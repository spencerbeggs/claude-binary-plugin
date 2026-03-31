# Runtime Effect Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert PipelineRuntime and Commands to Effect services, eliminate process.exit, remove raw handlers and legacy pipeline outputs, rename pipeline: to handler:.

**Architecture:** PipelineRuntime becomes an Effect service (Context.Tag) with a Live layer. Commands class is deleted; its logic moves to the existing CommandRunnerLive. The generated entrypoint becomes the sole owner of stdout writes and process lifecycle. No process.exit anywhere.

**Tech Stack:** Effect (Context.Tag, Layer, Effect.gen), Effect Schema, Bun runtime

**Spec:** `docs/superpowers/specs/2026-03-31-runtime-effect-migration-design.md`

---

## Tasks

### Task 1: Rename `pipeline:` to `handler:` in Hook Definitions

**Files:**

- Modify: `package/src/plugin/config.ts`
- Modify: `package/src/build/HookExtractor.ts`
- Modify: `package/src/build/EntrypointGenerator.ts`
- Modify: `package/src/testing/builder.ts`
- Modify: `package/__tests__/plugin/config.test.ts`
- Modify: `package/__tests__/plugin/pluginconfig.test.ts`
- Modify: `package/__tests__/testing/builder.test.ts`
- Modify: `package/__tests__/build/builder.test.ts`
- Modify: `plugin/plugin.build.ts`
- Modify: `plugin/__test__/plugin.test.ts`

This is a mechanical rename. The `pipeline:` property on hook definitions becomes `handler:`. The old `handler:` property (used for raw handlers) will be deleted in Task 2.

- [ ] **Step 1: Rename in config.ts type definitions**

In `package/src/plugin/config.ts`:

Rename `HandlerHookDefinition.pipeline` to `HandlerHookDefinition.handler` (line ~483):

```typescript
// Before:
export interface HandlerHookDefinition<TInput, TOutput, TOptions, TState> extends HookDefinitionBase {
 pipeline: PipelineHandler<TInput, TOutput, TOptions, TState>;
 handler?: never;
}

// After:
export interface HandlerHookDefinition<TInput, TOutput, TOptions, TState> extends HookDefinitionBase {
 handler: PipelineHandler<TInput, TOutput, TOptions, TState>;
}
```

Rename `HandlerFileHookDefinition.pipeline` to `HandlerFileHookDefinition.handler` (line ~505):

```typescript
// Before:
export interface HandlerFileHookDefinition extends HookDefinitionBase {
 pipeline: string;
 handler?: never;
}

// After:
export interface HandlerFileHookDefinition extends HookDefinitionBase {
 handler: string;
}
```

Rename in `CommandFileDefinition` and `CommandInlineDefinition` — search for `pipeline:` in command definition types and rename to `handler:`.

- [ ] **Step 2: Rename in HookExtractor.ts**

In `package/src/build/HookExtractor.ts`, update property access (lines ~55-65):

```typescript
// Before:
const pipelineValue = hook.pipeline;
const handlerValue = hook.handler;
const isFileBased =
 (typeof pipelineValue === "string" && pipelineValue.length > 0) ||
 (typeof handlerValue === "string" && handlerValue.length > 0);
const filePath = isFileBased ? (pipelineValue as string) || (handlerValue as string) : undefined;

entries.push({
 // ...
 isPipeline: "pipeline" in hook && hook.pipeline !== undefined,
});

// After:
const handlerValue = hook.handler;
const isFileBased = typeof handlerValue === "string" && handlerValue.length > 0;
const filePath = isFileBased ? (handlerValue as string) : undefined;

entries.push({
 // ...
 isPipeline: "handler" in hook && hook.handler !== undefined,
});
```

- [ ] **Step 3: Rename in EntrypointGenerator.ts**

In `package/src/build/EntrypointGenerator.ts`, update the generated template strings:

