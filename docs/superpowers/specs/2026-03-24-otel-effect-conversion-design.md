# OTEL Effect Conversion Design

## Overview

Convert the 26-file imperative OTEL subsystem (`src/otel/`) to idiomatic Effect
services with layers, typed errors, and `acquireRelease` lifecycle management.
The existing sidecar architecture (plugin binary -> Unix socket IPC -> sidecar
process -> OTLP exporters) is preserved. Both client and sidecar sides become
Effect programs.

## Constraints

- **Keep sidecar architecture.** The plugin binary exits too quickly for direct
  OTLP export. The sidecar process batches and exports asynchronously.
- **Bun runtime.** Avoid `@effect/opentelemetry` `NodeSdk` until Bun
  compatibility is verified. Use `@opentelemetry/sdk-*` packages directly on
  the sidecar side, wrapped in Effect lifecycle.
- **Minimal public API.** Plugin authors interact only with the `Telemetry`
  service and `Effect.withSpan` in handlers. All IPC, sidecar, and config
  internals are private.
- **No backward compatibility.** This is a pre-1.0 rewrite. Old imperative
  APIs are deleted, not deprecated.

## Client-Side Services

Three layers compose the client-side OTEL support. They replace
`TelemetryEmitter`, `SidecarClient`, `SidecarClientPool`, `SidecarLauncher`,
and the current shim `TelemetryLive`.

**Visibility rule:** Only `Telemetry` is public. `OtelConfig` and
`SidecarConnection` are internal services — `PipelineRuntime` and plugin
authors always go through `Telemetry`, never touching the lower layers
directly.

### OtelConfig (tagged service)

Follows the standard codebase pattern: `Context.Tag` in `src/services/`,
`Layer` implementation in `src/layers/`. The config data shape uses
`Schema.Class` for validation.

```typescript
// Data shape
class OtelConfigData extends Schema.Class<OtelConfigData>("OtelConfigData")({
  endpoint: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.Literal("http", "grpc")),
  serviceName: Schema.optional(Schema.String),
  headers: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String })
  ),
  enabled: Schema.Boolean,
  socketPath: Schema.optional(Schema.String),
}) {}

// Service tag
class OtelConfig extends Context.Tag("OtelConfig")<
  OtelConfig,
  OtelConfigData
>() {}
```

- `OtelConfigLive = Layer.effect(OtelConfig, ...)` reads
  `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_HEADERS`, etc. Returns `enabled: false` when telemetry
  is off or platform is unsupported.
- `OtelConfigTest(overrides)` returns
  `Layer.succeed(OtelConfig, { enabled: false, ...overrides })`.
- `isEnabled()` check becomes `config.enabled` field access.

Note: This schema covers the client-side config only. The `OtelProtocolConfig`
interface in `protocol.ts` (which includes `pluginName`, `marketplaceName`,
`resourceAttributes`, `exportTimeoutMs`) remains a separate type used for the
IPC ping message payload. They serve different purposes: `OtelConfig` is
"should we emit and where is the socket," `OtelProtocolConfig` is "how should
the sidecar configure its OTLP exporters."

### SidecarConnection (lifecycle-managed service, internal)

Combines client, launcher, and pool into one scoped resource. Manages the full
socket lifecycle: spawn sidecar if needed, connect, queue messages, flush on
scope close. This is an internal service — not exposed to plugin authors.

```typescript
class SidecarConnection extends Context.Tag("SidecarConnection")<
  SidecarConnection,
  {
    readonly emit: (message: SidecarProtocolMessage) => Effect<void>
    readonly preconnect: Effect<void>
    readonly flush: (timeoutMs?: number) => Effect<boolean>
  }
>() {}
```

**`SidecarConnectionLive`** is `Layer.scoped`:

- **Acquire:** Read `OtelConfig`, resolve socket path, attempt connection to
  existing sidecar. If no sidecar is running, spawn one via
  `Bun.spawn([binaryPath, "--sidecar"], ...)` and wait for socket availability.
- **Internal state:** `Ref<Socket | null>` for connection,
  `Queue.sliding<SidecarProtocolMessage>(1024)` for message buffering. Sliding
  queue drops oldest messages when full, consistent with fire-and-forget
  semantics — telemetry loss is acceptable, blocking is not.
- **`emit`:** If connected, serialize and write. If not, enqueue and attempt
  reconnection in background. Fire-and-forget — never blocks the caller.
