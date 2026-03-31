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
    runtime.ts          # Commands class, argument parsing
  errors/               # Data.TaggedError definitions (one per file)
  layers/               # Service implementations (Live + Test)
    PipelineRuntime.ts  # Hook execution engine
    PipelineLive.ts     # Composed service layer for production
    PluginLoggerLive.ts # NDJSON file logger
    PluginLoggerTest.ts # In-memory test logger
    SessionRegistry.ts  # SQLite session-to-env-dir mapping
    SidecarConnectionLive.ts  # Unix socket IPC to OTEL sidecar
    SidecarLoggerLive.ts      # Sidecar process file logger
    SidecarTransportLive.ts   # Sidecar Unix socket server
    *Live.ts            # Production implementations
    *Test.ts            # Test factory functions
  otel/                 # OpenTelemetry subsystem (sidecar, protocol, handlers)
  outcomes/             # Outcome system (typed hook return values)
    Outcome.ts          # Abstract base class with isOutcome(), resolveContext()
    Allow.ts            # PreToolUse/PermissionRequest: permit action
    Deny.ts             # PreToolUse/PermissionRequest: reject action
    Ask.ts              # PreToolUse: prompt user for confirmation
    Modify.ts           # PreToolUse: change tool input before execution
    Block.ts            # PostToolUse/Stop: halt continuation
    Continue.ts         # PostToolUse/Stop: allow continuation
    AddContext.ts       # SessionStart/PostToolUse: inject additionalContext
    NoAction.ts         # Passthrough: no-op response
    Skip.ts             # Any actionable hook: skip without acting
    ContextBuilder.ts   # MarkdownContext, XmlContext for composing context
    types.ts            # HookOutcomeMap, isValidOutcomeForHook(), outcome unions
  plugin/               # Plugin configuration factory
    config.ts           # Plugin() factory, PluginDefinition, ClaudePlugin, InferHandlers
  schemas/              # Effect Schema definitions
    branded.ts          # Branded types (SessionId, ToolUseId, TranscriptPath)
    hook-events.ts      # Schema.Class event types + HookEventSchemas class
    hook-inputs.ts      # Schema.Class input types (wire format from stdin)
    hook-literals.ts    # Literal union schemas (HookType enum, permissions, etc.)
    hook-responses.ts   # Schema.Class response types + toResponse converters
    json.ts             # JSON schema utilities
    pipeline-outputs.ts # Pipeline output schemas (discriminated on status)
  services/             # Effect Context.Tag service interfaces
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

## Plugin() Factory

Plugins are defined via the `Plugin()` factory function, which returns a
typed base class constructor. Users extend the returned class to define
their plugin.

```typescript
import { Plugin } from "claude-binary-plugin";
import { Schema } from "effect";

class MyPlugin extends Plugin("MY_PLUGIN", {
  options: Schema.Struct({
    MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
      default: () => "strict" as const,
    }),
  }),
  state: MyState,
  setup: async ({ options, cwd }) => {
    return new MyState({ git: true, packageManager: "bun" });
  },
  hooks: {
    PreToolUse: [{ name: "guard", pipeline: "./hooks/guard.hook.ts" }],
  },
}) {}

export type Handlers = InferHandlers<MyPlugin>;
export default new MyPlugin();
```

### How Plugin() Works

- `Plugin(prefix, definition)` captures the `PluginDefinition` config in
  a closure and returns a class constructor
- Users extend the returned class (can add methods, properties)
- Instance properties: `.config`, `.prefix`, `.build()`, `.test()`
- `PluginDefinition` interface replaces the old `PluginConfig` (which still
  exists internally but `PluginDefinition` is the user-facing API)
- `ClaudePlugin` interface describes what instances look like
- Zero explicit generics -- types for `options`, `state`, `hooks`, and
  `commands` are inferred from the definition fields

### Key Interfaces

| Interface | Purpose |
| --------- | ------- |
| `PluginDefinition<TOptionsSchema, TStateSchema>` | Config object passed to `Plugin()` |
| `ClaudePlugin<TOptionsSchema, TStateSchema>` | Shape of plugin instances |
| `InferHandlers<T>` | Extract typed handler signatures from a plugin class |
| `InferPluginOptions<T>` | Extract options type from a plugin |
| `InferPluginState<T>` | Extract state type from a plugin |
| `InferPluginCommands<T>` | Extract command handler types from a plugin |

