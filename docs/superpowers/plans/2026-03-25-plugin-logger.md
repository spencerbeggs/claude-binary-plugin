# Plugin Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the imperative DebugLogger with an Effect-native
structured logger, converting PipelineRuntime from `async/await` to
an Effect program so `Effect.log*` works throughout the pipeline.

**Architecture:** PipelineRuntime.run() becomes an `Effect.gen` block.
A custom `Logger.make` produces NDJSON, piped through
`PlatformLogger.toFile` for managed file I/O. Channel annotations
(`pipeline`, `event`, `context`, `state`, `otel`) categorize log
entries for `jq` filtering. When logging is disabled, `Logger.none`
provides zero overhead.

**Tech Stack:** Effect (Logger, Layer, PlatformLogger), `@effect/platform-bun`
(BunFileSystem), `bun:test`, Biome

**Spec:** `docs/superpowers/specs/2026-03-25-plugin-logger-design.md`

---

## Task 1: Create PluginLoggerLive and PluginLoggerTest

**Files:**

- Create: `src/layers/PluginLoggerLive.ts`
- Create: `src/layers/PluginLoggerTest.ts`
- Create: `__tests__/layers/PluginLoggerLive.test.ts`

- [ ] **Step 1: Write failing tests**

Test the logger layer produces NDJSON with correct fields. Test
channel annotations appear in output. Test `Logger.none` when
disabled. Test file fallback on open failure.

Key test cases:

- `PluginLoggerLive` writes NDJSON lines to a file
- Log entries contain `timestamp`, `level`, `message`, `fiber`,
  `channel` fields
- `Effect.annotateLogs("channel", "event")` produces a `channel`
  field in output
- Custom annotations (`hookType`, `pluginName`) appear as top-level
  JSON fields
- When `CLAUDE_DEBUG` is unset, `Logger.none` is provided (no file)
- `makePluginLoggerTest()` captures logs in-memory

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/layers/PluginLoggerLive.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PluginLoggerLive**

Create `src/layers/PluginLoggerLive.ts`:

- Build a custom `Logger.make` that produces NDJSON with controlled
  field names (`level` not `logLevel`, `fiber` not `fiberId`).
  Flatten annotations to top-level fields. Ensure `channel` is
  always present (default to `"general"` if not annotated).
- Pipe through `PlatformLogger.toFile(logFilePath)` (no second
  argument — follows the `SidecarLoggerLive` pattern)
- Provide `BunFileSystem.layer` internally
- Use `Logger.replaceScoped` to replace the default logger
- Set `Logger.minimumLogLevel` from `resolveLogLevel()`
- When `CLAUDE_LOG_STDERR=1`, zip with `Logger.prettyLogger`
- On file open failure, fall back to `Logger.none`:

  ```typescript
  ).pipe(
    Layer.provide(BunFileSystem.layer),
    Layer.catchAll(() => Logger.replace(Logger.defaultLogger, Logger.none)),
  )
  ```

- When logging disabled (no `CLAUDE_DEBUG`), return
  `Logger.replace(Logger.defaultLogger, Logger.none)`
- Define `resolveLogLevel` inline (copy the ~20-line function from
  `LoggerLive.ts` rather than importing — avoids a temporary cross-
  file dependency that breaks when `LoggerLive.ts` is deleted in
  Task 4)

Export:

```typescript
export const makePluginLoggerLive = (
  pluginName: string,
  logLevel?: LogLevel.LogLevel,
): Layer.Layer<never>
```

Log file path resolution: same logic as current DebugLogger — use
`CLAUDE_ENV_FILE` dirname, fall back to `/tmp`.

- [ ] **Step 4: Implement PluginLoggerTest**

Create `src/layers/PluginLoggerTest.ts`:

```typescript
export const makePluginLoggerTest = () => {
  const logs: Array<{ level: string; message: string; [key: string]: unknown }> = [];
  const logger = Logger.make(({ message, date, logLevel, annotations }) => {
    logs.push({
      timestamp: date.toISOString(),
      level: logLevel._tag,
      message: typeof message === "string" ? message : JSON.stringify(message),
      ...Object.fromEntries(annotations),
    });
  });
  const layer = Logger.replace(Logger.defaultLogger, logger);
  const getLogs = () => [...logs];
  const clear = () => { logs.length = 0; };
  return { layer, getLogs, clear };
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/layers/PluginLoggerLive.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test && bun run typecheck && bun run lint:fix`
Expected: All pass (new files, no consumers yet)

