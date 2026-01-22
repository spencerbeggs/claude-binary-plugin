---
status: current
module: claude-binary-plugin
category: testing
created: 2026-01-22
updated: 2026-01-22
last-synced: 2026-01-22
completeness: 95
related:
  - .claude/design/architecture.md
dependencies: []
---

# Testing

This document describes the testing utilities provided by the
`claude-binary-plugin` SDK.

## Overview

The SDK provides a fluent testing API for plugin developers, accessible
via the `plugin.test()` method on any `ClaudeBinaryPlugin` instance. This
API provides full type inference for options, state, and hook inputs based
on your plugin's schema.

```typescript
import plugin from "../plugin.js";

const ctx = plugin.test()
  .withOptions({ DEBUG: "false" })
  .withState({ packageManager: "bun" });

const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");

expect(result.action).toBe("allow");
ctx.dispose();
```

All testing utilities are exported from the main entry point:

```typescript
import { PluginTester, TestFixtures } from "claude-binary-plugin";
```

## Fluent Testing API

### Basic Setup Pattern

The recommended pattern uses `beforeEach`/`afterEach` for setup and cleanup:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.js";

describe("Security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", ALLOW_SUDO: "false" })
      .withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });
  });

  afterEach(() => {
    ctx.dispose();  // REQUIRED - prevents test pollution
  });

  test("blocks dangerous commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("dangerous");
  });

  test("allows safe commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "git status" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });
});
```

### Configuration Methods

All configuration methods are fluent (return `this` for chaining).

#### withOptions(options)

Set the plugin options matching your schema definition. These correspond
to the environment variables your plugin accepts:

```typescript
ctx.withOptions({
  DEBUG: "true",
  API_KEY: "test-key",
  TIMEOUT_MS: "30000",
});
```

The options parameter is fully typed based on your plugin's Zod schema.

#### withState(state)

Set the computed state that would normally come from the `setup()` function.
This bypasses actual detection logic for isolated testing:

```typescript
ctx.withState({
  packageManager: "bun",
  gitRepo: true,
  projectRoot: "/test/project",
  // ... any fields your setup() returns
});
```

#### withPluginRoot(path)

Set the plugin root directory for resolving relative paths in command and
hook definitions. **Required** when testing commands defined with relative
paths like `./commands/test.cmd.ts`:

```typescript
// Set to the directory containing your plugin config
ctx.withPluginRoot(import.meta.dir);

// Or resolve from test file location
import { resolve } from "node:path";
ctx.withPluginRoot(resolve(import.meta.dir, ".."));
```

Without this, relative paths resolve from `process.cwd()` which may not be
your plugin directory.

#### withProjectDir(path)

Set the project directory (`CLAUDE_PROJECT_DIR`) for tests. Useful when
testing commands that operate on project files:

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use a temp directory for isolated tests
const tempDir = await mkdtemp(join(tmpdir(), "test-"));
ctx.withProjectDir(tempDir);
```

#### withTempProject() and withFile()

For testing commands that interact with the file system, use the virtual
test directory pattern. This creates an isolated temp directory with test
files that is automatically cleaned up:

```typescript
const result = await plugin.test()
  .withTempProject()  // Creates isolated temp directory
  .withFile("package.json", JSON.stringify({ name: "test", type: "module" }))
  .withFile("tsconfig.json", JSON.stringify({
    compilerOptions: { strict: true, noEmit: true }
  }))
  .withFile("src/index.ts", "export const foo = 1;")
  .withOptions({ DEBUG: "false" })
  .withState({ enabled: true })
  .mockBunShell()
  .withShellMatching(/bunx\s+tsc/, { exitCode: 0, stdout: "", stderr: "" })
  .runCommand("typecheck", {});

expect(result.exitCode).toBe(0);
```

Key points:

- `withTempProject()` must be called before `withFile()`
- File paths are relative to the temp project root
- Parent directories are created automatically
- Temp directory is cleaned up when `dispose()` is called
- Use `getTempProjectDir()` to access the actual path after tests run

This pattern is cleaner than manually creating temp directories because:

1. No need to manage temp directory lifecycle manually
2. Files are created just before tests run
3. Cleanup happens automatically via `dispose()`
4. The project directory is set automatically

## Mocking System

