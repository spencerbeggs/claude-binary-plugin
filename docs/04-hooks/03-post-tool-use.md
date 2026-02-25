# PostToolUse

The PostToolUse hook fires immediately after a tool completes successfully. Use it to inspect tool results, add context for Claude based on the output, or block continuation when something went wrong.

## When It Fires

PostToolUse fires once for each successful tool execution. Like PreToolUse, it supports a `tools` array for filtering to specific tool names (see [Tool Filtering][tool-filtering]).

## Input Type

```typescript
interface PostToolUseInput {
  session_id: string;
  tool_name: string;         // "Bash", "Edit", "Write", etc.
  tool_input: ToolInput;     // The parameters that were sent to the tool
  tool_response: ToolResponse; // The tool's output
  tool_use_id: string;       // Same ID from the corresponding PreToolUse
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "PostToolUse";
}
```

The `tool_response` field contains the raw output from the tool. For Bash, this is typically `{ output: string }`. The `tool_use_id` matches the same field from the corresponding PreToolUse event, allowing you to correlate before and after.

## Output Type

`PostToolUsePipelineOutput` supports four actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `block` | Stops Claude from continuing | `reason` (shown to Claude) |
| `continue` | Normal flow proceeds | -- |
| `context` | Adds context for Claude | `claudeContext` (injected as additional context) |
| `none` | Hook ran, no action taken | -- |

## Handler Example

This example extends the my-plugin project with a PostToolUse hook that detects test failures in Bash output and adds guidance for Claude:

```typescript
// hooks/post-tool.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PostToolUse"] = ({ input }) => {
  const response = input.tool_response as { output?: string } | undefined;
  const output = response?.output ?? "";

  // Add context when test commands produce failures
  if (output.includes("FAIL")) {
    return {
      status: "executed",
      action: "context",
      summary: "test failures detected",
      claudeContext:
        "Test failures were detected in the output. " +
        "Review the failing tests carefully and fix the root cause " +
        "rather than modifying tests to pass.",
    };
  }

  // No action needed for other tool results
  return {
    status: "executed",
    action: "none",
    summary: "no post-tool action",
  };
};

export default handler;
```

## Plugin Configuration

Add the PostToolUse hook to the hooks object in `plugin.config.ts`:

```typescript
hooks: {
  SessionStart: [
    { name: "context", pipeline: "./hooks/context.hook.ts" },
  ],
  PreToolUse: [
    { name: "security", tools: ["Bash"], pipeline: "./hooks/security.hook.ts" },
  ],
  PostToolUse: [
    { name: "post-tool", tools: ["Bash"], pipeline: "./hooks/post-tool.hook.ts" },
  ],
},
```

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PostToolUse/post-tool", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("adds context when test failures detected", async () => {
    const result = await ctx
      .withPostToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "bun test" },
        tool_response: { output: "FAIL src/index.test.ts" },
      })
      .runHook("PostToolUse", "post-tool");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("context");
    expect(result.context).toContain("Test failures");
  });

  test("takes no action for successful commands", async () => {
    const result = await ctx
      .withPostToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "bun test" },
        tool_response: { output: "All tests passed" },
      })
      .runHook("PostToolUse", "post-tool");

    expect(result.action).toBe("none");
  });
});
```

## Advanced Patterns

### Blocking Based on Output

Use the `block` action to stop Claude from continuing when a tool produces dangerous or invalid results:

```typescript
const handler: Pipeline["PostToolUse"] = ({ input }) => {
  const response = input.tool_response as { output?: string } | undefined;
  const output = response?.output ?? "";

  // Block if a command accidentally exposed secrets
  if (/(?:api[_-]?key|secret|password)\s*[:=]\s*\S+/i.test(output)) {
    return {
      status: "executed",
      action: "block",
      summary: "blocked: secrets in output",
      reason: "The command output appears to contain secrets. " +
        "Do not include this output in your response.",
    };
  }

  return {
    status: "executed",
    action: "none",
    summary: "output clean",
  };
};
```

### Analyzing Tool Responses

Inspect the tool response to provide targeted guidance:

```typescript
const handler: Pipeline["PostToolUse"] = ({ input }) => {
  const response = input.tool_response as { output?: string } | undefined;
  const output = response?.output ?? "";

  // Count TypeScript errors in tsc output
  const errorMatches = output.match(/error TS\d+/g);
  if (errorMatches && errorMatches.length > 0) {
    return {
      status: "executed",
      action: "context",
      summary: `${errorMatches.length} TypeScript errors found`,
      claudeContext:
        `Found ${errorMatches.length} TypeScript error(s). ` +
        "Fix type errors before moving on to other tasks. " +
        "Do not use @ts-ignore or type assertions to suppress errors.",
      metrics: { issuesFound: errorMatches.length },
    };
  }

  return {
    status: "executed",
    action: "none",
    summary: "no issues in output",
  };
};
```

[tool-filtering]: ./08-tool-filtering.md
