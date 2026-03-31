# Services

## Overview

All services follow the Effect pattern: a `Context.Tag` interface in
`src/services/` with Live and Test implementations in `src/layers/`.

## Service Catalog

### StdinReader

Reads raw JSON text from stdin.

```typescript
class StdinReader extends Context.Tag("StdinReader")<StdinReader, {
  readonly read: () => Effect.Effect<string, StdinError>;
}>() {}
```

- **Live** (`StdinReaderLive`): Reads from `Bun.stdin.text()`
- **Test** (`makeStdinReaderTest(json: string)`): Returns the provided string

### SchemaValidator

Decodes raw JSON strings against Effect Schemas.

```typescript
class SchemaValidator extends Context.Tag("SchemaValidator")<SchemaValidator, {
  readonly decode: <A, I>(raw: string, schema: Schema<A, I>) => Effect.Effect<A, SchemaValidationError>;
}>() {}
```

- **Live** (`SchemaValidatorLive`): Parses JSON and runs `Schema.decodeUnknownSync`
- **Test**: Not provided separately; `SchemaValidatorLive` is stateless and used directly

### EnvLoader

Loads environment variables from files and session state.

```typescript
class EnvLoader extends Context.Tag("EnvLoader")<EnvLoader, {
  readonly loadUserEnv: (projectRoot: string) => Effect.Effect<void, EnvLoadError>;
  readonly loadHookFiles: (dir: string) => Effect.Effect<void, EnvLoadError>;
  readonly loadSessionEnv: (prefix: string) => Effect.Effect<void, EnvLoadError>;
}>() {}
```

- **Live** (`EnvLoaderLive`): Reads `.env` files and `hook-*.sh` files from disk
- **Test** (`EnvLoaderTest`): No-op layer (all methods succeed without side effects)

### EnvPersister

Persists environment variables to session env files.

```typescript
class EnvPersister extends Context.Tag("EnvPersister")<EnvPersister, {
  readonly persist: (vars: Record<string, string>, path: string) => Effect.Effect<void, EnvPersistError>;
}>() {}
```

- **Live** (`EnvPersisterLive`): Writes `export KEY="value"` lines to a shell file
- **Test** (`makeEnvPersisterTest()`): Records persisted vars in memory for assertion

### SessionStore

Looks up and registers session-to-env-dir mappings.

```typescript
class SessionStore extends Context.Tag("SessionStore")<SessionStore, {
  readonly lookup: (sessionId: SessionId) => Effect.Effect<string, SessionLookupError>;
  readonly register: (sessionId: SessionId, dir: string) => Effect.Effect<void>;
}>() {}
```

- **Live** (`SessionStoreLive`): Delegates to `SessionRegistry` (SQLite)
- **Test** (`makeSessionStoreTest()`): In-memory `Map<string, string>`

### ShellExecutor

Executes shell commands.

```typescript
class ShellResult extends Schema.Class<ShellResult>("ShellResult")({
  exitCode: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
}) {}

class ShellExecutor extends Context.Tag("ShellExecutor")<ShellExecutor, {
  readonly exec: (cmd: string) => Effect.Effect<ShellResult, ShellError>;
}>() {}
```

- **Live** (`ShellExecutorLive`): Runs via `Bun.$`
- **Test** (`makeShellExecutorTest(results)`): Returns pre-configured results

### Telemetry

Emits OTEL telemetry events for hook execution.

```typescript
class Telemetry extends Context.Tag("Telemetry")<Telemetry, {
  readonly emitHookExecution: (data: HookExecutionData) => Effect.Effect<void>;
  readonly emitError: (error: unknown) => Effect.Effect<void>;
  readonly emitFatalError: (data: FatalErrorData) => Effect.Effect<boolean>;
  readonly preconnect: Effect.Effect<void>;
  readonly flush: (timeoutMs?: number) => Effect.Effect<boolean>;
}>() {}
```

- **Live** (`TelemetryLive`): Routes telemetry through `SidecarConnection` IPC.
  Also installs an Effect Tracer that bridges `Effect.withSpan` to the sidecar.
- **Test** (`makeTelemetryTest()`): No-op implementation, records calls for assertion

### OtelConfig

Provides OTEL configuration from environment variables.

```typescript
class OtelConfigData extends Schema.Class<OtelConfigData>("OtelConfigData")({
  enabled: Schema.Boolean,
  endpoint: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.Literal("http", "grpc")),
  serviceName: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  socketPath: Schema.optional(Schema.String),
}) {}

class OtelConfig extends Context.Tag("OtelConfig")<OtelConfig, OtelConfigData>() {}
```

- **Live** (`OtelConfigLive`): Reads from `CLAUDE_CODE_ENABLE_TELEMETRY`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, etc.
- **Test** (`makeOtelConfigTest(overrides)`): Returns config with provided overrides

