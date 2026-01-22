---
status: current
module: claude-binary-plugin
category: testing
created: 2026-01-22
updated: 2026-01-22
last-synced: 2026-01-22
completeness: 100
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

## Quick Reference

### Configuration Methods

| Method | Description |
| ------ | ----------- |
| `withOptions(opts)` | Set plugin options (typed from schema) |
| `withState(state)` | Set computed state (from setup function) |
| `withPluginRoot(path)` | Set plugin directory for handler resolution |
| `withProjectDir(path)` | Set project directory (CLAUDE_PROJECT_DIR) |
| `withTempProject()` | Create isolated temp directory |
| `withFile(path, content)` | Add file to temp project |
| `getTempProjectDir()` | Get temp directory path after test runs |

### Hook Input Methods

| Method | Hook Type |
| ------ | --------- |
| `withPreToolUseInput(input)` | PreToolUse |
| `withPostToolUseInput(input)` | PostToolUse |
| `withSessionStartInput(input)` | SessionStart |
| `withSessionEndInput(input)` | SessionEnd |
| `withStopInput(input)` | Stop |
| `withSubagentStopInput(input)` | SubagentStop |
| `withUserPromptSubmitInput(input)` | UserPromptSubmit |
| `withPreCompactInput(input)` | PreCompact |
| `withNotificationInput(input)` | Notification |
| `withPermissionRequestInput(input)` | PermissionRequest |

### Shell Mocking Methods

| Method | Description |
| ------ | ----------- |
| `withShell(pattern, result)` | Static response (substring match) |
| `withShellMatching(regex, result)` | Static response (regex match) |
| `withShellMatcher(name, fn, result)` | Static response (custom function) |
| `mockShellOnce(pattern, result)` | One-time response |
| `mockShellSequence(pattern, results)` | Sequential responses |
| `mockBunShell()` | Intercept all Bun.$ calls |
| `restoreBunShell()` | Restore original Bun.$ |

### Mock Function Methods

| Method | Description |
| ------ | ----------- |
| `mockFn<TArgs, TReturn>(name)` | Create tracked mock function |
| `clearMockCalls()` | Clear call history, keep config |
| `resetMocks()` | Reset all mocks to initial state |

### Execution Methods

| Method | Description |
| ------ | ----------- |
| `runHook(hookType, hookName)` | Execute a hook handler |
| `runCommand(name, args?)` | Execute a command handler |
| `dispose()` | Clean up all mocks (required) |

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
      .withState({ packageManager: "bun", gitRepo: true });
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

### Configuration Method Details

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
  // ... any fields your setup() returns
});
```

**Important:** Do not include framework-provided fields like `projectDir`,
`pluginDir`, or `pluginEnvFile` in state. These are set automatically.
Use `withProjectDir()` or `withTempProject()` instead.

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

#### withTempProject()

Create an isolated temp directory for file system tests. The directory
is automatically cleaned up when `dispose()` is called:

```typescript
ctx.withTempProject();
```

This method:

- Creates a unique temp directory (e.g., `/tmp/plugin-test-a1b2c3/`)
- Sets it as the project directory automatically
- Enables use of `withFile()` to add test files
- Cleans up the directory on `dispose()`

#### withFile(relativePath, content)

Add a file to the temp project directory. Requires `withTempProject()`:

```typescript
ctx.withTempProject()
  .withFile("package.json", JSON.stringify({ name: "test", type: "module" }))
  .withFile("src/index.ts", "export const foo = 1;")
  .withFile("tsconfig.json", JSON.stringify({
    compilerOptions: { strict: true, noEmit: true }
  }));
```

Features:

- Parent directories are created automatically
- Accepts string or `Uint8Array` content
- Files are created just before test execution

#### getTempProjectDir()

Get the temp project directory path after tests have run:

```typescript
const result = await ctx
  .withTempProject()
  .withFile("test.txt", "hello")
  .runCommand("process", {});