- Line ~79: Change `optionsSchema: pluginConfig.options` references
- Line ~88-89: Change `!("pipeline" in hookDef)` to `!("handler" in hookDef)`
- Line ~95: Change `pipeline: hookDef.pipeline` to `handler: hookDef.handler`
- Change all `PipelineRuntime.run({ ... pipeline:` to `PipelineRuntime.run({ ... handler:`

Note: Keep `runRaw` cases for now — they'll be deleted in Task 2.

- [ ] **Step 4: Rename in testing/builder.ts**

In `package/src/testing/builder.ts`, update `resolveHandler()` method (line ~1821):

```typescript
// Before:
if (typeof hookDef.pipeline === "function") {
 return hookDef.pipeline;
}
if (typeof hookDef.pipeline === "string") {
 return this.importHandler(hookDef.pipeline);
}

// After:
if (typeof hookDef.handler === "function") {
 return hookDef.handler;
}
if (typeof hookDef.handler === "string") {
 return this.importHandler(hookDef.handler);
}
```

Also remove the raw handler error throws (they reference `hookDef.handler` which now means something different).

- [ ] **Step 5: Rename in all test files and test plugin**

Search and replace `pipeline:` with `handler:` in hook definition objects across:

- `package/__tests__/plugin/config.test.ts` — many instances
- `package/__tests__/plugin/pluginconfig.test.ts`
- `package/__tests__/testing/builder.test.ts`
- `package/__tests__/build/builder.test.ts`
- `plugin/plugin.build.ts`
- `plugin/__test__/plugin.test.ts`

- [ ] **Step 6: Run tests and typecheck**

Run: `cd package && bunx tsgo --noEmit && bun test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename pipeline: to handler: in hook definitions"
```

---

### Task 2: Delete Raw Handler Types and Legacy Pipeline Outputs

**Files:**

- Modify: `package/src/plugin/config.ts`
- Modify: `package/src/build/EntrypointGenerator.ts`
- Modify: `package/src/index.ts`
- Modify: `package/__tests__/plugin/config.test.ts` (if raw handler tests exist)

- [ ] **Step 1: Delete raw types from config.ts**

In `package/src/plugin/config.ts`, delete:

1. `RawHandler` type (line ~229-236)
2. `RawHookDefinition` interface (line ~513-517)
3. `RawFileHookDefinition` interface (line ~534-538)
4. Remove `RawHookDefinition` and `RawFileHookDefinition` from the `HookDefinition` union (line ~569-574)
5. Remove `PassthroughHookEntry.handler?: never` field (no longer needed as discriminant)
6. Remove all `*Raw` entries from `InferHandlers` interface (10 entries: `SessionStartRaw`, `SessionEndRaw`, `PreToolUseRaw`, `PostToolUseRaw`, `StopRaw`, `SubagentStopRaw`, `UserPromptSubmitRaw`, `PreCompactRaw`, `NotificationRaw`, `PermissionRequestRaw`)
7. Delete all `*RawHandler` type aliases (`SessionStartRawHandler`, `PreToolUseRawHandler`, etc.)

- [ ] **Step 2: Delete runRaw cases from EntrypointGenerator.ts**

In `package/src/build/EntrypointGenerator.ts`, delete the entire raw handler case generation block (lines ~105-132). Only pipeline (now `handler:`) cases should remain.

- [ ] **Step 3: Update index.ts exports**

In `package/src/index.ts`, remove from exports:

- `RawHandler`
- `RawHookDefinition`
- `RawFileHookDefinition`
- `RunRawHandlerOptions`
- All `*RawHandler` type aliases

- [ ] **Step 4: Delete any raw handler tests**

In `package/__tests__/plugin/config.test.ts`, delete the "accepts raw handler mode" test and any other tests that use `handler:` with a `RawHandler` function (the old raw pattern, NOT the renamed pipeline handlers).

- [ ] **Step 5: Run tests and typecheck**

