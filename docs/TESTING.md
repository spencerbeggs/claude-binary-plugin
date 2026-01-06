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
  .withOptions({ DEBUG: false })
  .withState({ packageManager: "bun" });

const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");

expect(result.action).toBe("allow");
ctx.dispose();
```

All testing utilities are exported from the main entry point:

```typescript
import { PluginTestBuilder, Mocks } from "claude-binary-plugin";
```

## Fluent Testing API

### Basic Usage

The recommended pattern uses `beforeEach`/`afterEach` for setup and cleanup:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.js";

describe("Security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: false, ALLOW_SUDO: false })
      .withState({ packageManager: "bun", gitRepo: true });
  });

  afterEach(() => {
    ctx.dispose();
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

Set the plugin options matching your schema definition:

```typescript
ctx.withOptions({
  DEBUG: true,
  API_KEY: "test-key",
  MAX_RETRIES: 3,
});
```

The options parameter is fully typed based on your plugin's Zod schema.

#### withState(state)

Set the computed state that would normally come from the `setup()` function:

```typescript
ctx.withState({
  packageManager: "bun",
  gitRepo: true,
  projectRoot: "/test/project",
});
```

This allows testing hooks without running the actual setup detection logic.

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

### Execution Methods

#### runHook(hookType, hookName)

Execute a hook handler with the configured context:

```typescript
const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");
```

Returns a `HookTestResult` with:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | Exit code (0 = success) |
| `stdout` | `string` | Raw stdout output |
| `stderr` | `string` | Raw stderr output |
| `output` | `Record<string, unknown>` | Parsed JSON response |
| `action` | `HookAction` | Convenience: "allow" \| "deny" \| "block" \| etc. |
| `context` | `string` | Convenience: `additionalContext` field |
| `reason` | `string` | Convenience: `reason` field |

#### runCommand(commandName, args)

Execute a command handler:

```typescript
const result = await ctx.runCommand("lint", {
  _positionals: ["src/"],
  fix: true,
});
```

Returns a `CommandTestResult` with:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | Exit code (0 = success, 1 = issues, 2 = fatal) |
| `stdout` | `string` | Raw stdout output |
| `stderr` | `string` | Raw stderr output |
| `logs` | `string[]` | Captured console.log calls |
| `errors` | `string[]` | Captured console.error calls |

### Cleanup

#### dispose()

Clean up all mocks and restore the original environment. Call this in
`afterEach()`:

```typescript
afterEach(() => {
  ctx.dispose();
});
```

Safe to call multiple times. Required to prevent test pollution.

## Validation

The builder enforces required configuration before running tests:

```typescript
// Throws: "withOptions() must be called before running tests"
await plugin.test()
  .withState({ packageManager: "bun" })
  .runHook("PreToolUse", "security");

// Throws: "withState() must be called before running tests"
await plugin.test()
  .withOptions({ DEBUG: false })
  .runHook("PreToolUse", "security");
```

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
| `TestFixtures.inMemoryShellExecutor(handler)` | Create in-memory shell executor |
| `TestFixtures.envPresets` | Pre-configured environment setups |
| `TestFixtures.ExitError` | Error thrown by mocked process.exit |

## Best Practices

1. **Use the fluent API** - Prefer `plugin.test()` over low-level utilities
2. **Always dispose** - Call `ctx.dispose()` in `afterEach()` to prevent leaks
3. **Test both paths** - Test allow and deny cases for security hooks
4. **Use realistic inputs** - Mirror actual Claude Code event structures
5. **Mock external calls** - Use `withShell()` for subprocess isolation
