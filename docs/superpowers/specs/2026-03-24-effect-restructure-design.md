# Effect-First Restructure Design Spec

## Overview

Reorganize the `src/` directory to be Effect-first, remove deprecated APIs,
decompose oversized files into services and layers, and establish a clean
directory structure following the patterns in the `github-action-effects`
reference project.

## Status

- **Pre-1.0** — no external users, no backward compatibility concerns
- **Effect migration complete** — all Zod replaced with Effect Schema/Data/core
- **Service layers exist** — functional Live/Test implementations for all 7
  services, with logic to be expanded as PipelineRuntime and PluginEnv are
  decomposed

## Goals

1. Reorganize `src/` into a flat, Effect-first directory structure
2. Remove deprecated APIs (event classes, response builders, EnvCodecs,
   ToolInputGuard, HookEventSchemas facade)
3. Decompose oversized files into focused services and layers
4. Convert remaining imperative code to Effect-native patterns
5. Replace DebugLogger with Effect Logger layer
6. Move all tests to `__tests__/` directory mirroring `src/`
7. Establish two entry points: `index.ts` (public) and `testing.ts` (test utils)
8. Eliminate intermediate barrel files — direct imports only

## Non-Goals

- Full Effect-native rewrite of OTEL internals (flatten structure only)
- Refactoring `ClaudeBinaryPlugin.create()` factory (preserve current ergonomics)
- Changing the plugin author experience (plain async handlers stay)

## Design

### 1. Target Directory Structure

```text
src/
  errors/                        One Data.TaggedError per file
    SchemaValidationError.ts
    EnvLoadError.ts
    EnvPersistError.ts
    PipelineError.ts
    SessionLookupError.ts
    CommandParseError.ts
    StdinError.ts
    ShellError.ts

  schemas/                       Effect Schema definitions by domain
    hook-events.ts               10 event schemas + union + annotations
    pipeline-outputs.ts          output schemas per hook type
    json.ts                      recursive JSON schemas
    branded.ts                   SessionId, ToolUseId, HookName, TranscriptPath

  services/                      Context.Tag interfaces only
    StdinReader.ts
    SchemaValidator.ts
    EnvLoader.ts
    EnvPersister.ts
    SessionStore.ts
    Telemetry.ts
    ShellExecutor.ts
    CommandRunner.ts             NEW: replaces static Commands class
    PluginBuilder.ts             NEW: replaces static PluginBuilder class
    PluginEnv.ts                 state container service (typed var accessor)

  layers/                        Live + Test implementations
    StdinReaderLive.ts
    StdinReaderTest.ts
    SchemaValidatorLive.ts
    EnvLoaderLive.ts
    EnvLoaderTest.ts
    EnvPersisterLive.ts
    EnvPersisterTest.ts
    SessionStoreLive.ts          uses SessionRegistry internally
    SessionStoreTest.ts
    TelemetryLive.ts
    TelemetryTest.ts
    ShellExecutorLive.ts
    ShellExecutorTest.ts
    CommandRunnerLive.ts
    CommandRunnerTest.ts
    PluginBuilderLive.ts
    PluginBuilderTest.ts
    PluginEnvLive.ts             env loading, validation, persistence
    PluginEnvTest.ts
    LoggerLive.ts                NEW: Effect Logger layer (replaces DebugLogger)
    PipelineRuntime.ts           composed Effect program (hook execution)
    PipelineLive.ts              composed Layer.mergeAll of all Live layers
    SessionRegistry.ts           SQLite backing implementation

  plugin/                        user-facing SDK factory
    config.ts                    ClaudeBinaryPlugin.create() + types

  otel/                          flattened, no classes/ nesting
    OtelConfig.ts
    TelemetryEmitter.ts
    TelemetryMetrics.ts
    TelemetrySpan.ts
    Platform.ts
    GitInfo.ts
    PluginInfo.ts
    SidecarLauncher.ts
    SidecarClient.ts
    SidecarClientPool.ts
    SidecarMessage.ts
    SidecarServer.ts
    SidecarExporters.ts
    SidecarProviders.ts
    SidecarResource.ts
    SidecarRouter.ts
    SidecarLifecycle.ts
    SidecarLog.ts
    EventHandler.ts
    MetricHandler.ts
    SpanHandler.ts
    protocol.ts
    SessionEnv.ts
    ClaudeAccountInfo.ts
    version.macro.ts

  build/                         decomposed from monolithic builder
    EntrypointGenerator.ts       generates hook entrypoint TS
    ManifestGenerator.ts         generates hooks.json
    HookExtractor.ts             extracts hook entries from config
    CommandExtractor.ts          extracts command entries
    ProxyTemplate.ts             proxy template for dev mode

  cli/                           CLI entry point
    index.ts                     @effect/cli build command
    macros.ts                    template macros

  types/                         pure TypeScript types (no schemas)
    hook-events.ts               HookType enum, input/output interfaces
    pipeline.ts                  pipeline output types, metrics types,
                                 pipeline utility functions
    plugin-state.ts              BaseState, computed state types, setup types
    tool-inputs.ts               tool input interfaces + type guards
    json.ts                      type-fest re-exports (JsonValue, Jsonify, etc.)
    common.ts                    shared types (IO, ContentType, type-fest
                                 utility re-exports from current utility.ts)

  index.ts                       public API entry point
  testing.ts                     test utilities entry point

__tests__/                       mirrors src/ structure
  errors/
    SchemaValidationError.test.ts
    ...
  schemas/
    hook-events.test.ts
    pipeline-outputs.test.ts
    ...
  services/
    PluginEnv.test.ts
    ...
  layers/
    StdinReaderLive.test.ts
    SessionStoreLive.test.ts
    SessionRegistry.test.ts
    CommandRunnerLive.test.ts
    PipelineRuntime.test.ts
    PluginEnvLive.test.ts
    LoggerLive.test.ts
    ...
  plugin/
    config.test.ts
  build/
    EntrypointGenerator.test.ts
    ManifestGenerator.test.ts
    ...
  otel/
    OtelConfig.test.ts
    TelemetryEmitter.test.ts
    SidecarClient.test.ts
    ...                          23 test files (flattened)
  cli/
    index.test.ts
  types/
    tool-inputs.test.ts
```