Run: `cd package && bunx tsgo --noEmit && bun test`
Expected: ALL PASS (raw handler tests removed, everything else works)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove raw handler types and legacy pipeline outputs"
```

---

### Task 3: Create PipelineRuntime Effect Service

**Files:**

- Create: `package/src/services/PipelineRuntimeService.ts`
- Modify: `package/src/index.ts`

- [ ] **Step 1: Write the service interface**

Create `package/src/services/PipelineRuntimeService.ts`:

```typescript
import type { Effect } from "effect";
import { Context } from "effect";
import type { PipelineError } from "../errors/PipelineError.js";
import type { OutcomeTelemetry } from "../outcomes/Outcome.js";
import type { HookEventType } from "./PipelineRuntime.js";

/**
 * Result from a pipeline hook execution.
 * @public
 */
export interface RunResult {
 /** Exit code (0 = success) */
 readonly code: number;
 /** Serializable response object for stdout */
 readonly response: Record<string, unknown>;
 /** Telemetry data from the outcome */
 readonly telemetry?: OutcomeTelemetry;
}

/**
 * Configuration for running a pipeline hook.
 * @public
 */
export interface PipelineRunConfig<TOptions = unknown, TState = Record<string, unknown>> {
 readonly hookType: string;
 readonly hookName: string;
 readonly pluginName: string;
 readonly pluginVersion: string;
 readonly handler: (ctx: {
  input: unknown;
  options: unknown;
  state: unknown;
 }) => unknown;
 readonly stateClass: new () => unknown;
 readonly tools?: string[];
 readonly optionsSchema?: unknown;
 readonly stateSchema?: unknown;
 readonly setup?: (ctx: unknown) => unknown;
 readonly handlerLayer?: unknown;
 readonly inputText?: string;
}

/**
 * PipelineRuntime Effect service.
 *
 * Executes hook handlers with schema validation, state management,
 * and telemetry. Returns structured results instead of calling process.exit.
 *
 * @public
 */
export class PipelineRuntimeService extends Context.Tag("PipelineRuntimeService")<
 PipelineRuntimeService,
 {
  readonly run: <TOptions, TState>(
   config: PipelineRunConfig<TOptions, TState>,
  ) => Effect.Effect<RunResult, PipelineError>;
 }
>() {}
```

Note: The config interface uses `unknown` for handler/schema/layer types because the service interface shouldn't constrain these — the Live implementation will cast as needed. The existing `PipelineConfig` interface from the old file can be used internally by the Live layer.

- [ ] **Step 2: Export from index.ts**

Add to `package/src/index.ts`:

```typescript
export { PipelineRuntimeService, type RunResult, type PipelineRunConfig } from "./services/PipelineRuntimeService.js";
```

- [ ] **Step 3: Run typecheck**

Run: `cd package && bunx tsgo --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package/src/services/PipelineRuntimeService.ts package/src/index.ts
git commit -m "feat: add PipelineRuntimeService Effect service interface"
```

---

### Task 4: Implement PipelineRuntimeLive

**Files:**

- Create: `package/src/layers/PipelineRuntimeServiceLive.ts`
- Modify: `package/src/index.ts`

This is the largest task. The implementation logic moves from the static `PipelineRuntime.run()` method to an Effect Layer.

- [ ] **Step 1: Create the Live layer**

Create `package/src/layers/PipelineRuntimeServiceLive.ts`. Extract the core logic from `PipelineRuntime.run()` (lines 317-701 of the old file), converting it to an Effect program that returns `RunResult` instead of calling `process.exit`.

Key changes from the old `run()`:

- Remove `process.exit` — return `RunResult` with code
- Remove legacy pipeline output handling — only Outcome handling
- Remove `io.exit` usage — errors become `PipelineError`
- Remove `runRaw` — deleted
- Keep all Effect.gen, Effect.tryPromise, Effect.provide patterns (already Effect)
- Extract helper functions (`getHookSchemas`, `createBaseState`, `extractPersistedState`, `findSessionEnvDir`, `writeResponse`, `persistSessionEnv`) as module-level functions

```typescript
import { Effect, Layer, ParseResult, Schema } from "effect";
import { PipelineError } from "../errors/PipelineError.js";
import { Outcome } from "../outcomes/Outcome.js";
import { isValidOutcomeForHook } from "../outcomes/types.js";
import { PipelineRuntimeService, type PipelineRunConfig, type RunResult } from "../services/PipelineRuntimeService.js";
import { PluginEnv } from "../services/PluginEnv.js";
import { makePluginLoggerLive } from "./PluginLoggerLive.js";
// ... other imports from the current PipelineRuntime.ts

