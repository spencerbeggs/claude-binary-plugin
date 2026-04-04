# Architecture

## Overview

`claude-binary-plugin` is a TypeScript SDK for building Claude Code plugins
that compile to single-file Bun executables. It uses Effect for typed
functional programming with services, layers, and Schema.Class validation.

## Monorepo Structure

The project is a Bun workspace monorepo with two packages:

| Package | Purpose |
| --------- | --------- |
 | `package/` | The `claude-binary-plugin` SDK (source, tests, build output) |
| `plugin/` | A test plugin that dogfoods the SDK |

## Directory Layout (`package/src/`)

```text
src/
  index.ts              # Public entry point (all SDK exports)
  testing.ts            # Test utility entry point (test factories)
  build/                # Build system (PluginBuilder, code generation)
    builder.ts          # PluginBuilder static class (public facade)
    HookExtractor.ts    # Extract hook entries from plugin config
    CommandExtractor.ts # Extract command entries from plugin config
    EntrypointGenerator.ts  # Generate TypeScript entrypoint source
    ManifestGenerator.ts    # Generate hooks.json manifest
    ProxyTemplate.ts        # Generate proxy shell script
  commands/             # Command system runtime
    runtime.ts          # CommandArgumentError, EmptyArgs type
  errors/               # Data.TaggedError definitions (one per file)
  hooks/                # Per-hook modules (26 files + shared + types)
    PreToolUse.ts       # Input, Event, Output, Response, Handler, HookDef, Outcome union
    PostToolUse.ts      # Same co-located pattern for each hook
    PermissionDenied.ts # New hook type (26th) — Retry | NoAction outcomes
    ... (24 more)       # One file per hook type
    shared.ts           # Shared infrastructure: metadata, output schemas, passthrough patterns
    types.ts            # HooksMap, InferHandlers, HookOutcomeMap, ALL_VALID_OUTCOME_TAGS, isValidOutcomeForHook
  layers/               # Service implementations (Live + Test)
    PluginRuntime.ts    # Type exports only (HookEventTypeName, IODependencies, PluginRunConfig)
    PluginRuntimeServiceLive.ts  # PluginRuntimeService Live layer
    PluginLive.ts       # Composed service layer for handler dependencies
    CommandRunnerLive.ts # CommandRunner Live layer (full run + parse)
    PluginLoggerLive.ts # NDJSON file logger
    PluginLoggerTest.ts # In-memory test logger
    SessionRegistry.ts  # SQLite session-to-env-dir mapping (facade module with exported functions)
    SidecarConnectionLive.ts  # Unix socket IPC to OTEL sidecar
    SidecarLoggerLive.ts      # Sidecar process file logger
    SidecarTransportLive.ts   # Sidecar Unix socket server
    *Live.ts            # Production implementations
    *Test.ts            # Test factory functions
  otel/                 # OpenTelemetry subsystem (~95% Effect-native)
  outcomes/             # Outcome system (typed hook return values)
    Outcome.ts          # Abstract base class with isOutcome(), resolveContext()
    Allow.ts            # PreToolUse/PermissionRequest: permit action
    Deny.ts             # PreToolUse/PermissionRequest: reject action
    Ask.ts              # PreToolUse: prompt user for confirmation
    Modify.ts           # PreToolUse: change tool input before execution
    Block.ts            # PostToolUse/Stop: halt continuation
    Continue.ts         # PostToolUse/Stop: allow continuation
    AddContext.ts       # SessionStart/PostToolUse: inject additionalContext
    NoAction.ts         # Passthrough: no-op response (with .implicit() static factory)
    Skip.ts             # Any actionable hook: skip without acting
    Retry.ts            # PermissionDenied: retry the denied action
    WatchPaths.ts       # CwdChanged/FileChanged: specify paths to watch
    ContextBuilder.ts   # MarkdownContext, XmlContext for composing context
  plugin/               # Plugin configuration and orchestration (decomposed)
    config.ts           # PluginConfig Schema.Class, ClaudePlugin orchestrator, re-exports
    handler.ts          # PluginHandler, HookDefinition, ToolFilter types
    commands.ts         # Command system types and definitions
    infer.ts            # InferHandlers, InferPluginOptions, InferPluginState, etc.
    state.ts            # State management types and utilities
  schemas/              # Effect Schema definitions (reduced after hooks refactor)
    branded.ts          # Branded types (SessionId, ToolUseId, TranscriptPath, NormalizedPath)
    hook-events.ts      # HookEventSchemas union registry (still provides discriminated union)
    hook-literals.ts    # Literal union schemas (HookType enum, permissions, etc.)
    json.ts             # JSON schema utilities
  services/             # Effect Context.Tag service interfaces
    PluginRuntimeService.ts  # Hook execution service (RunResult, PluginRunConfig)
  testing/              # Test utilities
    builder.ts          # PluginTester fluent API
    mocks.ts            # Mock types and utilities
  types/                # TypeScript type definitions
    common.ts           # Re-exported type-fest utilities
    json.ts             # JSON type definitions
    pipeline.ts         # Pipeline utilities, TokenMetrics
    plugin-state.ts     # Validation error types
    tool-inputs.ts      # Typed tool input interfaces
```