The `PluginTester` provides a comprehensive mocking system with four
integrated layers:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Bun.$ Interception                                    │
│  ─────────────────────────────────────────────────────────────  │
│  Automatically intercepts Bun.$`...` template literal calls     │
│  and routes them through shell mock configuration               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Shell Mocking                                         │
│  ─────────────────────────────────────────────────────────────  │
│  String-based ShellResult mocks for ShellExecutor               │
│  Buffer-based BufferShellResult mocks for InMemoryShellExecutor │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Mock Functions                                        │
│  ─────────────────────────────────────────────────────────────  │
│  Jest-like tracked functions with call history and return       │
│  value configuration                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Environment & I/O Mocking                             │
│  ─────────────────────────────────────────────────────────────  │
│  Automatic env var setup, stdout/stderr capture,                │
│  state serialization                                            │
└─────────────────────────────────────────────────────────────────┘
```

All mocking state is cleaned up automatically when `dispose()` is called.

---

### Mock Functions

The fluent API provides Jest-like mock utilities for tracking function
calls and configuring return values. These are useful for mocking
dependencies passed to your handlers.

#### How Mock Functions Work

Mock functions track every call made to them and allow you to configure
what they return. Internally, they maintain:

- **Call history** - Arguments from every invocation
- **Result history** - Return values or thrown errors
- **Return queue** - Values to return once then discard
- **Default return** - Fallback value after queue is exhausted
- **Implementation** - Custom function to execute

```text
mockFn("arg1", "arg2")
         │
         ▼
┌─────────────────────────────────────┐
│  1. Record call in calls[]          │
│  2. Check for rejectedError → throw │
│  3. Check for implementation → run  │
│  4. Check returnQueue → shift       │
│  5. Return defaultReturn            │
│  6. Record result in results[]      │
└─────────────────────────────────────┘
```

#### Creating Mock Functions

**Via PluginTester (recommended):**

```typescript
const fetchMock = ctx.mockFn<[string], Response>("fetch");
```

Mocks created this way are registered with the context and cleaned up
on `dispose()`.

**Standalone (for use outside fluent API):**

```typescript
import { createMockFn } from "claude-binary-plugin";

const mock = createMockFn<[number, number], number>();
```

#### Configuring Return Values

```typescript
const mock = ctx.mockFn<[string], number>("parser");

// Default return value (used after queue exhausted)
mock.mockReturnValue(42);

// Queue values returned in order, then fall through to default
mock.mockReturnValueOnce(100);
mock.mockReturnValueOnce(200);

mock("a");  // → 100 (from queue)
mock("b");  // → 200 (from queue)
mock("c");  // → 42  (default)
mock("d");  // → 42  (default)
```

#### Custom Implementation

```typescript
const mock = ctx.mockFn<[number, number], number>("add");

mock.mockImplementation((a, b) => a + b);

mock(2, 3);  // → 5
mock(10, 20);  // → 30
```

Implementation takes precedence over return values:

```typescript
mock.mockReturnValue(999);  // Ignored when implementation exists
mock.mockImplementation((a, b) => a * b);
mock(3, 4);  // → 12 (not 999)
```

#### Error Simulation

```typescript
const mock = ctx.mockFn<[string], Response>("fetch");

mock.mockRejectedValue(new Error("Network error"));

await mock("url");  // throws Error("Network error")
```

#### Inspecting Calls

```typescript
const mock = ctx.mockFn<[string, number], void>("log");

mock("hello", 1);
mock("world", 2);

// Properties
mock.calls;      // [["hello", 1], ["world", 2]]
mock.callCount;  // 2
mock.called;     // true
mock.lastCall;   // ["world", 2]

// Results tracking
mock.results;    // [{ type: "return", value: undefined }, ...]
```

#### Clearing and Resetting

```typescript
// Clear call history but keep configuration
mock.mockClear();
mock.callCount;  // 0
// Return values still configured

// Reset to initial state (clear everything)
mock.mockReset();
// All configuration removed
```

#### Mock Function API Reference

| Method | Description |
| ------ | ----------- |
| `mockReturnValue(value)` | Set default return value |
| `mockReturnValueOnce(value)` | Queue a one-time return value |
| `mockImplementation(fn)` | Set custom implementation |
| `mockRejectedValue(error)` | Throw error on every call |
| `mockClear()` | Clear calls/results, keep config |
| `mockReset()` | Reset to initial state |

| Property | Type | Description |
| -------- | ---- | ----------- |
| `calls` | `TArgs[]` | All call argument arrays |
| `results` | `Array<{type, value}>` | Return/throw results |
| `callCount` | `number` | Total invocation count |
| `called` | `boolean` | True if called at least once |
| `lastCall` | `TArgs \| undefined` | Most recent call args |

---

### Shell Mocking

Shell mocking provides deterministic responses for shell command execution
without actually running commands. There are two variants:

| Type | Input | Output | Use Case |
| ---- | ----- | ------ | -------- |
| `ShellResult` | String command | String stdout/stderr | `ShellExecutor` |
| `BufferShellResult` | Command array | Buffer stdout/stderr | `InMemoryShellExecutor` |

#### How Shell Mocking Works

Shell mocks are stored in two maps:

1. **Static responses** - Pattern → result (always returns same result)
2. **Sequenced responses** - Pattern → queue of results (returns in order)

Resolution order:

```text
getShellMock("git status")
         │
         ▼
