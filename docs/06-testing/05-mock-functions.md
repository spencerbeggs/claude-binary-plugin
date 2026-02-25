# Mock Functions

The `PluginTester` provides tracked mock functions with a Jest-like API. Mock functions record every call, let you configure return values, and integrate with the tester's cleanup lifecycle.

## Creating a Mock Function

Use `ctx.mockFn(name, impl?)` to create a tracked mock. The `name` parameter identifies the mock for cleanup purposes and must be unique within the test context.

```typescript
const fetchMock = ctx.mockFn<[string], Response>("fetch");
```

The type parameters are optional but recommended:

- First type parameter (`TArgs`): tuple type for the function arguments
- Second type parameter (`TReturn`): return type of the function

## Configuring Return Values

### mockReturnValue(value)

Set the default return value for all calls:

```typescript
const fetchMock = ctx.mockFn<[string], { ok: boolean }>("fetch");
fetchMock.mockReturnValue({ ok: true });

fetchMock("https://api.example.com");  // returns { ok: true }
fetchMock("https://other.example.com"); // returns { ok: true }
```

### mockReturnValueOnce(value)

Queue a return value for the next call only. Once consumed, subsequent calls use the default return value or the next queued value.

```typescript
fetchMock.mockReturnValueOnce({ ok: false });  // first call
fetchMock.mockReturnValueOnce({ ok: true });   // second call
fetchMock.mockReturnValue({ ok: true });       // all subsequent calls

fetchMock("a");  // { ok: false }
fetchMock("b");  // { ok: true }
fetchMock("c");  // { ok: true }
```

### mockImplementation(fn)

Replace the mock with a custom implementation:

```typescript
fetchMock.mockImplementation((url) => {
  if (url.includes("error")) {
    return { ok: false };
  }
  return { ok: true };
});

fetchMock("https://api.example.com/data");   // { ok: true }
fetchMock("https://api.example.com/error");  // { ok: false }
```

### mockRejectedValue(error)

Configure the mock to throw an error on every call:

```typescript
fetchMock.mockRejectedValue(new Error("Network timeout"));

fetchMock("any-url");  // throws Error("Network timeout")
```

## Inspecting Calls

### Properties

| Property | Type | Description |
| -------- | ---- | ----------- |
| `calls` | `TArgs[]` | Array of all call argument tuples |
| `results` | `Array<{ type, value }>` | Array of all return values or thrown errors |
| `callCount` | `number` | Number of times the mock was called |
| `called` | `boolean` | Whether the mock was called at least once |
| `lastCall` | `TArgs` or `undefined` | Arguments of the most recent call |

### Examples

```typescript
const logMock = ctx.mockFn<[string, number], void>("logger");
logMock.mockReturnValue(undefined);

logMock("request started", 1);
logMock("request completed", 2);

expect(logMock.called).toBe(true);
expect(logMock.callCount).toBe(2);
expect(logMock.calls).toEqual([
  ["request started", 1],
  ["request completed", 2],
]);
expect(logMock.lastCall).toEqual(["request completed", 2]);
```

## Clearing and Resetting

### mockClear()

Clear call history and results but keep configured return values and implementations:

```typescript
fetchMock.mockReturnValue({ ok: true });
fetchMock("url");
expect(fetchMock.callCount).toBe(1);

fetchMock.mockClear();
expect(fetchMock.callCount).toBe(0);

// Return value configuration is preserved
fetchMock("url");  // still returns { ok: true }
```

### mockReset()

Reset the mock to its initial state, clearing everything including return value configuration:

```typescript
fetchMock.mockReturnValue({ ok: true });
fetchMock("url");

fetchMock.mockReset();
expect(fetchMock.callCount).toBe(0);

fetchMock("url");  // returns undefined (no configured return)
```

## Bulk Operations

### ctx.clearMockCalls()

Clear call history for all registered mock functions at once. Keeps return value configuration intact.

```typescript
const mockA = ctx.mockFn("a");
const mockB = ctx.mockFn("b");
mockA(); mockB();

ctx.clearMockCalls();
expect(mockA.callCount).toBe(0);
expect(mockB.callCount).toBe(0);
```

### ctx.resetMocks()

Reset all registered mock functions and shell mock sequences to their initial state.

```typescript
ctx.resetMocks();
// All mocks cleared, all return values reset, shell sequences drained
```

## Complete Example

This example shows how to use mock functions to test a hook that depends on an external service.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/api-check hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("tracks multiple calls", async () => {
    const tracker = ctx.mockFn<[string], void>("event-tracker");
    tracker.mockReturnValue(undefined);

    // Simulate hook logic that calls the tracker
    tracker("hook-start");
    tracker("hook-end");

    expect(tracker.callCount).toBe(2);
    expect(tracker.calls[0]).toEqual(["hook-start"]);
    expect(tracker.calls[1]).toEqual(["hook-end"]);
  });

  test("clear calls between test phases", async () => {
    const counter = ctx.mockFn<[string], number>("counter");
    counter.mockReturnValue(1);

    // Phase 1
    counter("phase-1");
    expect(counter.callCount).toBe(1);

    // Clear for phase 2
    ctx.clearMockCalls();
    expect(counter.callCount).toBe(0);

    // Phase 2
    counter("phase-2");
    expect(counter.callCount).toBe(1);
    expect(counter.lastCall).toEqual(["phase-2"]);
  });
});
```

## Cleanup

All mock functions registered with `ctx.mockFn()` are cleaned up automatically when `dispose()` is called. You do not need to manually restore or reset them in `afterEach` beyond calling `dispose()`.
