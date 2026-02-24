# PermissionRequest

The PermissionRequest hook fires when Claude Code is about to show a permission dialog to the user. Use this hook to auto-allow or auto-deny specific permission requests based on your security policy.

## When It Fires

PermissionRequest fires whenever Claude needs user approval to perform an action. The hook lets you make the decision programmatically instead of requiring the user to respond interactively.

## Input Type

```typescript
interface PermissionRequestInput {
  session_id: string;
  message: string;
  notification_type: string;
  cwd?: string;
  transcript_path?: string;
  hook_event_name: "PermissionRequest";
}
```

The `message` field contains the permission prompt that would be shown to the user. The `notification_type` field indicates the category of permission being requested.

## Output Type

`PermissionRequestPipelineOutput` supports two actions:

| Action | Effect | Key Fields |
| --- | --- | --- |
| `allow` | Permission granted, action proceeds | `reason` (optional), `updatedInput` (optional) |
| `deny` | Permission denied, action blocked | `reason` (optional), `interrupt` (optional) |

When denying, you can set `interrupt: true` to interrupt Claude's current execution flow rather than just denying the specific permission.

## Handler Example

This handler auto-allows all permission requests. In practice, you would inspect the request details and selectively allow or deny:

```typescript
// hooks/permission.hook.ts
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PermissionRequest"] = ({ input }) => {
  // Auto-allow read-only operations
  if (input.message.includes("read") || input.message.includes("search")) {
    return {
      status: "executed",
      action: "allow",
      summary: "auto-allowed read operation",
    };
  }

  // Auto-deny anything involving network access
  if (input.message.includes("network") || input.message.includes("internet")) {
    return {
      status: "executed",
      action: "deny",
      summary: "denied network access",
      reason: "Network access is not permitted by plugin policy.",
    };
  }

  // Allow everything else
  return {
    status: "executed",
    action: "allow",
    summary: "permission auto-allowed",
  };
};

export default handler;
```

## Plugin Configuration

```typescript
hooks: {
  PermissionRequest: [
    { name: "permission", pipeline: "./hooks/permission.hook.ts" },
  ],
},
```

## Testing

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PermissionRequest/permission", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("auto-allows permission requests", async () => {
    const result = await ctx
      .withPermissionRequestInput({
        message: "Allow filesystem access?",
        notification_type: "permission",
      })
      .runHook("PermissionRequest", "permission");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("allow");
  });

  test("denies network access", async () => {
    const result = await ctx
      .withPermissionRequestInput({
        message: "Allow network access to api.example.com?",
        notification_type: "permission",
      })
      .runHook("PermissionRequest", "permission");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("not permitted");
  });
});
```

## Advanced: Using updatedInput

When allowing a permission, you can modify the input that Claude will use:

```typescript
const handler: Pipeline["PermissionRequest"] = ({ input }) => {
  // Allow file writes but restrict to the project directory
  if (input.message.includes("write to file")) {
    return {
      status: "executed",
      action: "allow",
      summary: "allowed with restrictions",
      updatedInput: {
        restricted_paths: ["/home/user/project"],
      },
    };
  }

  return {
    status: "executed",
    action: "allow",
    summary: "permission allowed",
  };
};
```

## Advanced: Interrupting Execution

Set `interrupt: true` when denying to stop Claude's current execution entirely, not just the specific permission:

```typescript
const handler: Pipeline["PermissionRequest"] = ({ input }) => {
  if (input.notification_type === "dangerous_operation") {
    return {
      status: "executed",
      action: "deny",
      summary: "denied and interrupted",
      reason: "This operation is classified as dangerous. Execution has been stopped.",
      interrupt: true,
    };
  }

  return {
    status: "executed",
    action: "allow",
    summary: "permission allowed",
  };
};
```