- **`flush`:** Drain queue with timeout. Used before process exit.
- **Release:** Disconnect socket, clear queue.

**`SidecarConnectionTest`** captures messages to an array. No socket, no
process spawning.

Depends on: `OtelConfig`

### Telemetry (enriched existing service, public)

The existing `Telemetry` tag gains a richer interface. The implementation
replaces the current `require()` hack with proper dependency on
`SidecarConnection`.

```typescript
class Telemetry extends Context.Tag("Telemetry")<
  Telemetry,
  {
    readonly emitHookExecution: (data: HookExecutionData) => Effect<void>
    readonly emitError: (error: unknown) => Effect<void>
    readonly emitFatalError: (data: FatalErrorData) => Effect<boolean>
    readonly preconnect: Effect<void>
    readonly flush: (timeoutMs?: number) => Effect<boolean>
  }
>() {}
```

**`TelemetryLive`** checks `config.enabled` on each call. When disabled, all
methods are no-ops (`Effect.void` / `Effect.succeed(false)`). When enabled,
methods delegate to `SidecarConnection.emit()` after building the appropriate
`SidecarProtocolMessage` payload.

**`emitFatalError` returns `Effect<boolean>`** — unlike other emit methods,
this one needs to report whether the flush succeeded because the caller
(`process.on("uncaughtException")`) must know if it's safe to exit. The
boolean return is intentional: `true` means the error was delivered, `false`
means it timed out. The caller always exits regardless, but the return value
controls whether to add a brief delay.

Message-building logic (OTEL attributes, event names, severity mapping) is
extracted from the current `TelemetryEmitter` static methods into pure
functions. These are module-level functions, not services.

The `withErrorTelemetry` helper stays, with corrected type signature:

```typescript
const withErrorTelemetry = <A, E, R>(
  effect: Effect<A, E, R | Telemetry>
) =>
  Effect.tapError(effect, (error) =>
    Effect.flatMap(Telemetry, (t) => t.emitError(error))
  )
```

Depends on: `SidecarConnection`, `OtelConfig`

### Client Layer Composition

```typescript
const OtelClientLive = pipe(
  TelemetryLive,
  Layer.provide(SidecarConnectionLive),
  Layer.provide(OtelConfigLive),
)
```

This replaces the current `TelemetryLive` in `PipelineLive`.

## Sidecar-Side Services

Two services plus an entry point. They replace `SidecarServer`,
`SidecarRouter`, `SidecarProviders`, `SidecarLifecycle`, and `SidecarLog`.

### OtelProviders (lifecycle-managed service)

Wraps the three OTEL SDK providers (`NodeTracerProvider`, `MeterProvider`,
`LoggerProvider`) with `acquireRelease`. Uses the proven `@opentelemetry/sdk-*`
packages directly.

```typescript
class OtelProviders extends Context.Tag("OtelProviders")<
  OtelProviders,
  {
    readonly getTracer: (name: string, version?: string) => Tracer
    readonly getMeter: (name: string, version?: string) => Meter
    readonly getLogger: (name: string, version?: string) => Logger
    readonly reinit: (config: ResourceConfig) => Effect<boolean>
  }
>() {}
```

**`OtelProvidersLive`** is `Layer.scoped`:

- **Acquire:** Providers start uninitialized (`Ref<Provider | null>`).
  Initialization is deferred to first `reinit` call (triggered by ping
  message).
- **Pre-init behavior:** `getTracer`, `getMeter`, and `getLogger` return
  no-op instances from the global OTEL API when providers are uninitialized.
  Messages arriving before the first ping (before `reinit`) are silently
  dropped — the no-op instances discard spans/metrics/logs. This is safe
  because the first message in any session is always a ping.
- **`reinit`:** Computes config hash. If unchanged, no-op. If changed, shuts
  down existing providers and creates new ones with updated config. Detects git
  info, creates OTEL resource, creates exporters via `SidecarExporters` factory
  functions.
- **Release (finalizer):** `forceFlush()` then `shutdown()` on all three
  providers concurrently with `Effect.allDiscard({ concurrency: "unbounded" })`.
  Errors are logged and ignored via `Effect.ignoreLogged`.

`SidecarExporters` stays as pure factory functions (no service needed).
`SidecarResource` stays as a pure function.

### SidecarTransport (lifecycle-managed service)

Wraps the Unix socket server with `acquireRelease`. Accepts a `lastActivity`
`Ref` as a construction parameter to coordinate with the idle timeout in
`SidecarMain`.