┌─────────────────────────────────────┐
│  1. Check sequenced mocks           │
│     - Find matching pattern         │
│     - If sequence has items, shift  │
│     - Else return default           │
│  2. Check static responses          │
│     - Find matching pattern         │
│     - Return result                 │
│  3. Return undefined (no match)     │
└─────────────────────────────────────┘
```

Pattern matching uses `command.includes(pattern)`, so patterns can be
substrings of the full command.

#### String-Based Shell Mocking (ShellResult)

For code using `ShellExecutor` (string commands, string output):

```typescript
// Static response (always returns this)
ctx.withShell("git status", {
  exitCode: 0,
  stdout: "On branch main\nnothing to commit",
  stderr: "",
});

// One-time response (first call only)
ctx.mockShellOnce("npm install", {
  exitCode: 0,
  stdout: "added 42 packages",
  stderr: "",
});

// Sequential responses (returned in order)
ctx.mockShellSequence("curl https://api.example.com", [
  { exitCode: 1, stdout: "", stderr: "Connection refused" },
  { exitCode: 1, stdout: "", stderr: "Connection refused" },
  { exitCode: 0, stdout: '{"status":"ok"}', stderr: "" },
]);
```

**Combining static and sequenced:**

```typescript
// Queue takes priority, then falls through to static
ctx.withShell("npm test", { exitCode: 1, stdout: "", stderr: "1 failing" });
ctx.mockShellOnce("npm test", { exitCode: 0, stdout: "all passing", stderr: "" });

// First call → all passing (from queue)
// Second call → 1 failing (from static)
// Third call → 1 failing (from static)
```

#### Advanced Pattern Matching

For commands with dynamic arguments or complex patterns, use regex or
custom matchers:

**Regex matching with `withShellMatching()`:**

```typescript
// Match "bunx tsc" with any arguments (handles dynamic paths)
ctx.withShellMatching(/bunx\s+tsc/, { exitCode: 0, stdout: "", stderr: "" });

// Match "npm test" or "bun test"
ctx.withShellMatching(/(?:npm|bun)\s+test/, { exitCode: 0, stdout: "pass", stderr: "" });

// Match any TypeScript compilation command
ctx.withShellMatching(/tsc\s+--noEmit/, { exitCode: 0, stdout: "", stderr: "" });
```

**Custom matcher with `withShellMatcher()`:**

```typescript
// Match commands that start with "npm" or "yarn"
ctx.withShellMatcher(
  "package-manager",
  (cmd) => cmd.startsWith("npm ") || cmd.startsWith("yarn "),
  { exitCode: 0, stdout: "done", stderr: "" }
);

// Match tsc with a project flag (any path)
ctx.withShellMatcher(
  "tsc-with-project",
  (cmd) => cmd.includes("tsc") && cmd.includes("-p"),
  { exitCode: 0, stdout: "", stderr: "" }
);
```

**Array command interpolation:**

When commands use array interpolation like `Bun.$`${cmd}`` where
`cmd = ["bunx", "tsc", "--noEmit"]`, the mock automatically joins the
array with spaces for pattern matching:

```typescript
// This matches both:
// - Bun.$`bunx tsc --noEmit`  (string template)
// - Bun.$`${["bunx", "tsc", "--noEmit"]}`  (array interpolation)
ctx.withShell("bunx tsc", { exitCode: 0, stdout: "", stderr: "" });
```

#### Buffer-Based Shell Mocking (BufferShellResult)

For code using `InMemoryShellExecutor` (command arrays, Buffer output):

```typescript
// Static response
ctx.withBufferShell("git status", {
  exitCode: 0,
  stdout: Buffer.from("On branch main"),
  stderr: Buffer.from(""),
});

