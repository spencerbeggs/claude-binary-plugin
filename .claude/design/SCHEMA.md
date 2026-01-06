# OTEL Schema Documentation

This document describes the OpenTelemetry schema used by the
`claude-binary-plugin` SDK for hook telemetry.

## Table of Contents

1. [Overview](#overview)
2. [Scope and Service](#scope-and-service)
3. [Event Types](#event-types)
4. [Attributes](#attributes)
5. [Metrics](#metrics)
6. [Hook Outcome Model](#hook-outcome-model)
7. [Configuration](#configuration)

---

## Overview

The SDK emits telemetry aligned with Anthropic's Claude Code native
telemetry schema. Events use the `claude_code.hook.*` naming pattern
and are distinguished from Anthropic's native events by scope name.

Key design principles:

- **Anthropic alignment** - Attribute names use dot notation matching
  Claude Code's native schema (e.g., `session.id`, `tool.name`)
- **Scope separation** - Our scope (`systems.savvyweb.claude_code.events`)
  distinguishes from Anthropic's (`com.anthropic.claude_code.events`)
- **Fire-and-forget** - Telemetry never blocks hook execution
- **Semantic outcomes** - Hook results are classified for easy filtering
- **Class-based API** - All telemetry accessed via static class methods

### Telemetry Classes

The SDK provides three primary classes for telemetry emission:

```typescript
import {
  TelemetryEmitter,
  TelemetryMetrics,
  TelemetrySpan,
  OTELConfig,
} from "claude-binary-plugin";

// Check if telemetry is enabled
if (OTELConfig.isEnabled()) {
  // Emit events
  TelemetryEmitter.emitHookExecution(event, "pre-bash", { ... });

  // Record metrics
  TelemetryMetrics.recordCounter(event, "files.processed", 5);

  // Instrument with spans
  await TelemetrySpan.withHookSpan(event, "validate", async () => { ... });
}
```

| Class | Purpose |
| ----- | ------- |
| `TelemetryEmitter` | Emit events (`emitHookExecution`, `emitFatalError`, etc.) |
| `TelemetryMetrics` | Record metrics (counters, histograms, gauges) |
| `TelemetrySpan` | Span instrumentation for tracing |
| `OTELConfig` | Configuration and `isEnabled()` check |

---

## Scope and Service

| Field | Value |
| ----- | ----- |
| Scope Name | `systems.savvyweb.claude_code.events` |
| Service Name | `claude-code` |
| Service Namespace | `claude-code` |

The scope name allows queries to filter between:

- `scope_name = "com.anthropic.claude_code.events"` - Native Claude Code
- `scope_name = "systems.savvyweb.claude_code.events"` - Plugin hooks

---

## Event Types

| Event Name | Description |
| ---------- | ----------- |
| `claude_code.hook.execution` | Hook execution completed |
| `claude_code.hook.validation_error` | Schema validation failed |
| `claude_code.hook.env_error` | Environment validation failed |
| `claude_code.hook.fatal_error` | Uncaught exception |

### claude_code.hook.execution

Primary event emitted when a hook completes. Contains timing, decision,
and outcome data.

**Required Attributes:**

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `session.id` | string | Claude Code session UUID |
| `event.name` | string | `"claude_code.hook.execution"` |
| `event.timestamp` | string | ISO 8601 timestamp |
| `hook.name` | string | Custom hook name (e.g., "pre-bash") |
| `hook.type` | string | Hook event type (PreToolUse, etc.) |
| `hook.duration_ms` | number | Execution time in milliseconds |
| `source` | string | Always `"hook"` |
| `plugin.name` | string | Plugin name |
| `plugin.version` | string | Plugin version |

**Optional Attributes:**

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `app.version` | string | Claude Code binary version |
| `terminal.type` | string | Terminal type (iTerm, vscode, etc.) |
| `hook.outcome` | string | Semantic outcome (see below) |
| `tool.name` | string | Tool name (for tool hooks) |
| `tool.use_id` | string | Tool use ID for correlation |
| `permission.decision` | string | `"allow"`, `"deny"`, `"ask"` |
| `decision.source` | string | Who made the decision |
| `permission.decision_reason` | string | Reason shown to Claude |
| `tool.input_modified` | boolean | Whether input was modified |
| `hook.decision` | string | `"block"` for blocking hooks |
| `reason` | string | Block reason |
| `response.has_context` | boolean | Whether context was added |
| `error` | string | Error message if failed |
| `metrics.*` | number | Operational metrics |
| `context.*` | any | Hook-specific context |

### claude_code.hook.validation_error

Emitted when Claude Code sends malformed event data that fails Zod
schema validation.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `session.id` | string | Session UUID |
| `hook.name` | string | Hook that received the error |
| `validation.path` | string | Field path that failed |
| `validation.issue_count` | number | Number of issues |
| `error` | string | Formatted error message |

### claude_code.hook.env_error

Emitted when plugin environment variables fail validation.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `session.id` | string | Session UUID |
| `hook.name` | string | Hook that received the error |
| `env.class` | string | Env class name |
| `validation.path` | string | Field path that failed |
| `validation.issue_count` | number | Number of issues |
| `error` | string | Formatted error message |

### claude_code.hook.fatal_error

Emitted when an uncaught exception or unhandled rejection occurs.

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `session.id` | string | Session UUID |
| `hook.name` | string | Hook that crashed |
| `error.type` | string | Exception type |
| `error` | string | Error message |
| `error.is_validation` | boolean | Whether it was a validation error |

---

## Attributes

### Standard Attributes (Anthropic-Aligned)

| Attribute | Description |
| --------- | ----------- |
| `session.id` | Claude Code session UUID |
| `app.version` | Claude Code binary version |
| `terminal.type` | Terminal type (iTerm, vscode, cursor, tmux) |
| `organization.id` | Organization UUID (when authenticated) |
| `user.account_uuid` | User account UUID (when authenticated) |
| `event.name` | Event name |
| `event.timestamp` | ISO 8601 timestamp |
| `source` | Telemetry source (always "hook") |
| `model` | Model being used |
| `error` | Error message |

### Hook Attributes

| Attribute | Description |
| --------- | ----------- |
| `hook.name` | Custom hook identifier (e.g., "pre-bash") |
| `hook.type` | Hook event type (PreToolUse, SessionStart, etc.) |
| `hook.outcome` | Semantic outcome (see Outcome Model) |
| `hook.decision` | Decision value (allow, deny, block) |
| `hook.duration_ms` | Execution duration in milliseconds |

### Tool Attributes

| Attribute | Description |
| --------- | ----------- |
| `tool.name` | Tool name (Bash, Edit, Write, etc.) |
| `tool.use_id` | Tool use ID for correlation |
| `tool.input_hash` | Hash of tool input (for deduplication) |
| `tool.input_modified` | Whether input was modified by hook |

### Permission Attributes

| Attribute | Description |
| --------- | ----------- |
| `permission.decision` | `"allow"`, `"deny"`, `"ask"` |
| `permission.decision_reason` | Reason shown to Claude |
| `decision.source` | Who made the decision (see below) |

**Decision Source Values:**

| Value | Description |
| ----- | ----------- |
| `config` | Decision from configuration (e.g., allowlist) |
| `user_permanent` | User chose "always allow/deny" |
| `user_temporary` | User chose "allow/deny this time" |
| `hook` | Hook made the decision programmatically |
| `user_abort` | User aborted the operation |
| `user_reject` | User rejected the permission request |

### Plugin Attributes

| Attribute | Description |
| --------- | ----------- |
| `plugin.name` | Plugin name (e.g., "workflow") |
| `plugin.version` | Plugin version from package.json |
| `plugin.marketplace` | Marketplace name (optional) |
| `plugin.marketplace.version` | Marketplace version |
| `plugin.hook.handler` | Hook handler file path |
| `plugin.command` | Command name (for command hooks) |

### Git Attributes

| Attribute | Description |
| --------- | ----------- |
| `git.branch` | Current git branch |
| `git.provider` | Git provider (github, gitlab, bitbucket) |
| `git.owner` | Repository owner/organization |
| `git.repo` | Repository name |

### Sidecar Attributes

| Attribute | Description |
| --------- | ----------- |
| `sidecar.pid` | Sidecar process ID |
| `sidecar.socket.path` | Unix socket path |
| `sidecar.uptime_ms` | Sidecar uptime |
| `sidecar.message.count` | Messages processed |

---

## Metrics

All metrics use the `claude_code.hook.*` prefix.

| Metric Name | Type | Description |
| ----------- | ---- | ----------- |
| `claude_code.hook.count` | Counter | Hook invocations |
| `claude_code.hook.duration_ms` | Histogram | Hook execution duration |
| `claude_code.hook.tool_use.count` | Counter | Tool uses processed |
| `claude_code.hook.tool_denied.count` | Counter | Denied tool uses |
| `claude_code.hook.session.active` | Gauge | Active sessions |
| `claude_code.hook.session.start.count` | Counter | Sessions started |
| `claude_code.hook.session.end.count` | Counter | Sessions ended |
| `claude_code.hook.sidecar.ipc.messages.sent` | Counter | IPC messages |
| `claude_code.hook.sidecar.ipc.errors` | Counter | IPC errors |
| `claude_code.hook.sidecar.ipc.latency_ms` | Histogram | IPC latency |

### Metric Dimensions

**Hook Count:**

- `hook.name` - Custom hook name
- `hook.decision` - Decision made
- `tool.name` - Tool name (if applicable)

**Hook Duration:**

- `hook.name` - Custom hook name
- `tool.name` - Tool name (if applicable)

---

## Hook Outcome Model

Outcomes classify what the hook decided to do, enabling easy filtering
and analysis of hook behavior patterns.

| Outcome | Description |
| ------- | ----------- |
| `skipped` | Hook didn't apply (wrong tool, disabled) |
| `allowed` | PreToolUse: explicitly allowed |
| `denied` | PreToolUse: explicitly denied |
| `modified` | Tool input was modified |
| `blocked` | PostToolUse/Stop: blocked continuation |
| `context_added` | Added context for Claude |
| `passthrough` | Analyzed but took no action |
| `error` | Hook failed with error |

### Outcome Mapping

| Hook Response | Outcome |
| ------------- | ------- |
| `permissionDecision: "allow"` | `allowed` |
| `permissionDecision: "deny"` | `denied` |
| `permissionDecision: "ask"` | `passthrough` |
| `updatedInput: {...}` | `modified` |
| `additionalContext: "..."` | `context_added` |
| `decision: "block"` | `blocked` |
| (no fields set) | `passthrough` |
| (hook disabled for tool) | `skipped` |
| (exception thrown) | `error` |

### Examples

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

---

## Configuration

### Environment Variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Protocol (http/grpc) | `http` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers | - |
| `OTEL_SERVICE_NAME` | Service name override | `claude-code` |
| `OTEL_INCLUDE_SESSION_ID` | Include session.id | `true` |

### Sidecar Configuration

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `OTEL_SIDECAR_SOCKET` | Unix socket path | Auto-generated |
| `OTEL_SIDECAR_SESSION_ID` | Session ID | From hook |
| `OTEL_SIDECAR_IDLE_TIMEOUT_MS` | Idle timeout | `300000` (5 min) |

---

## References

- [Claude Code Monitoring](https://docs.anthropic.com/en/docs/claude-code/monitoring)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
