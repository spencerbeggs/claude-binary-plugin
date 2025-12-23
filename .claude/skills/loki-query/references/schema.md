# Plugin Telemetry Schema

This document defines the OTEL schema for Claude Code plugin telemetry. Our custom
events use a separate scope from Anthropic's native telemetry.

## Scope Configuration

| Scope | Description |
| ----- | ----------- |
| `com.anthropic.claude_code.events` | Anthropic's native Claude Code telemetry |
| `systems.savvyweb.claude_code.events` | Custom plugin telemetry (hooks, errors) |

Query by scope to separate plugin events from native events:

```logql
# Plugin events only
{service_name="claude-code"} | scope_name="systems.savvyweb.claude_code.events"

# Native Claude Code events only
{service_name="claude-code"} | scope_name="com.anthropic.claude_code.events"
```

---

## Event Types

### claude_code.hook.execution

Primary event for hook executions. Emitted after every hook completes.

| Attribute | Type | Description | Source |
| --------- | ---- | ----------- | ------ |
| `session.id` | string | Session UUID | Anthropic |
| `event.name` | string | `"claude_code.hook.execution"` | Anthropic |
| `event.timestamp` | string | ISO 8601 timestamp | Anthropic |
| `app.version` | string | Claude Code binary version | Anthropic |
| `organization.id` | string | Organization UUID | Anthropic |
| `user.account_uuid` | string | User account UUID | Anthropic |
| `terminal.type` | string | Terminal type (vscode, wezterm, etc.) | Anthropic |
| `tool_name` | string | Tool name (if applicable) | Anthropic |
| `duration_ms` | number | Execution time in milliseconds | Anthropic |
| `source` | string | Always `"hook"` | Anthropic |
| `hook.name` | string | Custom hook name | Extension |
| `hook.type` | string | Hook event type | Extension |
| `hook.outcome` | string | Outcome classification | Extension |
| `plugin.name` | string | Plugin name | Extension |
| `plugin.version` | string | Plugin version | Extension |
| `plugin.marketplace` | string | Marketplace name (optional) | Extension |
| `context_tokens` | number | Tokens in additionalContext | Extension |
| `metrics.*` | number | Operational metrics | Extension |

### PreToolUse-Specific Attributes

When `hook.type` = "PreToolUse":

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `permission_decision` | string | `"allow"`, `"deny"`, `"ask"` |
| `decision.source` | string | Decision source (see below) |
| `permission_decision_reason` | string | Reason shown to Claude |
| `has_updated_input` | boolean | Whether input was modified |

### PostToolUse-Specific Attributes

When `hook.type` = "PostToolUse":

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `has_additional_context` | boolean | Whether context was added |
| `decision` | string | `"block"` if blocked |
| `reason` | string | Block reason |

---

## Hook Types

| Hook Type | When Triggered | Can Do |
| --------- | -------------- | ------ |
| `SessionStart` | Session begins | Add context |
| `SessionEnd` | Session ends | Cleanup only |
| `PreToolUse` | Before tool executes | Allow/deny/modify input |
| `PostToolUse` | After tool completes | Add context or block |
| `Stop` | Agent about to stop | Block with reason |
| `SubagentStop` | Subagent about to stop | Block with reason |
| `UserPromptSubmit` | User submits prompt | Add context or block |
| `PermissionRequest` | Permission needed | Auto-allow/deny |

---

## Hook Outcome Model

Outcomes are derived from the actual hook JSON return values. They represent
what the hook **decided to do**, not success/failure.

### Outcome Values

| Outcome | Description |
| ------- | ----------- |
| `skipped` | Hook didn't apply (wrong tool, disabled) |
| `allowed` | PreToolUse: explicitly allowed |
| `denied` | PreToolUse: explicitly denied |
| `modified` | Input was modified |
| `blocked` | PostToolUse/Stop: blocked continuation |
| `context_added` | Added context for Claude |
| `passthrough` | Analyzed but took no action |
| `error` | Hook failed |

### Mapping from Hook JSON Output

