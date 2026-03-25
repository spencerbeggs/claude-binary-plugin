# Plugin Logger Design

## Overview

Replace the imperative DebugLogger system and convert PipelineRuntime
from imperative `async/await` to an Effect program. This enables
Effect-native structured logging via `Effect.log*` throughout the
entire pipeline. A single NDJSON log file per session captures all SDK
and plugin-developer logs, categorized by channel annotations for
filtering with `jq`.

## Goals

- Convert PipelineRuntime.run() from imperative async/await to Effect
- Unified logging for SDK internals and plugin handler code
- Structured NDJSON output to a session-specific file
- Channel-based categorization for filtering by concern
- Zero overhead when logging is disabled
- Testable: in-memory log capture for assertions

## Prerequisite: PipelineRuntime Effect Conversion

### Why

PipelineRuntime.run() is currently imperative `async/await` with
scattered `Effect.runPromise()` calls. `Effect.log*` only works inside
an Effect fiber — you cannot call it in imperative code. Converting
`run()` to an Effect program is required before logging can work
naturally.

### Current Structure

```typescript
static async run(options): Promise<never> {
  // Imperative: try/catch, await, console.error()
  const inputText = await Bun.stdin.text();
  const rawInput = JSON.parse(inputText);
  event = Schema.decodeUnknownSync(eventSchema)(rawInput);
  // ...
  const output = await pipeline({ input: event, options, state });
  // ...
  process.stdout.write(JSON.stringify(response));
  io.exit(0);
}
```

### Target Structure

```typescript
static run(options): Promise<never> {
  const program = Effect.gen(function*() {
    yield* Effect.logDebug("starting pipeline");

    // Read and decode input
    const inputText = yield* Effect.tryPromise(() => Bun.stdin.text());
    const rawInput = JSON.parse(inputText);
    const hookSchemas = PipelineRuntime.getHookSchemas(hookType);
    const decodedInput = Schema.decodeUnknownSync(hookSchemas.inputSchema)(rawInput);
    const event = hookSchemas.fromInput(decodedInput);

    yield* Effect.log("hook event received").pipe(
      Effect.annotateLogs("channel", "event")
    );

    // ... rest of pipeline as yield* operations ...
  }).pipe(
    Effect.annotateLogs({
      hookType, hookName, pluginName, sessionId
    }),
    Effect.provide(PluginLoggerLive(pluginName)),
    Effect.provide(BunFileSystem.layer)
  );

  return Effect.runPromise(program).then(() => io.exit(0));
}
```

The entire body of `run()` becomes a single `Effect.gen` block. All
intermediate operations that need Effect (logging, telemetry emission,
schema decode error handling) use `yield*`. Pure synchronous operations
(JSON.parse, field access) remain inline.

### Handler Return Type Change

`PipelineHandler` changes from:

```typescript
type PipelineHandler<TInput, TOutput, TOptions, TState> =
  (ctx: HandlerContext<...>) => TOutput | Promise<TOutput>;
```

To:

```typescript
type PipelineHandler<TInput, TOutput, TOptions, TState> =
  (ctx: HandlerContext<...>) => TOutput | Promise<TOutput> | Effect<TOutput>;
```

PipelineRuntime detects the return type:

- Plain object: used directly (backward compatible)
- Promise: awaited via `Effect.tryPromise`
- Effect: executed via `yield*`

This means existing handlers work unchanged. New handlers can
optionally return an Effect to use `Effect.log*`:

```typescript
const handler: Pipeline["PreToolUse"] = ({ input }) =>
  Effect.gen(function*() {
    yield* Effect.logDebug("checking tool input").pipe(
      Effect.annotateLogs("channel", "pipeline")
    );
    return { status: "executed", action: "allow", summary: "ok" };
  });
```

### runRaw() Conversion

Same pattern as `run()`: the body becomes `Effect.gen`, annotations
are applied at the top scope. Fewer log points since raw handlers
manage their own output.

### handleUnknown() Conversion

`handleUnknown()` also converts to an Effect program. Current
`process.stderr.write()` calls become `Effect.logError()` with
`channel: "pipeline"`. Telemetry emission uses `yield*` instead
of `await Effect.runPromise()`.

### What Changes in PipelineRuntime

| Aspect | Before | After |
| -------- | -------- | ------- |
| Control flow | `async/await` + `try/catch` | `Effect.gen` + `Effect.catchTag` |
| Error output | `console.error()` | `Effect.logError()` |
| Telemetry | `await Effect.runPromise(telemetry.emit(...))` | `yield* telemetry.emit(...)` |
| Handler call | `await pipeline(ctx)` | Detect return type, `yield*` if Effect |
| Exit | `io.exit(0)` | Effect completes, caller exits |
| Stdin read | `await Bun.stdin.text()` | `yield* Effect.tryPromise(...)` |

