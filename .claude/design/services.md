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
  readonly loadUserEnvFiles: (projectRoot: string) => Effect.Effect<string[], EnvLoadError>;
  readonly loadSessionEnvFiles: (dir: string) => Effect.Effect<number, EnvLoadError>;
  readonly loadFromVarsFile: (path: string) => Effect.Effect<void, EnvLoadError>;
}>() {}
```

- **Live** (`EnvLoaderLive`): Reads `.env` files and `hook-*.sh` files from disk.
  `loadUserEnvFiles` returns the list of loaded file paths; `loadSessionEnvFiles`
  returns the count of loaded session files.
- **Test** (`EnvLoaderTest`): No-op layer (all methods succeed without side effects)

### EnvWriter

Persists environment variables to session env files. Reads `CLAUDE_ENV_FILE`
from EnvBridge automatically.

```typescript
class EnvWriter extends Context.Tag("EnvWriter")<EnvWriter, {
  readonly persist: (vars: Record<string, string>) => Effect.Effect<PersistResult, EnvPersistError>;
}>() {}
```

- **Live** (`EnvWriterLive`): Writes `export KEY="value"` lines to a shell file
- **Test** (`makeEnvWriterTest()`): Records persisted vars in memory for assertion

### EnvFileParser

Pure parse/format/escape for shell env files.

```typescript
class EnvFileParser extends Context.Tag("EnvFileParser")<EnvFileParser, {
  readonly parse: (content: string) => Effect.Effect<Record<string, string>>;
  readonly format: (vars: Record<string, string>) => Effect.Effect<string>;
  readonly escapeForBash: (value: string) => Effect.Effect<string>;
}>() {}
```

### EnvBridge

Bun.env read/write boundary. Isolates direct Bun.env access behind an
Effect service for testability.

```typescript
class EnvBridge extends Context.Tag("EnvBridge")<EnvBridge, {
  readonly write: (key: string, value: string) => Effect.Effect<void>;
  readonly read: (key: string) => Effect.Effect<string | undefined>;
  readonly readAll: () => Effect.Effect<Record<string, string | undefined>>;
}>() {}
```

- **Live** (`EnvBridgeLive`): Reads/writes `Bun.env` directly
- **Test** (`makeEnvBridgeTest()`): Uses in-memory `Ref` for isolation

### EnvValidator

Schema-based env var validation.

```typescript
class EnvValidator extends Context.Tag("EnvValidator")<EnvValidator, {
  readonly validate: <T>(schema: Schema<T>) => Effect.Effect<T, SchemaValidationError>;
}>() {}
```

### EnvResolver

SessionRegistry lookup wrapper. Resolves session env directories.

```typescript
class EnvResolver extends Context.Tag("EnvResolver")<EnvResolver, {
  readonly getSessionEnvDir: (sessionId: SessionId) => Effect.Effect<string, SessionLookupError>;
  readonly getProjectSessionEnvDir: (projectDir: string) => Effect.Effect<string, SessionLookupError>;
  readonly registerSession: (sessionId: SessionId, dir: string) => Effect.Effect<void>;
}>() {}
```

- **Live** (`EnvResolverLive`): Delegates to SessionRegistry facade functions
- **Test** (`makeEnvResolverTest()`): In-memory session map

### EnvCoordinator

Orchestrates env flows across SessionStart, hook, and command contexts.
Replaces the former `PluginEnvService`.

```typescript
class EnvCoordinator extends Context.Tag("EnvCoordinator")<EnvCoordinator, {
  readonly forSessionStart: <T>(cls: new () => T, params) => Effect.Effect<T, EnvLoadError>;
  readonly forHook: <T>(cls: new () => T, params) => Effect.Effect<T, EnvLoadError>;
  readonly forCommand: <T, TArgs>(cls: new () => T, params) => Effect.Effect<CommandContextResult<T, TArgs>, EnvLoadError>;
  readonly persistSessionEnv: (sessionId: SessionId, vars: Record<string, string>) => Effect.Effect<PersistResult, EnvPersistError>;
}>() {}
```

- **Live** (`EnvCoordinatorLive`): Orchestrates EnvLoader, EnvWriter, EnvBridge,
  EnvResolver, and EnvValidator to load/persist environment state
- **Test** (`makeEnvCoordinatorTest()`): In-memory implementation

### SessionStore

Looks up and registers session-to-env-dir mappings. Provides full CRUD
operations over the SQLite session registry.

```typescript
class SessionStore extends Context.Tag("SessionStore")<SessionStore, {
  readonly lookup: (sessionId: SessionId) => Effect.Effect<string, SessionLookupError>;
  readonly lookupByProject: (projectDir: string) => Effect.Effect<string, SessionLookupError>;
  readonly register: (sessionId: SessionId, dir: string) => Effect.Effect<void>;
  readonly getRecord: (sessionId: SessionId) => Effect.Effect<SessionRecord | null>;
  readonly remove: (sessionId: SessionId) => Effect.Effect<void>;
  readonly cleanup: (maxAge: number) => Effect.Effect<number>;
  readonly getAll: () => Effect.Effect<SessionRecord[]>;
  readonly count: () => Effect.Effect<number>;
}>() {}
```

- **Live** (`SessionStoreLive`): Uses `Layer.scoped` with `acquireRelease` for
  SQLite DB lifecycle. Delegates to `SessionRegistry` facade functions.
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
  Depends on `PlatformInfo` for platform context in telemetry data.
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
  tracesExporter: Schema.optional(Schema.String),
  metricsExporter: Schema.optional(Schema.String),
  logsExporter: Schema.optional(Schema.String),
  resourceAttributes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  deploymentEnv: Schema.optional(Schema.String),
}) {}

class OtelConfig extends Context.Tag("OtelConfig")<OtelConfig, OtelConfigData>() {}
```