## Outcomes System

Outcomes are typed return values from hook handlers. Each outcome is a
`Schema.Class` that extends an abstract `Outcome` base class. Outcomes
replace the legacy `{ status, action, summary }` pipeline output objects
with a cleaner, type-safe API.

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

### Outcome Architecture

Each outcome class:

- Is a `Schema.Class` with named fields (e.g., `summary`, `reason`)
- Has `toResponse()` returning the Claude Code wire format
- Has `toTelemetry()` returning OTEL span attributes
- Has a static `_tag` for identification (e.g., `"Allow"`, `"Deny"`)
- Extends `Outcome` via `Object.setPrototypeOf` (not class inheritance,
  because `Schema.Class` controls the prototype chain)
- Supports extension via `Schema.Class.extend()` for custom telemetry fields

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
in `VALID_OUTCOME_TAGS` in `outcomes/types.ts`. `PipelineRuntime` calls
this before serializing the response; invalid outcomes cause an error exit.

### Backward Compatibility

`PipelineRuntime` checks `Outcome.isOutcome(output)` first (new path),
then falls back to `isPipelineOutput(output)` (legacy path). Both paths
work -- existing handlers returning `{ status, action, summary }` objects
continue to function unchanged.

## Effect Service/Layer Pattern

Services are defined as `Context.Tag` interfaces in `src/services/`. Each service
has a Live implementation (production) and a Test factory (testing) in `src/layers/`.

```text
Service (Context.Tag)     Layer (implementation)
  StdinReader         ->  StdinReaderLive / makeStdinReaderTest
  SchemaValidator     ->  SchemaValidatorLive
  EnvLoader           ->  EnvLoaderLive / EnvLoaderTest
  EnvPersister        ->  EnvPersisterLive / makeEnvPersisterTest
  SessionStore        ->  SessionStoreLive / makeSessionStoreTest
  ShellExecutor       ->  ShellExecutorLive / makeShellExecutorTest
  Telemetry           ->  TelemetryLive / makeTelemetryTest
  OtelConfig          ->  OtelConfigLive / makeOtelConfigTest
  SidecarConnection   ->  SidecarConnectionLive / makeSidecarConnectionTest
  CommandRunner       ->  CommandRunnerLive / makeCommandRunnerTest
  PluginEnvService    ->  PluginEnvLive / makePluginEnvTest
  PluginBuilderService -> PluginBuilderLive / makePluginBuilderTest
```

## PipelineLive (Composed Layer)

`PipelineLive` merges all production service layers into a single layer for
pipeline execution. OTEL layers are composed with dependency ordering:

```typescript
const OtelClientLive = pipe(TelemetryLive, Layer.provide(SidecarConnectionLive), Layer.provide(OtelConfigLive));

export const PipelineLive = Layer.mergeAll(
  StdinReaderLive, SchemaValidatorLive, EnvLoaderLive,
  EnvPersisterLive, SessionStoreLive, OtelClientLive, ShellExecutorLive,
);
```

## PipelineRuntime Execution Flow

`PipelineRuntime.run()` is the main entry point for hook execution:

1. Resolve I/O dependencies (stdin/stdout/stderr or injected test streams)
2. Preconnect telemetry sidecar (non-blocking)
3. Read JSON from stdin, decode with Input Schema.Class
4. Convert decoded input to Event instance via `fromInput()`
5. Check tool filter (PreToolUse/PostToolUse only)
6. Load environment via `PluginEnv.forContext()`
7. Run `setup()` and persist state if SessionStart
8. Call pipeline handler with `{ input, options, state }`
9. **Check if output is an Outcome** (via `Outcome.isOutcome()`):
   - Validate outcome for hook type via `isValidOutcomeForHook()`
   - Extract telemetry via `outcome.toTelemetry()`
   - Convert to response via `outcome.toResponse()`
10. **Else check if output is a legacy PipelineOutput** (via `isPipelineOutput()`):
    - Validate against hook-type-specific output schema
    - Map status/action to telemetry outcome label
    - Convert via `toResponse()` functions
