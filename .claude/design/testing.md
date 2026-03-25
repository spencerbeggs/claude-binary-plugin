# Testing

## Overview

Testing uses Effect layers to swap production implementations with test
doubles. No global mocking of `Bun.$`, `process.stdout`, or `Bun.env`.

## Test Layer Factories

Each service has a test factory in `src/layers/`:

| Factory | What it provides |
| --- | --- |
| `makeStdinReaderTest(input)` | Returns pre-canned stdin string |
| `EnvLoaderTest` | No-op (skips file I/O) |
| `makeEnvPersisterTest()` | Records writes to array |
| `makeSessionStoreTest()` | In-memory Map instead of SQLite |
| `makeTelemetryTest()` | Captures events/errors to arrays |
| `makeShellExecutorTest(responses?)` | Pattern-matching mock shell |
| `makeCommandRunnerTest()` | Records runs, returns success |
| `makePluginEnvTest(vars?)` | In-memory env vars |
| `makePluginBuilderTest()` | Records build calls |

## Using Test Layers

```typescript
import { Effect, Layer } from "effect";
import { StdinReader } from "../src/services/StdinReader.js";
import { makeStdinReaderTest } from "../src/layers/StdinReaderTest.js";

test("reads input", async () => {
  const program = Effect.flatMap(StdinReader, (s) => s.read());
  const result = await Effect.runPromise(
    program.pipe(Effect.provide(makeStdinReaderTest('{"hook_event_name":"PreToolUse"}')))
  );
  expect(result).toContain("PreToolUse");
});
```

## Test Utilities Entry Point

`src/testing.ts` exports all test factories:

```typescript
import { makeStdinReaderTest, makeTelemetryTest } from "claude-binary-plugin/testing";
```

## Legacy PluginTester

`src/testing/builder.ts` provides a fluent API:

```typescript
const result = await plugin.test()
  .withOptions({ apiKey: "test-key" })
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("validate-tool");
expect(result.action).toBe("allow");
```

This is being phased out in favor of direct layer composition. It still
works but uses global mocking internally.

## Test Files

All tests live in `__tests__/` mirroring `src/`:

```text
__tests__/schemas/hook-events.test.ts
__tests__/layers/PipelineRuntime.test.ts
__tests__/otel/OtelConfig.test.ts
__tests__/plugin/config.test.ts
```

Test runner: `bun test` (discovers `__tests__/**/*.test.ts`)
