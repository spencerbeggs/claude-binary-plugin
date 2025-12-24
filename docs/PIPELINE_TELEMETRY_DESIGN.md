# Pipeline Telemetry Design

> RFC for structured hook outputs and auto-instrumented OTEL metrics

## Overview

This document describes a design for improving observability in the Claude Code plugin pipeline system. The goal is to provide detailed telemetry that helps developers understand how their hooks are executing, what actions they're taking, and how they're consuming the context budget.

## Problem Statement

Current challenges with plugin development:

1. **Unclear hook behavior** - Difficult to understand why hooks are resolving the way they are
2. **Implicit outcomes** - The "outcome" of a hook is derived heuristically, not explicitly declared
3. **Mixed audiences** - No clear separation between log messages, user messages, and Claude context
4. **Limited metrics** - Token usage and validation results are not systematically tracked
5. **Manual instrumentation** - Developers must manually add telemetry, leading to inconsistency

## Design Goals

1. **Explicit outcomes** - Every pipeline hook must declare its result explicitly
2. **Audience separation** - Clear distinction between logs, user-facing, and Claude-facing messages
3. **Auto-instrumentation** - Capture as much telemetry as possible without developer effort
4. **Type enforcement** - Use TypeScript and Zod to ensure completeness at compile time
5. **Query-friendly** - Structure data for easy aggregation and alerting in Grafana/Loki

## Three Audiences Model

Hook outputs serve three distinct audiences with different needs:

```text
┌─────────────────────────────────────────────────────────────────┐
│ LOGS (Telemetry)                                                │
│ ─────────────────                                               │
│ Audience: Developers debugging/monitoring                       │
│ Content:  Concise, machine-parseable                            │
│ Examples: "3 type errors", "skipped: tool not in filter"        │
│ Fields:   status, action, validation, summary                   │
├─────────────────────────────────────────────────────────────────┤
│ USER (Terminal)                                                 │
│ ─────────────────                                               │
│ Audience: Human using Claude Code                               │
│ Content:  Brief, actionable                                     │
│ Examples: "There are syntax errors I need to fix..."            │
│ Fields:   userMessage (-> systemMessage, stopReason)            │
├─────────────────────────────────────────────────────────────────┤
│ CLAUDE (Context)                                                │
│ ─────────────────                                               │
│ Audience: The LLM                                               │
│ Content:  Detailed, instructive                                 │
│ Examples: Full error output with line numbers and fix guidance  │
│ Fields:   claudeContext (-> additionalContext), reason          │
└─────────────────────────────────────────────────────────────────┘
```

## Compound Hook Result Structure

### Execution Status

Indicates whether the hook ran and how:

```typescript
type ExecutionStatus =
  | "executed"      // Hook ran normally
  | "skipped"       // Didn't need to run (filter, not applicable)
  | "disabled"      // Couldn't run (preconditions failed)
  | "cached"        // Used cached result from previous run
  | "error"         // Unexpected failure (exception thrown)
  | "timeout";      // Exceeded time limit
```

### Hook Action

What the hook decided to do (only present when status is "executed"):

```typescript
type HookAction =
  // Permission decisions (PreToolUse, PermissionRequest)
  | "allow"         // Permitted the action
  | "deny"          // Rejected the action
  | "ask"           // Deferred to user for decision

  // Continuation control (Stop, SubagentStop, PostToolUse)
  | "block"         // Prevented continuation
  | "continue"      // Allowed continuation

  // Content changes
  | "modify"        // Changed input or output
  | "context"       // Added context for Claude

  // No-op
  | "none";         // Analyzed but took no action
```

### Validation Result

For hooks that perform linting/checking (optional):

```typescript
type ValidationResult =
  | "passed"        // All checks passed
  | "fixed"         // Found issues, auto-fixed them
  | "failed"        // Found unfixable issues
  | "warning";      // Passed but with warnings
```

### Execution Quality

Indicates degraded or partial execution:

```typescript
interface ExecutionQuality {
  degraded?: boolean;           // Ran with reduced functionality
  degradedReason?: string;      // Why (e.g., "shellcheck unavailable")
  partial?: boolean;            // Only partially completed
  fallback?: boolean;           // Used fallback behavior
  cached?: boolean;             // Result was from cache
}
```

### Complete Pipeline Output