## Log Format

Each line is a JSON object produced by a custom `Logger.make`:

```json
{
  "timestamp": "2026-03-25T01:23:45.678Z",
  "level": "INFO",
  "fiber": "#3",
  "channel": "event",
  "message": "PreToolUse hook received",
  "pluginName": "my-plugin",
  "hookName": "security",
  "hookType": "PreToolUse",
  "toolName": "Bash",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "span": "pipeline.run 12ms"
}
```

The logger is built with `Logger.make` (not `Logger.json` directly)
to control exact field names: `level` not `logLevel`, `fiber` not
`fiberId`. Annotations are flattened to top-level fields. This follows
the pattern already used in `LoggerLive.ts`.

**Fixed fields** (always present): `timestamp`, `level`, `message`,
`fiber`, `channel`.

**Contextual fields** (present when annotated): `pluginName`,
`hookName`, `hookType`, `toolName`, `sessionId`, `span`.

Contextual fields are set via `Effect.annotateLogs` at the
PipelineRuntime entry point. All `yield* Effect.log*` calls within
that scope inherit them automatically.

## Channels

| Channel | What it captures |
| ---------- | ----------------- |
| `pipeline` | Decode, handler invocation, response building, tool filter skips |
| `context` | additionalContext/claudeContext values flowing to Claude |
| `event` | Hook events received (type, tool, session_id) — audit trail |
| `state` | Session resolution, env loading, state persistence, options validation |
| `otel` | Telemetry emission, sidecar communication, flush results |

Filtering examples:

```bash
jq 'select(.channel == "context")' plugin.log
jq 'select(.channel == "event" and .hookType == "PreToolUse")' plugin.log
jq 'select(.level == "ERROR")' plugin.log
jq 'select(.sessionId == "550e8400-...")' plugin.log
```

## Output Destinations

**Primary: Session-specific file.** Path follows the existing
convention: `{sessionEnvDir}/{pluginName}.log`. Resolved from
`CLAUDE_ENV_FILE` the same way DebugLogger does today.

**Secondary: stderr (opt-in).** When `CLAUDE_LOG_STDERR=1` is set, a
`Logger.prettyLogger` is zipped with the file logger so output also
streams to stderr. Off by default to keep Claude Code's stderr clean.

**When disabled:** `Logger.none`. No file opened, no formatting. All
`Effect.log*` calls are no-ops. Zero overhead.

## Log Level Control

Controlled via `CLAUDE_DEBUG` env var using the existing
`resolveLogLevel` function:

| Value | Level | Behavior |
| ------------------- | ------- | ------------------- |
| unset | — | Logging disabled |
| `"1"` or `"true"` | Debug | All log levels |
| `"debug"` | Debug | All log levels |
| `"info"` | Info | Info and above |
| `"warn"` | Warn | Warn and above |
| `"error"` | Error | Error and above |
| `"0"` | — | Logging disabled |

## Layer Architecture

```text
PluginLoggerLive(pluginName, logLevel?)
  └─ Logger.make(...)               (custom NDJSON formatter)
     └─ PlatformLogger.toFile(path) (file sink, batched writes)
        └─ BunFileSystem.layer      (platform filesystem, provided internally)
```

`PluginLoggerLive` is a scoped `Layer` that:

1. Resolves the log file path from session env
2. Creates a custom `Logger.make` that produces NDJSON with controlled
   field names, piped through `PlatformLogger.toFile` with a small
   `batchWindow` (50ms) to reduce I/O overhead
3. Optionally zips with `Logger.prettyLogger` when `CLAUDE_LOG_STDERR=1`
4. Replaces the default logger via `Logger.replaceScoped`
5. Sets minimum log level from `CLAUDE_DEBUG`
6. Provides `BunFileSystem.layer` internally (following the
   `SidecarLoggerLive` pattern) so consumers only need to include
   `PluginLoggerLive` without additional platform dependencies

**File lifecycle:** `PlatformLogger.toFile` uses Effect's `Scope` for
resource management. The file handle is acquired when the layer is
provided and released when the scope closes. For PipelineRuntime, the
file is open for the duration of `run()` and closed on completion.

**Failure mode:** If the log file path cannot be resolved (no
`CLAUDE_ENV_FILE`, no session directory) or the file cannot be opened
(permissions, disk full), the layer falls back to `Logger.none`. A
logging failure must never kill the plugin. This is implemented via
`Layer.catchAll(() => Logger.none)`.

**Concurrent writes:** Claude Code hooks run as separate processes.
Each process opens its own file handle with `O_APPEND`. NDJSON lines
are short enough that POSIX `O_APPEND` guarantees atomic writes (up
to `PIPE_BUF`, typically 4KB). No cross-process locking is needed.

**Composition:** `PluginLoggerLive` is added to `PipelineLive` so all
services within the pipeline automatically get the logger.