const tempDir = ctx.getTempProjectDir();
// Use tempDir for assertions if needed
```

Returns `undefined` if `withTempProject()` wasn't called or tests haven't
run yet.

## Testing Commands with File System

For commands that interact with the file system, use the virtual test
directory pattern. This creates isolated temp directories with test files:

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import plugin from "../plugin.js";

describe("Typecheck command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  afterEach(() => ctx?.dispose());

  test("reports no errors for valid TypeScript", async () => {
    ctx = plugin.test()
      .withTempProject()
      .withFile("package.json", JSON.stringify({
        name: "test-project",
        type: "module",
      }))
      .withFile("tsconfig.json", JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: "ESNext",
          moduleResolution: "bundler",
        },
        include: ["src/**/*"],
      }))
      .withFile("src/index.ts", `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `)
      .withOptions({ DEBUG: "false" })
      .withState({ typescriptEnabled: true })
      .mockBunShell()
      .withShellMatching(/bunx\s+tsc/, {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No errors");
  });

  test("reports errors for invalid TypeScript", async () => {
    ctx = plugin.test()
      .withTempProject()
      .withFile("package.json", JSON.stringify({ name: "test" }))
      .withFile("tsconfig.json", JSON.stringify({
        compilerOptions: { strict: true, noEmit: true },
      }))
      .withFile("src/index.ts", `
        // Type error: string is not assignable to number
        const x: number = "hello";
      `)
      .withOptions({ DEBUG: "false" })
      .withState({ typescriptEnabled: true })
      .mockBunShell()
      .withShellMatching(/bunx\s+tsc/, {
        exitCode: 1,
        stdout: "",
        stderr: "src/index.ts(2,15): error TS2322",
      });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("error TS2322");
  });
});
```

### Why Use Temp Projects?

1. **Isolation** - Each test gets its own directory, safe for parallel runs
2. **No cleanup code** - `dispose()` handles directory removal
3. **Realistic paths** - Commands see real file paths, not mocks
4. **Easy setup** - Declarative file creation in fluent chain

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

### Shell Mocking

Shell mocking provides deterministic responses for shell command execution
without actually running commands.

#### Basic Shell Mocking

```typescript
// Static response - always returns this result
ctx.withShell("git status", {
  exitCode: 0,
  stdout: "On branch main\nnothing to commit",
  stderr: "",
});

// One-time response - first call only
ctx.mockShellOnce("npm install", {
  exitCode: 0,
  stdout: "added 42 packages",
  stderr: "",
});

// Sequential responses - returned in order
ctx.mockShellSequence("bun test", [
  { exitCode: 1, stdout: "", stderr: "1 failing" },  // First call
  { exitCode: 0, stdout: "all pass", stderr: "" },   // Second call
]);
```

#### Pattern Matching

For commands with dynamic arguments, use regex or custom matchers:

**Regex matching:**

```typescript
// Match "bunx tsc" with any arguments
ctx.withShellMatching(/bunx\s+tsc/, {
  exitCode: 0,
  stdout: "",
  stderr: "",
});

// Match "npm test" or "bun test"
ctx.withShellMatching(/(?:npm|bun)\s+test/, {
  exitCode: 0,
  stdout: "pass",
  stderr: "",
});

// Match any TypeScript compilation
ctx.withShellMatching(/tsc\s+--noEmit/, {
  exitCode: 0,
  stdout: "",
  stderr: "",
});
```

**Custom matcher:**

```typescript
// Match commands starting with npm or yarn
ctx.withShellMatcher(
  "package-manager",
  (cmd) => cmd.startsWith("npm ") || cmd.startsWith("yarn "),
  { exitCode: 0, stdout: "done", stderr: "" }
);

// Match tsc with any project flag
ctx.withShellMatcher(
  "tsc-project",
  (cmd) => cmd.includes("tsc") && cmd.includes("-p"),
  { exitCode: 0, stdout: "", stderr: "" }
);
```

#### Array Command Interpolation

When code uses array interpolation like `Bun.$`${cmd}`` where
`cmd = ["bunx", "tsc", "--noEmit"]`, the mock automatically joins
the array with spaces:

