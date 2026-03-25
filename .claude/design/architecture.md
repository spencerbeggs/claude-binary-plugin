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
  plugin/               # Plugin configuration factory
    config.ts           # ClaudeBinaryPlugin.create(), type definitions
  schemas/              # Effect Schema definitions
    branded.ts          # Branded types (SessionId, ToolUseId, TranscriptPath)
    hook-events.ts      # Schema.Class event types + HookEventSchemas class
    hook-inputs.ts      # Schema.Class input types (wire format from stdin)
    hook-literals.ts    # Literal union schemas (HookType, permissions, etc.)
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
9. Validate output matches hook-type-specific output schema
10. Emit OTEL telemetry (hook execution event)
11. Convert pipeline output to response via `toResponse()` functions
12. Write JSON response to stdout
13. Exit process

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

- `src/index.ts` -- All public SDK exports (services, layers, schemas, types, errors)
- `src/testing.ts` -- Test factory functions only (imported as `claude-binary-plugin/testing`)