```typescript
class SidecarTransport extends Context.Tag("SidecarTransport")<
  SidecarTransport,
  {
    readonly clientCount: Effect<number>
  }
>() {}
```

**`SidecarTransportLive`** is a function that takes a `Ref<number>` and
returns `Layer.scoped`:

```typescript
const makeSidecarTransportLive = (
  lastActivity: Ref.Ref<number>
) => Layer.scoped(SidecarTransport, ...)
```

- **Acquire:** Read socket path from env. Remove stale socket file. Create
  `Bun.listen` Unix socket server. On each incoming message, update
  `Ref.set(lastActivity, Date.now())` before routing. Wire message handler
  that routes to `OtelProviders` methods.
- **Message routing** (pure function, replaces `SidecarRouter`):
  - `ping` -> `providers.reinit(config)`, return `{ ok: true }`
  - `span` -> `SpanHandler.handle(data)`, fire-and-forget
  - `event` -> `EventHandler.handle(data)`, fire-and-forget
  - `metric` -> `MetricHandler.handle(data)`, fire-and-forget
  - `shutdown` (with sessionId) -> remove session config
  - `shutdown` (no sessionId) -> `Effect.interrupt` (unwinds scope, triggers
    all finalizers)
- **Release:** Close all client connections, stop server, remove socket file.

`SpanHandler`, `EventHandler`, `MetricHandler` stay as pure functions that
call `OtelProviders.getTracer/getLogger/getMeter` and forward data.

Depends on: `OtelProviders`

### Sidecar Error Handling

Sidecar-side failures (provider init failure, socket bind failure, message
deserialization) use `Effect.die` for truly unrecoverable errors (can't bind
socket) and `Effect.logError` for recoverable ones (malformed message). The
`SidecarError` type is client-side only. The sidecar is a separate process
where errors either terminate it (defects) or are logged and skipped
(individual message failures).

### Sidecar Entry Point

Replaces `Sidecar.main()`. The main fiber body is intentionally just the idle
timeout watcher. The transport server's lifecycle is managed by its layer scope
— it runs as long as the scope is open. When the idle watcher interrupts,
the scope closes and all layer finalizers run (transport shutdown, provider
flush+shutdown).

Signal handling: `SIGTERM`/`SIGINT` are wired to interrupt the main fiber via
`Effect.addFinalizer` or a signal-to-interrupt bridge, triggering the same
clean unwinding.

```typescript
const SidecarMain = Effect.gen(function*() {
  const idleTimeoutMs = readIdleTimeout()
  const lastActivity = yield* Ref.make(Date.now())

  // Build transport layer with shared lastActivity ref
  const transportLayer = makeSidecarTransportLive(lastActivity)

  // Idle timeout checker — the only thing in the main fiber body.
  // The transport server runs via its layer scope, not as a forked fiber.
  // When this effect interrupts, the scope unwinds and all finalizers run.
  yield* Effect.repeat(
    Effect.gen(function*() {
      const last = yield* Ref.get(lastActivity)
      if (Date.now() - last >= idleTimeoutMs) {
        yield* Effect.interrupt
      }
    }),
    Schedule.spaced(Duration.seconds(5))
  )
})
```

### Sidecar Logger

Replaces `SidecarLog.ts` with `PlatformLogger.toFile` from `@effect/platform`.
Requires `@effect/platform-bun` for the `BunFileSystem` layer (already a
project dependency via `@effect/platform`).

```typescript
const SidecarLoggerLive = Logger.replaceScoped(
  Logger.defaultLogger,
  Logger.structuredLogger.pipe(
    Logger.map((entry) => JSON.stringify(entry)),
    PlatformLogger.toFile(resolveSidecarLogPath())
  )
).pipe(
  Layer.provide(BunFileSystem.layer)
)
```

All `Effect.log`, `Effect.logDebug`, `Effect.logError` calls in the sidecar
write structured NDJSON to the log file. File handle cleanup on scope close.

### Sidecar Layer Composition

```typescript
const SidecarLive = pipe(
  SidecarTransportLive,
  Layer.provide(OtelProvidersLive),
  Layer.provide(SidecarLoggerLive),
)

// Entry point
static main(): void {
  Effect.runFork(
    SidecarMain.pipe(Effect.provide(SidecarLive))
  )
}
```

## Error Types

Two new `Data.TaggedError` types in `src/errors/`:

