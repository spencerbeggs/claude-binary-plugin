# OpenTelemetry

## Overview

The SDK provides OpenTelemetry observability through a sidecar architecture.
Hook processes (short-lived) communicate with a long-lived sidecar process
via Unix socket IPC. The sidecar aggregates telemetry and exports it to an
OTLP endpoint.

## Architecture

```text
Hook Process (short-lived)          Sidecar Process (long-lived)
+---------------------------+       +---------------------------+
| PipelineRuntime           |       | SidecarMain               |
|   -> Telemetry service    | IPC   |   -> SidecarTransport     |
|   -> SidecarConnection ---+------>|   -> OtelProviders        |
|      (Unix socket client) |       |      (Tracer, Meter, Log) |
+---------------------------+       |   -> SpanHandler          |
                                    |   -> EventHandler         |
                                    |   -> MetricHandler        |
                                    +---------------------------+
                                              |
                                              v
                                         OTLP Endpoint
```

## Effect Services

### OtelConfig

Tag: `"OtelConfig"`, value: `OtelConfigData` (Schema.Class).

| Field | Type | Source |
| ------- | ------ | -------- |
 | `enabled` | boolean | `CLAUDE_CODE_ENABLE_TELEMETRY === "1"` and platform is darwin/linux |
| `endpoint` | string? | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `protocol` | `"http" \| "grpc"` | `OTEL_EXPORTER_OTLP_PROTOCOL` |
| `headers` | Record? | `OTEL_EXPORTER_OTLP_HEADERS` (comma-separated `key=value`) |
| `socketPath` | string? | `OTEL_SIDECAR_SOCKET` |

Live: `OtelConfigLive` reads from `Bun.env`.
Test: `makeOtelConfigTest(overrides?)` returns config with provided fields.

### Telemetry

Tag: `"Telemetry"`. Hook-facing service for emitting telemetry.

Methods:

- `emitHookExecution(data: HookExecutionData)` -- Emit hook execution event
- `emitError(error)` -- Emit error event
- `emitFatalError(data: FatalErrorData)` -- Emit fatal error + flush
- `preconnect` -- Eagerly establish sidecar connection
- `flush(timeoutMs?)` -- Drain pending messages

Live: `TelemetryLive` is a merged layer providing both the Telemetry service
and an Effect Tracer that routes `Effect.withSpan` calls through the sidecar.
When OTEL is disabled, all methods are no-ops and no tracer is installed.

### SidecarConnection

Tag: `"SidecarConnection"`. Client-side Unix socket connection to the sidecar.

Methods:

- `emit(message)` -- Send a protocol message (fire-and-forget)
- `preconnect` -- Establish connection, spawning sidecar if needed
- `flush(timeoutMs?)` -- Drain the message queue through the socket

Live: `SidecarConnectionLive` is a scoped layer managing:

- Sliding queue (1024 capacity) for message buffering
- Socket lifecycle via `Bun.connect` with `Ref<Socket | null>`
- Auto-reconnect on socket errors
- Sidecar spawning via `{pluginRoot}/{pluginName}.plugin --sidecar`
- Graceful shutdown via `Effect.addFinalizer`
- No-op when OTEL is disabled

### OtelProviders

Tag: `"OtelProviders"`. Sidecar-side OTEL SDK providers.

Methods:

- `getTracer(name, version?)` -- Get an OTEL Tracer
- `getMeter(name, version?)` -- Get an OTEL Meter
- `getLogger(name, version?)` -- Get an OTEL Logger
- `reinit(config)` -- Reinitialize providers with new config

Live: `OtelProvidersLive` wraps `NodeTracerProvider`, `MeterProvider`,
and `LoggerProvider` with Effect lifecycle management.

### SidecarTransport

Tag: `"SidecarTransport"`. Sidecar-side Unix socket server.

Methods:

- `clientCount` -- Number of connected clients

Live: `makeSidecarTransportLive(lastActivity)` creates a scoped layer that:

