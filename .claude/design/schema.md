# Schema

## Overview

Effect Schema is the single source of truth for all data types in the SDK.
The `Schema.Class` pattern provides a TypeScript type, a runtime schema, and
an `instanceof` check in a single declaration.

## Four-Layer Pipeline

Data flows through four schema layers from Claude Code to response:

```text
stdin JSON -> Input Schema.Class -> Event Schema.Class -> Outcome (or HookOutput) -> Response -> stdout JSON
```

| Layer | Location | Purpose |
| ------- | ---------- | --------- |
 | Input | `schemas/hook-inputs.ts` | Wire format from Claude Code stdin |
| Event | `schemas/hook-events.ts` | Enriched event with `fromInput()` factory |
| Outcome | `outcomes/*.ts` | Typed handler return value (new pattern) |
| HookOutput | `schemas/hook-outputs.ts` | Legacy handler return (discriminated on `status`) |
| Response | `schemas/hook-responses.ts` | Wire format for Claude Code stdout |

Handlers can return either an Outcome class instance (preferred) or a legacy
HookOutput object. `PluginRuntime` handles both paths.

## Input Schema Classes (`hook-inputs.ts`)

Each hook type has an Input class that matches Claude Code's JSON wire format.
All share `HookInputBaseFields`:

```typescript
const HookInputBaseFields = {
  session_id: SessionIdSchema,           // UUID, branded
  transcript_path: Schema.optional(TranscriptPathSchema),
  cwd: Schema.optional(Schema.String),
  permission_mode: Schema.optional(HookPermissionsModeSchema),
  hook_event_name: HookTypeSchema,       // Overridden per class with literal
  agent_id: Schema.optional(Schema.String),
  agent_type: Schema.optional(Schema.String),
};
```

### All 25 Input Classes