### 2. Deprecation and Removal

#### Files Deleted Entirely

| File | Reason |
| --- | --- |
| `src/events/classes/HookEvent.ts` | Event class API deprecated |
| `src/events/classes/PreToolUseEvent.ts` | (and all other 9 subclasses) |
| `src/events/classes/ResponseBuilders.ts` | Builder pattern deprecated |
| `src/events/classes/SchemaValidator.ts` | Logic moves to SchemaValidatorLive |
| `src/events/types.ts` | Moves to `src/types/hook-events.ts` |
| `src/events/enums.ts` | Moves to `src/types/hook-events.ts` |
| `src/events/response-types.ts` | Deprecated with response builders |
| `src/state/classes/EnvCodecs.ts` | Replaced by Effect Schema transforms |
| `src/core/schemas.ts` | Moves to `src/schemas/hook-events.ts` |
| `src/core/tool-inputs.ts` | Moves to `src/types/tool-inputs.ts` |
| `src/testing/builder.ts` | Rewritten as thin wrapper using layers |
| `src/testing/mocks.ts` | Test utilities move to `src/testing.ts` |
| `src/commands/runtime.ts` | Becomes CommandRunner service + layer |
| `src/build/builder.ts` | Decomposed into 5 focused files |
| `src/utils/debug-logger.ts` | Replaced by Effect Logger layer |

#### Directories Removed

- `src/events/` — entirely (event class API deprecated)
- `src/core/` — contents moved to `schemas/` and `types/`
- `src/commands/` — becomes CommandRunner service
- `src/testing/` — replaced by `src/testing.ts` + test factories in `layers/`
- `src/utils/` — DebugLogger replaced by Logger layer
- `src/pipeline/` — config moves to `plugin/`, runtime moves to `layers/`,
  types move to `types/pipeline.ts`, metrics absorbed into types or services
- `src/state/` — PluginEnv moves to `services/`, SessionRegistry moves to
  `layers/`, types move to `types/plugin-state.ts`
- `src/otel/classes/` — flattened into `src/otel/`
- `src/otel/sidecar/classes/` — flattened into `src/otel/`

### 3. Effect-Native Conversions

#### Commands to CommandRunner Service

Static `Commands` class becomes an Effect service:

```typescript
// services/CommandRunner.ts
export class CommandRunner extends Context.Tag("CommandRunner")<CommandRunner, {
  readonly run: <TArgs>(
    options: RunCommandOptions<TArgs>,
  ) => Effect.Effect<CommandOutput, CommandParseError>;
  readonly parse: <TArgs>(
    schema: Schema.Schema<TArgs>,
    args: string[],
  ) => Effect.Effect<TArgs, CommandParseError>;
}>() {}
```

No more `process.exit()` in command handling — the Effect program handles
exit at the top level.

#### PluginBuilder Decomposition

The 2,047-line static class decomposes into a service backed by focused
modules in `build/`:

```typescript
// services/PluginBuilder.ts
export class PluginBuilder extends Context.Tag("PluginBuilder")<PluginBuilder, {
  readonly extractHooks: (config: PluginConfig) => Effect.Effect<HookEntry[]>;
  readonly extractCommands: (config: PluginConfig) => Effect.Effect<CommandEntry[]>;
  readonly generateEntrypoint: (entries: HookEntry[]) => Effect.Effect<string>;
  readonly generateManifest: (entries: HookEntry[]) => Effect.Effect<string>;
  readonly compile: (
    entrypoint: string,
    options: CompileOptions,
  ) => Effect.Effect<void, ShellError>;
}>() {}
```

The Live layer delegates to the focused files in `build/`:
`EntrypointGenerator.ts`, `ManifestGenerator.ts`, `HookExtractor.ts`,
`CommandExtractor.ts`.

#### PipelineRuntime as Effect Program

The procedural `run()` method becomes a composed Effect program:

```typescript
// layers/PipelineRuntime.ts
export const runHook = (config: PipelineConfig) =>
  Effect.gen(function* () {
    const stdin = yield* StdinReader;
    const validator = yield* SchemaValidator;
    const envLoader = yield* EnvLoader;
    const telemetry = yield* Telemetry;

    const raw = yield* stdin.read();
    const event = yield* validator.decode(raw, HookEventSchema);

    yield* envLoader.loadHookFiles(sessionEnvDir);
    const state = yield* loadState(event);

    const output = yield* Effect.tryPromise({
      try: () => config.pipeline({ input, options, state }),
      catch: (cause) => new PipelineError({
        hookName: config.hookName,
        stage: "handler",
        cause,
      }),
    });

    yield* telemetry.emitHookExecution({ ... });
    return output;
  }).pipe(
    Effect.withSpan("hook.execution"),
    withErrorTelemetry,
  );
```

#### PluginEnv Decomposition

The 1,680-line class loses its I/O responsibilities to services:

- File loading → `EnvLoaderLive`
- Validation → `SchemaValidatorLive`
- Persistence → `EnvPersisterLive`
- Session lookup → `SessionStoreLive`

What remains is `services/PluginEnv.ts` — a `Context.Tag` service with a
thin typed state container (~200 lines) providing `get()`, `require()`, and
vars accessor. Its Live layer (`layers/PluginEnvLive.ts`) orchestrates env
loading, validation, and persistence by depending on the other services.
`types/plugin-state.ts` holds the `BaseState` interface and computed state
types. `layers/SessionRegistry.ts` is the SQLite backing implementation
used internally by `SessionStoreLive`.

#### DebugLogger to Effect Logger Layer

The 585-line custom `DebugLogger` is replaced by Effect's built-in Logger
system:

```typescript
// layers/LoggerLive.ts
export const LoggerLive = (
  level?: LogLevel.LogLevel,
  logFile?: string,
): Layer.Layer<never> => {
  if (!level || level._tag === "None") {
    return Logger.replace(Logger.defaultLogger, Logger.none);
  }

  const stderrLogger = Logger.structuredLogger.pipe(
    Logger.map((entry) => JSON.stringify(entry)),
    Logger.withConsoleError,
  );

  // Optional file logger via Logger.zip
  // LogLevel gating from CLAUDE_DEBUG env var

  return Layer.merge(
    Logger.replace(Logger.defaultLogger, stderrLogger),
    Logger.minimumLogLevel(level),
  );
};
```

All `this.log.debug(...)` / `this.log.info(...)` calls become
`Effect.logDebug(...)` / `Effect.logInfo(...)`. Tests provide `Logger.none`
to silence output.

### 4. OTEL Flattening

The OTEL subsystem keeps its imperative internals but gets a flat structure:

**Before:**

```text
src/otel/
  classes/
    OtelConfig.ts
    TelemetryEmitter.ts
    ...
  sidecar/
    classes/
      SidecarServer.ts
      EventHandler.ts
      ...
```

**After:**

```text
src/otel/
  OtelConfig.ts
  TelemetryEmitter.ts
  SidecarServer.ts
  EventHandler.ts
  ...
```

All files move up to `src/otel/` with no sub-nesting. Import paths shorten.
No behavioral changes.

### 5. Schema.Class Adoption

Replace manual `interface + Schema.Struct + type alias` patterns with
`Schema.Class` declarations that provide the type, schema, and `instanceof`
check in a single declaration.

**Before (current pattern):**