- Listens on a Unix socket (`OTEL_SIDECAR_SOCKET` or default path)
- Parses JSON Lines messages with BigInt revival
- Routes messages to handlers via `routeMessage()`:
  - `ping` -> configure providers, store session config
  - `span` -> `SpanHandler.handle()` via Tracer
  - `event` -> `EventHandler.handle()` via Logger
  - `metric` -> `MetricHandler.handle()` via Meter
  - `shutdown` -> `Effect.interrupt` for orderly shutdown
- Updates `lastActivity` Ref on every message
- Cleans up on scope close (close clients, stop server, remove socket file)

## Sidecar Lifecycle

### Startup

1. Hook process calls `SidecarConnection.preconnect`
2. Attempts `Bun.connect` to socket path
3. If connection fails, spawns `{binaryPath} --sidecar` with `proc.unref()`
4. Retries connection with backoff (100ms, 200ms, 500ms)

### Running

`SidecarMain.makeSidecarProgram()` creates the main Effect program:

1. Reads idle timeout from `CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS` (default 5min)
2. Creates shared `Ref<number>` for last-activity tracking
3. Builds layer stack: `SidecarTransportLive` + `OtelProvidersLive`
4. Races idle timeout checker against signal handler (SIGTERM/SIGINT)
5. Whichever fires first interrupts the fiber, triggering scope unwinding

### Shutdown

Triggered by idle timeout or signal. Scope finalizers run in reverse order:

1. Transport closes all client sockets, stops server, removes socket file
2. Providers flush and shut down (TracerProvider, MeterProvider, LoggerProvider)
3. Logger closes log file

Entry point: `Sidecar.main()` in `src/otel/Sidecar.ts` is called by the
generated entrypoint when `--sidecar` flag is detected.

## Protocol Messages (`otel/protocol.ts`)

All messages are Schema.Class definitions in a discriminated union on `type`:

| Message | Type | Purpose |
| --------- | ------ | --------- |
 | `PingMessage` | `"ping"` | Session startup, carries `OtelProtocolConfig` |
| `SpanMessage` | `"span"` | Trace span data |
| `EventMessage` | `"event"` | Log/event data |
| `MetricMessage` | `"metric"` | Metric data point |
| `ShutdownMessage` | `"shutdown"` | Graceful shutdown signal |

Wire format: JSON Lines (newline-delimited JSON) over Unix socket.
BigInt values are serialized as `"123n"` strings.

## OTEL Handlers (`src/otel/`)

| File | Purpose |
| ------ | --------- |
 | `SpanHandler.ts` | Routes SpanData to OTEL Tracer |
| `EventHandler.ts` | Routes EventData to OTEL Logger |
| `MetricHandler.ts` | Routes MetricData to OTEL Meter |
| `SidecarSpan.ts` | Effect Tracer Span implementation that emits via IPC |
| `SidecarExporters.ts` | OTLP exporter configuration |
| `SidecarResource.ts` | OTEL resource attribute builder |
| `message-builders.ts` | Build protocol messages from hook execution data |
| `constants.ts` | Shared constants (`isOtelEnabled`, etc.) |
| `Platform.ts` | Platform detection, socket path resolution |
| `GitInfo.ts` | Git repository info for resource attributes |
| `ClaudeAccountInfo.ts` | Claude account info detection |
| `PluginInfo.ts` | Plugin metadata for resource attributes |
| `version.macro.ts` | Build-time version injection |

## Configuration Environment Variables

| Variable | Purpose |
| ---------- | --------- |
 | `CLAUDE_CODE_ENABLE_TELEMETRY` | Set to `"1"` to enable OTEL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP endpoint URL |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `"http"` or `"grpc"` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers (`key=value,key=value`) |
| `OTEL_SIDECAR_SOCKET` | Custom Unix socket path |
| `CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS` | Sidecar idle timeout (default 300000) |

## SidecarLoggerLive

`makeSidecarLoggerLive(logPath)` provides structured JSON file logging for
the sidecar process via `PlatformLogger.toFile` with `BunFileSystem`.
Path resolved by `resolveSidecarLogPath()`: `{sessionDir}/claude-otel-sidecar.log`
or `/tmp/claude-otel-sidecar.log`.