```typescript
interface PipelineOutputBase {
  // ─────────────────────────────────────────────────────────────
  // REQUIRED: Telemetry
  // ─────────────────────────────────────────────────────────────

  /** Execution status - did the hook run? */
  status: ExecutionStatus;

  /** Human-readable summary for logs (auto-generated if not provided) */
  summary: string;

  // ─────────────────────────────────────────────────────────────
  // CONDITIONAL: Based on status
  // ─────────────────────────────────────────────────────────────

  /** What action was taken (required when status is "executed") */
  action?: HookAction;

  /** Validation result (optional, for linting/checking hooks) */
  validation?: ValidationResult;

  /** Quality indicators */
  quality?: ExecutionQuality;

  /** User-provided metrics for telemetry */
  metrics?: PipelineMetrics;

  // ─────────────────────────────────────────────────────────────
  // OPTIONAL: User-facing messages
  // ─────────────────────────────────────────────────────────────

  /** Message shown to user in terminal (-> systemMessage) */
  userMessage?: string;

  // ─────────────────────────────────────────────────────────────
  // OPTIONAL: Claude-facing content
  // ─────────────────────────────────────────────────────────────

  /** Detailed context/instructions for Claude (-> additionalContext) */
  claudeContext?: string;

  /** Concise reason shown to Claude (-> permissionDecisionReason, block reason) */
  reason?: string;
}
```

## Hook-Specific Output Types

### PreToolUse

```typescript
type PreToolUseOutput = PipelineOutputBase & (
  | {
      status: "executed";
      action: "allow";
      updatedInput?: Record<string, unknown>;
    }
  | {
      status: "executed";
      action: "deny";
      reason: string;  // Required for deny
    }
  | {
      status: "executed";
      action: "ask";
    }
  | {
      status: "executed";
      action: "modify";
      updatedInput: Record<string, unknown>;  // Required for modify
    }
  | {
      status: "skipped" | "disabled" | "cached";
      reason?: string;
    }
  | {
      status: "error" | "timeout";
      reason: string;  // Required for errors
    }
);
```

### PostToolUse

```typescript
type PostToolUseOutput = PipelineOutputBase & (
  | {
      status: "executed";
      action: "continue" | "context" | "none";
      validation?: ValidationResult;
    }
  | {
      status: "executed";
      action: "block";
      reason: string;  // Required for block
      validation?: "failed";
    }
  | {
      status: "skipped" | "disabled" | "cached";
    }
  | {
      status: "error" | "timeout";
      reason: string;
    }
);
```

### SessionStart

```typescript
type SessionStartOutput = PipelineOutputBase & (
  | {
      status: "executed";
      action: "context" | "none";
    }
  | {
      status: "disabled" | "error";
      reason?: string;
    }
);
```

### Stop / SubagentStop

```typescript
type StopOutput = PipelineOutputBase & (
  | {
      status: "executed";
      action: "block";
      reason: string;  // Why Claude should keep working
    }
  | {
      status: "executed";
      action: "continue";  // Allow stopping
    }
  | {
      status: "skipped" | "disabled";
    }
);
```

## Auto-Instrumented Metrics

The pipeline runtime automatically captures these metrics without developer effort.

### Always Available

| Metric             | Source | Description                       |
| ------------------ | ------ | --------------------------------- |
| `hook.duration_ms` | Timer  | Execution time in milliseconds    |
| `hook.name`        | Config | Hook identifier                   |
| `hook.type`        | Event  | SessionStart, PreToolUse, etc.    |
| `hook.status`      | Output | executed, skipped, disabled, etc. |
| `hook.action`      | Output | allow, deny, block, etc.          |
| `hook.summary`     | Output | Human-readable summary            |
| `plugin.name`      | Config | Plugin identifier                 |
| `session.id`       | Event  | Session UUID                      |

### Tool-Specific (PreToolUse/PostToolUse)

| Metric                  | Source   | Description                         |
| ----------------------- | -------- | ----------------------------------- |
| `tool.name`             | Event    | Tool being used (Bash, Write, etc.) |
| `tool.use_id`           | Event    | Unique ID for this tool invocation  |
| `tool.input_size_bytes` | Computed | Size of tool input JSON             |
| `tool.input_key_count`  | Computed | Number of keys in tool input        |

### File Operations

| Metric                    | Source                 | Description                     |
| ------------------------- | ---------------------- | ------------------------------- |
| `file.path`               | `tool_input.file_path` | File being operated on          |
| `file.extension`          | Computed               | File extension (.ts, .py, etc.) |
| `file.content_size_bytes` | `tool_input.content`   | Size of file content            |

### Bash Commands

| Metric                | Source                         | Description               |
| --------------------- | ------------------------------ | ------------------------- |
| `bash.command_prefix` | Computed                       | First word of command     |
| `bash.is_background`  | `tool_input.run_in_background` | Background execution flag |
| `bash.timeout_ms`     | `tool_input.timeout`           | Configured timeout        |

### Response Metrics

| Metric                        | Source | Description                   |
| ----------------------------- | ------ | ----------------------------- |
| `response.has_claude_context` | Output | Whether claudeContext was set |
| `response.has_user_message`   | Output | Whether userMessage was set   |
| `response.input_modified`     | Output | Whether input was modified    |

### Validation Metrics