## Integration Points

### PipelineRuntime.run()

Converted to `Effect.gen`. The entire body is a single Effect program
with annotations applied at the top scope:

1. Annotate scope with `hookType`, `hookName`, `pluginName`,
   `sessionId`, `toolName`
2. All error handling uses `Effect.logError()` instead of
   `console.error()`
3. Log points throughout:
   - `channel=event`: when hook event is decoded
   - `channel=pipeline`: decode success, tool filter skip, handler
     invocation, output validation, response written
   - `channel=context`: when claudeContext/additionalContext is
     non-empty (log the actual context value)
   - `channel=state`: session env dir resolution, state loading
   - `channel=otel`: telemetry emission, flush results

### PipelineRuntime.runRaw()

Same conversion pattern. Fewer log points (no output validation or
response conversion).

### PipelineRuntime.handleUnknown()

Converted to Effect. Current `process.stderr.write()` calls become
`Effect.logError()` with `channel: "pipeline"`.

### Plugin Developer Code

Handlers can return plain objects (backward compatible), Promises, or
Effects. When returning an Effect, `Effect.log*` calls within it
automatically inherit the pipeline's annotations:

```typescript
// Existing style (still works)
const handler: Pipeline["PreToolUse"] = ({ input }) => {
  return { status: "executed", action: "allow", summary: "ok" };
};

// New style (opt-in, enables logging)
const handler: Pipeline["PreToolUse"] = ({ input }) =>
  Effect.gen(function*() {
    yield* Effect.logDebug("checking tool input").pipe(
      Effect.annotateLogs("channel", "pipeline")
    );
    return { status: "executed", action: "allow", summary: "ok" };
  });
```

### PluginEnv

The `.log()`, `.info()`, `.debug()` methods are removed. PluginEnv's
`forContext()` is called inside the Effect program scope, so internal
logging uses `Effect.log*` with `channel: "state"` directly.

### Handler Context

The `log`, `info`, `debug` methods currently injected into handler
state via `BaseState` are removed. Handlers use `Effect.log*` instead
(requires returning an Effect).

## Test Layer

`makePluginLoggerTest()` returns a layer that captures log entries
in-memory as an array. Tests assert on log content, channel, and
level without touching the filesystem:

```typescript
const { layer, getLogs } = makePluginLoggerTest();

// ... run effect with layer ...

const logs = getLogs();
expect(logs).toContainEqual(
  expect.objectContaining({
    channel: "event",
    hookType: "PreToolUse"
  })
);
```

## File Disposition

### New Files

| File | Purpose |
| -------------------------------------------- | -------------------------------------------------- |
| `src/layers/PluginLoggerLive.ts` | Scoped layer: custom Logger.make + PlatformLogger.toFile |
| `src/layers/PluginLoggerTest.ts` | Test factory: in-memory log capture |
| `__tests__/layers/PluginLoggerLive.test.ts` | Tests for file writing, channels, log levels |

### Modified Files

| File | Change |
| -------------------------------- | ------------------------------------------------------ |
| `src/layers/PipelineRuntime.ts` | Convert run/runRaw/handleUnknown to Effect programs |
| `src/layers/PipelineLive.ts` | Add `PluginLoggerLive` to composed layer |
| `src/services/PluginEnv.ts` | Remove DebugLogger dependency and logger methods |
| `src/plugin/config.ts` | Add `Effect` to PipelineHandler return type, remove log methods from BaseState |
| `src/index.ts` | Remove DebugLogger exports, add PluginLoggerLive/Test |
| `src/testing.ts` | Add `makePluginLoggerTest` export |
| `__tests__/layers/PipelineRuntime.test.ts` | Update for Effect-based run() |

### Deleted Files

| File | Lines | Reason |
| ----------------------------------------- | ------- | ---------------------------------------- |
| `src/utils/debug-logger.ts` | 586 | Fully replaced by Effect logger |
| `__tests__/utils/debug-logger.test.ts` | 758 | Tests for deleted code |
| `src/layers/LoggerLive.ts` | 99 | Absorbed into PluginLoggerLive |

### Unchanged Files

| File | Reason |
| ----------------------------------- | -------------------------------------------------- |
| `src/layers/SidecarLoggerLive.ts` | Sidecar runs in separate process with own logger |

## Migration Notes

- PipelineRuntime converts from imperative to Effect-native
- `PipelineHandler` return type adds `| Effect<TOutput>` (backward
  compatible — plain objects and Promises still work)
- `DebugLogger` and `LoggerLive` are deleted entirely
- `TimingTracker` is replaced by Effect's `Effect.withSpan`
- Handler state no longer carries `log`/`info`/`debug` methods
- Plugin developers who used `state.log()` switch to returning an
  Effect with `Effect.logDebug()`
- Net change: ~1,450 lines deleted, ~400-500 lines added