11. Emit OTEL telemetry (hook execution event)
12. Write JSON response to stdout
13. Exit process

### State Schema.Class Support

When `PluginConfig.state` is a `Schema.Class`, the pipeline:

- **SessionStart**: Encodes state via `Schema.encodeUnknownSync(stateSchema)`
  before persisting to env files
- **Subsequent hooks**: Decodes via `Schema.decodeUnknownSync(stateSchema)`
  to reconstruct a typed instance with methods
- **Prototype preservation**: Uses `Object.assign(Object.create(proto), state, baseState)`
  to ensure decoded state retains `Schema.Class` prototype methods

`PipelineConfig` carries `stateSchema` and `handlerLayer` fields.
`EntrypointGenerator` passes `stateSchema: pluginConfig.state` and
`handlerLayer: PipelineLive` when generating the entrypoint code.

## PluginLoggerLive

NDJSON file logger using Effect's `Logger.make` piped through
`PlatformLogger.toFile` with `BunFileSystem`. Enabled when `CLAUDE_DEBUG` is set.
Falls back to `Logger.none` when disabled or on file open failure. Each log
entry includes timestamp, level, message, fiber, channel, and pluginName.

## Error Handling

All errors use `Data.TaggedError`, one per file in `src/errors/`:

| Error | Tag | Fields |
| ------- | ----- | -------- |
 | PipelineError | `"PipelineError"` | hookName, stage, cause |
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

**PluginEnv** (`src/services/PluginEnv.ts`) is the abstract base class for
plugin environment management. Plugins extend it with their options schema.
It handles loading env vars from hook `.sh` files, validating options, and
persisting state via `escapeForBashDoubleQuotes()` into session env files.

**SessionRegistry** (`src/layers/SessionRegistry.ts`) provides SQLite-based
session-to-env-dir mapping. It stores `session_id -> session_env_dir` pairs
so non-SessionStart hooks can find their session's env directory.

## Two Entry Points

- `src/index.ts` -- All public SDK exports (services, layers, schemas, types, errors, outcomes)
- `src/testing.ts` -- Test factory functions only (imported as `claude-binary-plugin/testing`)

## Hook Types (25 Total)

Claude Code supports 25 hook event types. The SDK provides Input, Event,
and Output schemas for all of them.

### Original 10

`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`,
`UserPromptSubmit`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`,
`SessionEnd`

### Added 15

`PostToolUseFailure`, `StopFailure`, `SubagentStart`, `TaskCreated`,
`TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`,
`CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`,
`PostCompact`, `Elicitation`, `ElicitationResult`

See `schema.md` for field details on each type.

## Handler Type Aliases

All handler type aliases use the `*Handler` suffix (renamed from the
previous `*Pipeline` names):

- `SessionStartHandler`, `SessionEndHandler`
- `PreToolUseHandler`, `PostToolUseHandler`
- `StopHandler`, `SubagentStopHandler`
- `UserPromptSubmitHandler`, `PreCompactHandler`
- `NotificationHandler`, `PermissionRequestHandler`
- `InferHandlers` (was `InferPluginPipeline`)
- `HandlerHookDefinition` (was `PipelineHookDefinition`)

## Known Issue: Bun Tree-Shaking

**Status:** Active blocker for state methods in compiled binaries.

State `Schema.Class` methods (like `getPmExec()`, `canUseGit()`) are stripped
from compiled `.plugin` binaries by Bun's bundler tree-shaking. They work
correctly in dev mode (`bun run`) but disappear in the compiled output.

**Root cause:** `Schema.decodeUnknownSync` creates instances internally via
the constructor, but Bun's static analysis cannot trace that the constructor's
prototype methods are needed. Since no direct code references the methods,
Bun considers them dead code.

**Impact:** Any `Schema.Class` state with prototype methods will have those
methods stripped in production. The data fields survive (they are assigned
in the constructor), but prototype methods do not.

**Workarounds under investigation:**

- Bun build flags to disable tree-shaking for specific classes
- Explicit method references to prevent removal
- Alternative state patterns that avoid prototype methods