```typescript
// This matches both:
// - Bun.$`bunx tsc --noEmit`  (string template)
// - Bun.$`${["bunx", "tsc", "--noEmit"]}`  (array interpolation)
ctx.withShellMatching(/bunx\s+tsc/, {
  exitCode: 0,
  stdout: "",
  stderr: "",
});
```

---

### Bun.$ Interception

The most powerful mocking feature: automatic interception of `Bun.$`
template literal calls.

#### Activating Interception

```typescript
ctx.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
   .mockBunShell();  // REQUIRED - activates interception

// Now ALL Bun.$ calls are intercepted
const result = await Bun.$`git status`.text();
expect(result).toBe("clean");
```

**Important:** You must call `mockBunShell()` to activate interception.
Without it, shell mocks are configured but `Bun.$` calls execute normally.

#### How It Works

```text
1. Save original Bun.$ reference
2. Replace Bun.$ with mock tagged template function
3. Mock function:
   a. Reconstructs command string from template parts
   b. Handles array interpolation (joins with spaces)
   c. Looks up result via configured mocks
   d. Returns MockShellPromise (mimics real Bun.$ return)
```

#### Template Interpolation

The mock correctly handles template interpolation:

```typescript
const branch = "main";
ctx.withShell("git checkout main", { exitCode: 0, stdout: "", stderr: "" })
   .mockBunShell();

// Template literal is reconstructed to "git checkout main"
await Bun.$`git checkout ${branch}`;  // matches!
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

#### MockShellPromise API

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

### Mock Functions

Jest-like mock utilities for tracking function calls:

```typescript
// Create a mock
const fetchMock = ctx.mockFn<[string], Response>("fetch");

// Configure returns
fetchMock.mockReturnValue({ ok: true });
fetchMock.mockReturnValueOnce({ ok: false });  // First call only

// Or use implementation
fetchMock.mockImplementation((url) => {
  return { ok: url.includes("valid") };
});

// Inspect calls
fetchMock.calls;      // [["https://api.example.com"]]
fetchMock.callCount;  // 1
fetchMock.called;     // true
fetchMock.lastCall;   // ["https://api.example.com"]

