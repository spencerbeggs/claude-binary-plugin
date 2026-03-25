# Architecture

## Overview

claude-binary-plugin is a TypeScript SDK for building Claude Code plugins
that compile to single-file Bun executables. It uses Effect for typed
functional programming with services, layers, and Schema.Class validation.

## Directory Structure

```text
src/
  errors/       Data.TaggedError, one per file (8 files)
  schemas/      Effect Schema definitions (hook-events, pipeline-outputs, branded, json)
  services/     Context.Tag interfaces only (14 services)
  layers/       Live + Test implementations (19 files)
  plugin/       ClaudeBinaryPlugin.create() factory
  build/        Plugin compilation (decomposed into focused modules)
  otel/         OpenTelemetry telemetry (Effect-based services and layers)
  types/        Pure TypeScript types (pipeline, plugin-state, tool-inputs)
  commands/     Legacy command runtime (being phased out)
  testing/      Legacy PluginTester (being phased out)
  utils/        Legacy utilities (DebugLogger removed; use makePluginLoggerLive)
  index.ts      Public API entry point
  testing.ts    Test utilities entry point
__tests__/      All test files, mirroring src/
```

## Service/Layer Pattern

Every capability is an Effect service with separate interface and
implementation:

```text
src/services/X.ts        Context.Tag definition (interface)
src/layers/XLive.ts      Production implementation (Layer)
src/layers/XTest.ts      Test factory (returns Layer)
```

**14 services:** StdinReader, SchemaValidator, EnvLoader, EnvPersister,
SessionStore, Telemetry, ShellExecutor, CommandRunner, PluginBuilder,
PluginEnvService, OtelConfig, SidecarConnection, OtelProviders, SidecarTransport

**Composed layer:** `PipelineLive` in `src/layers/PipelineLive.ts`
merges all Live layers via `Layer.mergeAll`.

## Plugin Execution Flow

1. Claude Code invokes the compiled binary with JSON on stdin
2. `PipelineRuntime.run()` reads stdin via StdinReader service
3. JSON is decoded against hook event Schema.Class via SchemaValidator
4. Environment state is loaded via EnvLoader (from session env files)
5. Handler is called with typed `{ input, options, state }` context
6. Handler returns a plain output object `{ status, action, summary }`
7. Output is validated against pipeline output schema
8. Telemetry is emitted, response written to stdout, process exits

## Schema.Class Pattern

Hook events use `Schema.Class` — one declaration provides the type,
schema, and instanceof check:

```typescript
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>(
  "PreToolUseEvent",
)({
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
  session_id: SessionIdSchema,
}) {}
```

## Entry Points

- `src/index.ts` — public API (plugin authors import from here)
- `src/testing.ts` — test utilities (test layer factories)
- No intermediate barrel files. Internal code imports directly from
  source files.

## Build System

`src/build/` is decomposed into focused modules:

- `HookExtractor.ts` — extracts hook entries from plugin config
- `CommandExtractor.ts` — extracts command entries
- `EntrypointGenerator.ts` — generates TypeScript entrypoint
- `ManifestGenerator.ts` — generates hooks.json
- `ProxyTemplate.ts` — dev mode proxy
- `builder.ts` — orchestration (PluginBuilder static class)

**Generated artifacts:** `{name}.plugin` (binary), `hooks.json` (manifest),
`sidecar.js` (OTEL, if enabled)

## State Management

`PluginEnv` (in `src/services/PluginEnv.ts`) is the base class for plugin
state. Three loading contexts:

- `forSessionStart` — validates options schema, runs setup function
- `forHook` — loads persisted state from session env dir
- `forCommand` — parses CLI args

State flows through session env files (shell export scripts) persisted
to `CLAUDE_ENV_FILE`.

## Error Handling

All errors extend `Data.TaggedError` and are handled via Effect's typed
error channel:

- `SchemaValidationError` — input/output validation failures
- `PipelineError` — handler execution failures (with stage)
- `EnvLoadError` / `EnvPersistError` — environment I/O
- `SessionLookupError` — session registry misses
- `CommandParseError` — CLI argument parsing
- `StdinError` / `ShellError` — I/O operations

## Legacy Code

These modules are functional but being phased out:

- `src/commands/runtime.ts` — static Commands class (→ CommandRunner service)
- `src/testing/builder.ts` — PluginTester fluent API (→ layer-based testing)
- `src/utils/` — DebugLogger removed; use `makePluginLoggerLive` from `src/layers/PluginLoggerLive.ts`