```typescript
// schemas/hook-events.ts
export const PreToolUseEventSchema = Schema.Struct({
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
  session_id: SessionIdSchema,
});
export type PreToolUseEventParsed = typeof PreToolUseEventSchema.Type;

// types/hook-events.ts (separate file)
export interface PreToolUseInput {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: JsonObject;
  tool_use_id: string;
  session_id: string;
}
```

**After (Schema.Class):**

```typescript
// schemas/hook-events.ts — single declaration, type + schema + instanceof
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>(
  "PreToolUseEvent",
)({
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
  session_id: SessionIdSchema,
  transcript_path: Schema.optional(TranscriptPathSchema),
  cwd: Schema.optional(Schema.String),
  permission_mode: Schema.optional(HookPermissionsModeSchema),
}) {}

// Usage:
const event = Schema.decodeUnknownSync(PreToolUseEvent)(data);
event.tool_name;        // string — fully typed
event instanceof PreToolUseEvent;  // true — instanceof works
```

**Where to apply:**

| Category | Files | Count | Value |
| --- | --- | --- | --- |
| Hook event types | `schemas/hook-events.ts` | 10 classes | Eliminates duplicate interfaces in `types/` |
| OTEL protocol | `otel/protocol.ts` | 15+ types | Adds validation to unvalidated protocol |
| Service return types | `services/*.ts` | 3-5 types | Runtime validation at service boundaries |
| Session records | `layers/SessionRegistry.ts` | 2 types | Database record validation |
| Pipeline outputs | `schemas/pipeline-outputs.ts` | 6+ types | Already have schemas, just consolidate |

**What NOT to convert:**

- Pure utility types (`ContentType`, `IO`) — no runtime validation needed
- Generic handler context types in `plugin/config.ts` — complex generics
  don't fit Schema.Class
- Test fixture types — internal, no validation needed

**Impact on types/ directory:** Many interfaces in `types/hook-events.ts`
become unnecessary because Schema.Class provides the types. The
`types/hook-events.ts` file shrinks to just the `HookType` enum and any
types not backed by schemas (like discriminated union aliases).

### 6. Entry Points

Two entry points, no intermediate barrel files:

**`src/index.ts`** — public API for plugin authors:

- `ClaudeBinaryPlugin` — plugin definition factory
- All service tags — for advanced Effect users
- `PipelineLive` — composed layer
- Error types — for `catchTag` usage
- Schema constructors — branded types
- Types — all input/output interfaces, hook types
- `PluginEnv` — state container
- `OtelConfig` — opt-in telemetry config

**`src/testing.ts`** — test utilities:

- All test layer factories (`makeStdinReaderTest`, etc.)
- `PipelineTest` — composed test layer
- `PluginTester` — fluent test API (rewritten to use layers internally)

**Import rule:** Code within `src/` imports directly from source files
(e.g., `../errors/SchemaValidationError.js`), never from `index.ts` or
`testing.ts`. Only consumers of the published package use the entry points.

### 6. PluginTester

The fluent test API is preserved but rewritten internally:

```typescript
const result = await plugin.test()
  .withOptions({ apiKey: "test-key" })
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("validate-tool");

expect(result.action).toBe("allow");
```

Internally, `.runHook()` builds a test layer from the fluent config and runs
the pipeline Effect with `Effect.provide(testLayer)`. No global mocking.

Raw layer factories are also exported from `testing.ts` for advanced users
who want to compose layers directly.

### 7. JSON Type Split

The current `src/types/json.ts` contains both Effect Schema definitions
(JsonValueSchema, JsonObjectSchema) and pure type re-exports from type-fest
(JsonValue, JsonObject, Jsonify). These split:

- `src/schemas/json.ts` — Effect Schema definitions (JsonValueSchema,
  JsonObjectSchema, JsonArraySchema, JsonPrimitiveSchema)
- `src/types/json.ts` — type-fest re-exports (JsonValue, JsonObject,
  JsonPrimitive, JsonArray, Jsonifiable, Jsonify) and utility types
  (OtelAttributeValue, OtelAttributes, OtelHeaders, ParsedJson,
  JsonObjectWith)

### 8. Test Migration Strategy

All 54 `.test.ts` files move from colocated positions to `__tests__/`
mirroring the `src/` structure. The migration happens in one pass alongside
the source restructuring — since every import path changes anyway, fixing
test imports is part of the same work.

The `__tests__/` tree includes subdirectories for all source directories:

```text
__tests__/
  errors/
  schemas/
  layers/
  pipeline/
  state/
  otel/              23 test files (flattened from classes/ + sidecar/)
  build/
  cli/
  types/
```

Test configuration in `bunfig.toml` or the test script points to
`__tests__/**/*.test.ts` instead of the current colocated pattern.

