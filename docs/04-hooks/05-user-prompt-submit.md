# UserPromptSubmit

The UserPromptSubmit hook fires when the user submits a prompt, before Claude begins processing it. Use this hook to inject context based on the prompt content, validate prompts, or block submissions that match certain patterns.

## When It Fires

UserPromptSubmit fires once each time the user submits text to Claude. It receives the full prompt text.

## Input Type

```typescript
interface UserPromptSubmitInput {
  session_id: string;
  prompt: string;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "UserPromptSubmit";
}
```

The `prompt` field contains the raw text the user typed.

## Output Type

`UserPromptSubmitPipelineOutput` supports four actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `block` | Prevents Claude from processing the prompt | `reason` (shown to Claude) |
| `continue` | Prompt proceeds normally | -- |
| `context` | Adds context for Claude before processing | `claudeContext` (injected as additional context) |
| `none` | Hook ran, no action taken | -- |

## Handler Example

This handler adds deployment guidance when the user mentions deployment-related topics:

```typescript
// hooks/prompt-filter.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["UserPromptSubmit"] = ({ input }) => {
  const prompt = input.prompt ?? "";

  // Add context when the user mentions deployment
  if (/deploy|release|publish/i.test(prompt)) {
    return {
      status: "executed",
      action: "context",
      summary: "deployment context added",
      claudeContext:
        "The user is asking about deployment. Ensure all tests pass " +
        "and the build succeeds before proceeding with any deployment steps.",
    };
  }

  return {
    status: "executed",
    action: "none",
    summary: "prompt allowed",
  };
};

export default handler;
```

## Plugin Configuration

```typescript
hooks: {
  UserPromptSubmit: [
    { name: "prompt-filter", pipeline: "./hooks/prompt-filter.hook.ts" },
  ],
},
```

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("UserPromptSubmit/prompt-filter", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("adds context for deployment-related prompts", async () => {
    const result = await ctx
      .withUserPromptSubmitInput({ prompt: "Deploy to production" })
      .runHook("UserPromptSubmit", "prompt-filter");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("context");
    expect(result.context).toContain("deployment");
  });

  test("allows normal prompts without action", async () => {
    const result = await ctx
      .withUserPromptSubmitInput({ prompt: "Help me fix this bug" })
      .runHook("UserPromptSubmit", "prompt-filter");

    expect(result.action).toBe("none");
  });
});
```

## Advanced Patterns

### Blocking Prompts

Block prompts that match patterns you want to prevent:

```typescript
const handler: Pipeline["UserPromptSubmit"] = ({ input }) => {
  const prompt = input.prompt ?? "";

  // Block prompts asking to disable safety features
  if (/ignore.*security|bypass.*check|disable.*hook/i.test(prompt)) {
    return {
      status: "executed",
      action: "block",
      summary: "blocked: safety bypass attempt",
      reason: "Prompts requesting to bypass safety checks are not allowed.",
    };
  }

  return {
    status: "executed",
    action: "none",
    summary: "prompt allowed",
  };
};
```

### Context Injection Based on Keywords

Inject project-specific context based on what the user is asking about:

```typescript
const handler: Pipeline["UserPromptSubmit"] = ({ input, state }) => {
  const prompt = input.prompt ?? "";
  const contextLines: string[] = [];

  if (/test|spec|coverage/i.test(prompt)) {
    contextLines.push(
      "Testing framework: bun:test",
      `Test command: ${state.packageManager} test`,
      "Tests are in __tests__/ directories alongside source files.",
    );
  }

  if (/lint|format|style/i.test(prompt)) {
    contextLines.push(
      "Linter: Biome (tabs, 120 char width)",
      "Run: bun run lint",
      "Config: biome.jsonc in project root",
    );
  }

  if (contextLines.length === 0) {
    return {
      status: "executed",
      action: "none",
      summary: "no keyword matches",
    };
  }

  return {
    status: "executed",
    action: "context",
    summary: `added ${contextLines.length} context lines`,
    claudeContext: contextLines.join("\n"),
  };
};
```