// Reset
fetchMock.mockClear();  // Clear history, keep config
fetchMock.mockReset();  // Reset everything
```

---

### Setting Hook Inputs

Each hook type has a corresponding input method:

#### PreToolUse

```typescript
ctx.withPreToolUseInput({
  tool_name: "Bash",
  tool_input: { command: "ls -la" },
  tool_use_id: "tool_123",  // optional, auto-generated
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

#### Stop / SubagentStop

```typescript
ctx.withStopInput({ stop_hook_active: true });
ctx.withSubagentStopInput({ stop_hook_active: true });
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

#### Notification / PermissionRequest

```typescript
ctx.withNotificationInput({
  message: "Build completed",
  notification_type: "info",
});

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
| `permission_mode` | `string` | Permission mode for session |

## Running Hooks

### runHook(hookType, hookName)

Execute a hook handler with the configured context:

```typescript
const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");
```

### HookTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = error |
| `stdout` | `string` | JSON-stringified pipeline output |
| `stderr` | `string` | Error output |
| `output` | `Record<string, unknown>` | Parsed pipeline output |
| `action` | `HookAction` | "allow" \| "deny" \| "block" \| "context" |
| `context` | `string` | `claudeContext` field value |
| `reason` | `string` | `reason` field value |

### Hook Testing Patterns

**PreToolUse allow/deny:**

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

**SessionStart context injection:**

```typescript
test("adds project context", async () => {
  const result = await ctx
    .withSessionStartInput({ source: "startup" })
    .runHook("SessionStart", "context");

  expect(result.action).toBe("context");
  expect(result.context).toContain("Project uses bun");
});
```

**PostToolUse:**

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

**Stop hooks:**

```typescript
test("blocks premature stops", async () => {
  const result = await ctx
    .withStopInput({ stop_hook_active: true })
    .runHook("Stop", "guard");

  expect(result.action).toBe("block");
  expect(result.reason).toBeDefined();
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

### CommandTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = issues, 2 = fatal |
| `stdout` | `string` | Markdown output from command |
| `stderr` | `string` | Error output |
| `logs` | `string[]` | Captured `console.log` calls |
| `errors` | `string[]` | Captured `console.error` calls |
| `data` | `Record<string, unknown>` | Structured data from handler |

### Command Testing Patterns

**Basic command execution:**

```typescript
test("lint command runs successfully", async () => {
  const result = await ctx.runCommand("lint", { path: "src/", fix: true });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("# Lint Results");
});
```

**Testing with file system:**

```typescript
test("processes files in project", async () => {
  const result = await plugin.test()
    .withTempProject()
    .withFile("src/index.ts", "export const x = 1;")
    .withFile("src/utils.ts", "export const y = 2;")
    .withOptions({ DEBUG: "false" })
    .withState({ enabled: true })
    .mockBunShell()
    .withShellMatching(/biome/, {
      exitCode: 0,
      stdout: "Checked 2 files",
      stderr: "",
    })
    .runCommand("lint", {});

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Checked 2 files");
});
```

**Testing exit codes:**

```typescript
test("returns exit code 1 when issues found", async () => {
  ctx.mockBunShell()
     .withShell("biome check", {
       exitCode: 1,
       stdout: "Found 3 errors",
       stderr: "",
     });

  const result = await ctx.runCommand("lint", {});

  expect(result.exitCode).toBe(1);
});
```

## Cleanup

### dispose()

Clean up all mocks and restore the original environment:

```typescript
afterEach(() => {
  ctx.dispose();
});
```

This method:

- Restores all environment variables
- Restores `Bun.$` if mocked
- Removes temp project directory
- Resets I/O mocks
- Clears all mock state

**Required to prevent test pollution.** Safe to call multiple times.

## Validation

The builder enforces required configuration:

```typescript
// Throws: "withOptions() must be called before running tests"
await plugin.test()
  .withState({ packageManager: "bun" })
  .runHook("PreToolUse", "security");

// Throws: "withState() must be called before running tests"
await plugin.test()
  .withOptions({ DEBUG: "false" })
  .runHook("PreToolUse", "security");

// Throws: "withTempProject() must be called before withFile()"
plugin.test()
  .withFile("test.txt", "content");
```

## Complete Example

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

// Define a plugin with hooks and commands
const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    DEBUG: z.string().default("false"),
    STRICT_MODE: z.string().default("true"),
  }),
  setup: async ({ cwd }) => ({
    hasTypeScript: true,
    hasTests: true,
  }),
  hooks: {
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: async ({ input, options }) => {
        const cmd = (input.tool_input as { command?: string }).command ?? "";

        if (cmd.includes("rm -rf") && options.STRICT_MODE === "true") {
          return {
            status: "executed",
            action: "deny",
            summary: "blocked dangerous command",
            reason: "rm -rf is not allowed in strict mode",
          };
        }

        return { status: "executed", action: "allow", summary: "ok" };
      },
    }],
    SessionStart: [{
      name: "context",
      pipeline: async ({ state }) => {
        const lines = ["# Project Context"];
        if (state.hasTypeScript) lines.push("- TypeScript enabled");
        if (state.hasTests) lines.push("- Test suite available");

        return {
          status: "executed",
          action: "context",
          summary: "added context",
          claudeContext: lines.join("\n"),
        };
      },
    }],
  },
  commands: {
    typecheck: {
      description: "Run TypeScript type checking",
      args: z.object({
        strict: z.boolean().default(true),
      }),
      pipeline: async ({ args, state }) => {
        if (!state.hasTypeScript) {
          return { exitCode: 2, output: "TypeScript not configured" };
        }

        const mode = args.strict ? "strict" : "normal";
        return {
          exitCode: 0,
          output: `# Typecheck Results\n\nMode: ${mode}\nStatus: OK`,
        };
      },
    },
  },
});

