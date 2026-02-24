# Passthrough Hooks

SessionEnd, PreCompact, and Notification are passthrough hooks. They can only observe events -- they cannot modify behavior, block actions, or inject context. Their only valid action is `none`.

## Output Type

All three hooks use `PassthroughPipelineOutput`:

```typescript
// The only valid executed output for passthrough hooks
{
  status: "executed",
  action: "none",    // Only "none" is allowed
  summary: "...",
}
```

You can also return `skipped`, `disabled`, or `error` statuses, but you cannot return actions like `block`, `context`, or `allow`.

## SessionEnd

### When It Fires

SessionEnd fires when the Claude Code session terminates. The `reason` field explains why.

### Input Type

```typescript
interface SessionEndInput {
  session_id: string;
  reason: "clear" | "logout" | "prompt_input_exit" | "other";
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "SessionEnd";
}
```

| Reason | Meaning |
| --- | --- |
| `clear` | User cleared the session |
| `logout` | User logged out |
| `prompt_input_exit` | User exited the prompt input |
| `other` | Session ended for another reason |

### Handler Example

```typescript
// hooks/cleanup.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionEnd"] = ({ input }) => {
  // SessionEnd is passthrough-only -- use for cleanup, not behavior changes.
  return {
    status: "executed",
    action: "none",
    summary: `session ended: ${input.reason}`,
  };
};

export default handler;
```

### Plugin Configuration

```typescript
hooks: {
  SessionEnd: [
    { name: "cleanup", pipeline: "./hooks/cleanup.hook.ts" },
  ],
},
```

### Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionEnd/cleanup", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("handles logout", async () => {
    const result = await ctx
      .withSessionEndInput({ reason: "logout" })
      .runHook("SessionEnd", "cleanup");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("none");
  });

  test("handles clear", async () => {
    const result = await ctx
      .withSessionEndInput({ reason: "clear" })
      .runHook("SessionEnd", "cleanup");

    expect(result.action).toBe("none");
  });
});
```

## PreCompact

### When It Fires

PreCompact fires before Claude Code compacts the conversation context window. Compaction happens automatically when the context grows too large, or manually when the user triggers it.

### Input Type

```typescript
interface PreCompactInput {
  session_id: string;
  trigger: "manual" | "auto";
  custom_instructions: string;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "PreCompact";
}
```

| Field | Description |
| --- | --- |
| `trigger` | Whether compaction was triggered manually by the user or automatically by the system |
| `custom_instructions` | Any custom instructions included for the compact operation |

### Handler Example

```typescript
// hooks/pre-compact.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PreCompact"] = ({ input }) => {
  // PreCompact is passthrough-only. Observe when compaction happens.
  return {
    status: "executed",
    action: "none",
    summary: `pre-compact observed (trigger: ${input.trigger})`,
  };
};

export default handler;
```

### Plugin Configuration

```typescript
hooks: {
  PreCompact: [
    { name: "pre-compact", pipeline: "./hooks/pre-compact.hook.ts" },
  ],
},
```

### Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreCompact/pre-compact", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("observes auto compaction", async () => {
    const result = await ctx
      .withPreCompactInput({ trigger: "auto" })
      .runHook("PreCompact", "pre-compact");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("none");
  });

  test("observes manual compaction", async () => {
    const result = await ctx
      .withPreCompactInput({ trigger: "manual" })
      .runHook("PreCompact", "pre-compact");

    expect(result.action).toBe("none");
  });
});
```

## Notification

### When It Fires

Notification fires when Claude Code sends a notification event. Notification types include `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, and custom types.

### Input Type

```typescript
interface NotificationInput {
  session_id: string;
  message: string;
  notification_type: string;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "Notification";
}
```

### Handler Example

```typescript
// hooks/notification.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Notification"] = () => {
  // Notification hooks are passthrough-only.
  // Use this for logging or metrics, not for changing behavior.
  return {
    status: "executed",
    action: "none",
    summary: "notification observed",
  };
};

export default handler;
```

### Plugin Configuration

```typescript
hooks: {
  Notification: [
    { name: "notification", pipeline: "./hooks/notification.hook.ts" },
  ],
},
```

### Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("Notification/notification", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("observes notifications without action", async () => {
    const result = await ctx
      .withNotificationInput({
        message: "Build completed",
        notification_type: "info",
      })
      .runHook("Notification", "notification");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("none");
  });
});
```

## When to Use Passthrough Hooks

Passthrough hooks are useful for:

- **Cleanup** -- flush caches or close connections when a session ends (SessionEnd)
- **Logging** -- record events for debugging or analytics
- **Metrics** -- emit OTEL telemetry when specific events occur
- **Monitoring** -- track session lifecycle for operational visibility

They are not useful when you need to modify Claude's behavior. For that, use hooks with richer action sets like [PreToolUse][pre-tool-use], [PostToolUse][post-tool-use], or [UserPromptSubmit][user-prompt-submit].

[pre-tool-use]: ./02-pre-tool-use.md
[post-tool-use]: ./03-post-tool-use.md
[user-prompt-submit]: ./05-user-prompt-submit.md
