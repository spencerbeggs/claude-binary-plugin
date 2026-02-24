# PreToolUse

The PreToolUse hook fires after Claude creates tool parameters but before the tool executes. It is the primary security boundary in a plugin, allowing you to inspect, allow, deny, or modify tool inputs.

## When It Fires

PreToolUse fires every time Claude is about to call a tool. When your hook definition includes a `tools` array, the hook only fires for matching tool names (see [Tool Filtering][tool-filtering]).

## Input Type

```typescript
interface PreToolUseInput {
  session_id: string;
  tool_name: string;       // "Bash", "Edit", "Write", etc.
  tool_input: ToolInput;   // Tool-specific parameters
  tool_use_id: string;     // Unique ID for this invocation
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "PreToolUse";
}
```

The `tool_input` field contains the parameters Claude prepared for the tool. Its shape depends on the tool -- a Bash tool has `{ command: string }`, a Write tool has `{ file_path: string, content: string }`, and so on.

## Output Type

`PreToolUsePipelineOutput` supports four actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `allow` | Tool proceeds with original input | `reason` (optional, shown to Claude) |
| `deny` | Tool is blocked from executing | `reason` (required, shown to Claude) |
| `ask` | Decision deferred to the user | `reason` (optional) |
| `modify` | Tool proceeds with changed input | `updatedInput` (required, replaces original) |

## Handler Example

This is the `security.hook.ts` handler from the scaffolded my-plugin project. It blocks dangerous shell commands while allowing everything else:

```typescript
// hooks/security.hook.ts
import type { Pipeline } from "../plugin.config.js";

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r|--force|--recursive)/,
  /\bsudo\s+rm\b/,
  /\b(chmod|chown)\s+(-R|--recursive)\s+\//,
  /\bdd\s+.*of=\/dev\//,
  /\bmkfs\b/,
];

const handler: Pipeline["PreToolUse"] = ({ input }) => {
  const command = (input.tool_input as { command?: string }).command ?? "";

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        status: "executed",
        action: "deny",
        summary: "blocked dangerous command",
        reason: `This command matches a dangerous pattern and has been blocked: ${command.slice(0, 80)}`,
      };
    }
  }

  return {
    status: "executed",
    action: "allow",
    summary: "command allowed",
  };
};

export default handler;
```

## Plugin Configuration

Register the PreToolUse hook with a `tools` filter so it only fires for Bash invocations:

```typescript
hooks: {
  PreToolUse: [
    {
      name: "security",
      tools: ["Bash"],
      pipeline: "./hooks/security.hook.ts",
    },
  ],
},
```

Without the `tools` array, the hook runs for every tool call. See [Tool Filtering][tool-filtering] for details.

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/security", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

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

  test("blocks dangerous rm -rf commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("dangerous");
  });

  test("blocks sudo rm commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "sudo rm /etc/hosts" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
  });

  test("allows normal file operations", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "ls -la src/" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });
});
```

## Modifying Tool Input

Use the `modify` action with `updatedInput` to change what the tool receives. The original input is replaced entirely by your modified version:

```typescript
const handler: Pipeline["PreToolUse"] = ({ input }) => {
  const command = (input.tool_input as { command?: string }).command ?? "";

  // Add a timeout to all long-running commands
  if (command.startsWith("npm test") || command.startsWith("bun test")) {
    return {
      status: "executed",
      action: "modify",
      summary: "added timeout wrapper",
      updatedInput: {
        command: `timeout 300 ${command}`,
      },
    };
  }

  return {
    status: "executed",
    action: "allow",
    summary: "command allowed",
  };
};
```

## Typed Tool Inputs

The `tool_input` field is typed as `Record<string, unknown>` by default. For type-safe access, use `ToolInputGuard` to narrow the type based on the tool name:

```typescript
import { ToolInputGuard } from "claude-binary-plugin";
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PreToolUse"] = ({ input }) => {
  // Type-safe access to Bash tool input
  const bashInput = ToolInputGuard.getTyped("Bash", input.tool_input);
  if (bashInput) {
    if (bashInput.dangerouslyDisableSandbox) {
      return {
        status: "executed",
        action: "deny",
        summary: "sandbox bypass blocked",
        reason: "Disabling the sandbox is not permitted.",
      };
    }
  }

  // Type-safe access to Write tool input
  const writeInput = ToolInputGuard.getTyped("Write", input.tool_input);
  if (writeInput) {
    if (writeInput.file_path.endsWith(".env")) {
      return {
        status: "executed",
        action: "deny",
        summary: "blocked .env write",
        reason: "Writing to .env files is not allowed.",
      };
    }
  }

  return {
    status: "executed",
    action: "allow",
    summary: "tool allowed",
  };
};
```

The following typed tool inputs are available:

| Tool | Type | Key Fields |
| --- | --- | --- |
| Bash | `BashToolInput` | `command`, `timeout`, `dangerouslyDisableSandbox` |
| Write | `WriteToolInput` | `file_path`, `content` |
| Edit | `EditToolInput` | `file_path`, `old_string`, `new_string` |
| Read | `ReadToolInput` | `file_path`, `offset`, `limit` |
| Glob | `GlobToolInput` | `pattern`, `path` |
| Grep | `GrepToolInput` | `pattern`, `path`, `output_mode` |
| Task | `TaskToolInput` | `prompt`, `subagent_type`, `model` |
| WebFetch | `WebFetchToolInput` | `url`, `prompt` |
| WebSearch | `WebSearchToolInput` | `query`, `allowed_domains` |
| NotebookEdit | `NotebookEditToolInput` | `notebook_path`, `new_source`, `edit_mode` |
| TodoWrite | `TodoWriteToolInput` | `todos` |

[tool-filtering]: ./08-tool-filtering.md
