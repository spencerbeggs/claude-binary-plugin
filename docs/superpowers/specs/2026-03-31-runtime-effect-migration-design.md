# Runtime Effect Migration

## Problem

The runtime execution path (PipelineRuntime + Commands) uses imperative
patterns: `process.exit()` calls, try/catch blocks, duplicated logic between
`run()` and `runRaw()`, and legacy pipeline output handling. This prevents
composability, complicates testing, and doesn't align with the Effect
architecture used by the rest of the SDK.

Additionally, the `pipeline:` key in hook definitions is a holdover from the
old naming — it should be `handler:`. Raw handler support (`runRaw()`,
`RawHandler`, `RawHookDefinition`) is dead weight now that the Outcomes
system covers all use cases.

## Solution

Convert PipelineRuntime and Commands to Effect services, eliminate
`process.exit`, remove raw handlers and legacy pipeline outputs, rename
`pipeline:` to `handler:`.

## PipelineRuntime Service

### Service Interface

New file `src/services/PipelineRuntime.ts`:

```typescript
import { Context, Effect } from "effect";
import type { PipelineError } from "../errors/PipelineError.js";
import type { OutcomeTelemetry } from "../outcomes/Outcome.js";

interface RunResult {
  readonly code: number;
  readonly response: Record<string, unknown>;
  readonly telemetry?: OutcomeTelemetry;
}

class PipelineRuntime extends Context.Tag("PipelineRuntime")<
  PipelineRuntime,
  {
    readonly run: (config: PipelineConfig) => Effect.Effect<RunResult, PipelineError>;
  }
>() {}
```

### Live Implementation

New file `src/layers/PipelineRuntimeLive.ts`:

The `run()` implementation follows this flow:

