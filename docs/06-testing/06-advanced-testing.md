# Advanced Testing

This guide covers file system testing patterns, low-level test utilities, inline vs. file-based handler testing, and a troubleshooting checklist for common issues.

## File System Tests with Temp Projects

For commands and hooks that interact with the file system, create a realistic project structure using `withTempProject()` and `withFile()`.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("typecheck command with real files", () => {
  let ctx: ReturnType<typeof plugin.test>;

  afterEach(() => ctx?.dispose());

  test("checks files in temp project", async () => {
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
      .withFile("src/index.ts", [
        "export function add(a: number, b: number): number {",
        "  return a + b;",
        "}",
      ].join("\n"))
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ typescriptEnabled: true })
      .mockBunShell()
      .withShellMatching(/bunx\s+tsc/, {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(0);

    // Verify the temp directory was created
    const tempDir = ctx.getTempProjectDir();
    expect(tempDir).toBeDefined();
    expect(tempDir).toContain("plugin-test-");
  });

  test("detects type errors", async () => {
    ctx = plugin.test()
      .withTempProject()
      .withFile("package.json", JSON.stringify({ name: "test" }))
      .withFile("tsconfig.json", JSON.stringify({
        compilerOptions: { strict: true, noEmit: true },
      }))
      .withFile("src/index.ts", "const x: number = 'hello';")
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ typescriptEnabled: true })
      .mockBunShell()
      .withShellMatching(/bunx\s+tsc/, {
        exitCode: 1,
        stdout: "",
        stderr: "src/index.ts(1,7): error TS2322",
      });

    const result = await ctx.runCommand("typecheck", {});

    expect(result.exitCode).toBe(1);
  });
});
```

### Why Use Temp Projects

- **Isolation** -- Each test gets its own directory. Tests can run in parallel safely.
- **No cleanup code** -- `dispose()` removes the temp directory automatically.
- **Realistic paths** -- Handlers see real file paths, not mocks.
- **Declarative setup** -- File creation is part of the fluent chain.

## Low-Level Test Utilities

The `PluginTester` fluent API covers most testing needs. For edge cases or SDK development, the `TestFixtures` and `MockState` classes provide lower-level utilities.

```typescript
import { TestFixtures, MockState } from "claude-binary-plugin";
```

### TestFixtures

`TestFixtures` is a static utility class with methods for mocking I/O, environment, commands, hooks, and shell execution.

**I/O mocking:**

```typescript
// Mock stdin with hook input, capture stdout/stderr
const io = TestFixtures.createIO({
  tool_name: "Bash",
  tool_input: { command: "ls" },
});

// After running the hook...
const stdout = io.getStdout();
const stderr = io.getStderr();

// Clean up
TestFixtures.resetIO();
```

**Environment mocking:**

```typescript
// Create isolated environment (clears ALL env vars)
const env = TestFixtures.createEnv({
  CLAUDE_PROJECT_DIR: "/test",
  MY_PLUGIN_DEBUG: "true",
});

// Use in test...

env.restore();  // restores all original env vars
```

**Shell executor:**

```typescript
// Create a mock shell executor with predefined responses
const shell = TestFixtures.shellExecutor({
  "git status": TestFixtures.shellResult(0, "On branch main"),
  "npm test": TestFixtures.shellResult(1, "", "1 failing"),
});