### SidecarError

```typescript
class SidecarError extends Data.TaggedError("SidecarError")<{
  readonly stage: "spawn" | "connect" | "send" | "flush" | "shutdown"
  readonly message: string
  readonly cause?: unknown
}>() {}
```

Used internally by `SidecarConnection` operations (client side only).
Suppressed at the `Telemetry` service boundary via `Effect.ignoreLogged` —
telemetry errors appear in logs but never fail a hook.

### OtelConfigError

```typescript
class OtelConfigError extends Data.TaggedError("OtelConfigError")<{
  readonly message: string
  readonly variable?: string
}>() {}
```

For invalid env var configurations (malformed headers, invalid protocol).

## Protocol Schemas

IPC message types convert from TypeScript interfaces to `Schema.Class`
definitions. This provides runtime validation on the sidecar side (receiving
data over a socket) and type-safe construction on the client side.

### BigInt Handling

Nanosecond timestamps use `Schema.BigInt` which encodes as `string` in JSON
and decodes to `bigint` at runtime. This replaces the custom BigInt
serialization in `SidecarMessage.ts`.

```typescript
class EventData extends Schema.Class<EventData>("EventData")({
  name: Schema.String,
  timeNs: Schema.BigInt, // wire: "1711234567890123456", runtime: bigint
  severity: Schema.optional(
    Schema.Literal("trace", "debug", "info", "warn", "error", "fatal")
  ),
  body: Schema.optional(Schema.String),
  attributes: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
  scope: Schema.optional(ScopeData),
}) {}

class SpanData extends Schema.Class<SpanData>("SpanData")({
  spanId: Schema.String,
  traceId: Schema.String,
  parentSpanId: Schema.optional(Schema.String),
  name: Schema.String,
  kind: Schema.Literal("client", "server", "producer", "consumer", "internal"),
  startTimeNs: Schema.BigInt,
  endTimeNs: Schema.optional(Schema.BigInt),
  attributes: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
  status: Schema.optional(SpanStatusSchema),
  events: Schema.optional(Schema.Array(SpanEventSchema)),
}) {}

class MetricData extends Schema.Class<MetricData>("MetricData")({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  unit: Schema.optional(Schema.String),
  type: MetricTypeSchema, // discriminated union on "kind"
  attributes: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
  timeNs: Schema.BigInt,
}) {}
```

Message union discriminated on `type`:

```typescript
const SidecarProtocolMessage = Schema.Union(
  PingMessage, SpanMessage, EventMessage, MetricMessage, ShutdownMessage
)
```

Client uses `Schema.encode` to serialize, sidecar uses `Schema.decode` to
validate. JSON Lines framing (newline-delimited) stays the same.

### Types That Stay as Interfaces

`HookExecutionResult`, `SchemaValidationErrorResult`, `FatalErrorResult`, and
other telemetry result types remain plain TypeScript interfaces. They are
internal data passed to pure message-building functions and never cross a trust
boundary.

## Pipeline Integration

### Preconnect / Flush Bracketing

`PipelineRuntime.run()` brackets hook execution with telemetry lifecycle:

1. Preconnect telemetry (non-blocking, warms socket)
2. Read stdin
3. Decode event schema
4. Load env state
5. Call handler (wrapped in `Effect.withSpan`)
6. Validate output
7. Emit telemetry event
8. Flush telemetry (500ms timeout, errors logged and ignored)
9. Write stdout, exit

Preconnect and flush are best-effort — failures are logged but never block
hook execution.

### Automatic Span Tracing

The pipeline wraps the handler in `Effect.withSpan("hook.execution", { ... })`.
Plugin authors can add child spans in their handlers:

```typescript
const handler = ({ input }) =>
  Effect.withSpan("validate-permissions")(
    checkPermissions(input)
  )
```

This requires a tracer bridge. `TelemetryLive` provides both the `Telemetry`
service and an Effect `Tracer` implementation:

```typescript
const sidecarTracer = Tracer.make({
  span: (name, parent, context, links, startTime, kind) =>
    new SidecarSpan(name, parent, conn, ...)
  context: (f, fiber) => f()
})
```

`SidecarSpan` implements Effect's span interface. On `end()`, it serializes
to a `SpanMessage` and sends via `SidecarConnection.emit()`.

### PipelineLive Update