## Three-File Pattern (PluginConfig + ClaudePlugin)

Plugins use a three-file pattern with clear separation of concerns:

1. **`plugin.config.ts`** -- Schema declarations via `PluginConfig.extend()`
2. **`hooks/*.ts`** -- Handler files typed via `InferHandlers<typeof MyConfig>`
3. **`plugin.build.ts`** -- Wires handlers to config via `ClaudePlugin`, builds

### plugin.config.ts -- declares what the plugin is

```typescript
import { PluginConfig } from "claude-binary-plugin";
import type { InferHandlers } from "claude-binary-plugin";
import { Schema } from "effect";

class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
  prefix: Schema.Literal("MY_PLUGIN"),
}) {
  static readonly options = Schema.Struct({
    MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
      default: () => "strict" as const,
    }),
  });
  static readonly state = MyState;
  static readonly setup = async () => new MyState({ git: true });
}

export type Handlers = InferHandlers<typeof MyConfig>;
export default MyConfig;
```

### hooks/*.ts -- typed handlers

```typescript
import type { Handlers } from "../plugin.config.js";
import { Allow, Deny } from "claude-binary-plugin";

const handler: Handlers["PreToolUse"] = ({ input, options, state }) => {
  if (options.MODE === "strict" && input.tool_name === "Bash") {
    return new Deny({ summary: "blocked", reason: "strict mode" });
  }
  return new Allow({ summary: "ok" });
};
export default handler;
```

### plugin.build.ts -- wires handlers and builds

```typescript
import { ClaudePlugin } from "claude-binary-plugin";
import MyConfig from "./plugin.config.js";
import guardHandler from "./hooks/guard.js";

const plugin = new ClaudePlugin(MyConfig, {
  PreToolUse: [{ name: "guard", handler: guardHandler }],
});
await plugin.build({ rootDir: import.meta.dir });
```

### How It Works

- `PluginConfig` is a `Schema.Class` with an empty base. Users call
  `.extend()` to add Schema fields (like `prefix` via `Schema.Literal`)
- Meta-level schemas (`options`, `state`, `setup`) go as `static readonly`
  properties -- these survive Bun's tree-shaking
- `ClaudePlugin` is a runtime orchestrator that takes a config class +
  hooks map and provides `.build()` and `.test()` methods
- Config describes *what the plugin is*; `ClaudePlugin` describes
  *what it does* (which handlers run for which hooks)
- Zero explicit generics -- types are inferred from statics

### Key Classes and Types

| Type | Location | Purpose |
| --------- | -------- | ------- |
| `PluginConfig` | `plugin/config.ts` | Schema.Class base for config subclasses |
| `ClaudePlugin<TConfig>` | `plugin/config.ts` | Runtime orchestrator (config + hooks) |
| `InferHandlers<T>` | `hooks/types.ts` | Extract typed handler signatures from config statics |
| `InferPluginOptions<T>` | `plugin/infer.ts` | Extract options type from config statics |
| `InferPluginState<T>` | `plugin/infer.ts` | Extract state type from config statics |
| `InferPluginCommands<T>` | `plugin/infer.ts` | Extract command handler types |
| `ExtractOptionsSchema<T>` | `plugin/infer.ts` | Read `options` static property |
| `ExtractStateSchema<T>` | `plugin/infer.ts` | Read `state` static property |
| `PluginHandler<O,S,T>` | `plugin/handler.ts` | Base handler function type with outcome constraint |
| `HookDefinition<O,S,T>` | `plugin/handler.ts` | Hook definition (name + handler + tools) |
| `HooksMap<TConfig>` | `hooks/types.ts` | Maps hook names to definition arrays |
| `HookOutcomeMap` | `hooks/types.ts` | Maps hook names to valid outcome unions |