// One-time response
ctx.mockBufferShellOnce("npm install", {
  exitCode: 0,
  stdout: Buffer.from("installed"),
  stderr: Buffer.from(""),
});

// Sequential responses
ctx.mockBufferShellSequence("curl", [
  { exitCode: 1, stdout: Buffer.from(""), stderr: Buffer.from("timeout") },
  { exitCode: 0, stdout: Buffer.from("success"), stderr: Buffer.from("") },
]);
```

Buffer shell patterns match against the joined command array:

```typescript
// Command array: ["git", "status", "--short"]
// Matched against: "git status --short"
ctx.withBufferShell("git status", result);  // matches
ctx.withBufferShell("status --short", result);  // also matches
```

#### Shell Mock API Reference

**String-based (ShellResult):**

| Method | Description |
| ------ | ----------- |
| `withShell(pattern, result)` | Set static response (substring match) |
| `withShellMatching(regex, result)` | Set static response (regex match) |
| `withShellMatcher(name, fn, result)` | Set static response (custom matcher) |
| `mockShellOnce(pattern, result)` | Queue one-time response |
| `mockShellSequence(pattern, results)` | Queue multiple responses |
| `getShellMock(command)` | Resolve mock (internal) |

**Buffer-based (BufferShellResult):**

| Method | Description |
| ------ | ----------- |
| `withBufferShell(pattern, result)` | Set static response |
| `mockBufferShellOnce(pattern, result)` | Queue one-time response |
| `mockBufferShellSequence(pattern, results)` | Queue multiple responses |
| `getBufferShellMock(cmd)` | Resolve mock (internal) |

---

### Bun.$ Interception

The most powerful mocking feature: automatic interception of `Bun.$`
template literal calls. This eliminates the need for dependency injection
when testing code that uses `Bun.$` directly.

#### How Bun.$ Interception Works

When `mockBunShell()` is called:

```text
1. Save original Bun.$ reference
2. Replace Bun.$ with mock tagged template function
3. Mock function:
   a. Reconstructs command string from template parts
   b. Looks up result via getShellMock()
   c. Returns MockShellPromise (mimics real Bun.$ return)
```

The `MockShellPromise` implements the full `Bun.$` API:

```text
┌─────────────────────────────────────────────────────────────────┐
│  MockShellPromise                                               │
│  ─────────────────────────────────────────────────────────────  │
│  Implements PromiseLike<MockShellResult>                        │
│                                                                 │
│  Chainable (return this):     Terminal (return Promise):        │
│  • .quiet()                   • await (resolves to result)      │
│  • .nothrow()                 • .text() → stdout string         │
│  • .env(vars)                 • .json() → parsed stdout         │
│  • .cwd(path)                 • .blob() → stdout Blob           │
│                               • .lines() → stdout array         │
└─────────────────────────────────────────────────────────────────┘
```

#### Activating Interception

```typescript
ctx.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
   .mockBunShell();

// Now ALL Bun.$ calls are intercepted
const result = await Bun.$`git status`.text();
expect(result).toBe("clean");
```

#### Template Literal Reconstruction

The mock correctly handles template interpolation:

```typescript
const branch = "main";
ctx.withShell("git checkout main", { exitCode: 0, stdout: "", stderr: "" })
   .mockBunShell();

// Template literal is reconstructed to "git checkout main"
await Bun.$`git checkout ${branch}`;  // matches!
```

Also handles the `{ raw: string }` pattern used for escaping:

```typescript
const cmd = "echo 'hello'";
ctx.withShell("echo 'hello'", { exitCode: 0, stdout: "hello", stderr: "" })
   .mockBunShell();

await Bun.$`${{ raw: cmd }}`;  // matches!
```

#### Error Behavior

By default, throws on non-zero exit (matching real `Bun.$`):

```typescript
ctx.withShell("false", { exitCode: 1, stdout: "", stderr: "error" })
   .mockBunShell();