- [ ] **Step 7: Commit**

```bash
git add src/layers/PluginLoggerLive.ts src/layers/PluginLoggerTest.ts \
  __tests__/layers/PluginLoggerLive.test.ts
git commit -m "feat: add PluginLoggerLive and PluginLoggerTest layers

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Convert PipelineRuntime.run() to Effect

**Files:**

- Modify: `src/layers/PipelineRuntime.ts`
- Modify: `src/plugin/config.ts` (PipelineHandler type)
- Modify: `__tests__/layers/PipelineRuntime.test.ts`

This is the largest task. The imperative `async run()` method becomes
an `Effect.gen` block. All `console.error()` calls become
`Effect.logError()`. The handler return type gains `| Effect<TOutput>`.

- [ ] **Step 1: Update PipelineHandler return type**

In `src/plugin/config.ts`, change `PipelineHandler`:

```typescript
// Before:
export type PipelineHandler<TInput, TOutput, TOptions, TState> = (
  ctx: HandlerContext<TInput, TOptions, TState>,
) => TOutput | Promise<TOutput>;

// After:
export type PipelineHandler<TInput, TOutput, TOptions, TState> = (
  ctx: HandlerContext<TInput, TOptions, TState>,
) => TOutput | Promise<TOutput> | Effect.Effect<TOutput>;
```

Add `import { Effect } from "effect";` to config.ts imports.

- [ ] **Step 2: Run existing tests to verify backward compat**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: PASS — type change is additive, existing handlers still work

- [ ] **Step 3: Convert run() body to Effect.gen**

In `src/layers/PipelineRuntime.ts`, replace the `static async run()`
method. The full body becomes an `Effect.gen` block wrapped in
`Effect.runPromise`. Key changes:

- `await Bun.stdin.text()` becomes
  `yield* Effect.tryPromise(() => Bun.stdin.text())`
- `Schema.decodeUnknownSync(...)` stays synchronous (no yield needed)
- `console.error(msg)` becomes `yield* Effect.logError(msg)`
- `await Effect.runPromise(telemetry.emit(...))` becomes
  `yield* telemetry.emit(...)`
- `io.exit(code)` moves outside the Effect (called after
  `Effect.runPromise` resolves)
- Handler call detects return type:

  ```typescript
  const rawOutput = pipeline(ctx);
  let output;
  if (Effect.isEffect(rawOutput)) {
    output = yield* rawOutput;
  } else if (rawOutput instanceof Promise || (rawOutput && typeof (rawOutput as any).then === "function")) {
    output = yield* Effect.tryPromise(() => rawOutput as Promise<unknown>);
  } else {
    output = rawOutput;
  }
  ```

- Add `Effect.annotateLogs({ hookType, hookName, pluginName })` at
  the top scope. `sessionId` and `toolName` are annotated after
  event decode.
- Add `Effect.log` calls at key points with channel annotations
  (see spec "Integration Points" section for exact placement).
- Provide `PluginLoggerLive(pluginName)` to the program.

The method signature stays `static async run(options): Promise<never>`
for backward compatibility at the call site.

- [ ] **Step 4: Convert runRaw() to Effect.gen**

Same pattern as run() but simpler — fewer log points, no output
validation or response conversion. The raw handler call also needs
the Effect return type detection.

**Note:** `runRaw()` currently uses `process.exit(2)` directly (not
`io.exit`) for error paths. Keep `process.exit` in `runRaw()` since
it does not have I/O injection. Error paths use
`yield* Effect.logError(msg)` before the process exit.

- [ ] **Step 5: Convert handleUnknown() to Effect.gen**

Replace `process.stderr.write()` with `Effect.logError()`.
Replace `await Effect.runPromise(telemetry.emit(...))` with
`yield* telemetry.emit(...)`.

- [ ] **Step 6: Update tests**

Existing PipelineRuntime tests use `io: { inputText, stdout, stderr,
exit, cwd }` for I/O injection. These should continue to work since
`run()` still returns `Promise<never>` and the I/O injection pattern
is preserved.

Add new tests:

- Handler returning an `Effect` is properly executed
- `Effect.log*` calls within Effect-returning handlers produce log
  entries (use `makePluginLoggerTest()`)
- Verify all existing integration tests still pass

- [ ] **Step 7: Run full test suite**

Run: `bun run test && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/layers/PipelineRuntime.ts src/plugin/config.ts \
  __tests__/layers/PipelineRuntime.test.ts