## Outcomes System

Outcomes are typed return values from hook handlers. Each outcome is a
`Schema.Class` that extends an abstract `Outcome` base class. Outcomes
replace the legacy `{ status, action, summary }` hook output objects
with a cleaner, type-safe API.

### Compile-Time Outcome Type Safety

`PluginHandler` has a `TOutcome` generic parameter that constrains which
outcome types are valid for each hook. Each handler type (e.g.,
`PreToolUseHandler`, `PostToolUseHandler`) restricts the return type to
only the outcomes valid for that hook, providing compile-time safety.

### Outcome Classes

| Class | Hook Types | Wire Response |
| ----- | ---------- | ------------- |
| `Allow` | PreToolUse, PermissionRequest | `{ permissionDecision: "allow" }` |
| `Deny` | PreToolUse, PermissionRequest | `{ permissionDecision: "deny", reason }` |
| `Ask` | PreToolUse | `{ permissionDecision: "ask", message }` |
| `Modify` | PreToolUse | `{ permissionDecision: "allow", updatedInput }` |
| `Block` | PostToolUse, Stop, SubagentStop | `{ decision: "block", reason }` |
| `Continue` | PostToolUse, Stop, SubagentStop | `{}` |
| `AddContext` | SessionStart, PostToolUse, UserPromptSubmit | `{ additionalContext }` |
| `NoAction` | Any (passthrough) | `{}` |
| `Skip` | Any actionable hook | `{}` |
| `Retry` | PermissionDenied | `{ hookSpecificOutput: { retry: true } }` |
| `WatchPaths` | CwdChanged, FileChanged | `{ watchPaths: [...] }` |

### Outcome Architecture

Each outcome class:

- Is a `Schema.Class` with named fields (e.g., `summary`, `reason`)
- Has `toResponse()` returning the Claude Code wire format
- Has `toTelemetry()` returning OTEL span attributes
- Has a static `_tag` for identification (e.g., `"Allow"`, `"Deny"`)
- Extends `Outcome` via `Object.setPrototypeOf` (not class inheritance,
  because `Schema.Class` controls the prototype chain)
- Supports extension via `Schema.Class.extend()` for custom telemetry fields

`NoAction` also provides a static `NoAction.implicit()` factory that creates
an instance marked as implicit (for distinguishing missing handler returns
from explicit no-op returns in OTEL telemetry).

### Extending Outcomes

Users can add domain-specific fields that automatically become OTEL metrics:

```typescript
class SecurityAllow extends Allow.extend<SecurityAllow>("SecurityAllow")({
  riskLevel: Schema.Literal("none", "low"),
  scannedPatterns: Schema.Number,
}) {}

// Domain fields (riskLevel, scannedPatterns) are emitted as telemetry metrics
return new SecurityAllow({
  summary: "tool is safe",
  riskLevel: "none",
  scannedPatterns: 42,
});
```

### ContextBuilder

`ContextBuilder` is an abstract base for composing `additionalContext` strings.
Two concrete implementations are provided:

- `MarkdownContext` -- fluent API with `.heading()`, `.paragraph()`, `.list()`,
  `.codeBlock()`, `.rule()`. Tracks section and rule counts for OTEL metrics.
- `XmlContext` -- fluent API with `.tag()`, `.cdata()`. Tracks tag counts.

Both expose a `.metrics` getter returning `Record<string, number>` for OTEL.
`AddContext` accepts either a raw string or a `ContextBuilder` instance as
its `context` field. The SDK resolves it to a string at response time.

### Outcome Validation

