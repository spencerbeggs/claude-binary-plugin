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

#### withShell(pattern, result)

Mock shell command responses for testing detection or command execution:

```typescript
ctx.withShell("node --version", {
  exitCode: 0,
  stdout: "v22.0.0",
  stderr: "",
});

ctx.withShell("bun --version", {
  exitCode: 0,
  stdout: "1.3.5",
  stderr: "",
});
```

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

**How it works:**

1. Finds the command definition by name in plugin config
2. Resolves the handler (inline function or dynamic import)
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
