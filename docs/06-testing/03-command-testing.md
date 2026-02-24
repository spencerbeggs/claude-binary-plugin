# Command Testing

Commands are tested using the same `plugin.test()` fluent API as hooks. The `runCommand()` method validates arguments against the command's Zod schema, calls the handler, and returns a `CommandTestResult`.

## Basic Pattern

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("example command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("runs successfully with no arguments", async () => {
    const result = await ctx.runCommand("example", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Example Command");
    expect(result.stdout).toContain("(none)");
  });

  test("passes positional arguments", async () => {
    const result = await ctx.runCommand("example", {
      _positionals: ["src/", "lib/"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/, lib/");
  });
});
```

## runCommand(name, args?)

The `runCommand` method accepts the command name and an optional arguments object. Arguments are validated against the command's Zod schema, and schema defaults are applied for any omitted fields.

```typescript
const result = await ctx.runCommand("example", {
  _positionals: ["file.ts"],
});
```

If the command's schema defines defaults, you can omit those fields entirely:

```typescript
// If the schema has: _positionals: z.array(z.string()).optional().default([])
const result = await ctx.runCommand("example", {});
// args._positionals will be []
```

## CommandTestResult

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = issues found, 2 = fatal error |
| `stdout` | `string` | Markdown output from the command handler |
| `stderr` | `string` | Error output |
| `logs` | `string[]` | Captured `console.log` calls from the handler |
| `errors` | `string[]` | Captured `console.error` calls from the handler |
| `data` | `Record<string, unknown>` | Structured data if the handler returned it (optional) |

## Resolving Relative Paths with withPluginRoot

When commands are defined with relative pipeline paths like `./commands/example.cmd.ts`, the tester needs to know where your plugin root is to resolve those paths. Use `withPluginRoot()` to set it.

```typescript
beforeEach(() => {
  ctx = plugin.test()
    .withPluginRoot(import.meta.dir)  // directory containing the test file
    .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
    .withState({});
});
```

If your test files are in a `tests/` subdirectory:

```typescript
import { resolve } from "node:path";

ctx.withPluginRoot(resolve(import.meta.dir, ".."));
```

Without `withPluginRoot()`, the tester resolves relative paths from `process.cwd()`, which may not be correct.

## Testing Exit Codes

Commands use three exit code ranges:

| Code | Meaning | Example |
| ---- | ------- | ------- |
| 0 | Success | Command completed without issues |
| 1 | Issues found | Lint errors, test failures |
| 2 | Fatal error | Invalid arguments, missing config |

```typescript
test("returns success on clean run", async () => {
  const result = await ctx.runCommand("example", {});
  expect(result.exitCode).toBe(0);
});

test("returns exit code 2 on invalid state", async () => {
  ctx.withState({ broken: true });
  const result = await ctx.runCommand("example", {});
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("error");
});
```

## Testing with Temp Projects

Commands that read files from the project directory benefit from `withTempProject()` and `withFile()`. These create a real directory structure that the command handler can interact with.

```typescript
test("processes files in project", async () => {
  ctx = plugin.test()
    .withTempProject()
    .withFile("package.json", JSON.stringify({
      name: "test-project",
      type: "module",
    }))
    .withFile("src/index.ts", "export const x = 1;")
    .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
    .withState({})
    .mockBunShell()
    .withShellMatching(/biome/, {
      exitCode: 0,
      stdout: "Checked 2 files",
      stderr: "",
    });

  const result = await ctx.runCommand("lint", {});

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Checked 2 files");
});
```

The temp directory is cleaned up automatically when `dispose()` is called.

## Commands That Run External Tools

Many commands shell out to external tools (linters, compilers, test runners). Mock these calls with the shell mocking system to keep tests fast and deterministic.

```typescript
test("runs typecheck and reports results", async () => {
  ctx = plugin.test()
    .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
    .withState({ typescriptEnabled: true })
    .mockBunShell()
    .withShellMatching(/bunx\s+tsc/, {
      exitCode: 1,
      stdout: "",
      stderr: "src/index.ts(5,3): error TS2322: Type 'string' is not assignable to type 'number'.",
    });

  const result = await ctx.runCommand("typecheck", {});

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("TS2322");
});
```

Remember to call `mockBunShell()` to activate the interception. Without it, shell mocks are configured but `Bun.$` calls execute real commands. See the [shell mocking guide][shell-mocking] for details.

## Complete Example

This example tests the my-plugin scaffolded `example` command with different argument combinations and state variations.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("example command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("outputs markdown with no arguments", async () => {
    const result = await ctx.runCommand("example", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Example Command");
    expect(result.stdout).toContain("Arguments: (none)");
  });

  test("includes positional arguments in output", async () => {
    const result = await ctx.runCommand("example", {
      _positionals: ["src/", "lib/"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/, lib/");
  });

  test("reflects debug option", async () => {
    ctx.withOptions({ DEBUG: "true", TIMEOUT_MS: "30000" });

    const result = await ctx.runCommand("example", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Debug: true");
  });

  test("includes project directory from state", async () => {
    ctx.withProjectDir("/home/user/my-project");

    const result = await ctx.runCommand("example", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("/home/user/my-project");
  });
});
```

[shell-mocking]: ./04-shell-mocking.md