export const PipelineRuntimeServiceLive = Layer.succeed(
 PipelineRuntimeService,
 PipelineRuntimeService.of({
  run: (config) =>
   Effect.gen(function* () {
    // 1. Read stdin
    const inputText = config.inputText ?? (yield* Effect.tryPromise(() => Bun.stdin.text()));

    // 2. Parse JSON + decode with schema
    const rawInput = JSON.parse(inputText);
    const hookSchemas = getHookSchemas(config.hookType);
    if (!hookSchemas) {
     return { code: 0, response: {} } satisfies RunResult;
    }
    const decodedInput = Schema.decodeUnknownSync(hookSchemas.inputSchema)(rawInput);
    const event = hookSchemas.fromInput(decodedInput);

    // 3. Tool filtering
    if (config.tools?.length && "tool_name" in event) {
     if (!config.tools.includes(event.tool_name)) {
      return { code: 0, response: {} } satisfies RunResult;
     }
    }

    // 4. Load options + state
    // ... (extract from current run() lines ~380-492)

    // 5. Invoke handler
    const rawOutput = config.handler({ input: event, options, state });
    let output: unknown;
    if (Effect.isEffect(rawOutput)) {
     output = config.handlerLayer
      ? yield* Effect.provide(rawOutput, config.handlerLayer)
      : yield* rawOutput;
    } else if (rawOutput instanceof Promise) {
     output = yield* Effect.tryPromise(() => rawOutput);
    } else {
     output = rawOutput;
    }

    // 6. Validate Outcome
    if (!Outcome.isOutcome(output)) {
     return yield* Effect.fail(
      new PipelineError({ message: "Handler must return an Outcome instance" }),
     );
    }
    if (!isValidOutcomeForHook(config.hookType, output)) {
     return yield* Effect.fail(
      new PipelineError({ message: `Invalid outcome for hook type ${config.hookType}` }),
     );
    }

    // 7. Build RunResult
    const response = output.toResponse();
    const telemetry = output.toTelemetry();
    return { code: 0, response, telemetry } satisfies RunResult;
   }).pipe(
    Effect.catchAll((error) =>
     Effect.fail(new PipelineError({ message: String(error) })),
    ),
    Effect.scoped,
    Effect.provide(makePluginLoggerLive(config.pluginName)),
   ),
 }),
);
```

The above is a sketch — the actual implementation should be extracted carefully from the existing `run()` method, preserving all the state loading, setup function execution, session env persistence, and telemetry emission logic.

- [ ] **Step 2: Export from index.ts**

Add to `package/src/index.ts`:

```typescript
export { PipelineRuntimeServiceLive } from "./layers/PipelineRuntimeServiceLive.js";
```

- [ ] **Step 3: Write test for the new service**

Create `package/__tests__/layers/PipelineRuntimeServiceLive.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Schema } from "effect";
import { Allow, Deny } from "../../src/outcomes/Allow.js";
import { PipelineRuntimeService } from "../../src/services/PipelineRuntimeService.js";
import { PipelineRuntimeServiceLive } from "../../src/layers/PipelineRuntimeServiceLive.js";