await Bun.$`false`;  // throws Error("Command failed: false")
```

Use `.nothrow()` to suppress:

```typescript
const result = await Bun.$`false`.nothrow();
expect(result.exitCode).toBe(1);  // No throw
```

#### Complete Integration Example

```typescript
describe("Build script", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false" })
      .withState({ projectRoot: "/app" })
      // Configure all shell mocks
      .withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
      .withShell("bun install", { exitCode: 0, stdout: "done", stderr: "" })
      .mockShellSequence("bun test", [
        { exitCode: 1, stdout: "", stderr: "1 failing" },  // First run
        { exitCode: 0, stdout: "all pass", stderr: "" },   // After fix
      ])
      // Activate Bun.$ interception
      .mockBunShell();
  });

  afterEach(() => ctx.dispose());

  test("retries failing tests", async () => {
    // Your code under test uses Bun.$ directly
    const status = await Bun.$`git status`.text();
    expect(status).toBe("clean");

    // First test run fails
    const run1 = await Bun.$`bun test`.nothrow();
    expect(run1.exitCode).toBe(1);

    // Second test run passes
    const run2 = await Bun.$`bun test`.nothrow();
    expect(run2.exitCode).toBe(0);
  });
});
```

#### Restoration

Original `Bun.$` is automatically restored on `dispose()`:

```typescript
afterEach(() => ctx.dispose());  // Restores Bun.$
```

Manual restoration if needed mid-test:

```typescript
ctx.restoreBunShell();  // Restores immediately
```

#### Bun.$ Mock API Reference

| Method | Description |
| ------ | ----------- |
| `mockBunShell()` | Activate Bun.$ interception |
| `restoreBunShell()` | Restore original Bun.$ |

**MockShellPromise methods:**

| Method | Return Type | Description |
| ------ | ----------- | ----------- |
| `.quiet()` | `MockShellPromise` | No-op, returns self |
| `.nothrow()` | `MockShellPromise` | Suppress error throws |
| `.env(vars)` | `MockShellPromise` | No-op, returns self |
| `.cwd(path)` | `MockShellPromise` | No-op, returns self |
| `.text()` | `Promise<string>` | Stdout as trimmed string |
| `.json()` | `Promise<unknown>` | Parse stdout as JSON |
| `.blob()` | `Promise<Blob>` | Stdout as Blob |
| `.lines()` | `Promise<string[]>` | Stdout split by newlines |
| `await` | `MockShellResult` | `{ exitCode, stdout, stderr }` |

---

### Global Mock Utilities

These methods affect all registered mocks:

#### clearMockCalls()

Clear call history from all registered mock functions without resetting
their configuration:

```typescript
// After first test phase
expect(myMock.callCount).toBe(3);

ctx.clearMockCalls();

// Start fresh for next phase
expect(myMock.callCount).toBe(0);
// Return values still configured
```

#### resetMocks()

Reset all mock functions and shell mock sequences to initial state:

```typescript
ctx.resetMocks();
// All mock functions reset
// All shell sequence queues cleared
// Static shell responses preserved
```

---

### Hook Input Methods

Each hook type has a corresponding input method. All return `this` for
chaining.

#### PreToolUse

```typescript
ctx.withPreToolUseInput({
  tool_name: "Bash",
  tool_input: { command: "ls -la" },
  tool_use_id: "tool_123",  // optional, auto-generated if not provided
});
```

#### PostToolUse

```typescript
ctx.withPostToolUseInput({
  tool_name: "Bash",
  tool_input: { command: "ls -la" },
  tool_response: { output: "file1.txt\nfile2.txt" },
  tool_use_id: "tool_123",
});
```

#### SessionStart

```typescript
ctx.withSessionStartInput({
  source: "startup",  // "startup" | "resume" | "clear" | "compact"
});
```

#### SessionEnd

```typescript
ctx.withSessionEndInput({
  reason: "logout",  // "clear" | "logout" | "prompt_input_exit" | "other"
});
```

#### Stop

```typescript
ctx.withStopInput({
  stop_hook_active: true,
});
```

#### SubagentStop

```typescript
ctx.withSubagentStopInput({
  stop_hook_active: true,
});
```

#### UserPromptSubmit

```typescript
ctx.withUserPromptSubmitInput({
  prompt: "Help me refactor this code",
});
```

#### PreCompact

```typescript
ctx.withPreCompactInput({
  trigger: "auto",  // "manual" | "auto"
  custom_instructions: "Focus on security",  // optional
});
```

#### Notification

```typescript
ctx.withNotificationInput({
  message: "Build completed",
  notification_type: "info",
});
```

#### PermissionRequest

```typescript
ctx.withPermissionRequestInput({
  message: "Allow access to filesystem?",
  notification_type: "permission",
});
```

### Base Input Fields

All hook inputs extend `HookInputBase` with these optional fields:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `session_id` | `string` | Auto-generated if not provided |
| `transcript_path` | `string` | Path to transcript file |
| `cwd` | `string` | Current working directory |
| `permission_mode` | `string` | Permission mode for the session |

## Running Hooks

### runHook(hookType, hookName)

Execute a hook handler with the configured context:

```typescript
const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");
```

**How it works:**

1. Finds the hook definition by `hookType` and `hookName` in plugin config
2. Resolves the handler (inline function or dynamic import for file paths)
3. Builds handler context with `{ input, options, state }`
4. Calls the pipeline handler
5. Converts output to `HookTestResult`

### HookTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = error |
| `stdout` | `string` | JSON-stringified pipeline output |
| `stderr` | `string` | Error output |
| `output` | `Record<string, unknown>` | Parsed pipeline output object |
| `action` | `HookAction` | Convenience: "allow" \| "deny" \| "block" \| "context" \| etc. |
| `context` | `string` | Convenience: `claudeContext` field value |
| `reason` | `string` | Convenience: `reason` field value |

### Hook Testing Patterns

**Testing PreToolUse allow/deny:**

```typescript
test("allows safe commands", async () => {
  const result = await ctx
    .withPreToolUseInput({
      tool_name: "Bash",
      tool_input: { command: "git status" },
    })
    .runHook("PreToolUse", "security");

  expect(result.exitCode).toBe(0);
  expect(result.action).toBe("allow");
});