- **Live** (`OtelConfigLive`): Reads from `CLAUDE_CODE_ENABLE_TELEMETRY`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, etc.
  Depends on `PlatformInfo` for platform-gated enablement.
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

### PluginRuntimeService

Executes hook handlers and returns structured results. Replaces the old
static `PluginRuntime.run()` method.

```typescript
interface RunResult {
  readonly code: number;
  readonly response: Record<string, unknown>;
  readonly telemetry?: OutcomeTelemetry;
}

interface PluginRunConfig<TOptions, TState> {
  hookType: string;
  hookName: string;
  pluginName: string;
  pluginVersion: string;
  prefix?: string;
  handler: (ctx: { input: unknown; options: TOptions; state: TState }) => unknown;
  tools?: string[];
  optionsSchema?: unknown;
  stateSchema?: unknown;
  setup?: (ctx: unknown) => unknown;
  handlerLayer?: unknown;
  inputText?: string;
}

class PluginRuntimeService extends Context.Tag("PluginRuntimeService")<PluginRuntimeService, {
  readonly run: <TOptions, TState>(config: PluginRunConfig<TOptions, TState>) => Effect.Effect<RunResult, PluginRuntimeError>;
}>() {}
```

- **Live** (`PluginRuntimeServiceLive`): Full hook execution lifecycle --
  reads stdin, decodes schemas, loads state, invokes handler, validates
  Outcome, emits telemetry, returns `RunResult`. Uses `Layer.succeed`
  (no service dependencies of its own).
- **Test**: Not yet provided -- use `Effect.succeed` with mock `RunResult`

Note: `PluginRunConfig` uses `prefix?: string` instead of `stateClass`.

### CommandRunner

Runs plugin commands and parses CLI arguments.

```typescript
interface RunCommandOptions {
  readonly commandName: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly rawArgs: string[];
  readonly handler: (ctx: { args: unknown; options: unknown; state: unknown }) => unknown;
  readonly argsSchema?: unknown;
}

class CommandRunner extends Context.Tag("CommandRunner")<CommandRunner, {
  readonly run: (options: RunCommandOptions) => Effect.Effect<CommandOutput, CommandParseError>;
  readonly parse: <TArgs>(schema: Schema<TArgs>, args: string[]) => Effect.Effect<TArgs, CommandParseError>;
}>() {}
```

- **Live** (`CommandRunnerLive`): Full command lifecycle -- parses args,
  finds session env via SessionRegistry directly, loads state, invokes handler,
  validates output
- **Test** (`makeCommandRunnerTest()`): Returns pre-configured command outputs

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

### PlatformInfo

Provides platform detection and socket path resolution.

```typescript
class PlatformInfo extends Context.Tag("PlatformInfo")<PlatformInfo, {
  readonly os: string;
  readonly arch: string;
  readonly isSupported: boolean;
  readonly resolveSocketPath: (pluginName: string) => string;
}>() {}
```

- **Live** (`PlatformInfoLive`): Reads from `process.platform` and `process.arch`,
  resolves socket paths via XDG/temp directories