describe("PipelineRuntimeServiceLive", () => {
 test("run() returns RunResult with Outcome response", async () => {
  const handler = ({ input }) => new Allow({ summary: "ok" });

  const program = Effect.gen(function* () {
   const runtime = yield* PipelineRuntimeService;
   return yield* runtime.run({
    hookType: "PreToolUse",
    hookName: "test",
    pluginName: "test-plugin",
    pluginVersion: "1.0.0",
    handler,
    stateClass: /* ... */,
    inputText: JSON.stringify({
     tool_name: "Bash",
     tool_input: { command: "ls" },
     session_id: "test-session",
     transcript_path: "/tmp/test",
    }),
   });
  }).pipe(Effect.provide(PipelineRuntimeServiceLive));

  const result = await Effect.runPromise(program);
  expect(result.code).toBe(0);
  expect(result.response.permissionDecision).toBe("allow");
 });
});
```

- [ ] **Step 4: Run tests**

Run: `cd package && bun test __tests__/layers/PipelineRuntimeServiceLive.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/layers/PipelineRuntimeServiceLive.ts package/__tests__/layers/PipelineRuntimeServiceLive.test.ts package/src/index.ts
git commit -m "feat: implement PipelineRuntimeServiceLive"
```

---

### Task 5: Move Commands Logic to CommandRunnerLive

**Files:**

- Modify: `package/src/layers/CommandRunnerLive.ts`
- Modify: `package/src/commands/runtime.ts` (delete most of it)
- Modify: `package/src/index.ts`

- [ ] **Step 1: Move run() implementation to CommandRunnerLive**

In `package/src/layers/CommandRunnerLive.ts`, replace the placeholder `run()` with the real implementation extracted from `Commands.run()` (lines 278-325 of `commands/runtime.ts`):

```typescript
export const CommandRunnerLive = Layer.succeed(
 CommandRunner,
 CommandRunner.of({
  run: (options) =>
   Effect.gen(function* () {
    const { commandName, pluginName, pluginVersion, rawArgs } = options;

    // Parse arguments
    const argsSchema = options.argsSchema ?? Schema.Struct({});
    const parsed = parseRaw(rawArgs);
    const args = yield* Effect.try({
     try: () => Schema.decodeUnknownSync(argsSchema)(parsed),
     catch: (error) => new CommandParseError({ commandName, message: String(error) }),
    });

    // Load state
    const stateClass = options.stateClass;
    const sessionEnvDir = findSessionEnvDir();
    const stateInstance = yield* Effect.tryPromise({
     try: () => stateClass.forContext("hook", { sessionId: "cmd", sessionEnvDir, hookName: commandName }),
     catch: (error) => new CommandParseError({ commandName, message: `State load failed: ${error}` }),
    });

    const handlerOptions = stateInstance.vars ?? {};
    const baseState = createBaseState(stateInstance);
    const persistedState = extractPersistedState(stateInstance);
    const state = { ...baseState, ...persistedState };

    // Invoke handler
    const handler = options.handler;
    const result = yield* Effect.tryPromise({
     try: () => Promise.resolve(handler({ args, options: handlerOptions, state })),
     catch: (error) => new CommandParseError({ commandName, message: String(error) }),
    });

    return result;
   }),

  parse: (schema, args) =>
   Effect.try({
    try: () => {
     const parsed = parseRaw(args);
     return Schema.decodeUnknownSync(schema)(parsed);
    },
    catch: (error) => {
     if (ParseResult.isParseError(error)) {
      const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
      return new CommandParseError({ commandName: "parse", message: formatted });
     }
     return new CommandParseError({ commandName: "parse", message: String(error) });
    },
   }),
 }),
);
```

Move utility functions from `commands/runtime.ts` to `CommandRunnerLive.ts` as module-level helpers:

- `parseRaw()` (already in CommandRunnerLive)
- `parseArgValue()` (already in CommandRunnerLive)
- `findSessionEnvDir()` — move from Commands class
- `createBaseState()` — move from Commands class
- `extractPersistedState()` — move from Commands class
- `formatError()` — move from Commands class

Note: The `RunCommandOptions` interface in `services/CommandRunner.ts` may need additional fields (`handler`, `stateClass`, `argsSchema`) to support the full lifecycle. Update it as needed.

- [ ] **Step 2: Delete Commands class**

In `package/src/commands/runtime.ts`, delete the `Commands` class and `CommandArgumentError`. Keep only:

- Module-level schema helper functions (`extractSchemaFields`, `extractDescription`, `isSchemaOptional`, `formatArgumentError`) if they are used elsewhere
- Move `emptySchema` to `services/CommandRunner.ts` as a named export

If nothing else references the helpers, delete the entire file.

- [ ] **Step 3: Update index.ts exports**

In `package/src/index.ts`:

- Remove `Commands` and `CommandArgumentError` exports
- Ensure `CommandRunner`, `CommandRunnerLive`, `CommandParseError` are exported
- Move `emptySchema` export if it was relocated

- [ ] **Step 4: Run tests**

Run: `cd package && bunx tsgo --noEmit && bun test`
Expected: Some command-related tests may fail if they reference `Commands` directly. Fix them to use `CommandRunner` service.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move Commands logic to CommandRunnerLive, delete Commands class"
```