// Test the hooks
describe("Security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: true, hasTests: true });
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

  test("blocks rm -rf in strict mode", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/test" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("strict mode");
  });

  test("allows rm -rf when strict mode disabled", async () => {
    ctx.withOptions({ DEBUG: "false", STRICT_MODE: "false" });

    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/test" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });
});

describe("Context hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: true, hasTests: false });
  });

  afterEach(() => ctx.dispose());

  test("includes TypeScript in context", async () => {
    const result = await ctx
      .withSessionStartInput({ source: "startup" })
      .runHook("SessionStart", "context");

    expect(result.action).toBe("context");
    expect(result.context).toContain("TypeScript enabled");
    expect(result.context).not.toContain("Test suite");
  });
});

// Test the commands
describe("Typecheck command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  afterEach(() => ctx?.dispose());

  test("runs in strict mode by default", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: true, hasTests: true });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Mode: strict");
    expect(result.stdout).toContain("No errors found");
  });

  test("runs in normal mode when specified", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: true, hasTests: true });

    const result = await ctx.runCommand("typecheck", { strict: false });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Mode: normal");
  });

  test("fails when TypeScript not configured", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: false, hasTests: true });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("not configured");
  });
});

// Test with file system
describe("Typecheck with real files", () => {
  let ctx: ReturnType<typeof plugin.test>;

  afterEach(() => ctx?.dispose());

  test("checks files in temp project", async () => {
    ctx = plugin.test()
      .withTempProject()
      .withFile("package.json", JSON.stringify({ name: "test", type: "module" }))
      .withFile("tsconfig.json", JSON.stringify({
        compilerOptions: { strict: true, noEmit: true },
      }))
      .withFile("src/index.ts", "export const add = (a: number) => a + 1;")
      .withOptions({ DEBUG: "false", STRICT_MODE: "true" })
      .withState({ hasTypeScript: true, hasTests: true })
      .mockBunShell()
      .withShellMatching(/bunx\s+tsc/, {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(0);

    // Verify temp directory was created
    const tempDir = ctx.getTempProjectDir();
    expect(tempDir).toBeDefined();
    expect(tempDir).toContain("plugin-test-");
  });
});
```

## Troubleshooting

### Shell mocks not intercepting

Ensure you call `mockBunShell()`:

```typescript
// Wrong - mocks configured but not active
ctx.withShell("git status", result);

// Right - mocks configured AND active
ctx.withShell("git status", result)
   .mockBunShell();
```

### Command handler not found

Ensure `withPluginRoot()` points to your plugin directory:

```typescript
ctx.withPluginRoot(import.meta.dir)  // Directory containing test file
   .withPluginRoot(resolve(import.meta.dir, ".."))  // Or parent directory
```

### projectDir type error in withState()

Don't include framework fields in `withState()`. Use dedicated methods:

```typescript
// Wrong
ctx.withState({ projectDir: "/test", myField: true });

// Right
ctx.withTempProject()  // or withProjectDir("/test")
   .withState({ myField: true });
```

### Tests polluting each other

Always call `dispose()` in `afterEach`:

```typescript
afterEach(() => ctx.dispose());
```

### Regex not matching commands

Remember that array commands are joined with spaces:

```typescript
// Command: Bun.$`${["bunx", "tsc", "--noEmit", "-p", path]}`
// Becomes: "bunx tsc --noEmit -p /some/path"

// Use regex that handles dynamic parts
ctx.withShellMatching(/bunx\s+tsc.*--noEmit/, result);
```

## Best Practices

1. **Use the fluent API** - Prefer `plugin.test()` over low-level utilities
2. **Always dispose** - Call `ctx.dispose()` in `afterEach()`
3. **Test both paths** - Test allow and deny cases for security hooks
4. **Use temp projects** - For file system tests, use `withTempProject()`
5. **Mock shell calls** - Use `mockBunShell()` with appropriate patterns
6. **Use inline handlers** - Easier to test than file-based handlers
7. **Verify context** - Test that options and state reach handlers
8. **Test edge cases** - Invalid inputs, missing args, error conditions