| JSON Field | Value | Outcome |
| ---------- | ----- | ------- |
| (hook logic) | N/A for this tool | `skipped` |
| `permissionDecision` | `"allow"` | `allowed` |
| `permissionDecision` | `"deny"` | `denied` |
| `permissionDecision` | `"ask"` | `passthrough` |
| `updatedInput` | (any value) | `modified` |
| `additionalContext` | (any value) | `context_added` |
| `decision` | `"block"` | `blocked` |
| (no fields set) | - | `passthrough` |
| (exit code != 0) | - | `error` |

### Outcome Examples

| Scenario | Outcome |
| -------- | ------- |
| Lint hook on non-JS file | `skipped` |
| Security hook auto-allows git | `allowed` |
| Security hook blocks rm -rf | `denied` |
| Hook modifies command timeout | `modified` |
| PostToolUse adds docs context | `context_added` |
| Stop hook prevents completion | `blocked` |
| Lint hook runs, no errors | `passthrough` |
| Hook defers to user (ask) | `passthrough` |
| Hook throws exception | `error` |

**Key Distinctions:**

- `skipped`: "Not our concern" (wrong tool type, hook disabled)
- `passthrough`: "We examined it, nothing to do" (lint passed, or defer)

---

## Decision Source Values

For `decision.source` attribute:

| Value | Description |
| ----- | ----------- |
| `config` | Decision from configuration (e.g., allowlist) |
| `user_permanent` | User chose "always allow/deny" |
| `user_temporary` | User chose "allow/deny this time" |
| `hook` | Hook made the decision programmatically |
| `user_abort` | User aborted the operation |
| `user_reject` | User rejected the permission request |

---

## Error Events

### claude_code.hook.validation_error

Schema validation failure during hook parsing.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `validation.path` | string | Path to the validation error |
| `validation.issue_count` | number | Number of validation issues |
| `error` | string | Error message |

### claude_code.hook.env_error

Environment variable validation failure.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `validation.path` | string | Environment variable name |
| `error` | string | Error message |

### claude_code.hook.fatal_error

Uncaught exception or unhandled rejection.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `error` | string | Error message |
| `stack` | string | Stack trace (if available) |

---

## Anthropic Native Events

For reference, these are the native Claude Code events (scope: `com.anthropic.claude_code.events`):

### claude_code.user_prompt

| Attribute | Description |
| --------- | ----------- |
| `prompt_length` | Length of the prompt |
| `prompt` | Content (redacted unless `OTEL_LOG_USER_PROMPTS=1`) |

### claude_code.tool_result

| Attribute | Description |
| --------- | ----------- |
| `tool_name` | Name of the tool |
| `success` | `"true"` or `"false"` |
| `duration_ms` | Execution time in milliseconds |
| `error` | Error message (if failed) |
| `decision` | `"accept"` or `"reject"` |

### claude_code.api_request

| Attribute | Description |
| --------- | ----------- |
| `model` | Model used |
| `cost_usd` | Estimated cost in USD |
| `duration_ms` | Request duration in milliseconds |
| `input_tokens` | Number of input tokens |
| `output_tokens` | Number of output tokens |

### claude_code.tool_decision

| Attribute | Description |
| --------- | ----------- |
| `tool_name` | Name of the tool |
| `decision` | `"accept"` or `"reject"` |
| `source` | Decision source |

---

## Version Tracking

Two version attributes for correlation:

| Attribute | Description | Example |
| --------- | ----------- | ------- |
| `app.version` | Claude Code binary version | `"2.0.74"` |
| `plugin.version` | Plugin version | `"1.0.0"` |

This separation enables queries like:

- "Show hook outcomes when Claude upgraded from 2.0.73 to 2.0.74"
- "Which plugins add the most context tokens?"
- "Are there more errors after a Claude Code update?"

---

## Cardinality Control

Environment variables to control high-cardinality attributes:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `OTEL_METRICS_INCLUDE_SESSION_ID` | Include session.id | `true` |
| `OTEL_METRICS_INCLUDE_VERSION` | Include app.version | `false` |
| `OTEL_METRICS_INCLUDE_ACCOUNT_UUID` | Include user.account_uuid | `true` |
| `OTEL_METRICS_INCLUDE_PLUGIN_VERSION` | Include plugin.version | `false` |