---

### Task 6: Delete Old PipelineRuntime Static Class

**Files:**

- Modify: `package/src/layers/PipelineRuntime.ts` — delete or gut
- Modify: `package/src/index.ts`

- [ ] **Step 1: Remove static methods from old PipelineRuntime**

The old `package/src/layers/PipelineRuntime.ts` had `run()`, `runRaw()`, `handleUnknown()` as static methods. These are now replaced by `PipelineRuntimeServiceLive`.

Delete the `run()` and `runRaw()` static methods. Keep the file if it still exports types used elsewhere (`PipelineConfig`, `HookEventType`, `IODependencies`), but rename them or move them to the service file.

Move `handleUnknown()` to a standalone module-level function (not on a class). It can live in the same file or a new utility file.

- [ ] **Step 2: Update index.ts**

Remove the old `PipelineRuntime` export if it's been fully replaced. Update type exports to point to new locations.

- [ ] **Step 3: Run tests**

Run: `cd package && bunx tsgo --noEmit && bun test`
Expected: Compilation errors if anything still references the old static methods. Fix any remaining references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old PipelineRuntime static class"
```

---

### Task 7: Update EntrypointGenerator for Effect Pattern

**Files:**

- Modify: `package/src/build/EntrypointGenerator.ts`

- [ ] **Step 1: Rewrite the generated entrypoint template**

The generated entrypoint now:

1. Imports `PipelineRuntimeService`, `PipelineRuntimeServiceLive`, `CommandRunner`, `CommandRunnerLive` from `claude-binary-plugin`
2. Imports `Effect`, `Layer` from `effect`
3. Creates a merged runtime layer
4. Uses Effect.gen to call services
5. Writes results to stdout
6. Catches fatal errors and serializes to stdout

Update the template string in `generatePipelinePluginEntrypoint()`:

For hook cases, replace:

```typescript
// Old:
return PipelineRuntime.run({
  hookType: "${hookType}",
  hookName: "${hook.name}",
  handler: ${fileHookImport},
  ...
});

// New — return an Effect program (don't execute it):
case "${hookKey}":
  return runtime.run({
    hookType: "${hookType}",
    hookName: "${hook.name}",
    handler: ${fileHookImport},
    ...
  });
