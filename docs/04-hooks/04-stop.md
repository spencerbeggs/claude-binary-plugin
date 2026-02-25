# Stop and SubagentStop

The Stop hook fires when the main Claude Code agent is about to finish responding. SubagentStop fires when a subagent (spawned by the Task tool) is about to finish. Both hooks use the same output schema and let you block premature stops.

## When They Fire

- **Stop** -- the main agent has finished its work and is about to return control to the user.
- **SubagentStop** -- a subagent launched via the Task tool is about to complete and return results to the parent agent.

Both hooks fire with a `stop_hook_active` flag that indicates whether a stop hook is already running. This prevents infinite loops: if your hook blocks a stop and Claude tries to stop again, the recursive invocation will have `stop_hook_active: true`.

## Input Types

```typescript
interface StopInput {
  session_id: string;
  stop_hook_active: boolean;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "Stop";
}

interface SubagentStopInput {
  session_id: string;
  stop_hook_active: boolean;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "SubagentStop";
}
```

## Output Type

`StopPipelineOutput` supports two actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `block` | Prevents the agent from stopping | `reason` (required -- tells Claude why it cannot stop) |
| `continue` | Allows the agent to stop normally | -- |

When you return `block`, the `reason` field is required. Claude sees this reason and must address it before attempting to stop again.

## Handler Example

This handler allows stops by default but provides a template for adding custom blocking logic:

```typescript
// hooks/stop-guard.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Stop"] = ({ input }) => {
  // Always allow recursive stops to prevent infinite loops
  if (input.stop_hook_active) {
    return {
      status: "executed",
      action: "continue",
      summary: "recursive stop -- allowing",
    };
  }

  // Allow the stop by default. Customize this to block when needed.
  return {
    status: "executed",
    action: "continue",
    summary: "stop allowed",
  };
};

export default handler;
```

## Plugin Configuration

```typescript
hooks: {
  Stop: [
    { name: "stop-guard", pipeline: "./hooks/stop-guard.hook.ts" },
  ],
  SubagentStop: [
    { name: "subagent-guard", pipeline: "./hooks/subagent-guard.hook.ts" },
  ],
},
```

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("Stop/stop-guard", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("allows stop by default", async () => {
    const result = await ctx
      .withStopInput({ stop_hook_active: false })
      .runHook("Stop", "stop-guard");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("continue");
  });

  test("allows recursive stop", async () => {
    const result = await ctx
      .withStopInput({ stop_hook_active: true })
      .runHook("Stop", "stop-guard");

    expect(result.action).toBe("continue");
  });
});
```

SubagentStop tests follow the same pattern but use `withSubagentStopInput` and `runHook("SubagentStop", "subagent-guard")`.

## Advanced: Blocking Premature Stops

A common pattern is blocking stops until certain conditions are met. For example, requiring that tests pass before Claude finishes:

```typescript
const handler: Pipeline["Stop"] = ({ input, state }) => {
  if (input.stop_hook_active) {
    return {
      status: "executed",
      action: "continue",
      summary: "recursive stop -- allowing",
    };
  }

  // Block if the task list has incomplete items
  if (state.pendingTasks && state.pendingTasks > 0) {
    return {
      status: "executed",
      action: "block",
      summary: "blocked: tasks incomplete",
      reason: `You still have ${state.pendingTasks} pending task(s). ` +
        "Complete all tasks before stopping.",
    };
  }

  return {
    status: "executed",
    action: "continue",
    summary: "all tasks complete, stop allowed",
  };
};
```

## SubagentStop

SubagentStop uses the same schema as Stop. The handler file is separate so you can apply different logic to subagent completion versus main agent completion:

```typescript
// hooks/subagent-guard.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SubagentStop"] = ({ input }) => {
  if (input.stop_hook_active) {
    return {
      status: "executed",
      action: "continue",
      summary: "recursive subagent stop -- allowing",
    };
  }

  return {
    status: "executed",
    action: "continue",
    summary: "subagent stop allowed",
  };
};

export default handler;
```