```typescript
// Before
PipelineLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvPersisterLive, SessionStoreLive, TelemetryLive, ShellExecutorLive
)

// After
PipelineLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvPersisterLive, SessionStoreLive, OtelClientLive, ShellExecutorLive
)
```

Same `Telemetry` tag, richer implementation, transparent to downstream code.

## Build System Impact

No changes to generated code or build artifacts. The entrypoint template
continues to branch on `--sidecar` flag and dynamically import
`Sidecar.main()`. The conversion is internal to the runtime code.

## File Disposition

### Deleted (replaced by Effect services/layers)

| File | Replaced By |
| ---- | ----------- |
| `SidecarClientPool.ts` | `Ref<Map>` in `SidecarConnectionLive` |
| `SidecarLifecycle.ts` | Idle timeout effect + Effect interruption |
| `SidecarRouter.ts` | Pure function in `SidecarTransportLive` |
| `SidecarLog.ts` | `PlatformLogger.toFile` layer |
| `TelemetryEmitter.ts` | Pure message-building functions + `TelemetryLive` |
| `TelemetryMetrics.ts` | Folded into message-building functions |
| `TelemetrySpan.ts` | `SidecarSpan` tracer bridge |

### Converted to Effect (same responsibility, new implementation)

| File | Change |
| ---- | ------ |
| `OtelConfig.ts` | Class -> `Context.Tag` + `Schema.Class` + `Layer.effect` |
| `SidecarClient.ts` | Class -> `SidecarConnectionLive` layer |
| `SidecarLauncher.ts` | Class -> spawn logic in `SidecarConnectionLive` acquire |
| `SidecarServer.ts` | Class -> `SidecarTransportLive` layer |
| `SidecarProviders.ts` | Static class -> `OtelProvidersLive` layer |
| `Sidecar.ts` | `main()` -> `Effect.runFork(SidecarMain)` |
| `protocol.ts` | Interfaces -> `Schema.Class` definitions |
| `SidecarMessage.ts` | Custom serializer -> `Schema.encode`/`Schema.decode` |

### Unchanged (pure functions, types, metadata)

| File | Reason |
| ---- | ------ |
| `SidecarExporters.ts` | Pure factory functions |
| `SidecarResource.ts` | Pure resource creation |
| `Platform.ts` | Platform detection utility |
| `GitInfo.ts` | Git metadata detection |
| `ClaudeAccountInfo.ts` | Account metadata detection |
| `PluginInfo.ts` | Plugin metadata |
| `SessionEnv.ts` | Session environment state |
| `version.macro.ts` | Bun macro for SDK version |

### New Files

| File | Purpose |
| ---- | ------- |
| `src/errors/SidecarError.ts` | `Data.TaggedError` for sidecar operations |
| `src/errors/OtelConfigError.ts` | `Data.TaggedError` for config validation |
| `src/services/OtelConfig.ts` | `Context.Tag` definition |
| `src/layers/OtelConfigLive.ts` | Layer reading env vars |
| `src/layers/OtelConfigTest.ts` | Test factory |
| `src/services/SidecarConnection.ts` | `Context.Tag` definition (internal) |
| `src/layers/SidecarConnectionLive.ts` | Scoped layer implementation |
| `src/layers/SidecarConnectionTest.ts` | Test factory |
| `src/services/OtelProviders.ts` | `Context.Tag` definition |
| `src/layers/OtelProvidersLive.ts` | Scoped layer implementation |
| `src/services/SidecarTransport.ts` | `Context.Tag` definition |
| `src/layers/SidecarTransportLive.ts` | Scoped layer implementation |
| `src/layers/SidecarLoggerLive.ts` | PlatformLogger.toFile for sidecar |
| `src/otel/SidecarSpan.ts` | Effect Tracer bridge |
| `src/otel/SidecarMain.ts` | Sidecar entry point Effect program |

## Future Considerations

- **`@effect/opentelemetry` adoption:** Once Bun compatibility with `NodeSdk`
  or the lightweight `Otlp` modules is verified, the `OtelProviders` layer
  implementation could be swapped without changing service boundaries.
- **Effect.withSpan propagation:** If `@effect/opentelemetry` is adopted, the
  custom `SidecarSpan` tracer bridge could be replaced by the package's built-in
  `Tracer.layer`.
- **Client-side LoggerLive refactor:** The existing `LoggerLive` in
  `src/layers/LoggerLive.ts` uses manual `appendFileSync`. It should be
  refactored to use `PlatformLogger.toFile` as part of this work.