```

The main function wraps everything in Effect.gen:

```typescript
async function main(): Promise<void> {
  const RuntimeLayer = Layer.merge(PipelineRuntimeServiceLive, CommandRunnerLive);

  if (values.hook) {
    const program = Effect.gen(function* () {
      const runtime = yield* PipelineRuntimeService;
      return yield* selectHook(hookKey, runtime);
    }).pipe(Effect.provide(RuntimeLayer));

    const result = await Effect.runPromise(program);
    process.stdout.write(JSON.stringify(result.response));
    return;
  }

  if (values.cmd) {
    const program = Effect.gen(function* () {
      const runner = yield* CommandRunner;
      return yield* selectCommand(cmdName, cmdArgs, runner);
    }).pipe(Effect.provide(RuntimeLayer));

    const result = await Effect.runPromise(program);
    process.stdout.write(result.output);
    return;
  }
}

main().catch((error) => {
  const response = {
    error: true,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  process.stdout.write(JSON.stringify(response));
});
```

- [ ] **Step 2: Run typecheck**

Run: `cd package && bunx tsgo --noEmit`
Expected: PASS (EntrypointGenerator generates strings — its own types must check)

- [ ] **Step 3: Commit**

```bash
git add package/src/build/EntrypointGenerator.ts
git commit -m "refactor: update EntrypointGenerator for Effect service pattern"
```

---

### Task 8: Update Tests and Verify

**Files:**

- Modify: `package/__tests__/build/builder.test.ts` — update fromConfig tests if needed
- Modify: `package/__tests__/commands/` — update or delete command tests
- Modify: Any remaining test files that reference old APIs

- [ ] **Step 1: Update command tests**

Tests that reference `Commands.run()` or `Commands.parse()` need to be updated to test via `CommandRunner` service:

```typescript
import { Effect } from "effect";
import { CommandRunner } from "../../src/services/CommandRunner.js";
import { CommandRunnerLive } from "../../src/layers/CommandRunnerLive.js";

const program = Effect.gen(function* () {
 const runner = yield* CommandRunner;
 return yield* runner.parse(schema, args);
}).pipe(Effect.provide(CommandRunnerLive));

const result = await Effect.runPromise(program);
```

- [ ] **Step 2: Run full test suite**

Run: `cd package && bun test`
Expected: ALL PASS

- [ ] **Step 3: Run plugin tests**

Run: `cd plugin && bun test`
Expected: ALL PASS

- [ ] **Step 4: Type check both workspaces**

Run: `cd package && bunx tsgo --noEmit`
Run: `cd plugin && bunx tsgo --noEmit`
Expected: Both PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: update all tests for Effect service migration"
```

---

### Task 9: Clean Up Dead Code and Exports

**Files:**

- Modify: `package/src/index.ts`
- Modify: `package/src/plugin/config.ts` (if dead types remain)
- Delete: Files that are no longer needed

- [ ] **Step 1: Audit exports**

In `package/src/index.ts`, verify:

- `PipelineRuntimeService` and `PipelineRuntimeServiceLive` are exported
- `CommandRunner` and `CommandRunnerLive` are exported
- `RunResult` and `PipelineRunConfig` are exported
- Old `PipelineRuntime` static class is NOT exported (or only type exports remain)
- `Commands` class is NOT exported
- `RunRawHandlerOptions` is NOT exported
- No `*Raw*` types are exported

- [ ] **Step 2: Search for dead references**

```bash
cd package && grep -r "PipelineRuntime\." src/ --include="*.ts" | grep -v "PipelineRuntimeService"
cd package && grep -r "Commands\." src/ --include="*.ts" | grep -v "CommandRunner"
cd package && grep -r "runRaw" src/ --include="*.ts"
cd package && grep -r "RawHandler" src/ --include="*.ts"
```

Delete or update any remaining references.

- [ ] **Step 3: Run final verification**

Run: `cd package && bunx tsgo --noEmit && bun test`
Run: `cd plugin && bunx tsgo --noEmit && bun test`
Expected: ALL PASS, clean typecheck

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up dead code from runtime Effect migration"
```