git commit -m "refactor: convert PipelineRuntime to Effect programs

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Architecture Note: Logger Layer Composition

`PipelineLive.ts` does NOT include the logger. The logger needs
`pluginName` which is only available at runtime in `PipelineConfig`.
Instead, `PipelineRuntime.run()` provides the logger layer locally:

```typescript
const program = Effect.gen(function*() { ... }).pipe(
  Effect.provide(makePluginLoggerLive(pluginName)),
);
```

This matches how telemetry is already configured with runtime values
in `run()`. No changes to `PipelineLive.ts` are needed.

---

## Task 3: Remove DebugLogger and Logger Methods

**Files:**

- Modify: `src/services/PluginEnv.ts` (remove DebugLogger dependency)
- Modify: `src/plugin/config.ts` (remove log/info/debug from BaseState)
- Modify: `src/layers/PipelineRuntime.ts` (remove logger binding to state)
- Delete: `src/utils/debug-logger.ts`
- Delete: `__tests__/utils/debug-logger.test.ts`
- Delete: `src/layers/LoggerLive.ts`
- Modify: `src/index.ts` (remove DebugLogger exports)

- [ ] **Step 1: Remove log/info/debug from BaseState**

In `src/plugin/config.ts`, remove lines 829-835 from `BaseState`:

```typescript
// DELETE these:
log(message: string, ...args: unknown[]): void;
info(message: string, ...args: unknown[]): void;
debug(message: string, ...args: unknown[]): void;
```

- [ ] **Step 2: Remove logger binding in PipelineRuntime**

In `src/layers/PipelineRuntime.ts`, remove the places that bind
`stateInstance.log`, `stateInstance.info`, `stateInstance.debug` onto
`pluginState` and `baseState`. These are in `createBaseState()` and
the state construction in `run()`/`runRaw()`.

Also convert the `debugLog` helper in `extractPersistedState()` — it
calls `stateInstance.info(...)` internally. Replace with a simple
`console.error()` guarded by `Bun.env.CLAUDE_DEBUG` (matching the
existing fallback pattern at the else branch).

- [ ] **Step 3: Remove DebugLogger from PluginEnv**

In `src/services/PluginEnv.ts`:

- Remove the `import { DebugLogger } from "../utils/debug-logger.js"`
- Remove the `logger` property and its initialization
- Remove the `.log()`, `.info()`, `.debug()` methods
- Convert any internal logging calls to `console.error()` guarded
  by `if (Bun.env.CLAUDE_DEBUG)` (matching the existing fallback
  pattern). PluginEnv is not an Effect service, so `Effect.log*`
  cannot be used here. These guard-gated console calls are the
  final form, not a temporary placeholder.

- [ ] **Step 4: Move resolveLogLevel to PluginLoggerLive**

The `resolveLogLevel` function lives in `LoggerLive.ts` which we're
deleting. Move it to `src/layers/PluginLoggerLive.ts` (it's already
imported there from Task 1).

- [ ] **Step 5: Delete files**

```bash
rm src/utils/debug-logger.ts
rm __tests__/utils/debug-logger.test.ts
rm src/layers/LoggerLive.ts
```

- [ ] **Step 6: Update src/index.ts exports**

Remove:

- `DebugLogger` export
- `DebugLoggerOptions`, `FileSystem`, `LogLevel`, `TimerHandle`,
  `TimingEntry`, `TimingTracker` type exports from
  `./utils/debug-logger.js`
- `LoggerLive` export from `./layers/LoggerLive.js`
- `resolveLogLevel` export from `./layers/LoggerLive.js`

Add:

- `makePluginLoggerLive` from `./layers/PluginLoggerLive.js`
- `resolveLogLevel` from `./layers/PluginLoggerLive.js`

- [ ] **Step 7: Update src/testing.ts exports**

Add:

- `makePluginLoggerTest` from `./layers/PluginLoggerTest.js`

- [ ] **Step 8: Search for remaining references**

Search `src/` and `__tests__/` for any remaining imports of:

- `debug-logger`
- `LoggerLive` (from the deleted file)
- `DebugLogger`
- `state.log(`, `state.info(`, `state.debug(`
- `baseState.log`, `baseState.info`, `baseState.debug`

Fix all references.

- [ ] **Step 9: Run tests, typecheck, lint**

