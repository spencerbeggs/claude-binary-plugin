# Testing

The `claude-binary-plugin` SDK provides a fluent testing API that runs your actual pipeline handlers with mocked I/O. Tests exercise the real handler logic without compiling or executing the binary, giving you fast feedback with full type safety.

All tests use [bun:test][bun-test] as the test runner.

## Quick Example

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
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

The entry point is `plugin.test()`, which returns a `PluginTester` instance. Chain configuration methods to set up options, state, and inputs, then call `runHook()` or `runCommand()` to execute the handler. Always call `dispose()` in `afterEach` to clean up mocks.

## API Quick Reference

### Configuration

| Method | Description |
| ------ | ----------- |
| `withOptions(opts)` | Set plugin options (typed from schema) |
| `withState(state)` | Set computed state (bypasses setup function) |
| `withPluginRoot(path)` | Set plugin directory for resolving relative handler paths |
| `withProjectDir(path)` | Set project directory (CLAUDE_PROJECT_DIR) |
| `withTempProject()` | Create an isolated temp directory as project root |
| `withFile(path, content)` | Add a file to the temp project directory |
| `getTempProjectDir()` | Get the temp directory path after test execution |

### Hook Inputs

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

### Shell Mocking

| Method | Description |
| ------ | ----------- |
| `withShell(pattern, result)` | Static response for substring match |
| `withShellMatching(regex, result)` | Static response for regex match |
| `withShellMatcher(name, fn, result)` | Static response for custom function match |
| `mockShellOnce(pattern, result)` | One-time response (first call only) |
| `mockShellSequence(pattern, results)` | Sequential responses returned in order |
| `mockBunShell()` | Activate Bun.$ interception (required for shell mocks to work) |
| `restoreBunShell()` | Restore original Bun.$ (also called by dispose) |

### Mock Functions

| Method | Description |
| ------ | ----------- |
| `mockFn(name, impl?)` | Create a tracked mock function |
| `clearMockCalls()` | Clear call history, keep configuration |
| `resetMocks()` | Reset all mocks to initial state |

### Execution

| Method | Description |
| ------ | ----------- |
| `runHook(hookType, hookName)` | Execute a hook handler, returns `HookTestResult` |
| `runCommand(name, args?)` | Execute a command handler, returns `CommandTestResult` |
| `dispose()` | Clean up all mocks and temp files (required in afterEach) |

## Detailed Guides

- [Core Fluent API][plugin-tester] -- Configuration, execution, and cleanup
- [Hook Testing][hook-testing] -- Patterns for all 10 hook types
- [Command Testing][command-testing] -- Testing CLI commands
- [Shell Mocking][shell-mocking] -- Intercepting Bun.$ calls
- [Mock Functions][mock-functions] -- Tracked mock function utilities
- [Advanced Testing][advanced-testing] -- File system tests, low-level utilities, troubleshooting

[bun-test]: https://bun.sh/docs/cli/test
[plugin-tester]: ./01-plugin-tester.md
[hook-testing]: ./02-hook-testing.md
[command-testing]: ./03-command-testing.md
[shell-mocking]: ./04-shell-mocking.md
[mock-functions]: ./05-mock-functions.md
[advanced-testing]: ./06-advanced-testing.md