### SidecarConnection

Manages the Unix socket connection to the OTEL sidecar process.

```typescript
class SidecarConnection extends Context.Tag("SidecarConnection")<SidecarConnection, {
  readonly emit: (message: SidecarProtocolMessage) => Effect.Effect<void>;
  readonly preconnect: Effect.Effect<void>;
  readonly flush: (timeoutMs?: number) => Effect.Effect<boolean>;
}>() {}
```

- **Live** (`SidecarConnectionLive`): Scoped layer with socket lifecycle, sliding
  queue (1024 messages), auto-reconnect, and sidecar spawning. No-op when OTEL disabled.
- **Test** (`makeSidecarConnectionTest()`): No-op implementation

### CommandRunner

Runs plugin commands and parses CLI arguments.

```typescript
class CommandRunner extends Context.Tag("CommandRunner")<CommandRunner, {
  readonly run: (options: RunCommandOptions) => Effect.Effect<CommandOutput, CommandParseError>;
  readonly parse: <TArgs>(schema: Schema<TArgs>, args: string[]) => Effect.Effect<TArgs, CommandParseError>;
}>() {}
```

- **Live** (`CommandRunnerLive`): Runs commands from plugin config
- **Test** (`makeCommandRunnerTest()`): Returns pre-configured command outputs

### PluginEnvService

Effect-friendly interface over the `PluginEnv` abstract class.

```typescript
class PluginEnvService extends Context.Tag("PluginEnvService")<PluginEnvService, {
  readonly forSessionStart: <T>(cls: new () => T, params) => Effect.Effect<T, EnvLoadError>;
  readonly forHook: <T>(cls: new () => T, params) => Effect.Effect<T, EnvLoadError>;
  readonly forCommand: <T, TArgs>(cls: new () => T, params) => Effect.Effect<CommandContextResult<T, TArgs>, EnvLoadError>;
  readonly persistVars: (sessionId, vars, fs?) => Effect.Effect<PersistResult, EnvPersistError>;
}>() {}
```

- **Live** (`PluginEnvLive`): Delegates to `PluginEnv` methods with real file system
- **Test** (`makePluginEnvTest()`): In-memory implementation

### PluginBuilderService

Effect service for the build system.

```typescript
class PluginBuilderService extends Context.Tag("PluginBuilder")<PluginBuilderService, {
  readonly build: (options?) => Effect.Effect<PluginBuildResult, ShellError>;
  readonly fromConfig: (plugin, options?) => Effect.Effect<PluginBuildResult, ShellError>;
}>() {}
```

- **Live** (`PluginBuilderLive`): Delegates to `PluginBuilder` static methods
- **Test** (`makePluginBuilderTest()`): Returns mock build results

## Logger Layers

These are not services but Effect logger replacements.

### PluginLoggerLive

`makePluginLoggerLive(pluginName, logLevel?)` -- Replaces the default Effect
logger with an NDJSON file logger. Writes to `{sessionDir}/{pluginName}.log`.
Enabled by `CLAUDE_DEBUG` env var. Falls back to `Logger.none` on failure.

### PluginLoggerTest

`makePluginLoggerTest()` -- Returns `{ layer, getLogs(), clear() }`. Captures
log entries in an array for test assertions.

### SidecarLoggerLive

`makeSidecarLoggerLive(logPath)` -- Structured JSON file logger for the
sidecar process. Uses `PlatformLogger.toFile` with `BunFileSystem`.

## PipelineLive (Composed Layer)

```typescript
const OtelClientLive = pipe(TelemetryLive, Layer.provide(SidecarConnectionLive), Layer.provide(OtelConfigLive));

export const PipelineLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvPersisterLive, SessionStoreLive, OtelClientLive, ShellExecutorLive,
);
```

Provides all services needed for `PipelineRuntime.run()` in production.

## Outcomes Subsystem

The outcomes system (`src/outcomes/`) is not an Effect service but a core
subsystem that interacts with services:

- **Telemetry integration**: Each outcome's `toTelemetry()` provides structured
  data for the `Telemetry` service's `emitHookExecution()` call. Extended
  outcomes automatically expose domain-specific fields as OTEL metrics.

- **ContextBuilder OTEL metrics**: `MarkdownContext` and `XmlContext` track
  section/rule/tag counts via their `.metrics` getter, which are included
  in telemetry emission when used with `AddContext`.

- **PipelineRuntime interaction**: `PipelineRuntime` checks
  `Outcome.isOutcome(output)` before the legacy `isPipelineOutput()` path.
  It calls `isValidOutcomeForHook()` for runtime validation, then
  `outcome.toResponse()` for serialization and `outcome.toTelemetry()` for
  the telemetry service.

See `architecture.md` for full outcome class details and the hook-to-outcome
mapping table.