| Metric                     | Source      | Description                    |
| -------------------------- | ----------- | ------------------------------ |
| `validation.result`        | Output      | passed, fixed, failed, warning |
| `validation.issues_found`  | User metric | Number of issues detected      |
| `validation.issues_fixed`  | User metric | Number of issues auto-fixed    |
| `validation.files_scanned` | User metric | Number of files checked        |

### Quality Metrics

| Metric                    | Source | Description                    |
| ------------------------- | ------ | ------------------------------ |
| `quality.degraded`        | Output | Whether execution was degraded |
| `quality.degraded_reason` | Output | Why execution was degraded     |
| `quality.partial`         | Output | Whether execution was partial  |
| `quality.fallback`        | Output | Whether fallback was used      |
| `quality.cached`          | Output | Whether result was cached      |

## Token Usage Metrics

Token tracking helps understand context budget consumption.

### Per-Hook Token Metrics

| Metric                  | Source   | Description                       |
| ----------------------- | -------- | --------------------------------- |
| `tokens.claude_context` | Output   | Tokens in claudeContext           |
| `tokens.user_message`   | Output   | Tokens in userMessage             |
| `tokens.reason`         | Output   | Tokens in reason                  |
| `tokens.hook_total`     | Computed | Sum of above                      |
| `tokens.tool_input`     | Event    | Estimated tokens in tool input    |
| `tokens.tool_response`  | Event    | Estimated tokens in tool response |
| `tokens.file_content`   | Event    | Estimated tokens in file content  |

### Token Estimation

```typescript
function estimateTokenCount(text: string, contentType?: ContentType): number {
  if (!text) return 0;

  // Adjust chars-per-token ratio by content type
  switch (contentType) {
    case "code":
      return Math.ceil(text.length / 3.5);  // More symbols
    case "json":
      return Math.ceil(text.length / 3);    // Lots of punctuation
    case "markdown":
    case "prose":
    default:
      return Math.ceil(text.length / 4);    // Standard estimate
  }
}

function detectContentType(input: { file_path?: string; content?: string }): ContentType {
  if (input.file_path) {
    const ext = extname(input.file_path);
    if ([".ts", ".js", ".py", ".go", ".rs", ".java"].includes(ext)) return "code";
    if ([".json", ".jsonc"].includes(ext)) return "json";
    if ([".md", ".mdx"].includes(ext)) return "markdown";
  }
  if (input.content?.trimStart().match(/^[\[{]/)) return "json";
  return "prose";
}
```

### Session-Level Token Tracking

Aggregated at SessionEnd:

| Metric                                  | Description                          |
| --------------------------------------- | ------------------------------------ |
| `session.tokens.total_context_added`    | Cumulative tokens added by all hooks |
| `session.tokens.largest_single_context` | Largest single context injection     |
| `session.tokens.largest_context_hook`   | Which hook added the most            |
| `session.tokens.by_type.*`              | Breakdown by hook type               |

### Token Budget Awareness

Optional budget tracking for context window management:

```typescript
interface TokenBudget {
  contextWindow: number;      // e.g., 200000
  warningThreshold: number;   // e.g., 0.8 (80%)
  criticalThreshold: number;  // e.g., 0.95 (95%)
}

// Emitted metrics
{
  "tokens.budget_usage_percent": 45.2,
  "tokens.budget_level": "ok" | "warning" | "critical",
}
```

## User-Provided Metrics Interface

For domain-specific metrics that require hook knowledge:

```typescript
interface PipelineMetrics {
  // Validation metrics
  issuesFound?: number;
  issuesFixed?: number;
  filesScanned?: number;
  filesWithErrors?: number;

  // Performance metrics
  cacheHit?: boolean;

  // Custom metrics (extensible)
  [key: string]: number | boolean | string | undefined;
}
```

## Examples

### Example 1: Git Check - Git Not Installed

```typescript
return {
  status: "disabled",
  summary: "git not available",

  userMessage: "Git is not installed on this system.",

  claudeContext: `Git is not installed. Help the user install git:
    - macOS: brew install git
    - Ubuntu: apt-get install git

    Until git is installed, git-related commands will fail.`,
};
```

**OTEL Attributes:**

```text
hook.status = "disabled"
hook.summary = "git not available"
tokens.claude_context = 52
tokens.user_message = 10
response.has_claude_context = true
response.has_user_message = true
```

### Example 2: Linting - Found and Fixed Issues

```typescript
return {
  status: "executed",
  action: "modify",
  validation: "fixed",
  summary: "fixed 3 formatting issues",

  metrics: {
    issuesFound: 5,
    issuesFixed: 3,
    filesScanned: 1,
  },

  claudeContext: `Auto-fixed 3 formatting issues in src/index.ts:
    - Line 12: Added missing semicolon
    - Line 24: Fixed indentation
    - Line 31: Removed trailing whitespace

    2 issues remain that require manual fixes.`,
};
```