`isValidOutcomeForHook(hookType, outcome)` validates at runtime that a
handler returned a valid outcome for its hook type. The mapping is defined
in `ALL_VALID_OUTCOME_TAGS` in `hooks/types.ts` (composed from per-hook
`VALID_OUTCOME_TAGS` exports). `PluginRuntimeServiceLive` calls this before
serializing the response; invalid outcomes cause a `PluginRuntimeError`.

### Backward Compatibility

`PluginRuntimeServiceLive` checks `Outcome.isOutcome(output)` first
(new path), then falls back to `isHookOutput(output)` (legacy path).
Both paths work -- existing handlers returning `{ status, action, summary }`
objects continue to function unchanged.

## Effect Service/Layer Pattern

Services are defined as `Context.Tag` interfaces in `src/services/`. Each service
has a Live implementation (production) and a Test factory (testing) in `src/layers/`.

```text
Service (Context.Tag)     Layer (implementation)
  StdinReader         ->  StdinReaderLive / makeStdinReaderTest
  SchemaValidator     ->  SchemaValidatorLive
  EnvLoader           ->  EnvLoaderLive / EnvLoaderTest
  EnvWriter           ->  EnvWriterLive / makeEnvWriterTest
  EnvBridge           ->  EnvBridgeLive / makeEnvBridgeTest
  EnvValidator        ->  EnvValidatorLive
  EnvResolver         ->  EnvResolverLive / makeEnvResolverTest
  EnvCoordinator      ->  EnvCoordinatorLive / makeEnvCoordinatorTest
  SessionStore        ->  SessionStoreLive / makeSessionStoreTest
  ShellExecutor       ->  ShellExecutorLive / makeShellExecutorTest
  Telemetry           ->  TelemetryLive / makeTelemetryTest
  OtelConfig          ->  OtelConfigLive / makeOtelConfigTest
  SidecarConnection   ->  SidecarConnectionLive / makeSidecarConnectionTest
  CommandRunner       ->  CommandRunnerLive / makeCommandRunnerTest
  PluginRuntimeService -> PluginRuntimeServiceLive
  PluginBuilderService -> PluginBuilderLive / makePluginBuilderTest
  PlatformInfo        ->  PlatformInfoLive / makePlatformInfoTest
  PluginInfoService   ->  PluginInfoServiceLive / makePluginInfoServiceTest
  ClaudeAccountInfo   ->  ClaudeAccountInfoLive / makeClaudeAccountInfoTest
  GitInfo             ->  GitInfoLive / makeGitInfoTest
  MessageRouter       ->  MessageRouterLive / makeMessageRouterTest
```

## PluginLive (Handler Dependencies Layer)

`PluginLive` merges all production service layers into a single layer
that satisfies handler Effect dependencies. It does NOT include the
runtime services themselves -- those are composed separately.

The EnvCoordinator dependency graph is:

```text
EnvCoordinator
  +-- EnvLoader
  +-- EnvWriter
  +-- EnvBridge
  +-- EnvResolver
  +-- EnvValidator
```

```typescript
const OtelClientLive = pipe(TelemetryLive, Layer.provide(SidecarConnectionLive), Layer.provide(OtelConfigLive));

export const PluginLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvWriterLive, SessionStoreLive, OtelClientLive, ShellExecutorLive,
  PluginInfoServiceLive, PlatformInfoLive, GitInfoLive, ClaudeAccountInfoLive,
);
```

## Generated Entrypoint Architecture

The generated entrypoint owns the process lifecycle. Services return typed
results; the entrypoint writes stdout and manages process.exit:

```text
Generated Entrypoint (owns stdout + process.exit)
  +-- Effect.gen + Effect.provide(RuntimeLayer)
       +-- PluginRuntimeServiceLive.run() -> RunResult { code, response, telemetry? }
       +-- CommandRunnerLive.run() -> CommandOutput { exitCode, output, data? }
```

