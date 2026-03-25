# Schema

## Overview

Effect Schema is the single source of truth for all data types in the SDK.
The `Schema.Class` pattern provides a TypeScript type, a runtime schema, and
an `instanceof` check in a single declaration.

## Four-Layer Pipeline

Data flows through four schema layers from Claude Code to response:

```text
stdin JSON -> Input Schema.Class -> Event Schema.Class -> PipelineOutput -> Response Schema.Class -> stdout JSON
```

| Layer | Location | Purpose |
| ------- | ---------- | --------- |
 | Input | `schemas/hook-inputs.ts` | Wire format from Claude Code stdin |
| Event | `schemas/hook-events.ts` | Enriched event with `fromInput()` factory |
| PipelineOutput | `schemas/pipeline-outputs.ts` | Handler return value (discriminated on `status`) |
| Response | `schemas/hook-responses.ts` | Wire format for Claude Code stdout |

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
};
```

Input classes: `PreToolUseInput`, `PostToolUseInput`, `SessionStartInput`,
`SessionEndInput`, `StopInput`, `SubagentStopInput`, `UserPromptSubmitInput`,
`PreCompactInput`, `NotificationInput`, `PermissionRequestInput`.

Hook-specific fields:

| Input Class | Extra Fields |
| ------------- | ------------- |
 | PreToolUseInput | `tool_name`, `tool_input`, `tool_use_id` |
| PostToolUseInput | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| SessionStartInput | `source` |
| SessionEndInput | `reason` |
| StopInput | `stop_hook_active` |
| SubagentStopInput | `stop_hook_active` |
| UserPromptSubmitInput | `prompt` |
| PreCompactInput | `trigger`, `custom_instructions` |
| NotificationInput | `message`, `notification_type` |
| PermissionRequestInput | `message`, `notification_type` |

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

## Pipeline Output Schemas (`pipeline-outputs.ts`)

Pipeline outputs are discriminated unions on `status`. Each hook type has its
own output schema constraining valid `action` values.

### Base Fields

```typescript
PipelineOutputBaseSchema = Schema.Struct({
  status: ExecutionStatusSchema,  // "executed" | "skipped" | "disabled" | "cached" | "error" | "timeout"
  summary: Schema.String,         // Human-readable log message
  action: Schema.optional(HookActionSchema),  // Required when status is "executed"
  validation: Schema.optional(ValidationResultSchema),
  quality: Schema.optional(ExecutionQualitySchema),
  metrics: Schema.optional(PipelineMetricsSchema),
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
| `PassthroughOutputSchema` | none (SessionEnd, PreCompact, Notification) |

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
functions translate pipeline outputs to responses:

| Function | Maps |
| ---------- | ------ |
 | `toPreToolUseResponse()` | `action` -> `permissionDecision` |
| `toPostToolUseResponse()` | `claudeContext` -> `additionalContext`, `action:"block"` -> `decision:"block"` |
| `toSessionStartResponse()` | `claudeContext` -> `additionalContext` |
| `toStopResponse()` | `action:"block"` -> `decision:"block"` |
| `toUserPromptSubmitResponse()` | `claudeContext` -> `additionalContext`, `action:"block"` -> `decision:"block"` |
| `toPermissionRequestResponse()` | `action` -> `behavior` |
| `toPassthroughResponse()` | Always returns `{}` |

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

- `HookTypeSchema` -- All 10 hook type names
- `HookPermissionsModeSchema` -- `"default" | "plan" | "acceptEdits" | "bypassPermissions"`
- `PreToolUseDecisionSchema` -- `"allow" | "deny" | "ask"`
- `SessionStartSourceSchema` -- `"startup" | "resume" | "clear" | "compact"`
- `SessionEndReasonSchema` -- `"clear" | "logout" | "prompt_input_exit" | "other"`
- `PreCompactTriggerSchema` -- compact trigger types

## Usage in PipelineRuntime

`PipelineRuntime.run()` uses schemas at each stage:

1. **Parse**: `Schema.decodeUnknownSync(InputSchema)(rawJson)` validates stdin
2. **Convert**: `EventClass.fromInput(decodedInput)` creates typed event
3. **Validate**: Pipeline output checked against hook-specific output schema
4. **Respond**: `toResponse()` functions convert output to response class
5. **Serialize**: Response is JSON-stringified and written to stdout