## Files Affected

### New Files (truly new)

| Path | Purpose |
| --- | --- |
| `src/services/CommandRunner.ts` | Service tag (replaces Commands class) |
| `src/services/PluginBuilder.ts` | Service tag (replaces PluginBuilder class) |
| `src/services/PluginEnv.ts` | Service tag (thinned from state class) |
| `src/layers/CommandRunnerLive.ts` | Live implementation |
| `src/layers/CommandRunnerTest.ts` | Test factory |
| `src/layers/PluginBuilderLive.ts` | Live implementation |
| `src/layers/PluginBuilderTest.ts` | Test factory |
| `src/layers/PluginEnvLive.ts` | Env orchestration layer |
| `src/layers/PluginEnvTest.ts` | Test factory |
| `src/layers/LoggerLive.ts` | Effect Logger layer (replaces DebugLogger) |
| `src/build/EntrypointGenerator.ts` | Decomposed from builder.ts |
| `src/build/ManifestGenerator.ts` | Decomposed from builder.ts |
| `src/build/HookExtractor.ts` | Decomposed from builder.ts |
| `src/build/CommandExtractor.ts` | Decomposed from builder.ts |
| `src/types/plugin-state.ts` | Types extracted from PluginEnv |
| `src/types/common.ts` | Shared types merged from various files |
| `src/testing.ts` | Test utilities entry point |

### Moved Files

| From | To | Notes |
| --- | --- | --- |
| `src/pipeline/config.ts` | `src/plugin/config.ts` | User-facing factory |
| `src/pipeline/classes/PipelineRuntime.ts` | `src/layers/PipelineRuntime.ts` | Rewritten as Effect program |
| `src/pipeline/classes/Pipeline.ts` | `src/types/pipeline.ts` | Utilities + types merged |
| `src/pipeline/types.ts` | `src/types/pipeline.ts` | Non-schema output types |
| `src/pipeline/metrics.ts` | `src/types/pipeline.ts` | Token metrics types |
| `src/state/classes/PluginEnv.ts` | `src/services/PluginEnv.ts` | Thinned to service tag |
| `src/state/classes/SessionRegistry.ts` | `src/layers/SessionRegistry.ts` | SQLite backing impl |
| `src/types/branded.ts` | `src/schemas/branded.ts` | Schema definitions |
| `src/types/json.ts` | `src/schemas/json.ts` + `src/types/json.ts` | Split schemas vs types |
| `src/core/schemas.ts` | `src/schemas/hook-events.ts` | Renamed |
| `src/core/tool-inputs.ts` | `src/types/tool-inputs.ts` | Renamed |
| `src/build/proxy-template.ts` | `src/build/ProxyTemplate.ts` | PascalCase |
| `src/errors/index.ts` (inline) | `src/errors/*.ts` (8 files) | One error per file |
| `src/services/*.ts` (Live/Test) | `src/layers/*.ts` | Implementations split out |
| `src/services/index.ts` (PipelineLive) | `src/layers/PipelineLive.ts` | Composed layer |
| All colocated `*.test.ts` | `__tests__/` | Mirroring src/ structure |

### Deleted Files (no successor)

- `src/events/` — entire directory (deprecated event class API: 10
  subclasses + HookEvent + ResponseBuilders + SchemaValidator + types +
  enums + response-types)
- `src/commands/` — entire directory (replaced by CommandRunner service)
- `src/testing/` — entire directory (replaced by `testing.ts` + layer
  factories)
- `src/utils/` — entire directory (replaced by LoggerLive)
- `src/state/classes/EnvCodecs.ts` — replaced by Effect Schema
- `src/build/builder.ts` — decomposed into 4 focused files
- `src/services/index.ts` — barrel file eliminated
- `src/otel/classes/Sidecar.ts` — facade absorbed into flattened structure
- `src/types/utility.ts` — contents merged into `src/types/common.ts`

### Deleted Directories (contents moved)

- `src/core/` — schemas → `schemas/`, tool-inputs → `types/`
- `src/pipeline/` — config → `plugin/`, runtime → `layers/`, types → `types/`
- `src/state/` — PluginEnv → `services/`, SessionRegistry → `layers/`
- `src/otel/classes/` — flattened into `src/otel/`
- `src/otel/sidecar/classes/` — flattened into `src/otel/`

### Modified Files

- `src/services/*.ts` — existing service tags stripped of Live/Test code
- `src/cli/index.ts` — import path updates
- `src/index.ts` — rewritten with new export structure
- `src/otel/*.ts` — all files moved up, import paths updated
