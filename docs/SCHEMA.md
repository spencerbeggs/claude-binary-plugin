# OTEL Schema Documentation

This document outlines the Anthropic Claude Code OTEL schema, our current
savvy-web schema, and the alignment plan to ensure interoperability and
consistency.

## Table of Contents

1. [Anthropic Claude Code Schema](#anthropic-claude-code-schema)
2. [Current Savvy-Web Schema](#current-savvy-web-schema)
3. [Schema Comparison](#schema-comparison)
4. [Alignment Plan](#alignment-plan)
5. [Extended Schema Design](#extended-schema-design)

---

## Anthropic Claude Code Schema

**Source**:
[Claude Code Monitoring Documentation](https://code.claude.com/docs/en/monitoring-usage)

### Scope and Service Information

| Field | Value |
| ----- | ----- |
| `service.name` | `claude-code` |
| `service.version` | Current Claude Code version |
| Meter Name | `com.anthropic.claude_code` |
| Events Scope | `com.anthropic.claude_code.events` (inferred) |

### Resource Attributes

| Attribute | Description |
| --------- | ----------- |
| `service.name` | `claude-code` |
| `service.version` | Current Claude Code version |
| `os.type` | Operating system type (`linux`, `darwin`, `windows`) |
| `os.version` | Operating system version string |
| `host.arch` | Host architecture (`amd64`, `arm64`) |
| `wsl.version` | WSL version (only on Windows Subsystem for Linux) |

### Standard Attributes (All Metrics/Events)

| Attribute | Description |
| --------- | ----------- |
| `session.id` | Unique session ID |
| `app.version` | Claude Code version |
| `organization.id` | Org UUID (when authenticated) |
| `user.account_uuid` | Account UUID (when authenticated) |
| `terminal.type` | Terminal (iTerm, vscode, cursor, tmux) |

**Cardinality Control**:

- `session.id`: `OTEL_METRICS_INCLUDE_SESSION_ID` (default: true)
- `app.version`: `OTEL_METRICS_INCLUDE_VERSION` (default: false)
- `organization.id`: Always included
- `user.account_uuid`: `OTEL_METRICS_INCLUDE_ACCOUNT_UUID` (default:
  true)
- `terminal.type`: Always included

### Metrics

| Metric Name | Type | Unit | Description |
| ----------- | ---- | ---- | ----------- |
| `claude_code.session.count` | Counter | count | CLI sessions started |
| `claude_code.lines_of_code.count` | Counter | count | Lines of code modified |
| `claude_code.pull_request.count` | Counter | count | Pull requests created |
| `claude_code.commit.count` | Counter | count | Git commits created |
| `claude_code.cost.usage` | Counter | USD | Session cost |
| `claude_code.token.usage` | Counter | tokens | Tokens used |
| `claude_code.code_edit_tool.decision` | Counter | count | Code edit perms |
| `claude_code.active_time.total` | Counter | s | Total active time |

#### Metric-Specific Attributes

**Lines of Code Counter**:

- `type`: `"added"` or `"removed"`

**Cost Counter**:

- `model`: Model identifier (e.g., "claude-sonnet-4-5-20250929")

**Token Counter**:

- `type`: `"input"`, `"output"`, `"cacheRead"`, `"cacheCreation"`
- `model`: Model identifier

**Code Edit Tool Decision**:

- `tool`: Tool name (`"Edit"`, `"Write"`, `"NotebookEdit"`)
- `decision`: `"accept"` or `"reject"`
- `language`: Programming language of edited file

### Events

All events are exported via OpenTelemetry logs/events protocol.

#### 1. User Prompt Event

**Event Name**: `claude_code.user_prompt`

| Attribute | Description |
| --------- | ----------- |
| `event.name` | `"user_prompt"` |
| `event.timestamp` | ISO 8601 timestamp |
| `prompt_length` | Length of the prompt |
| `prompt` | Content (redacted, enable: `OTEL_LOG_USER_PROMPTS=1`) |

#### 2. Tool Result Event

**Event Name**: `claude_code.tool_result`

| Attribute | Description |
| --------- | ----------- |
| `event.name` | `"tool_result"` |
| `event.timestamp` | ISO 8601 timestamp |
| `tool_name` | Name of the tool |
| `success` | `"true"` or `"false"` |
| `duration_ms` | Execution time in milliseconds |
| `error` | Error message (if failed) |
| `decision` | `"accept"` or `"reject"` |
| `source` | Decision source (see below) |
| `tool_parameters` | JSON string with tool-specific parameters |

**Decision Sources**: `"config"`, `"user_permanent"`, `"user_temporary"`,
`"user_abort"`, `"user_reject"`

**Bash Tool Parameters**:

- `bash_command`, `full_command`, `timeout`, `description`, `sandbox`

#### 3. API Request Event

**Event Name**: `claude_code.api_request`

| Attribute | Description |
| --------- | ----------- |
| `event.name` | `"api_request"` |
| `event.timestamp` | ISO 8601 timestamp |
| `model` | Model used |
| `cost_usd` | Estimated cost in USD |
| `duration_ms` | Request duration in milliseconds |
| `input_tokens` | Number of input tokens |
| `output_tokens` | Number of output tokens |
| `cache_read_tokens` | Tokens read from cache |
| `cache_creation_tokens` | Tokens used for cache creation |

#### 4. API Error Event

**Event Name**: `claude_code.api_error`

| Attribute | Description |
| --------- | ----------- |
| `event.name` | `"api_error"` |
| `event.timestamp` | ISO 8601 timestamp |
| `model` | Model used |
| `error` | Error message |
| `status_code` | HTTP status code (if applicable) |
| `duration_ms` | Request duration in milliseconds |
| `attempt` | Attempt number (for retried requests) |

#### 5. Tool Decision Event

**Event Name**: `claude_code.tool_decision`

| Attribute | Description |
| --------- | ----------- |
| `event.name` | `"tool_decision"` |
| `event.timestamp` | ISO 8601 timestamp |
| `tool_name` | Name of the tool |
| `decision` | `"accept"` or `"reject"` |
| `source` | Decision source |

---

## Current Savvy-Web Schema

**Scope**: `systems.savvyweb.claude_code.events`

### Event Types

| Event Name | Description |
| ---------- | ----------- |
| `hook_execution` | Hook execution completion with timing and decision |
| `schema_validation_error` | Schema validation failure during hook parsing |
| `env_validation_error` | Environment variable validation failure |
| `fatal_error` | Uncaught exception or unhandled rejection |

### Current Attributes (from constants.ts)

#### Claude-Aligned Attributes

| Constant | Attribute Name | Description |
| -------- | -------------- | ----------- |
| `SESSION_ID` | `session_id` | Claude Code session ID |
| `ORGANIZATION_ID` | `organization.id` | Organization UUID |
| `USER_ACCOUNT_UUID` | `user.account_uuid` | User account UUID |
| `USER_EMAIL` | `user.email` | User email (high cardinality) |
| `HOOK_NAME` | `hook_name` | Custom hook name |
| `HOOK_TYPE` | `hook_type` | Hook event type (PreToolUse, SessionStart, etc.) |
| `TOOL_NAME` | `tool_name` | Tool name for tool-related hooks |
| `TOOL_INPUT_HASH` | `tool_input_hash` | Tool input hash for deduplication |
| `HOOK_DECISION` | `decision` | Hook decision (allow, deny, ask, block) |
| `PROJECT_DIR` | `project_dir` | Claude Code project directory |
| `MODEL` | `model` | Model being used |
| `SOURCE` | `source` | Telemetry source (always "hook") |
| `EVENT_TIMESTAMP` | `event_timestamp` | ISO 8601 timestamp |
| `DURATION_MS` | `duration_ms` | Execution duration in milliseconds |
| `ERROR` | `error` | Error message if failed |
| `PERMISSION_DECISION` | `permission_decision` | Permission decision |
| `PERMISSION_DECISION_REASON` | `permission_decision_reason` | Perm reason |
| `HAS_UPDATED_INPUT` | `has_updated_input` | Tool input modified |
| `REASON` | `reason` | Blocking reason |
| `HAS_ADDITIONAL_CONTEXT` | `has_additional_context` | Context provided |
| `VALIDATION_PATH` | `validation_path` | Validation error path |
| `VALIDATION_ISSUE_COUNT` | `validation_issue_count` | Validation issues |

#### Plugin-Specific Attributes

| Constant | Attribute Name | Description |
| -------- | -------------- | ----------- |
| `NAME` | `plugin.name` | Plugin name |
| `VERSION` | `plugin.version` | Plugin version |
| `MARKETPLACE` | `plugin.marketplace` | Marketplace name |
| `MARKETPLACE_VERSION` | `plugin.marketplace.version` | Marketplace version |
| `HOOK_HANDLER` | `plugin.hook.handler` | Hook handler file path |
| `COMMAND` | `plugin.command` | Command name for command hooks |

#### Sidecar Attributes

| Constant | Attribute Name | Description |
| -------- | -------------- | ----------- |
| `PID` | `sidecar.pid` | Sidecar process ID |
| `SOCKET_PATH` | `sidecar.socket.path` | Socket path |
| `UPTIME_MS` | `sidecar.uptime_ms` | Sidecar uptime |
| `MESSAGE_COUNT` | `sidecar.message.count` | Messages processed |

### Current Metrics

| Metric Name | Type | Description |
| ----------- | ---- | ----------- |
| `claude.hook.count` | Counter | Hook invocations |
| `claude.hook.duration_ms` | Histogram | Hook execution duration |
| `claude.tool.use.count` | Counter | Tool uses |
| `claude.tool.denied.count` | Counter | Denied tool uses |
| `claude.session.active` | Gauge | Active sessions |
| `claude.session.start.count` | Counter | Sessions started |
| `claude.session.end.count` | Counter | Sessions ended |
| `sidecar.ipc.messages.sent` | Counter | IPC messages sent |
| `sidecar.ipc.errors` | Counter | IPC errors |
| `sidecar.ipc.latency_ms` | Histogram | IPC message latency |

---

## Schema Comparison

### Attribute Naming Differences

| Concept | Anthropic | Savvy-Web Current | Action |
| ------- | --------- | ----------------- | ------ |
| Session ID | `session.id` | `session_id` | **CHANGE**: Use dot |
| Timestamp | `event.timestamp` | `event_timestamp` | **CHANGE**: Use dot |
| Tool name | `tool_name` | `tool_name` | **KEEP**: Already aligned |
| Duration | `duration_ms` | `duration_ms` | **KEEP**: Already aligned |
| Error | `error` | `error` | **KEEP**: Already aligned |
| Decision | `decision` | `decision` | **KEEP**: Already aligned |
| Source | `source` | `source` | **KEEP**: Already aligned |
| Organization | `organization.id` | `organization.id` | **KEEP**: Aligned |
| User UUID | `user.account_uuid` | `user.account_uuid` | **KEEP**: Aligned |
| App version | `app.version` | N/A | **ADD**: Include app version |
| Terminal type | `terminal.type` | N/A | **ADD**: Include type |
| Event name | `event.name` | Event is in log body | **ADD**: Include attr |

### Event Type Mapping

| Anthropic Event | Savvy-Web Equivalent | Notes |
| --------------- | -------------------- | ----- |
| `claude_code.user_prompt` | N/A | Not applicable to hooks |
| `claude_code.tool_result` | `hook_execution` (partial) | Before/after tool |
| `claude_code.api_request` | N/A | Not applicable to hooks |
| `claude_code.api_error` | N/A | Not applicable to hooks |
| `claude_code.tool_decision` | `hook_execution` (partial) | Hook decisions |

### Missing from Savvy-Web

1. `terminal.type` attribute
2. `app.version` attribute (Claude binary version, separate from plugin.version)
3. `event.name` attribute pattern
4. Decision source taxonomy (`config`, `user_permanent`, etc.)

**Key Insight**: The `scope_name` attribute distinguishes event sources:

- `com.anthropic.claude_code.events` - Anthropic's native telemetry
- `systems.savvyweb.claude_code.events` - Our plugin telemetry

This means we can use `claude_code.*` event names without collision.

### Savvy-Web Extensions (Not in Anthropic)

1. `hook.type` - The hook event type (PreToolUse, PostToolUse, etc.)
2. `hook.name` - Custom hook identifier
3. `hook.outcome` - Semantic outcome (see Outcome Model below)
4. `plugin.*` - Plugin-specific attributes
5. `sidecar.*` - Sidecar operational attributes
6. `metrics.*` - Operational metrics (filesScanned, issuesFound, etc.)
7. `context.*` - Hook-specific context
8. `context_tokens` - Token count for additionalContext (context bloat tracking)
9. Validation error events with detailed paths

### Hook Outcome Model

Outcomes are derived from the actual hook JSON return values. They represent
what the hook **decided to do**, not success/failure.

**From Claude Code Hook JSON Output**:

| Hook Type | JSON Fields | Possible Values |
| --------- | ----------- | --------------- |
| PreToolUse | `permissionDecision` | `"allow"`, `"deny"`, `"ask"` |
| PreToolUse | `updatedInput` | Modified tool input object |
| PostToolUse | `additionalContext` | Context string for Claude |
| PostToolUse | `decision` | `"block"` (or omitted) |
| Stop | `decision` | `"block"` (or omitted) |
| SessionStart | `additionalContext` | Context string for Claude |

**Outcome Values** (semantic classification for log filtering):

```typescript
type HookOutcome =
  | "skipped"        // Hook didn't apply (wrong tool, disabled)
  | "allowed"        // PreToolUse: explicitly allowed
  | "denied"         // PreToolUse: explicitly denied
  | "modified"       // Input was modified
  | "blocked"        // PostToolUse/Stop: blocked continuation
  | "context_added"  // Added context for Claude
  | "passthrough"    // Analyzed but took no action
  | "error";         // Hook failed
```

**Mapping from Hook JSON Output**:

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

**Outcome Examples**:

| Scenario | outcome |
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

**Key Distinctions**:

- `skipped`: "Not our concern" (wrong tool type, hook disabled)
- `passthrough`: "We examined it, nothing to do" (lint passed, or defer)

---

## Alignment Plan

### Phase 1: Attribute Renaming (Breaking Change)

Update `constants.ts` to align attribute names with Anthropic:

```typescript
// Before
SESSION_ID: "session_id",
EVENT_TIMESTAMP: "event_timestamp",

// After
SESSION_ID: "session.id",
EVENT_TIMESTAMP: "event.timestamp",
```

**Files to update**:

- `pkgs/bun-hooks/src/otel/constants.ts`
- `pkgs/bun-hooks/src/otel/events.ts`
- `pkgs/bun-hooks/src/otel/metrics.ts`
- `pkgs/bun-hooks/src/otel/instrumentation.ts`

### Phase 2: Add Missing Standard Attributes

Add these to all events:

```typescript
// New standard attributes
APP_VERSION: "app.version",
TERMINAL_TYPE: "terminal.type",
EVENT_NAME: "event.name",
```

### Phase 3: Align Decision Taxonomy

Update `HookOutcome` to include Anthropic's source taxonomy:

```typescript
// Current
type HookOutcome = "skipped" | "allowed" | "denied" | "modified" | ...;

// Add decision source
type DecisionSource = "config" | "user_permanent" | "user_temporary" |
  "hook" | "user_abort" | "user_reject";
```

### Phase 4: Rename Event Types

Rename events to use `claude_code.hook.*` pattern. The `scope_name` attribute
(`systems.savvyweb.claude_code.events` vs `com.anthropic.claude_code.events`)
already distinguishes our events from Anthropic's native telemetry.

| Current | Proposed |
| ------- | -------- |
| `hook_execution` | `claude_code.hook.execution` |
| `schema_validation_error` | `claude_code.hook.validation_error` |
| `env_validation_error` | `claude_code.hook.env_error` |
| `fatal_error` | `claude_code.hook.fatal_error` |

### Phase 5: Metric Namespace Alignment

Update metric names to use `claude_code.hook.*` prefix for consistency:

| Current | Proposed |
| ------- | -------- |
| `claude.hook.count` | `claude_code.hook.count` |
| `claude.hook.duration_ms` | `claude_code.hook.duration_ms` |
| `claude.tool.use.count` | `claude_code.hook.tool_use.count` |

---

## Extended Schema Design

Our final schema extends Anthropic's base while adding plugin-specific
observability.

### Scope Configuration

```typescript
const SCOPE = {
  // Our custom events
  SAVVYWEB_EVENTS: "systems.savvyweb.claude_code.events",
  // Version aligned with plugin version
  VERSION: Bun.env.BUN_HOOKS_PLUGIN_VERSION,
};
```

### Standard Attributes (Anthropic-Aligned)

```typescript
const STANDARD_ATTRS = {
  // Anthropic standard (dot-separated)
  SESSION_ID: "session.id",
  APP_VERSION: "app.version",       // Claude binary version (detected)
  ORGANIZATION_ID: "organization.id",
  USER_ACCOUNT_UUID: "user.account_uuid",
  TERMINAL_TYPE: "terminal.type",

  // Event attributes
  EVENT_NAME: "event.name",
  EVENT_TIMESTAMP: "event.timestamp",

  // Tool attributes (already aligned)
  TOOL_NAME: "tool_name",
  DURATION_MS: "duration_ms",
  ERROR: "error",
  DECISION: "decision",
  SOURCE: "source",
};
```

**Important**: `app.version` is the **Claude Code binary version** (detected
from `claude --version`), NOT the plugin version. This enables:

- Correlating hook behavior with Claude Code releases
- Tracking regressions when Claude updates
- Separating "what Claude version" from "what plugin version"

### Extension Attributes (Savvy-Web Specific)

```typescript
const EXTENSION_ATTRS = {
  // Hook-specific (not in Anthropic)
  HOOK_NAME: "hook.name",
  HOOK_TYPE: "hook.type",
  HOOK_OUTCOME: "hook.outcome",

  // Plugin metadata
  PLUGIN_NAME: "plugin.name",
  PLUGIN_VERSION: "plugin.version",
  PLUGIN_MARKETPLACE: "plugin.marketplace",

  // Operational metrics (namespaced)
  METRICS_PREFIX: "metrics.",
  CONTEXT_PREFIX: "context.",

  // Validation (for debugging)
  VALIDATION_PATH: "validation.path",
  VALIDATION_ISSUE_COUNT: "validation.issue_count",
};
```

### Final Event Schema

#### claude_code.hook.execution

Primary event for hook executions. Scope: `systems.savvyweb.claude_code.events`

| Attribute | Type | Description | Source |
| --------- | ---- | ----------- | ------ |
| `session.id` | string | Session UUID | Anthropic |
| `event.name` | string | `"claude_code.hook.execution"` | Anthropic |
| `event.timestamp` | string | ISO 8601 timestamp | Anthropic |
| `app.version` | string | Claude binary version | Anthropic |
| `organization.id` | string | Org UUID | Anthropic |
| `user.account_uuid` | string | User UUID | Anthropic |
| `terminal.type` | string | Terminal type | Anthropic |
| `tool_name` | string | Tool name (if applicable) | Anthropic |
| `duration_ms` | number | Execution time | Anthropic |
| `source` | string | Always `"hook"` | Anthropic |
| `hook.name` | string | Custom hook name | Extension |
| `hook.type` | string | Hook event type | Extension |
| `hook.outcome` | string | See Outcome Model | Extension |
| `plugin.name` | string | Plugin name | Extension |
| `plugin.version` | string | Plugin version | Extension |
| `plugin.marketplace` | string | Marketplace name (optional) | Extension |
| `context_tokens` | number | Tokens in additionalContext | Extension |
| `metrics.*` | number | Operational metrics | Extension |
| `context.*` | any | Hook-specific context | Extension |

**PreToolUse-specific attributes** (when `hook.type` = "PreToolUse"):

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `permission_decision` | string | `"allow"`, `"deny"`, `"ask"` |
| `decision.source` | string | Decision source (see below) |
| `permission_decision_reason` | string | Reason shown to Claude |
| `has_updated_input` | boolean | Whether input was modified |

**PostToolUse-specific attributes** (when `hook.type` = "PostToolUse"):

| Attribute | Type | Description |
| --------- | ---- | ----------- |
| `has_additional_context` | boolean | Whether context was added |
| `decision` | string | `"block"` if blocked |
| `reason` | string | Block reason |

**Decision Source Values** (for `decision.source` attribute):

| Value | Description |
| ----- | ----------- |
| `config` | Decision from configuration (e.g., allowlist) |
| `user_permanent` | User chose "always allow/deny" |
| `user_temporary` | User chose "allow/deny this time" |
| `hook` | Hook made the decision programmatically |
| `user_abort` | User aborted the operation |
| `user_reject` | User rejected the permission request |

**Version Tracking**:

- `app.version`: Claude Code binary version (e.g., "1.0.30")
- `plugin.version`: Plugin version (e.g., "0.1.0")

This separation allows querying like:

- "Show hook outcomes when Claude upgraded from 1.0.29 to 1.0.30"
- "Which plugins add the most context tokens?"

### Cardinality Control Environment Variables

Align with Anthropic's pattern:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `OTEL_METRICS_INCLUDE_SESSION_ID` | Include session.id | `true` |
| `OTEL_METRICS_INCLUDE_VERSION` | Include app.version | `false` |
| `OTEL_METRICS_INCLUDE_ACCOUNT_UUID` | Include user.account_uuid | `true` |
| `OTEL_METRICS_INCLUDE_PLUGIN_VERSION` | Include plugin.version | `false` |
| `OTEL_PLUGIN_INCLUDE_TOOL_INPUT` | Include tool input | `false` |

---

## Implementation Checklist

### Phase 1: Attribute Alignment

- [x] Update `SESSION_ID` constant from `session_id` to `session.id`
- [x] Update `EVENT_TIMESTAMP` from `event_timestamp` to `event.timestamp`
- [x] Add `event.name` attribute to all events

### Phase 2: Add Missing Attributes

- [x] Add `app.version` - detect Claude binary version (`claude --version`)
- [x] Add `terminal.type` attribute support
- [x] Ensure `plugin.name`, `plugin.version`, `plugin.marketplace` on all

### Phase 3: Naming Consistency

- [x] Rename `hook_name` to `hook.name`
- [x] Rename `hook_type` to `hook.type`
- [x] Update event names to `claude_code.hook.*` pattern
- [x] Update metric names to `claude_code.hook.*` prefix

### Phase 4: Decision Taxonomy

- [x] Add decision source taxonomy (config, user_permanent, hook, etc.)
- [x] Add `DECISION_SOURCE` constant as `decision.source`
- [x] Add `DecisionSource` type to events.ts
- [x] Add `decisionSource` field to `HookExecutionResult` interface

### Phase 5: Testing & Documentation

- [x] Update all test files (2301 tests passing)
- [x] Update CLAUDE.md documentation
- [ ] Update Grafana dashboards/queries (external task)

### Implementation Notes

**Detecting Claude binary version**:

```typescript
// Option 1: Parse from claude --version
const { stdout } = await $`claude --version`.quiet().nothrow();
const version = stdout.toString().match(/\d+\.\d+\.\d+/)?.[0];

// Option 2: Check if Claude exposes version in env
const version = Bun.env.CLAUDE_CODE_VERSION;
```

---

## References

- [Claude Code Monitoring Documentation](https://code.claude.com/docs/en/monitoring-usage)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- [W3C Baggage Specification](https://www.w3.org/TR/baggage/)