- **Test** (`makePlatformInfoTest(overrides?)`): Returns platform info with provided overrides

### PluginInfoService

Provides plugin metadata for OTEL resource attributes.

```typescript
class PluginInfoService extends Context.Tag("PluginInfoService")<PluginInfoService, {
  readonly name: string;
  readonly version: string;
  readonly sdkVersion: string;
}>() {}
```

- **Live** (`PluginInfoServiceLive`): Reads from plugin config and SDK version macro
- **Test** (`makePluginInfoServiceTest(overrides?)`): Returns mock plugin metadata

### ClaudeAccountInfo

Detects Claude account information for OTEL resource attributes.

```typescript
class ClaudeAccountInfo extends Context.Tag("ClaudeAccountInfo")<ClaudeAccountInfo, {
  readonly accountType: string;
  readonly organizationId: string | undefined;
}>() {}
```

- **Live** (`ClaudeAccountInfoLive`): Reads from environment variables
- **Test** (`makeClaudeAccountInfoTest(overrides?)`): Returns mock account info

### GitInfo

Provides git repository information for OTEL resource attributes.

```typescript
class GitInfo extends Context.Tag("GitInfo")<GitInfo, {
  readonly repoUrl: string | undefined;
  readonly branch: string | undefined;
  readonly commitSha: string | undefined;
}>() {}
```

- **Live** (`GitInfoLive`): Runs git commands via `ShellExecutor` to detect repo info
- **Test** (`makeGitInfoTest(overrides?)`): Returns mock git info

### MessageRouter

Routes sidecar protocol messages to OTEL providers. Replaces the previous
`SpanHandler`, `EventHandler`, and `MetricHandler` modules.

```typescript
class MessageRouter extends Context.Tag("MessageRouter")<MessageRouter, {
  readonly route: (message: SidecarProtocolMessage) => Effect.Effect<void>;
}>() {}
```

- **Live** (`MessageRouterLive`): Dispatches messages by type to the appropriate
  OTEL provider (Tracer for spans, Logger for events, Meter for metrics).
  Handles ping, span, event, metric, and shutdown message types.
- **Test** (`makeMessageRouterTest()`): No-op implementation, records routed messages

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

## PluginLive (Composed Layer)

```typescript
const OtelClientLive = pipe(TelemetryLive, Layer.provide(SidecarConnectionLive), Layer.provide(OtelConfigLive));

export const PluginLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvWriterLive, SessionStoreLive, OtelClientLive, ShellExecutorLive,
  PluginInfoServiceLive, PlatformInfoLive, GitInfoLive, ClaudeAccountInfoLive,
);
```

Provides handler dependencies (services that handlers may require via
`handlerLayer`). The runtime services (`PluginRuntimeServiceLive`,
`CommandRunnerLive`) are composed separately in the generated entrypoint's
`RuntimeLayer`.

## Outcomes Subsystem

The outcomes system (`src/outcomes/`) is not an Effect service but a core
subsystem that interacts with services. It now includes 11 outcome classes
(9 original + `Retry` and `WatchPaths`):

- **Telemetry integration**: Each outcome's `toTelemetry()` provides structured
  data for the `Telemetry` service's `emitHookExecution()` call. Extended
  outcomes automatically expose domain-specific fields as OTEL metrics.
  `NoAction.implicit()` creates instances distinguishable from explicit no-ops
  in telemetry.

- **ContextBuilder OTEL metrics**: `MarkdownContext` and `XmlContext` track
  section/rule/tag counts via their `.metrics` getter, which are included
  in telemetry emission when used with `AddContext`.

- **PluginRuntimeServiceLive interaction**: The Live layer checks
  `Outcome.isOutcome(output)` before the legacy `isHookOutput()` path.
  It calls `isValidOutcomeForHook()` (from `hooks/types.ts`) for runtime
  validation, then `outcome.toResponse()` for serialization and
  `outcome.toTelemetry()` for the telemetry service.

- **Per-hook outcome unions**: Each per-hook module (`src/hooks/{HookType}.ts`)
  exports a `{HookType}Outcome` type alias that is the union of valid outcomes
  for that hook, plus a `VALID_OUTCOME_TAGS` array for runtime validation.
  These are composed into `HookOutcomeMap` and `ALL_VALID_OUTCOME_TAGS` in
  `hooks/types.ts`.

See `architecture.md` for full outcome class details and the hook-to-outcome
mapping table.