```typescript
const RuntimeLayer = Layer.merge(PluginRuntimeServiceLive, CommandRunnerLive);

// Hook execution
const result = await Effect.runPromise(
  Effect.gen(function* () {
    const runtime = yield* PluginRuntimeService;
    return yield* runtime.run({ hookType, hookName, handler, ... });
  }).pipe(Effect.provide(RuntimeLayer))
);
process.stdout.write(JSON.stringify(result.response));

// Command execution
const result = await Effect.runPromise(
  Effect.gen(function* () {
    const runner = yield* CommandRunner;
    return yield* runner.run({ commandName, handler, rawArgs, ... });
  }).pipe(Effect.provide(RuntimeLayer))
);
console.log(result.output);
process.exit(result.exitCode);
```

No `process.exit()` anywhere in service code -- the entrypoint is the sole
owner of process lifecycle.

## PluginRuntimeService Execution Flow

`PluginRuntimeServiceLive.run()` executes hook handlers and returns
`RunResult` instead of writing stdout or calling `process.exit()`:

1. Read stdin (pre-loaded `inputText` or `Bun.stdin.text()`)
2. JSON parse and Schema decode input via `getHookSchemas()`
3. Convert decoded input to Event instance via `fromInput()`
4. Check tool filter (PreToolUse/PostToolUse only)
5. Load environment via `EnvCoordinator.forSessionStart()` or `EnvCoordinator.forHook()`
6. Run `setup()` and persist state if SessionStart
7. Call handler with `{ input, options, state }`
8. Handle sync, Promise, or Effect returns from handler
9. **Check if output is an Outcome** (via `Outcome.isOutcome()`):
   - Validate via `isValidOutcomeForHook()` -- fail with `PluginRuntimeError` if invalid
   - Extract telemetry via `outcome.toTelemetry()`
   - Return `RunResult` with `outcome.toResponse()`
10. **Else check if output is a legacy HookOutput** (via `isHookOutput()`):
    - Map status/action to telemetry outcome label
    - Convert via `toResponseForHook()` functions
    - Return `RunResult`
11. Emit OTEL telemetry throughout
12. Errors become `PluginRuntimeError` with `hookName`, `stage`, `cause`

### CommandRunner Execution Flow

`CommandRunnerLive.run()` executes commands and returns `CommandOutput`:

1. Parse raw CLI args via `parseRaw()`
2. Validate args against `argsSchema` (if provided)
3. Find session env dir via SessionRegistry directly
4. Load session env files via `EnvCoordinator.forCommand()`
5. Create state instance, extract options and persisted state
6. Call handler with `{ args, options, state }`
7. Validate output via `validateOutput()`
8. Return `CommandOutput { exitCode, output, data? }`

### State Schema.Class Support

When `PluginConfig.state` is a `Schema.Class`, the pipeline:

- **SessionStart**: Encodes state via `Schema.encodeUnknownSync(stateSchema)`
  before persisting to env files
- **Subsequent hooks**: Decodes via `Schema.decodeUnknownSync(stateSchema)`
  to reconstruct a typed instance with methods
- **Prototype preservation**: Uses `Object.assign(Object.create(proto), state, baseState)`
  to ensure decoded state retains `Schema.Class` prototype methods

## PluginLoggerLive

NDJSON file logger using Effect's `Logger.make` piped through
`PlatformLogger.toFile` with `BunFileSystem`. Enabled when `CLAUDE_DEBUG` is set.
Falls back to `Logger.none` when disabled or on file open failure. Each log
entry includes timestamp, level, message, fiber, channel, and pluginName.

## Error Handling

All errors use `Data.TaggedError`, one per file in `src/errors/`:

| Error | Tag | Fields |
| ------- | ----- | -------- |
 | PluginRuntimeError | `"PluginRuntimeError"` | hookName, stage, cause |
| SchemaValidationError | `"SchemaValidationError"` | message, issues |
| StdinError | `"StdinError"` | message |
| EnvLoadError | `"EnvLoadError"` | message |
| EnvPersistError | `"EnvPersistError"` | message |
| SessionLookupError | `"SessionLookupError"` | message |
| ShellError | `"ShellError"` | message |
| CommandParseError | `"CommandParseError"` | message |
| OtelConfigError | `"OtelConfigError"` | message |
| SidecarError | `"SidecarError"` | stage, message, cause |

## State Management