Run: `bun run test && bun run typecheck && bun run lint:fix`
Expected: Pass (some tests may need updating if they relied on
`state.log` etc.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove DebugLogger, LoggerLive, and logger methods from state

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Add Channel Logging Throughout Pipeline

**Files:**

- Modify: `src/layers/PipelineRuntime.ts`
- Modify: `__tests__/layers/PipelineRuntime.test.ts`

Task 2 converted `run()` to Effect and added basic `Effect.logError`
calls. This task adds the full channel-annotated logging at each
pipeline stage.

- [ ] **Step 1: Add channel=event logging**

After event decode succeeds, log the event type and key fields:

```typescript
yield* Effect.log("hook event received").pipe(
  Effect.annotateLogs({
    channel: "event",
    toolName: "tool_name" in event ? event.tool_name : undefined,
  }),
);
```

- [ ] **Step 2: Add channel=pipeline logging**

Log at key pipeline stages:

- After input decode: `"input decoded"`
- On tool filter skip: `"tool filtered, skipping"`
- Before handler call: `"invoking handler"`
- After handler returns: `"handler completed"`
- After output validation: `"output validated"`
- After response written: `"response written to stdout"`

- [ ] **Step 3: Add channel=context logging**

When `claudeContext` or `additionalContext` is non-empty in the
response, log the actual context value:

```typescript
if (response.additionalContext) {
  yield* Effect.log(response.additionalContext).pipe(
    Effect.annotateLogs("channel", "context"),
  );
}
```

- [ ] **Step 4: Add channel=state logging**

Log session env dir resolution and state loading:

- `"resolved session env dir"` with path
- `"loaded persisted state"` with key count
- `"persisted session env"` after SessionStart persistence

- [ ] **Step 5: Add channel=otel logging**

Log telemetry operations:

- `"emitting hook execution telemetry"`
- `"telemetry flush"` with success/failure

- [ ] **Step 6: Write tests for channel logging**

Using `makePluginLoggerTest()`, verify that a full `run()` call
produces log entries with the expected channels. Test at least:

- An `event` channel entry exists with correct `hookType`
- A `pipeline` channel entry exists for `"response written"`
- Error paths produce `ERROR` level entries

- [ ] **Step 7: Run full test suite**

Run: `bun run test && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/layers/PipelineRuntime.ts __tests__/layers/PipelineRuntime.test.ts
git commit -m "feat: add channel-annotated logging throughout pipeline

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 5: Update Public API and Design Docs

**Files:**

- Modify: `src/index.ts` (verify exports are correct)
- Modify: `__tests__/index.test.ts`
- Modify: `.claude/design/services.md`
- Modify: `.claude/design/architecture.md`

- [ ] **Step 1: Verify index.ts exports**

Confirm new exports present:

- `makePluginLoggerLive` from `./layers/PluginLoggerLive.js`
- `resolveLogLevel` from `./layers/PluginLoggerLive.js`

Confirm old exports removed:

- `DebugLogger` and related types
- `LoggerLive` from `./layers/LoggerLive.js`

- [ ] **Step 2: Update index tests**

Add test cases verifying new exports are accessible.

- [ ] **Step 3: Update design docs**

Update `.claude/design/services.md` to document the new
PluginLoggerLive/Test layers.

Update `.claude/design/architecture.md` to remove reference to
`utils/` directory if `debug-logger.ts` was the only file there.

- [ ] **Step 4: Run tests, typecheck, lint, build**

Run: `bun run test && bun run typecheck && bun run lint:fix && bun run build`
Expected: All pass, build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: update public API exports and design docs for logger

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 6: Final Verification and Cleanup

- [ ] **Step 1: Run full test suite**

Run: `bun run test`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix`
Expected: Clean

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 5: Verify deleted files are gone**

```bash
test -f src/utils/debug-logger.ts && echo "EXISTS" || echo "DELETED"
test -f src/layers/LoggerLive.ts && echo "EXISTS" || echo "DELETED"
```

Expected: Both DELETED

- [ ] **Step 6: Verify no remaining console.error in PipelineRuntime**

```bash
grep -n "console\.\(error\|log\|warn\)" src/layers/PipelineRuntime.ts
```

Expected: No matches

- [ ] **Step 7: Verify no remaining DebugLogger references**

```bash
grep -rn "DebugLogger\|debug-logger" src/ __tests__/
```

Expected: No matches

- [ ] **Step 8: Commit** (if any cleanup needed)

```bash
git add -A
git commit -m "chore: final cleanup for plugin logger migration

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
