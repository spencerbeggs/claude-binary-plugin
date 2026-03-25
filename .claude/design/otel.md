# OpenTelemetry Telemetry

## Overview

The OTEL subsystem provides observability for plugin hook execution via
a sidecar process that communicates over Unix socket IPC. It uses Effect
services with layers for typed error handling, resource management, and
layer-based testing.

## Architecture

```text
Plugin Binary → SidecarClient → Unix Socket → SidecarServer → OTLP Exporters
```

1. Plugin binary connects to the sidecar on first telemetry event
1. Sidecar runs an OTEL collector with HTTP OTLP exporters
1. Plugin sends events/spans/metrics via Unix socket IPC
1. Sidecar batches and exports to configured OTLP endpoint

## Client-Side Services (run in plugin binary)

### OtelConfig

Client OTEL configuration with enabled flag.

* Tag: `src/services/OtelConfig.ts`
* `Schema.Class` combining type + schema in one declaration
* Live: reads `OTEL_EXPORTER_OTLP_ENDPOINT` and related env vars
* `isEnabled()` — returns `true` when endpoint is configured
* Test: `makeOtelConfigTest(overrides)` — pre-canned config values

### SidecarConnection (internal)

Socket lifecycle management. Internal service, not exported.

* Tag: `src/services/SidecarConnection.ts`
* Live: scoped layer using `Effect.acquireRelease` with `Queue.sliding`
* Spawns sidecar process on acquire, flushes and closes on release
* Test: `makeSidecarConnectionTest()` — in-memory queue, no socket

### Telemetry

Emit OTEL hook execution events (enriched from original interface).

* Tag: `src/services/Telemetry.ts`
* `emitHookExecution(data): Effect<void>`
* `emitError(error): Effect<void>`
* `emitFatalError(error): Effect<void>` — for unrecoverable errors
* `preconnect(): Effect<void>` — eagerly open socket before first event
* `flush(): Effect<void>` — drain queue before process exit
* Live: depends on `SidecarConnection` + `OtelConfig`
* Test: `makeTelemetryTest()` — captures events/errors to arrays
* `withErrorTelemetry<A, E, R>(effect)` — auto-emits errors via `Effect.tapError`
* `HookExecutionData` — Schema.Class for telemetry payloads

## Sidecar-Side Services (compiled into sidecar.js)

### OtelProviders

OTEL SDK provider lifecycle.

* Tag: `src/services/OtelProviders.ts`
* Live: scoped layer using `Effect.acquireRelease` wrapping OTEL SDK setup
* Manages `NodeTracerProvider`, `MeterProvider`, `LoggerProvider` lifecycle
* Guaranteed flush and shutdown on release

### SidecarTransport

Unix socket server for receiving IPC messages.

* Tag: `src/services/SidecarTransport.ts`
* Live: `makeSidecarTransportLive(lastActivity)` — scoped socket server layer
* `lastActivity` is a `Ref` updated on each received message (idle timeout)

### SidecarMain

Effect program composing `OtelProviders` + `SidecarTransport`.

* Top-level Effect with idle timeout and OS signal handling (`SIGTERM`, `SIGINT`)
* Idle timeout triggers graceful shutdown if no messages received
* Signal handling ensures flush before process exit

## Key Files (in `src/otel/`)

### New Effect-Based Files

* `services/OtelConfig.ts` — `Context.Tag` + `Schema.Class` config definition
* `services/SidecarConnection.ts` — internal socket lifecycle service
* `services/OtelProviders.ts` — sidecar OTEL SDK lifecycle service
* `services/SidecarTransport.ts` — sidecar socket server service
* `layers/OtelClientLive.ts` — composed client layer (OtelConfig + SidecarConnection + Telemetry)
* `SidecarSpan.ts` — Effect-based span helpers replacing `TelemetrySpan.ts`
* `message-builders.ts` — typed IPC message constructors

### Retained Files

* `OtelConfig.ts` — original imperative class, kept for backward compat with `SidecarResource` and `SessionEnv`
* `SidecarExporters.ts` — OTLP HTTP exporters (unchanged)
* `SidecarResource.ts` — OTEL resource attributes
* `Platform.ts` — OS/arch detection
* `GitInfo.ts` — git repo detection
* `SessionEnv.ts` — session-level telemetry state
* `ClaudeAccountInfo.ts` — Claude account metadata
* `PluginInfo.ts` — plugin metadata
* `protocol.ts` — IPC message types
* `version.macro.ts` — SDK version (Bun macro)
* `SidecarLog.ts` — sidecar internal logging

## Environment Variables

* `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP HTTP endpoint (required to enable)
* `OTEL_EXPORTER_OTLP_HEADERS` — auth headers
* `OTEL_SIDECAR_SOCKET` — custom socket path

## Error Types

* `SidecarError` — stage-based error (`Data.TaggedError`) with a `stage` field
  indicating where the failure occurred (connect, send, flush, shutdown)
* `OtelConfigError` — raised when config is malformed or required values are missing