**EnvCoordinator** orchestrates env flows for SessionStart, hook, and command
contexts. It composes EnvLoader, EnvWriter, EnvBridge, EnvResolver, and
EnvValidator to handle loading env vars from hook `.sh` files, validating
options, and persisting state via `escapeForBashDoubleQuotes()` into session
env files.

**SessionRegistry** (`src/layers/SessionRegistry.ts`) is a facade module
providing exported functions for SQLite-based session-to-env-dir mapping:
`getBySessionId`, `getByProjectDir`, `registerSession`, `closeDb`. It stores
`session_id -> session_env_dir` pairs so non-SessionStart hooks can find
their session's env directory.

## Two Entry Points

- `src/index.ts` -- All public SDK exports (services, layers, schemas, types, errors, outcomes)
- `src/testing.ts` -- Test factory functions only (imported as `claude-binary-plugin/testing`)

## Hook Types (26 Total)

Claude Code supports 26 hook event types. Each hook is defined in its own
module under `src/hooks/{HookType}.ts`, co-locating Input schema, Event
class, Output schema, Response schema, Handler type, Hook definition type,
and Outcome union. All 26 hooks have fully typed handlers.

### Original 10

`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`,
`UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`,
`SessionEnd`

### Added 16

`PostToolUseFailure`, `StopFailure`, `SubagentStart`, `TaskCreated`,
`TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`,
`CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`,
`PostCompact`, `Elicitation`, `ElicitationResult`, `PermissionDenied`

### Per-Hook Module Structure

Each `src/hooks/{HookType}.ts` file exports:

- `{HookType}Input` -- Schema.Class for wire format from stdin
- `{HookType}Event` -- Schema.Class with `fromInput()` factory (uses NormalizedPath for paths)
- `{HookType}OutputSchema` -- Hook output schema (discriminated on status)
- `{HookType}ResponseSchema` -- Response schema for stdout
- `{HookType}Handler` -- Typed handler function signature
- `{HookType}HookDefinition` -- Hook definition type for ClaudePlugin
- `{HookType}Outcome` -- Union of valid outcome types for this hook
- `VALID_OUTCOME_TAGS` -- Runtime array of valid outcome tag strings

Shared infrastructure lives in `src/hooks/shared.ts` (metadata schemas,
output base schemas, passthrough patterns). Composed types live in
`src/hooks/types.ts` (HooksMap, InferHandlers, HookOutcomeMap).

See `schema.md` for field details on each type.

## Handler Type Aliases

All 26 hook types have handler type aliases exported from their per-hook
modules (e.g., `PreToolUseHandler` from `src/hooks/PreToolUse.ts`). Each
handler type is generic over `TOptions` and `TState` and constrains the
return type to only the valid outcomes for that hook.

Key composed types from `src/hooks/types.ts`:

- `HooksMap<TConfig>` -- Maps hook event names to arrays of hook definitions
- `InferHandlers<TConfig>` -- Maps hook event names to typed handler functions
- `HookOutcomeMap` -- Maps hook event names to their valid outcome unions
- `ALL_VALID_OUTCOME_TAGS` -- Runtime record of valid outcome tag strings per hook
- `isValidOutcomeForHook()` -- Runtime validation of handler returns

Handler and hook definition types from `src/plugin/handler.ts`:

- `PluginHandler<TOptions, TState, TOutcome>` -- Base handler function type
- `HookDefinition<TOptions, TState, TOutcome>` -- Hook definition with name, handler, tools
- `ToolFilter` -- Tool name filter for PreToolUse/PostToolUse hooks

## Bun Tree-Shaking (SOLVED)

**Status:** Solved via `PluginConfig.extend()` with `static readonly` properties.

Bun's bundler aggressively tree-shakes Schema.Class constructors stored as
plain object properties or instance properties. The solution: store meta-level
schemas (`options`, `state`, `setup`) as `static readonly` properties on the
PluginConfig subclass. Static class properties are proven to survive
`bun build --compile`.

The `PluginConfig` base is itself a Schema.Class, creating a real runtime
constructor/prototype chain that the bundler must preserve. Handler functions
are value-imported in `plugin.build.ts`, giving the bundler a clear dependency
graph with no dynamic resolution needed.

Type inference uses two-step inference (not constrained `infer`) for
compatibility with `tsgo` (native TypeScript).