1. Read stdin (pre-loaded `inputText` or `Bun.stdin.text()`)
2. JSON parse and Schema decode input
3. Look up hook schemas for the hook type
4. Tool filtering (skip if handler has `tools` filter and tool doesn't match)
5. Load PluginEnv state (options + persisted state)
6. Run setup function on SessionStart
7. Build handler context (`{ input, options, state }`)
8. Invoke handler (supports sync, Promise, or Effect returns)
9. Validate Outcome (`isValidOutcomeForHook`)
10. Build `RunResult` from `Outcome.toResponse()`

Helper functions from the current `PipelineRuntime` class (`getHookSchemas`,
`createBaseState`, `extractPersistedState`, `findSessionEnvDir`) become
module-level functions, not part of the service interface.

`handleUnknown()` becomes a standalone Effect function — it's a special
error path, not normal execution.

### What's Removed from PipelineRuntime

- `runRaw()` method — raw handlers are dead weight
- Legacy pipeline output handling (~60 lines) — handlers must return Outcomes
- `process.exit()` calls — process terminates naturally
- `IODependencies.exit` field — no longer needed
- Duplicated try/catch blocks between `run()` and `runRaw()`

## CommandRunner Service

The `CommandRunner` service already exists at `src/services/CommandRunner.ts`
with the right interface:

```typescript
class CommandRunner extends Context.Tag("CommandRunner")<
  CommandRunner,
  {
    readonly run: (options: RunCommandOptions) => Effect.Effect<CommandOutput, CommandParseError>;
    readonly parse: <TArgs>(schema, args) => Effect.Effect<TArgs, CommandParseError>;
  }
>() {}
```

### Live Implementation

`src/layers/CommandRunnerLive.ts` currently has a placeholder `run()`. The
real logic from the imperative `Commands.run()` static method moves here:

1. Parse raw CLI args
2. Load PluginEnv state (options)
3. Find session env dir and load state
4. Invoke command handler with `{ args, options, state }`
5. Validate output structure
6. Return `CommandOutput`

### What's Removed from Commands

The imperative `Commands` class in `commands/runtime.ts` is deleted. All
lifecycle logic (`process.exit`, error handling, state loading) moves to
`CommandRunnerLive`. Utility functions (`parseRaw`, `formatError`) that are
needed by the Live layer move to `CommandRunnerLive.ts` as module-level
helpers. The `Commands.emptySchema` constant moves to `CommandRunner` service
file or a shared location.

## Hook Definition Rename: `pipeline:` → `handler:`

### Type Changes in `config.ts`

- `HandlerHookDefinition.pipeline` → `HandlerHookDefinition.handler`
- `HandlerFileHookDefinition.pipeline` → `HandlerFileHookDefinition.handler`
- `CommandFileDefinition.pipeline` → `CommandFileDefinition.handler`
- `CommandInlineDefinition.pipeline` → `CommandInlineDefinition.handler`
- Remove `handler?: never` / `pipeline?: never` discriminants

### Types Deleted

- `RawHookDefinition` — no more raw handlers
- `RawFileHookDefinition` — no more raw file handlers
- `RawHandler` type
- All `*Raw` entries from `InferHandlers` (10 entries)

### HookDefinition Union Simplifies

From 5 variants to 3:

- `HandlerHookDefinition` (inline function via `handler:`)
- `HandlerFileHookDefinition` (file path string via `handler:`)
- `PassthroughHookEntry` (raw hooks.json entries)

## Generated Entrypoint

The generated entrypoint becomes the sole owner of stdout writes and process
lifecycle. It provides Effect layers and runs the program:

```typescript
import PluginConfigClass from "./plugin.config.js";
import guardHandler from "./hooks/guard.js";
import { PipelineRuntime, PipelineRuntimeLive } from "claude-binary-plugin";
import { CommandRunner, CommandRunnerLive } from "claude-binary-plugin";
import { Effect, Layer } from "effect";

const RuntimeLayer = Layer.merge(PipelineRuntimeLive, CommandRunnerLive);

async function main(): Promise<void> {
  if (values.hook) {
    const program = Effect.gen(function* () {
      const runtime = yield* PipelineRuntime;
      return yield* runtime.run({
        hookType, hookName, handler: guardHandler, ...
      });
    }).pipe(Effect.provide(RuntimeLayer));

    const result = await Effect.runPromise(program);
    process.stdout.write(JSON.stringify(result.response));
  }

  if (values.cmd) {
    const program = Effect.gen(function* () {
      const runner = yield* CommandRunner;
      return yield* runner.run({ commandName, rawArgs, ... });
    }).pipe(Effect.provide(RuntimeLayer));

    const result = await Effect.runPromise(program);
    process.stdout.write(result.output);
  }
}

// Fatal errors serialized to stdout for Claude to read
main().catch((error) => {
  const response = {
    error: true,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  process.stdout.write(JSON.stringify(response));
});
```

Key properties:

- No `process.exit()` anywhere — process terminates naturally
- Services return typed results, entrypoint writes stdout
- Fatal errors are caught and serialized to stdout so Claude can read them
- `PipelineRuntimeLive` and `CommandRunnerLive` provided via `Layer`

## PluginTester Impact

`PluginTester.runHook()` currently calls handler functions directly and
builds results. With PipelineRuntime as a service, it has two options:

1. Continue calling handlers directly (simpler, current approach works)
2. Use PipelineRuntime service with test layer

Option 1 is recommended — PluginTester tests the handler logic, not the
PipelineRuntime plumbing. The tester already builds the handler context
and processes Outcomes. No significant changes needed beyond adapting to
the `pipeline:` → `handler:` rename.

## Files Changed

### New Files

- `src/services/PipelineRuntime.ts` — Tag + RunResult interface
- `src/layers/PipelineRuntimeLive.ts` — Implementation

### Major Rewrites

- `src/layers/PipelineRuntime.ts` → split into service + live layer (delete old file)
- `src/commands/runtime.ts` → delete or reduce; logic moves to CommandRunnerLive
- `src/layers/CommandRunnerLive.ts` — real `run()` implementation

### Modifications

- `src/plugin/config.ts` — rename pipeline→handler, remove raw types
- `src/build/EntrypointGenerator.ts` — new generated entrypoint pattern
- `src/build/HookExtractor.ts` — pipeline→handler rename
- `src/build/builder.ts` — pipeline→handler in type references
- `src/testing/builder.ts` — pipeline→handler rename in hook lookup
- `src/index.ts` — update exports (remove raw types, add PipelineRuntime service)
- All test files — pipeline→handler rename
- Test plugin — pipeline→handler rename

### Unchanged

- Outcome classes, ContextBuilder
- All other Effect services and layers
- Schema validation, hook event types
- PluginConfig.extend() + ClaudePlugin API
- OTEL subsystem (separate migration)