test("denies dangerous commands", async () => {
  const result = await ctx
    .withPreToolUseInput({
      tool_name: "Bash",
      tool_input: { command: "rm -rf /" },
    })
    .runHook("PreToolUse", "security");

  expect(result.action).toBe("deny");
  expect(result.reason).toContain("dangerous");
});
```

**Testing SessionStart context injection:**

```typescript
test("adds project context", async () => {
  const result = await ctx
    .withSessionStartInput({ source: "startup" })
    .runHook("SessionStart", "context");

  expect(result.action).toBe("context");
  expect(result.context).toContain("Project uses bun");
});
```

**Testing PostToolUse:**

```typescript
test("adds context after tool execution", async () => {
  const result = await ctx
    .withPostToolUseInput({
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { output: "All tests passed" },
    })
    .runHook("PostToolUse", "test-reporter");

  expect(result.action).toBe("context");
  expect(result.context).toContain("tests passed");
});
```

**Testing Stop hooks:**

```typescript
test("blocks premature stops", async () => {
  const result = await ctx
    .withStopInput({ stop_hook_active: true })
    .runHook("Stop", "guard");

  expect(result.action).toBe("block");
  expect(result.reason).toBeDefined();
});
```

**Verifying handler receives correct context:**

```typescript
test("handler receives options from withOptions()", async () => {
  let receivedOptions: unknown;

  // Plugin with inline handler that captures options
  const testPlugin = ClaudeBinaryPlugin.create({
    prefix: "TEST",
    options: z.object({ API_KEY: z.string().optional() }),
    setup: async () => ({}),
    hooks: {
      PreToolUse: [{
        name: "capture",
        pipeline: async ({ options }) => {
          receivedOptions = options;
          return { status: "executed", action: "allow", summary: "ok" };
        },
      }],
    },
  });

  const ctx = testPlugin.test()
    .withOptions({ API_KEY: "secret" })
    .withState({})
    .withPreToolUseInput({ tool_name: "Bash", tool_input: {} });

  await ctx.runHook("PreToolUse", "capture");

  expect(receivedOptions).toEqual({ API_KEY: "secret" });
  ctx.dispose();
});
```

## Running Commands

### runCommand(commandName, args?)

Execute a command handler with optional arguments:

```typescript
const result = await ctx.runCommand("lint", {
  path: "src/",
  fix: true,
});
```

Arguments are validated against the command's Zod schema. Schema defaults
are applied automatically for omitted fields.

**Important:** For commands defined with file paths (e.g., `./commands/lint.cmd.ts`),
you must call `withPluginRoot()` first so paths resolve correctly:

```typescript
ctx = plugin.test()
  .withPluginRoot(import.meta.dir)  // Required for file-based commands
  .withOptions({ DEBUG: "false" })
  .withState({ projectRoot: "/test" });

