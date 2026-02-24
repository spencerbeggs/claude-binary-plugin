# PluginTester Fluent API

The `PluginTester` class is the core of the testing system. You create an instance by calling `plugin.test()` on any `ClaudeBinaryPlugin` instance. All methods are fluent (they return `this` for chaining), and the class provides full type inference from your plugin's schema.

## Basic Pattern

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("my hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("does something", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "ls" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });
});
```

The chain follows a consistent order:

1. `plugin.test()` -- create the tester
2. `withOptions()` -- set plugin options
3. `withState()` -- set computed state
4. Input method (e.g., `withPreToolUseInput()`) -- set hook input
5. `runHook()` or `runCommand()` -- execute the handler

## Configuration Methods

### withOptions(opts)

Set the plugin options that would normally come from environment variables. The parameter type is inferred from your plugin's Zod schema, and accepts deeply partial objects.

```typescript
ctx.withOptions({
  DEBUG: "true",
  TIMEOUT_MS: "5000",
});
```

Only specify the fields your test needs. Unspecified fields will be `undefined` unless your schema provides defaults.

### withState(state)

Set the computed state that would normally come from the `setup()` function at SessionStart. This bypasses actual detection logic so tests stay fast and deterministic.

```typescript
ctx.withState({
  packageManager: "bun",
  gitRepo: true,
});
```

Do not include framework-provided fields like `projectDir`, `pluginDir`, or `pluginEnvFile` in state. These are set automatically by the test framework. Use `withProjectDir()` or `withTempProject()` to control paths.

### withPluginRoot(path)

Set the plugin root directory for resolving relative paths in hook and command definitions. This is required when testing commands defined with relative `pipeline` paths like `./commands/example.cmd.ts`.

```typescript
// Set to the directory containing your plugin config
ctx.withPluginRoot(import.meta.dir);

// Or resolve from a test subdirectory
import { resolve } from "node:path";
ctx.withPluginRoot(resolve(import.meta.dir, ".."));
```

Without this, relative paths resolve from `process.cwd()`, which may not be your plugin directory.

### withProjectDir(path)

Set the project directory (`CLAUDE_PROJECT_DIR`) for the test. Useful when testing commands that operate on specific project files.

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "test-"));
ctx.withProjectDir(tempDir);
```

### withTempProject()

Create an isolated temporary directory that acts as the project root. The directory is created automatically before the test runs and cleaned up when `dispose()` is called.

```typescript
ctx.withTempProject();
```

This method:

- Creates a unique temp directory (e.g., `/tmp/plugin-test-a1b2c3/`)
- Sets it as the project directory automatically
- Enables the `withFile()` method for adding test files
- Cleans up the directory on `dispose()`

### withFile(relativePath, content)

Add a file to the temp project directory. Requires `withTempProject()` to be called first. Parent directories are created automatically.

```typescript
ctx.withTempProject()
  .withFile("package.json", JSON.stringify({ name: "test", type: "module" }))
  .withFile("src/index.ts", "export const foo = 1;")
  .withFile("tsconfig.json", JSON.stringify({
    compilerOptions: { strict: true, noEmit: true }
  }));
```

Calling `withFile()` without `withTempProject()` throws an error.

### getTempProjectDir()

Get the temp project directory path after tests have run. Returns `undefined` if `withTempProject()` was not called or the test has not executed yet.

```typescript
const result = await ctx
  .withTempProject()
  .withFile("test.txt", "hello")
  .runCommand("process", {});

const tempDir = ctx.getTempProjectDir();
```

## Execution Methods

### runHook(hookType, hookName)

Execute a hook handler with the configured context. The hook is looked up by type and name from the plugin configuration.

```typescript
const result = await ctx
  .withPreToolUseInput({
    tool_name: "Bash",
    tool_input: { command: "git status" },
  })
  .runHook("PreToolUse", "security");
```

#### HookTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 for success, 1 for error |
| `stdout` | `string` | Raw stdout output |
| `stderr` | `string` | Raw stderr output |
| `output` | `Record<string, unknown>` | Parsed pipeline output object |
| `action` | `HookAction` or `undefined` | Convenience accessor: `"allow"`, `"deny"`, `"block"`, `"context"`, etc. |
| `context` | `string` or `undefined` | Convenience accessor for `claudeContext` field |
| `reason` | `string` or `undefined` | Convenience accessor for `reason` field |

### runCommand(name, args?)

Execute a command handler with optional arguments. Arguments are validated against the command's Zod schema, and schema defaults are applied for omitted fields.

```typescript
const result = await ctx.runCommand("example", {
  _positionals: ["src/"],
});
```

#### CommandTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = issues found, 2 = fatal error |
| `stdout` | `string` | Markdown output from the command handler |
| `stderr` | `string` | Error output |
| `logs` | `string[]` | Captured `console.log` calls |
| `errors` | `string[]` | Captured `console.error` calls |
| `data` | `Record<string, unknown>` or `undefined` | Structured data if the handler returned it |

## Cleanup

### dispose()

Clean up all mocks and restore the original environment. This method must be called in `afterEach()` to prevent test pollution.

```typescript
afterEach(() => {
  ctx.dispose();
});
```

`dispose()` performs the following:

- Restores all modified environment variables
- Restores `Bun.$` if it was mocked
- Removes the temp project directory if one was created
- Resets I/O mocks (stdin, stdout, stderr)
- Clears all mock function state

It is safe to call `dispose()` multiple times.

## Validation

The builder enforces that required configuration is set before execution.

```typescript
// Throws: "withOptions() must be called before running tests"
await plugin.test()
  .withState({})
  .runHook("PreToolUse", "security");

// Throws: "withState() must be called before running tests"
await plugin.test()
  .withOptions({ DEBUG: "false" })
  .runHook("PreToolUse", "security");

// Throws: "withTempProject() must be called before withFile()"
plugin.test()
  .withFile("test.txt", "content");
```