const result = await shell("git status");
// { exitCode: 0, stdout: "On branch main", stderr: "" }
```

**Environment presets:**

```typescript
// Quick setup for common Claude Code environments
const env = TestFixtures.createEnv(
  TestFixtures.envPresets.claudeHook({ MY_PLUGIN_DEBUG: "true" })
);
```

### MockState

`MockState` is a minimal `PluginEnv` subclass with the prefix `"MOCK"`. Use it when you need a state class instance but do not need real validation.

```typescript
const stateClass = TestFixtures.MockStateClass;
const instance = new stateClass();
```

## Testing Inline vs. File-Based Handlers

### Inline Handlers

Inline handlers (defined directly in `plugin.config.ts`) are the easiest to test because there is no file resolution involved.

```typescript
const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({ DEBUG: z.string().default("false") }),
  hooks: {
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: async ({ input }) => {
        const cmd = (input.tool_input as { command?: string }).command ?? "";
        if (cmd.includes("rm -rf")) {
          return {
            status: "executed",
            action: "deny",
            summary: "blocked dangerous command",
            reason: "rm -rf is not allowed",
          };
        }
        return { status: "executed", action: "allow", summary: "ok" };
      },
    }],
  },
});
```

Test these the same way as file-based handlers -- `runHook()` resolves inline functions directly.

### File-Based Handlers

File-based handlers point to a separate module:

```typescript
hooks: {
  PreToolUse: [{
    name: "security",
    tools: ["Bash"],
    pipeline: "./hooks/security.hook.ts",
  }],
}
```

When testing these, set `withPluginRoot()` so the tester can resolve the relative path:

```typescript
ctx.withPluginRoot(resolve(import.meta.dir, ".."));
```

## Troubleshooting

### Shell mocks not intercepting

**Symptom:** Tests run real commands instead of returning mock responses.

**Cause:** `mockBunShell()` was not called.

**Fix:**

```typescript
// Add mockBunShell() after configuring shell mocks
ctx.withShell("git status", result)
   .mockBunShell();  // <-- required
```

### Command handler not found

**Symptom:** `runCommand()` throws "Could not resolve handler".

**Cause:** The tester cannot resolve relative pipeline paths.

**Fix:**

```typescript
ctx.withPluginRoot(import.meta.dir);
// Or if tests are in a subdirectory:
ctx.withPluginRoot(resolve(import.meta.dir, ".."));
```

### projectDir type error in withState

**Symptom:** TypeScript error when passing `projectDir` to `withState()`.

**Cause:** Framework fields (`projectDir`, `pluginDir`, `pluginEnvFile`) are part of the base state, not the user state.

**Fix:**

```typescript
// Wrong
ctx.withState({ projectDir: "/test", myField: true });

// Right
ctx.withProjectDir("/test")
   .withState({ myField: true });
```

Or use `withTempProject()`:

```typescript
ctx.withTempProject()
   .withState({ myField: true });
```

### Tests polluting each other

**Symptom:** Tests pass individually but fail when run together.

**Cause:** `dispose()` is not being called, leaving mocked environment variables and `Bun.$` in place.

**Fix:**

```typescript
afterEach(() => {
  ctx.dispose();
});
```

### Regex not matching commands

**Symptom:** Shell mock with regex pattern does not intercept the expected command.

**Cause:** Array commands are joined with spaces before matching. The actual command string may differ from what you expect.

**Example:**

```typescript
// Code under test:
// const cmd = ["bunx", "tsc", "--noEmit", "-p", path];
// await Bun.$`${cmd}`;

// The mock sees: "bunx tsc --noEmit -p /some/path"

// Use a regex that handles dynamic path segments
ctx.withShellMatching(/bunx\s+tsc.*--noEmit/, result);
```

### withOptions or withState not called

**Symptom:** Error "withOptions() must be called before running tests".

**Cause:** Both `withOptions()` and `withState()` are required before calling `runHook()` or `runCommand()`.

**Fix:**

```typescript
ctx = plugin.test()
  .withOptions({ DEBUG: "false" })  // required
  .withState({})                    // required, even if empty
```

## Best Practices

1. **Use the fluent API** -- Prefer `plugin.test()` over low-level `TestFixtures` methods.
2. **Always dispose** -- Call `ctx.dispose()` in `afterEach()`.
3. **Test both paths** -- For PreToolUse hooks, test both allow and deny cases.
4. **Use temp projects** -- For file system tests, use `withTempProject()` instead of manual temp directories.
5. **Mock shell calls** -- Always use `mockBunShell()` when your handler runs shell commands.
6. **Prefer inline handlers for unit tests** -- Inline handlers avoid file resolution complexity.
7. **Verify context reaches handlers** -- Vary `options` and `state` across tests to confirm conditional logic.
8. **Test edge cases** -- Invalid inputs, missing arguments, error conditions, and empty state.
