# Testing

## Overview

Testing uses Effect's layer system to replace services with in-memory
implementations. No global mocking of `Bun.env`, `process.exit`, etc.

## Test Factory Functions

All test factories are exported from `claude-binary-plugin/testing`:

```typescript
import {
  makeStdinReaderTest,
  makeSessionStoreTest,
  makeShellExecutorTest,
  makeTelemetryTest,
  makePluginLoggerTest,
  makeEnvPersisterTest,
  makePluginEnvTest,
  makeOtelConfigTest,
  makeCommandRunnerTest,
  makeSidecarConnectionTest,
  EnvLoaderTest,
} from "claude-binary-plugin/testing";
```

### Factory Signatures

| Factory | Arguments | Returns |
| --------- | ----------- | --------- |
 | `makeStdinReaderTest(json)` | JSON string | Layer providing `StdinReader` |
| `makeSessionStoreTest()` | none | Layer with in-memory session map |
| `makeShellExecutorTest(results)` | Pre-configured shell results | Layer providing `ShellExecutor` |
| `makeTelemetryTest()` | none | Layer providing no-op `Telemetry` |
| `makePluginLoggerTest()` | none | `{ layer, getLogs(), clear() }` |
| `makeEnvPersisterTest()` | none | Layer recording persisted vars |
| `makePluginEnvTest()` | none | Layer providing `PluginEnvService` |
| `makeOtelConfigTest(overrides?)` | Optional config overrides | Layer providing `OtelConfig` |
| `makeCommandRunnerTest()` | none | Layer providing `CommandRunner` |
| `makeSidecarConnectionTest()` | none | Layer providing no-op `SidecarConnection` |
| `EnvLoaderTest` | (constant layer) | Layer providing no-op `EnvLoader` |

### Example: Testing a Pipeline Handler

```typescript
import { describe, test, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { makeStdinReaderTest, makeTelemetryTest } from "claude-binary-plugin/testing";

test("handler denies dangerous tool", async () => {
  const stdinLayer = makeStdinReaderTest(JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /" },
    tool_use_id: "tu_123",
  }));

  const testLayer = Layer.mergeAll(stdinLayer, makeTelemetryTest());

  const result = await Effect.runPromise(
    myHandler.pipe(Effect.provide(testLayer))
  );

  expect(result.action).toBe("deny");
});
```

## Testing Outcomes

Handlers returning Outcome instances can be tested directly without
running through the full pipeline:

```typescript
import { Allow, Deny, Modify, Outcome } from "claude-binary-plugin";

test("handler returns Deny for destructive command", () => {
  const result = myHandler({
    input: { tool_name: "Bash", tool_input: { command: "rm -rf /" } },
    options: { MODE: "strict" },
    state: { projectDir: "/tmp", pluginDir: "/tmp", pluginEnvFile: "/tmp/env" },
  });

  // Check outcome type
  expect(Outcome.isOutcome(result)).toBe(true);
  expect(result).toBeInstanceOf(Deny);

  // Check response wire format
  expect(result.toResponse()).toEqual({
    permissionDecision: "deny",
    reason: expect.any(String),
  });

  // Check telemetry data
  const telemetry = result.toTelemetry();
  expect(telemetry.outcome).toBe("denied");
  expect(telemetry.success).toBe(true);
  expect(telemetry.summary).toContain("blocked");
});
```

### Testing Extended Outcomes

When outcomes are extended with domain fields, test the custom metrics:

```typescript
class SecurityAllow extends Allow.extend<SecurityAllow>("SecurityAllow")({
  riskLevel: Schema.Literal("none", "low"),
  scannedPatterns: Schema.Number,
}) {}

test("extended outcome includes domain metrics", () => {
  const result = new SecurityAllow({
    summary: "safe",
    riskLevel: "none",
    scannedPatterns: 42,
  });

  const telemetry = result.toTelemetry();
  expect(telemetry.metrics).toEqual({
    riskLevel: "none",
    scannedPatterns: 42,
  });
});
```

### Testing ContextBuilder

