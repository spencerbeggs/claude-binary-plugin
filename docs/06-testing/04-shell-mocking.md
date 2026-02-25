# Shell Mocking

The shell mocking system lets you provide deterministic responses for shell commands without actually running them. This keeps tests fast, offline, and reproducible.

There are two layers to shell mocking:

1. **Mock configuration** -- Methods like `withShell()`, `withShellMatching()`, and `mockShellSequence()` define what results to return for which commands.
2. **Bun.$ interception** -- The `mockBunShell()` method replaces `Bun.$` with a mock that routes calls through your configured responses.

Both layers must be active for mocking to work. Configuring responses without calling `mockBunShell()` means `Bun.$` still runs real commands.

## Activating Interception

Call `mockBunShell()` to replace `Bun.$` with the mock implementation:

```typescript
ctx.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
   .mockBunShell();

// Now ALL Bun.$ calls are intercepted
const result = await Bun.$`git status`.text();
// result === "clean"
```

Without `mockBunShell()`, your mock configuration has no effect on `Bun.$`:

```typescript
// WRONG -- mocks configured but Bun.$ still runs real commands
ctx.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" });

// RIGHT -- mocks configured AND active
ctx.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
   .mockBunShell();
```

## Matching Strategies

### Substring Match: withShell(pattern, result)

The simplest matcher. Returns the result when the command string contains the pattern.

```typescript
ctx.withShell("git status", {
  exitCode: 0,
  stdout: "On branch main\nnothing to commit",
  stderr: "",
});

// Matches: "git status", "git status --short", "cd /foo && git status"
```

### Regex Match: withShellMatching(regex, result)

For patterns where substring matching is too broad or too narrow.

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
  stdout: "42 tests passed",
  stderr: "",
});

// Match any TypeScript compilation with --noEmit
ctx.withShellMatching(/tsc\s+--noEmit/, {
  exitCode: 0,
  stdout: "",
  stderr: "",
});
```

### Custom Function Match: withShellMatcher(name, fn, result)

For complex matching logic that cannot be expressed as a string or regex.

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

The `name` parameter is used internally for tracking. It must be unique among custom matchers.

## One-Time and Sequential Responses

### mockShellOnce(pattern, result)

Returns the result only for the first matching call. Subsequent calls fall through to other mocks or return the default "command not found" response.

```typescript
ctx.mockShellOnce("npm install", {
  exitCode: 0,
  stdout: "added 42 packages",
  stderr: "",
});

// First call: returns success
// Second call: falls through to other mocks
```

### mockShellSequence(pattern, results)

Returns results in order. After the sequence is exhausted, subsequent calls fall through.

```typescript
ctx.mockShellSequence("bun test", [
  { exitCode: 1, stdout: "", stderr: "1 failing" },   // First call
  { exitCode: 0, stdout: "all pass", stderr: "" },     // Second call
]);
```

This is useful for testing retry logic or commands that improve on successive runs.

## Error Behavior

By default, the mock throws an error when a command returns a non-zero exit code. This matches the real `Bun.$` behavior.

```typescript
ctx.withShell("false", { exitCode: 1, stdout: "", stderr: "error" })
   .mockBunShell();

await Bun.$`false`;  // throws Error("Command failed: false")
```

Use `.nothrow()` to suppress the error and inspect the result:

```typescript
const result = await Bun.$`false`.nothrow();
expect(result.exitCode).toBe(1);  // No throw
```

If no mock matches a command, the default response is exit code 127 with "command not found" in stderr.

## MockShellPromise API

The object returned by mocked `Bun.$` calls supports the same chaining methods as the real `Bun.$`.

| Method | Return Type | Description |
| ------ | ----------- | ----------- |
| `.quiet()` | `MockShellPromise` | No-op, returns self |
| `.nothrow()` | `MockShellPromise` | Suppress error on non-zero exit |
| `.env(vars)` | `MockShellPromise` | No-op, returns self |
| `.cwd(path)` | `MockShellPromise` | No-op, returns self |
| `.text()` | `Promise<string>` | Stdout as trimmed string |
| `.json()` | `Promise<unknown>` | Parse stdout as JSON |
| `.blob()` | `Promise<Blob>` | Stdout as Blob |
| `.lines()` | `Promise<string[]>` | Stdout split by newlines (empty lines filtered) |
| `await` | `MockShellResult` | Object with `exitCode`, `stdout` (Buffer), `stderr` (Buffer) |

## Template Interpolation

The mock correctly handles template literal interpolation:

```typescript
const branch = "main";
ctx.withShell("git checkout main", { exitCode: 0, stdout: "", stderr: "" })
   .mockBunShell();

// Template literal is reconstructed to "git checkout main"
await Bun.$`git checkout ${branch}`;  // matches
```

### Array Command Interpolation

When code uses array interpolation, the mock joins the array elements with spaces before matching:

```typescript
// Code under test:
// const cmd = ["bunx", "tsc", "--noEmit"];
// await Bun.$`${cmd}`;

// The mock sees the joined string: "bunx tsc --noEmit"
ctx.withShellMatching(/bunx\s+tsc/, {
  exitCode: 0,
  stdout: "",
  stderr: "",
}).mockBunShell();
```

This works because the mock detects array values in template expressions and joins them with spaces, matching how `Bun.$` handles array interpolation.

## Restoring Bun.$

### Automatic (recommended)

`dispose()` automatically restores the original `Bun.$`:

```typescript
afterEach(() => {
  ctx.dispose();  // restores Bun.$ along with everything else
});
```

### Manual

Use `restoreBunShell()` if you need to restore `Bun.$` before the test ends:

```typescript
ctx.restoreBunShell();
// Bun.$ now runs real commands again
```

## Complete Example

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("lint command with shell mocking", () => {
  let ctx: ReturnType<typeof plugin.test>;

  afterEach(() => {
    ctx?.dispose();
  });

  test("reports lint success", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({})
      .mockBunShell()
      .withShellMatching(/biome\s+check/, {
        exitCode: 0,
        stdout: "Checked 15 files in 0.12s. No errors found.",
        stderr: "",
      });

    const result = await ctx.runCommand("lint", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No errors found");
  });

  test("reports lint failures", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({})
      .mockBunShell()
      .withShellMatching(/biome\s+check/, {
        exitCode: 1,
        stdout: "Found 3 errors in 2 files",
        stderr: "",
      });

    const result = await ctx.runCommand("lint", {});

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("3 errors");
  });

  test("handles build retry", async () => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({})
      .mockBunShell()
      .mockShellSequence("bun build", [
        { exitCode: 1, stdout: "", stderr: "dependency error" },
        { exitCode: 0, stdout: "Build complete", stderr: "" },
      ]);

    // First call fails, second succeeds
    const fail = await Bun.$`bun build`.nothrow();
    expect(fail.exitCode).toBe(1);

    const pass = await Bun.$`bun build`.nothrow();
    expect(pass.exitCode).toBe(0);
  });
});
```