| Input Class | Hook-Specific Fields |
| ------------- | -------------------- |
| `PreToolUseInput` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUseInput` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| `PostToolUseFailureInput` | `tool_name`, `tool_input`, `tool_use_id`, `error` |
| `PermissionRequestInput` | `tool_name`, `tool_input`, `permission_suggestions` |
| `NotificationInput` | `message`, `notification_type` |
| `UserPromptSubmitInput` | `prompt` |
| `StopInput` | `stop_hook_active`, `last_assistant_message` |
| `StopFailureInput` | `error_type`, `error_message`, `last_assistant_message` |
| `SubagentStartInput` | _(base fields only)_ |
| `SubagentStopInput` | `stop_hook_active`, `last_assistant_message` |
| `TaskCreatedInput` | `task_id`, `task_name`, `description`, `parent_task_id` |
| `TaskCompletedInput` | `task_id`, `task_name`, `status`, `result`, `error` |
| `TeammateIdleInput` | _(base fields only)_ |
| `InstructionsLoadedInput` | `reason`, `files`, `memory_type`, `paths` |
| `ConfigChangeInput` | `source`, `changed_keys` |
| `CwdChangedInput` | `old_cwd`, `new_cwd` |
| `FileChangedInput` | `file_path`, `event_type` |
| `WorktreeCreateInput` | `worktree_path` |
| `WorktreeRemoveInput` | `worktree_path` |
| `PreCompactInput` | `trigger`, `custom_instructions` |
| `PostCompactInput` | `compacted_tokens`, `remaining_tokens` |
| `ElicitationInput` | `action`, `elicitation_id`, `values`, `schema` |
| `ElicitationResultInput` | `action`, `elicitation_id`, `values` |
| `SessionStartInput` | `source`, `model` |
| `SessionEndInput` | `reason` |

## Event Schema Classes (`hook-events.ts`)

Event classes mirror Input classes but add a `fromInput()` static factory.
The `HookEventSchemas` class provides a unified API with parse methods and
annotation-based metadata (description, capabilities).

```typescript
class PreToolUseEvent extends Schema.Class<PreToolUseEvent>("PreToolUseEvent")({
  ...HookEventBaseSchema.fields,
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
}) {
  static fromInput(input: typeof PreToolUseInput.Type): PreToolUseEvent { ... }
}
```

The discriminated union `HookEventSchema = Schema.Union(PreToolUseEvent, ...)` enables
parsing any hook event. Effect Schema auto-detects the discriminator from the
`hook_event_name` literal fields.

### Schema Metadata

Custom annotations store description and capabilities per event type:

```typescript
const PreToolUseEventAnnotated = PreToolUseEvent.annotations({
  [DescriptionAnnotation]: "Fired after Claude creates tool parameters but before the tool executes.",
  [CapabilitiesAnnotation]: ["allow", "deny", "modify"],
});
```

Retrieved via `HookEventSchemas.getMetadata(schema)` or `getSchemaMetadata(schema)`.

## Outcome Schema Classes (`outcomes/*.ts`)

Outcomes are the preferred return type for hook handlers. Each is a `Schema.Class`
extending the abstract `Outcome` base. See `architecture.md` for full details.

| Outcome | Wire Response | Telemetry Label |
| ------- | ------------- | --------------- |
| `Allow` | `{ permissionDecision: "allow" }` | `"allowed"` |
| `Deny` | `{ permissionDecision: "deny", reason }` | `"denied"` |
| `Ask` | `{ permissionDecision: "ask", message }` | `"asked"` |
| `Modify` | `{ permissionDecision: "allow", updatedInput }` | `"modified"` |
| `Block` | `{ decision: "block", reason }` | `"blocked"` |
| `Continue` | `{}` | `"continued"` |
| `AddContext` | `{ additionalContext }` | `"context_added"` |
| `NoAction` | `{}` | `"no_action"` |
| `Skip` | `{}` | `"skipped"` |

## OtelConfigData Schema

```typescript
class OtelConfigData extends Schema.Class<OtelConfigData>("OtelConfigData")({
  enabled: Schema.Boolean,
  endpoint: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.Literal("http", "grpc")),
  serviceName: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  socketPath: Schema.optional(Schema.String),
  tracesExporter: Schema.optional(Schema.String),
  metricsExporter: Schema.optional(Schema.String),
  logsExporter: Schema.optional(Schema.String),
  resourceAttributes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  deploymentEnv: Schema.optional(Schema.String),
}) {}
```

## Hook Output Schemas (`hook-outputs.ts`) [Legacy]

Hook outputs are the legacy return format, discriminated unions on `status`.
Each hook type has its own output schema constraining valid `action` values.

### Base Fields

```typescript
HookOutputBaseSchema = Schema.Struct({
  status: ExecutionStatusSchema,  // "executed" | "skipped" | "disabled" | "cached" | "error" | "timeout"
  summary: Schema.String,         // Human-readable log message
  action: Schema.optional(HookActionSchema),  // Required when status is "executed"
  validation: Schema.optional(ValidationResultSchema),
  quality: Schema.optional(ExecutionQualitySchema),
  metrics: Schema.optional(HookMetricsSchema),
  userMessage: Schema.optional(Schema.String),
  claudeContext: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  updatedInput: Schema.optional(JsonObjectSchema),
});
```

### Hook-Specific Output Schemas

| Schema | Valid Actions |
| -------- | ------------- |
 | `PreToolUseOutputSchema` | allow, deny, ask, modify |
| `PostToolUseOutputSchema` | block, continue, context, none |
| `SessionStartOutputSchema` | context, none |
| `StopOutputSchema` / `SubagentStopOutputSchema` | block, continue |
| `UserPromptSubmitOutputSchema` | block, continue, context, none |
| `PermissionRequestOutputSchema` | allow, deny |
| `PassthroughOutputSchema` | none (SessionEnd, PreCompact, Notification, etc.) |

### HookAction Values

```typescript
HookActionSchema = Schema.Literal(
  "allow", "deny", "ask",       // Permission decisions
  "block", "continue",          // Continuation control
  "modify", "context",          // Content changes
  "none",                       // No-op
);
```

## Response Schema Classes (`hook-responses.ts`)

Response classes match Claude Code's expected stdout JSON format. Converter
functions translate hook outputs to responses:

| Function | Maps |
| ---------- | ------ |
 | `toPreToolUseResponse()` | `action` -> `permissionDecision` |
| `toPostToolUseResponse()` | `claudeContext` -> `additionalContext`, `action:"block"` -> `decision:"block"` |
| `toSessionStartResponse()` | `claudeContext` -> `additionalContext` |
| `toStopResponse()` | `action:"block"` -> `decision:"block"` |
| `toUserPromptSubmitResponse()` | `claudeContext` -> `additionalContext`, `action:"block"` -> `decision:"block"` |
| `toPermissionRequestResponse()` | `action` -> `behavior` |
| `toPassthroughResponse()` | Always returns `{}` |

Note: When outcomes are used, `toResponse()` is called directly on the
outcome instance, bypassing these converter functions.

## Branded Types (`branded.ts`)

Three branded types ensure type safety for identifiers:

```typescript
const SessionIdSchema = Schema.UUID.pipe(Schema.brand("SessionId"));
type SessionId = Branded<string, "SessionId">;

const ToolUseIdSchema = Schema.String.pipe(Schema.brand("ToolUseId"));
type ToolUseId = Branded<string, "ToolUseId">;

const TranscriptPathSchema = Schema.String.pipe(Schema.brand("TranscriptPath"));
type TranscriptPath = Branded<string, "TranscriptPath">;
```

## Literal Schemas (`hook-literals.ts`)

Shared literal union schemas extracted to prevent circular imports:

- `HookTypeSchema` -- All 25 hook type names (see HookType enum below)
- `HookPermissionsModeSchema` -- `"default" | "plan" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions"`
- `PreToolUseDecisionSchema` -- `"allow" | "deny" | "ask"`
- `PermissionRequestBehaviorSchema` -- `"allow" | "deny"`
- `SessionStartSourceSchema` -- `"startup" | "resume" | "clear" | "compact"`
- `SessionEndReasonSchema` -- `"clear" | "resume" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other"`
- `PreCompactTriggerSchema` -- `"manual" | "auto"`
- `StopFailureErrorSchema` -- `"rate_limit" | "authentication_failed" | "billing_error" | "invalid_request" | "server_error" | "max_output_tokens" | "unknown"`
- `InstructionsLoadedReasonSchema` -- `"session_start" | "nested_traversal" | "path_glob_match" | "include" | "compact"`
- `InstructionsMemoryTypeSchema` -- `"User" | "Project" | "Local" | "Managed"`
- `ConfigChangeSourceSchema` -- `"user_settings" | "project_settings" | "local_settings" | "policy_settings" | "skills"`
- `FileChangeEventSchema` -- `"change" | "add" | "unlink"`
- `NotificationTypeSchema` -- `"permission_prompt" | "idle_prompt" | "auth_success" | "elicitation_dialog"`
- `ElicitationActionSchema` -- `"accept" | "decline" | "cancel"`

### HookType Enum

```typescript
enum HookType {
  PreToolUse, PostToolUse, PostToolUseFailure,
  PermissionRequest, Notification, UserPromptSubmit,
  Stop, StopFailure, SubagentStart, SubagentStop,
  TaskCreated, TaskCompleted, TeammateIdle,
  InstructionsLoaded, ConfigChange, CwdChanged, FileChanged,
  WorktreeCreate, WorktreeRemove,
  PreCompact, PostCompact,
  Elicitation, ElicitationResult,
  SessionStart, SessionEnd,
}
```

### ToolName Type

Known tool names plus extensibility for custom/MCP tools:

```typescript
type ToolName =
  | "Task" | "Bash" | "Glob" | "Grep" | "Read"
  | "Edit" | "Write" | "WebFetch" | "WebSearch"
  | "NotebookEdit" | "TodoRead" | "TodoWrite"
  | (string & {});  // Allow custom/MCP tool names
```

## State as Schema.Class

Plugin state can be declared as a `Schema.Class`, enabling typed serialization
and prototype method preservation across hook invocations.

```typescript
class MyState extends Schema.Class<MyState>("MyState")({
  git: Schema.Boolean,
  packageManager: Schema.Literal("npm", "bun"),
}) {
  getPmExec() { return this.packageManager === "bun" ? "bunx" : "npx"; }
}

// In plugin definition:
Plugin("MY_PLUGIN", {
  options: Schema.Struct({ ... }),
  state: MyState,
  setup: async () => new MyState({ git: true, packageManager: "bun" }),
  hooks: { ... },
});
```

**Encoding/decoding flow:**

1. SessionStart: `setup()` returns a `MyState` instance
2. SDK encodes via `Schema.encodeUnknownSync(MyState)` before persisting
3. Subsequent hooks: SDK decodes via `Schema.decodeUnknownSync(MyState)`
4. Prototype restored via `Object.assign(Object.create(MyState.prototype), decoded, baseState)`
5. Handlers receive a fully typed state with working methods

**Known issue:** Bun's tree-shaker strips prototype methods from compiled
binaries. See `architecture.md` for details.

## Usage in PluginRuntime

`PluginRuntime.run()` uses schemas at each stage:

1. **Parse**: `Schema.decodeUnknownSync(InputSchema)(rawJson)` validates stdin
2. **Convert**: `EventClass.fromInput(decodedInput)` creates typed event
3. **State decode**: If `stateSchema` is set, decode persisted state through it
4. **Handler**: Call plugin handler, receive Outcome or HookOutput
5. **Validate outcome**: If Outcome, `isValidOutcomeForHook()` checks validity
6. **Validate legacy**: If HookOutput, check against hook-specific output schema
7. **Respond**: Outcome's `toResponse()` or legacy `toResponse()` functions
8. **Serialize**: Response is JSON-stringified and written to stdout
