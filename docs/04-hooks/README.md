# Hooks

Hooks are lifecycle events that Claude Code sends to your plugin at specific points during a session. Your plugin processes each hook through a pipeline handler and returns a structured response that can allow, deny, modify, or add context to Claude's behavior.

## How Hooks Work

Claude Code spawns your plugin binary with a hook key argument and sends event data via stdin as JSON. Your handler receives typed context (input, options, state), makes a decision, and returns a pipeline output. The runtime converts that output to the response format Claude Code expects and writes it to stdout.

```text
Claude Code                          Plugin Binary
    |                                     |
    |-- stdin (JSON event) -------------->|
    |                                     |-- parse + validate
    |                                     |-- load state
    |                                     |-- call handler
    |                                     |-- validate output
    |<-- stdout (JSON response) ----------|
```

## Hook Lifecycle

Hooks fire in a predictable order during a Claude Code session:

```text
SessionStart
    |
    v
UserPromptSubmit --> PreToolUse --> Tool Executes --> PostToolUse
    |                    |                                |
    |                    |  (repeat per tool call)        |
    |                    +--------------------------------+
    |
    v
Stop / SubagentStop
    |
    v
SessionEnd
```

Additional hooks fire in specific circumstances:

- **PermissionRequest** -- when Claude needs permission for an action
- **PreCompact** -- before context window compaction
- **Notification** -- when Claude Code sends a notification event

## Quick Reference

| Hook Type | When Fired | Capabilities | Valid Actions |
| --- | --- | --- | --- |
| [SessionStart][session-start] | Session begins | Inject context, run setup | `context`, `none` |
| [PreToolUse][pre-tool-use] | Before tool executes | Allow, deny, modify input | `allow`, `deny`, `ask`, `modify` |
| [PostToolUse][post-tool-use] | After tool completes | Add context, block | `block`, `continue`, `context`, `none` |
| [Stop][stop] | Agent stopping | Block premature stops | `block`, `continue` |
| [SubagentStop][stop] | Subagent stopping | Block premature stops | `block`, `continue` |
| [UserPromptSubmit][user-prompt-submit] | User submits prompt | Add context, block | `block`, `continue`, `context`, `none` |
| [PermissionRequest][permission-request] | Permission needed | Auto-allow or deny | `allow`, `deny` |
| [SessionEnd][passthrough] | Session ends | Observe only | `none` |
| [PreCompact][passthrough] | Before compaction | Observe only | `none` |
| [Notification][passthrough] | Notification event | Observe only | `none` |

## Pipeline Output Format

Every hook handler returns a pipeline output object. The `status`, `action`, and `summary` fields are always present when a hook runs normally:

```typescript
return {
  status: "executed",      // Required: did the hook run?
  action: "allow",         // Required when status is "executed"
  summary: "command allowed", // Required: human-readable log line
};
```

Common optional fields include:

| Field | Purpose | Target |
| --- | --- | --- |
| `claudeContext` | Detailed context injected for Claude | Claude sees via `additionalContext` |
| `reason` | Concise decision reason | Claude sees via `permissionDecisionReason` |
| `userMessage` | Message shown in the terminal | User sees via `systemMessage` |
| `updatedInput` | Modified tool input (PreToolUse only) | Replaces original tool input |
| `metrics` | Custom domain metrics | Sent to OTEL telemetry |

See the [pipeline output types][pipeline-types] source for the full schema.

## Hook Definition Types

Hooks are defined in `plugin.config.ts` inside the `hooks` object. There are four ways to define a hook:

1. **Pipeline file** (recommended) -- points to a file exporting a default handler function
2. **Inline pipeline** -- defines the handler function directly in the config
3. **Raw handler** -- for direct access to the `HookEvent` object
4. **Passthrough** -- includes native Claude Code hook entries verbatim

For details on each definition type, see [Plugin Configuration][plugin-configuration].

## Per-Hook Documentation

- [SessionStart][session-start] -- context injection and setup
- [PreToolUse][pre-tool-use] -- tool interception and security
- [PostToolUse][post-tool-use] -- post-execution context and blocking
- [Stop and SubagentStop][stop] -- stop prevention
- [UserPromptSubmit][user-prompt-submit] -- prompt filtering and context
- [PermissionRequest][permission-request] -- automatic permission decisions
- [Passthrough Hooks][passthrough] -- SessionEnd, PreCompact, Notification
- [Tool Filtering][tool-filtering] -- the `tools` array and `matcher` in hooks.json

[session-start]: ./01-session-start.md
[pre-tool-use]: ./02-pre-tool-use.md
[post-tool-use]: ./03-post-tool-use.md
[stop]: ./04-stop.md
[user-prompt-submit]: ./05-user-prompt-submit.md
[permission-request]: ./06-permission-request.md
[passthrough]: ./07-passthrough-hooks.md
[tool-filtering]: ./08-tool-filtering.md
[plugin-configuration]: ../02-plugin-configuration.md
[pipeline-types]: ../../src/pipeline/types.ts
