# Effect Services

## Overview

The SDK uses 14 Effect services following the Context.Tag + Layer pattern.
Service tags live in `src/services/`, implementations in `src/layers/`.

## Services

### StdinReader

Read hook input from stdin.

- Tag: `src/services/StdinReader.ts`
- `read(): Effect<string, StdinError>`
- Live: `Bun.stdin.text()`
- Test: `makeStdinReaderTest(input)` — returns pre-canned string

### SchemaValidator

Validate JSON against Effect Schema.

- Tag: `src/services/SchemaValidator.ts`
- `decode<A, I>(raw, schema): Effect<A, SchemaValidationError>`
- Live: `Schema.decodeUnknownSync` with JSON.parse
- No test double (reuse Live — validation logic is pure)

### EnvLoader

Load environment variables from disk.

- Tag: `src/services/EnvLoader.ts`
- `loadUserEnv(projectRoot)`, `loadHookFiles(dir)`, `loadSessionEnv(prefix)`
- Live: reads `.env` files and hook shell scripts via `Bun.file()`
- Test: `EnvLoaderTest` — no-op

### EnvPersister

Write environment variables to session files.

- Tag: `src/services/EnvPersister.ts`
- `persist(vars, path): Effect<void, EnvPersistError>`
- Live: writes shell export scripts with `chmod 600`
- Test: `makeEnvPersisterTest()` — records writes to array

### SessionStore

SQLite-backed session registry.

- Tag: `src/services/SessionStore.ts`
- `lookup(sessionId): Effect<string, SessionLookupError>`
- `register(sessionId, dir): Effect<void>`
- Live: delegates to `SessionRegistry` class (SQLite)
- Test: `makeSessionStoreTest()` — in-memory Map

### Telemetry

Emit OTEL hook execution events.

- Tag: `src/services/Telemetry.ts`
- `emitHookExecution(data): Effect<void>`
- `emitError(error): Effect<void>`
- `emitFatalError(error): Effect<void>` — for unrecoverable errors
- `preconnect(): Effect<void>` — eagerly open socket before first event
- `flush(): Effect<void>` — drain queue before process exit
- Live: depends on `SidecarConnection` + `OtelConfig`
- Test: `makeTelemetryTest()` — captures events/errors to arrays
- `withErrorTelemetry<A, E, R>(effect)` — auto-emits errors via `Effect.tapError`
- `HookExecutionData` — Schema.Class for telemetry payloads

### ShellExecutor

Execute shell commands.

- Tag: `src/services/ShellExecutor.ts`
- `exec(cmd): Effect<ShellResult, ShellError>`
- Live: `Bun.$` with exit code mapping
- Test: `makeShellExecutorTest(responses?)` — pattern-matching mock
- `ShellResult` — Schema.Class (exitCode, stdout, stderr)

### CommandRunner

Parse and run CLI commands.

- Tag: `src/services/CommandRunner.ts`
- `run(options): Effect<CommandOutput, CommandParseError>`
- `parse<TArgs>(schema, args): Effect<TArgs, CommandParseError>`
- Live: Effect Schema decoding with markdown error formatting
- Test: `makeCommandRunnerTest()` — records runs

### PluginBuilder

Compile plugins to executables.

- Tag: `src/services/PluginBuilder.ts`
- `build(config): Effect<PluginBuildResult, ShellError>`
- Live: wraps `PluginBuilder.fromConfig()` static method
- Test: `makePluginBuilderTest()` — records build calls

### PluginEnvService

Load and persist plugin environment state.

- Tag: `src/services/PluginEnvService.ts`
- `forSessionStart(params)`, `forHook(params)`, `forCommand(params)`
- `persistVars(schema, vars, path)`
- Live: wraps `PluginEnv.forContext()` static methods
- Test: `makePluginEnvTest(vars?)` — in-memory env vars

### OtelConfig

Client OTEL configuration with enabled flag.

- Tag: `src/services/OtelConfig.ts`
- `Schema.Class` combining type + schema in one declaration
- `isEnabled(): boolean` — returns `true` when OTLP endpoint is configured
- Live: reads `OTEL_EXPORTER_OTLP_ENDPOINT` and related env vars
- Test: `makeOtelConfigTest(overrides)` — pre-canned config values

### SidecarConnection (internal)

Socket lifecycle management. Internal service, not part of the public API.

- Tag: `src/services/SidecarConnection.ts`
- Live: scoped layer using `Effect.acquireRelease` with `Queue.sliding`
- Spawns sidecar process on acquire, flushes and closes on release
- Test: `makeSidecarConnectionTest()` — in-memory queue, no socket

### OtelProviders (sidecar-side)

OTEL SDK provider lifecycle inside the sidecar process.

- Tag: `src/services/OtelProviders.ts`
- Live: scoped layer using `Effect.acquireRelease` wrapping OTEL SDK setup
- Manages `NodeTracerProvider`, `MeterProvider`, `LoggerProvider` lifecycle
- Guaranteed flush and shutdown on release

### SidecarTransport (sidecar-side)

Unix socket server for receiving IPC messages inside the sidecar process.

- Tag: `src/services/SidecarTransport.ts`
- Live: `makeSidecarTransportLive(lastActivity)` — scoped socket server layer
- `lastActivity` is a `Ref` updated on each received message (idle timeout)

## Composed Layers

### PipelineLive (`src/layers/PipelineLive.ts`)

`Layer.mergeAll` of all core Live layers (StdinReader, SchemaValidator,
EnvLoader, EnvPersister, SessionStore, Telemetry, ShellExecutor) plus
`OtelClientLive` (OtelConfig + SidecarConnection + Telemetry).

### PluginLoggerLive (`src/layers/PluginLoggerLive.ts`)

Effect-native NDJSON file logger for plugin execution:

- `makePluginLoggerLive(pluginName, logLevel?)` — returns a `Logger.replace` layer
- Writes structured NDJSON to `{pluginName}.log` in the session env dir
- Uses `Logger.make` for controlled NDJSON field names (timestamp, level, message, annotations)
- Channel annotations via `Effect.annotateLogs("channel", "...")` throughout the pipeline
- Falls back to `Logger.none` on file open failure or when logging is disabled
- `CLAUDE_LOG_STDERR=1` environment variable enables stderr output instead of file
- `resolveLogLevel(option?)` — resolves log level from a string option or `CLAUDE_DEBUG` env var
- Test: `makePluginLoggerTest()` (from `claude-binary-plugin/testing`) — `Logger.none` layer, silences all output in tests