const result = await ctx.runCommand("lint");
```

**How it works:**

1. Finds the command definition by name in plugin config
2. Resolves the handler (inline function or dynamic import from plugin root)
3. Validates args against the command's Zod schema
4. Builds command context with `{ args, options, state }`
5. Calls the command handler
6. Returns `CommandTestResult`

### CommandTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = issues found, 2 = fatal error |
| `stdout` | `string` | Markdown output from the command |
| `stderr` | `string` | Error output |
| `logs` | `string[]` | Captured `console.log` calls |
| `errors` | `string[]` | Captured `console.error` calls |
| `data` | `Record<string, unknown>` | Optional structured data from handler |

### Command Testing Patterns

**Testing successful execution:**

```typescript
test("lint command runs successfully", async () => {
  const result = await ctx.runCommand("lint", { path: "src/", fix: true });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("# Lint Results");
  expect(result.stdout).toContain("All checks passed");
});
```

**Testing with default arguments:**

```typescript
test("uses schema defaults when args omitted", async () => {
  const result = await ctx.runCommand("lint");

  // Schema defaults are applied (e.g., path: ".", fix: true)
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Path: .");
});
```

**Testing exit codes:**

```typescript
test("returns exit code 1 when issues found", async () => {
  const result = await ctx.runCommand("test", { pattern: "failing" });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("tests failed");
});

test("returns exit code 2 for fatal errors", async () => {
  // @ts-expect-error - Testing invalid command
  const result = await ctx.runCommand("nonexistent");

  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("not found");
});
```

**Testing structured data:**

```typescript
test("returns structured data", async () => {
  const result = await ctx.runCommand("test");

  expect(result.exitCode).toBe(0);
  expect(result.data).toEqual({ passed: 10, failed: 0 });
});
```

**Testing state access in commands:**

```typescript
test("command receives state from withState()", async () => {
  ctx.withState({
    packageManager: "pnpm",
    gitRepo: true,
    projectRoot: "/my-project",
  });

  const result = await ctx.runCommand("status");

  expect(result.stdout).toContain("pnpm");
  expect(result.stdout).toContain("/my-project");
});
```

## Cleanup

### dispose()

Clean up all mocks and restore the original environment. Call this in
`afterEach()`:

```typescript
afterEach(() => {
  ctx.dispose();
});
```

Safe to call multiple times. **Required to prevent test pollution.**

## Validation

The builder enforces required configuration before running tests:

```typescript
// Throws: "withOptions() must be called before running tests"
await plugin.test()
  .withState({ packageManager: "bun" })
  .runHook("PreToolUse", "security");

// Throws: "withState() must be called before running tests"
await plugin.test()
  .withOptions({ DEBUG: "false" })
  .runHook("PreToolUse", "security");
```

## Handler Resolution

### Inline Handlers

Inline handlers defined directly in the plugin config work seamlessly:

```typescript
const plugin = ClaudeBinaryPlugin.create({
  // ...
  hooks: {
    PreToolUse: [{
      name: "security",
      pipeline: async ({ input, options, state }) => {
        // This handler is called directly
        return { status: "executed", action: "allow", summary: "ok" };
      },
    }],
  },
});
```

### File Path Handlers

File-based handlers are dynamically imported:

```typescript
const plugin = ClaudeBinaryPlugin.create({
  // ...
  hooks: {
    PreToolUse: [{
      name: "security",
      pipeline: "./hooks/security.hook.ts",  // Resolved from cwd
    }],
  },
});
```

For file paths to resolve correctly, run tests from the plugin root
directory where the paths are relative to.

### Raw Handlers Not Supported

Raw handlers (using `handler` instead of `pipeline`) are not supported
in the fluent testing API. They require direct access to the event object
and should be tested separately using low-level utilities.

## Advanced: Low-Level Utilities

For SDK development or edge cases where the fluent API is insufficient,
the `TestFixtures` class provides lower-level utilities.

### Environment Isolation

```typescript
import { TestFixtures } from "claude-binary-plugin";

const env = TestFixtures.createEnv({
  CLAUDE_PROJECT_DIR: "/tmp/test",
  CLAUDE_SESSION_ID: "test-session",
});

// Test with isolated environment
expect(Bun.env.CLAUDE_PROJECT_DIR).toBe("/tmp/test");

// Modify during test
env.set("NEW_VAR", "value");
env.delete("CLAUDE_SESSION_ID");

// Restore original environment
env.restore();
```

### I/O Mocking

```typescript
import { TestFixtures } from "claude-binary-plugin";

const io = TestFixtures.createIO({
  session_id: "test",
  tool_name: "Bash",
  tool_input: { command: "ls" },
});

// Run hook logic that reads from stdin
// ...

// Check captured output
const stdout = io.getStdout();
const stderr = io.getStderr();