```typescript
import { MarkdownContext, XmlContext } from "claude-binary-plugin";

test("MarkdownContext renders correctly", () => {
  const ctx = new MarkdownContext()
    .heading(2, "Rules")
    .rule("No force push")
    .list(["item 1", "item 2"]);

  expect(ctx.toString()).toContain("## Rules");
  expect(ctx.metrics.sections).toBe(1);
  expect(ctx.metrics.rules).toBe(1);
});
```

## I/O Injection in PipelineRuntime

`PipelineRuntime.run()` accepts an `io` parameter for testing without
mocking process globals:

```typescript
interface IODependencies {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  exit?: (code: number) => never;
  cwd?: () => string;
  inputText?: string;  // Pre-loaded input, bypasses stdin reading
}
```

The `inputText` field is the primary mechanism for test injection -- it
provides the raw JSON string directly without reading from stdin.

## PluginTester Fluent API

The `PluginTester` class (`src/testing/builder.ts`) provides a fluent API for
integration testing of full plugin configurations. It is still functional but
being phased out in favor of direct layer-based testing.

```typescript
import { PluginTester } from "claude-binary-plugin";

const tester = PluginTester.from(plugin);

const result = await tester.hook("PreToolUse", {
  tool_name: "Bash",
  tool_input: { command: "echo hello" },
});

expect(result.output.action).toBe("allow");
```

`PluginTester` handles:

- Constructing the full stdin JSON with default base fields
- Creating the I/O injection
- Running `PipelineRuntime.run()` with test I/O
- Capturing stdout/stderr output
- Parsing the response

### PluginTester Outcome Support

When a handler returns an Outcome, `PluginTester` captures both the
response wire format and the telemetry data:

- `result.response` -- The JSON object written to stdout (from `toResponse()`)
- `result.outcome` -- The raw outcome label (from `toTelemetry().outcome`)
- `result.telemetry` -- Full telemetry data (outcome, summary, success, metrics)

### Test Input Types

Simplified input interfaces for each hook type (optional base fields):

- `PreToolUseTestInput` -- `tool_name`, `tool_input`, `tool_use_id?`
- `PostToolUseTestInput` -- `tool_name`, `tool_input`, `tool_response`, `tool_use_id?`
- `SessionStartTestInput` -- `source`
- `SessionEndTestInput` -- `reason`
- `StopTestInput` -- `stop_hook_active?`
- `SubagentStopTestInput` -- `stop_hook_active?`
- `UserPromptSubmitTestInput` -- `prompt?`
- `PreCompactTestInput` -- `trigger?`, `custom_instructions?`
- `NotificationTestInput` -- `message?`, `notification_type?`
- `PermissionRequestTestInput` -- `message?`, `notification_type?`

## Testing Effect-Returning Handlers

When handlers return Effects, provide the test layer stack:

```typescript
const testLayer = Layer.mergeAll(
  makeStdinReaderTest(inputJson),
  makeSessionStoreTest(),
  makeShellExecutorTest([{ exitCode: 0, stdout: "ok", stderr: "" }]),
  makeTelemetryTest(),
);

const result = await Effect.runPromise(
  Effect.scoped(handler.pipe(Effect.provide(testLayer)))
);
```

## Test File Organization

Test files live in `package/__tests__/` mirroring `package/src/`:

```text
__tests__/
  build/
    builder.test.ts
    HookExtractor.test.ts
    ...
  layers/
    PipelineRuntime.test.ts
    SessionRegistry.test.ts
    ...
  schemas/
    hook-events.test.ts
    pipeline-outputs.test.ts
    ...
  services/
    PluginEnv.test.ts
    ...
```

## Mock Utilities (`testing/mocks.ts`)

- `MockExitError` -- Thrown by mock exit functions to halt execution
- `BufferShellResult` -- Shell result with buffer support
- `InMemoryShellExecutor` -- Configurable mock shell
- `MockEnvContext` / `MockCommandContext` -- Pre-built test contexts
- `createMockFn()` -- Creates tracked mock functions for assertions