**OTEL Attributes:**

```text
hook.status = "executed"
hook.action = "modify"
hook.summary = "fixed 3 formatting issues"
validation.result = "fixed"
validation.issues_found = 5
validation.issues_fixed = 3
validation.files_scanned = 1
tokens.claude_context = 68
```

### Example 3: Linting - Unfixable Type Errors

```typescript
return {
  status: "executed",
  action: "block",
  validation: "failed",
  summary: "3 type errors",

  metrics: {
    issuesFound: 3,
    filesWithErrors: 2,
  },

  userMessage: "There are type errors I need to fix before continuing...",

  claudeContext: `Found 3 TypeScript errors that must be fixed:

1. src/foo.ts:12:5 - error TS2339
   Property 'bar' does not exist on type 'Foo'

2. src/foo.ts:24:10 - error TS2322
   Type 'string' is not assignable to type 'number'

3. src/baz.ts:5:1 - error TS2307
   Cannot find module './missing'

Run \`bun run typecheck\` to verify fixes.`,

  reason: "Fix type errors before continuing",
};
```

**OTEL Attributes:**

```text
hook.status = "executed"
hook.action = "block"
hook.summary = "3 type errors"
validation.result = "failed"
validation.issues_found = 3
validation.files_with_errors = 2
tokens.claude_context = 156
tokens.user_message = 14
tokens.reason = 8
response.has_claude_context = true
response.has_user_message = true
```

### Example 4: Degraded Execution

```typescript
return {
  status: "executed",
  action: "continue",
  validation: "passed",
  summary: "validated (shellcheck unavailable)",

  quality: {
    degraded: true,
    degradedReason: "shellcheck not installed",
    partial: true,
  },

  claudeContext: `Shell script validation was skipped because shellcheck
    is not installed. Consider installing it for comprehensive shell linting.`,
};
```

**OTEL Attributes:**

```text
hook.status = "executed"
hook.action = "continue"
validation.result = "passed"
quality.degraded = true
quality.degraded_reason = "shellcheck not installed"
quality.partial = true
```

### Example 5: Security Block

```typescript
return {
  status: "executed",
  action: "deny",
  summary: "denied: rm -rf /",

  reason: "Destructive command blocked",

  claudeContext: `This command was blocked because it would delete the entire
    filesystem. If you need to remove files, use a more targeted path.`,

  userMessage: "⚠️ Blocked potentially destructive command",
};
```

## Query Examples

### Execution Status Breakdown

```logql
{service_name="claude-code"}
  | json
  | count by (hook_status)
```

### What's Causing Hooks to be Disabled?

```logql
{hook_status="disabled"}
  | json
  | count by (hook_name, hook_summary)
```

### Validation Effectiveness by Hook

```logql
{validation_result=~".+"}
  | json
  | count by (hook_name, validation_result)
```

### Token Usage by Hook

```logql
sum by (hook_name) (tokens_hook_total)
```

### Degraded Executions

```logql
{quality_degraded="true"}
  | json
  | count by (hook_name, quality_degraded_reason)
```

### Large Tool Responses

```logql
{tokens_tool_response > 5000}
  | count by (tool_name)
```

### Session Token Budget Alerts

```logql
{tokens_budget_level="critical"}
```

### Average Duration by File Extension

```logql
avg by (file_extension) (hook_duration_ms)
```

## Implementation Plan

### Phase 1: Type Definitions

1. Define `ExecutionStatus`, `HookAction`, `ValidationResult`, `ExecutionQuality` types
2. Create `PipelineOutputBase` interface
3. Create hook-specific output types with discriminated unions
4. Update Zod schemas to match

### Phase 2: Pipeline Runtime Updates

1. Update `runPipeline()` to extract auto-metrics
2. Add token estimation utilities
3. Map new output fields to response builder methods
4. Emit OTEL attributes for all metrics

### Phase 3: Session-Level Tracking

1. Add session token state management
2. Emit aggregated metrics at SessionEnd
3. Implement optional token budget tracking

### Phase 4: Migration

1. Update existing pipeline hooks to use new output format
2. Add deprecation warnings for old format
3. Update documentation and examples

## Backward Compatibility

The raw handler API (`Pipeline["PreToolUseRaw"]`) remains unchanged for users who prefer full control. The strict pipeline outputs only apply to the declarative `Pipeline["PreToolUse"]` handlers.

## Open Questions

1. **Cardinality concerns** - Should we limit high-cardinality attributes like `file.path`?
2. **Token estimation accuracy** - Is the 4-chars-per-token heuristic sufficient?
3. **Budget configuration** - Where should token budgets be configured (plugin, global)?
4. **Caching semantics** - How should cached results affect metrics?

## References

- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Grafana Loki LogQL](https://grafana.com/docs/loki/latest/query/)