TestFixtures.resetIO();
```

### Shell Executor Mocking

```typescript
import { TestFixtures } from "claude-binary-plugin";

// String-based executor with pattern matching
const executor = TestFixtures.shellExecutor({
  "node --version": { exitCode: 0, stdout: "v22.0.0", stderr: "" },
  "bun --version": { exitCode: 0, stdout: "1.3.5", stderr: "" },
});

// Use with detection functions
const version = await detectNodeVersion(executor);
```

### Environment Presets

```typescript
import { TestFixtures } from "claude-binary-plugin";

// Minimal Claude Code hook environment
const env = TestFixtures.envPresets.claudeHook({
  CLAUDE_PROJECT_DIR: "/custom/path",
});

// Hook environment with env file
const env2 = TestFixtures.envPresets.withEnvFile("/path/to/env.sh", {
  CLAUDE_PROJECT_DIR: "/project",
});
```

### TestFixtures Class Reference

| Method | Description |
| ------ | ----------- |
| `TestFixtures.createEnv(vars, options)` | Create isolated mock environment |
| `TestFixtures.createIO(input)` | Mock stdin/stdout/stderr |
| `TestFixtures.resetIO()` | Reset I/O mocks |
| `TestFixtures.createCommand(args)` | Mock CLI command context |
| `TestFixtures.runCommand(args, mainFn)` | Run command with mocks |
| `TestFixtures.runHook(mainFn)` | Run hook with mocked exit |
| `TestFixtures.shellExecutor(responses)` | Create shell executor mock |
| `TestFixtures.inMemoryShellExecutor(handler)` | In-memory shell executor |
| `TestFixtures.envPresets` | Pre-configured environment setups |
| `TestFixtures.ExitError` | Error thrown by mocked process.exit |

## Best Practices

1. **Use the fluent API** - Prefer `plugin.test()` over low-level utilities
2. **Always dispose** - Call `ctx.dispose()` in `afterEach()` to prevent leaks
3. **Test both paths** - Test allow and deny cases for security hooks
4. **Use realistic inputs** - Mirror actual Claude Code event structures
5. **Mock external calls** - Use `withShell()` for subprocess isolation
6. **Use inline handlers for testability** - Easier to test than file paths
7. **Verify context passing** - Test that options and state reach handlers
8. **Test edge cases** - Invalid inputs, missing args, error conditions

## Complete Example

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    DEBUG: z.string().default("false"),
    ALLOW_DANGEROUS: z.string().default("false"),
  }),
  setup: async ({ cwd }) => ({
    projectRoot: cwd,
    hasGit: true,
  }),
  hooks: {
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: async ({ input, options, state }) => {
        const cmd = (input.tool_input as { command?: string }).command ?? "";

        if (cmd.includes("rm -rf") && options.ALLOW_DANGEROUS !== "true") {
          return {
            status: "executed",
            action: "deny",
            summary: "blocked dangerous command",
            reason: "rm -rf is not allowed",
          };
        }

        return {
          status: "executed",
          action: "allow",
          summary: "allowed command",
        };
      },
    }],
  },
  commands: {
    greet: {
      description: "Say hello",
      args: z.object({
        name: z.string().default("World"),
      }),
      pipeline: async ({ args, state }) => ({
        exitCode: 0,
        output: `# Hello\n\nHello, ${args.name}! Project: ${state.projectRoot}`,
      }),
    },
  },
});

describe("Security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", ALLOW_DANGEROUS: "false" })
      .withState({ projectRoot: "/test", hasGit: true });
  });

  afterEach(() => ctx.dispose());

  test("allows safe commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "git status" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });

  test("blocks rm -rf by default", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/test" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toBe("rm -rf is not allowed");
  });

  test("allows rm -rf when ALLOW_DANGEROUS is true", async () => {
    ctx.withOptions({ DEBUG: "false", ALLOW_DANGEROUS: "true" });

    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/test" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });
});

describe("Greet command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", ALLOW_DANGEROUS: "false" })
      .withState({ projectRoot: "/my-project", hasGit: true });
  });

  afterEach(() => ctx.dispose());

  test("greets with default name", async () => {
    const result = await ctx.runCommand("greet");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello, World!");
  });

  test("greets with custom name", async () => {
    const result = await ctx.runCommand("greet", { name: "Claude" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello, Claude!");
  });

  test("includes project root from state", async () => {
    const result = await ctx.runCommand("greet");

    expect(result.stdout).toContain("/my-project");
  });
});
```
