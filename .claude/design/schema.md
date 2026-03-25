# Schema System

## Overview

All validation uses Effect Schema. Zod has been completely removed.

## Four-Layer Schema Pipeline

Hook data flows through four schema layers, each with a specific role:

```text
stdin JSON
  -> Schema.decode(PreToolUseInput)           validate wire format
  -> PreToolUseEvent.fromInput(input)         transform to domain
  -> handler({ input: event, ... })           plugin author's code
  -> Schema.decode(PreToolUsePipelineOutput)  validate handler return
  -> toPreToolUseResponse(output)             transform to wire format
  -> JSON.stringify(response)                 serialize
  -> stdout
```

| Layer | File | Direction | Purpose |
| ----- | ---- | --------- | ------- |
| Input | `hook-inputs.ts` | stdin -> decode | Wire format from Claude Code |
| Event | `hook-events.ts` | decode -> handler | Domain type handler receives |
| Output | `pipeline-outputs.ts` | handler -> validate | Domain type handler returns |
| Response | `hook-responses.ts` | encode -> stdout | Wire format to Claude Code |

## Shared Literal Schemas (`src/schemas/hook-literals.ts`)

Shared literal schemas used by both Input and Event layers:

- `HookTypeSchema` — all 10 hook event names
- `HookPermissionsModeSchema` — permission modes
- `PreCompactTriggerSchema`, `SessionStartSourceSchema`, `SessionEndReasonSchema`
- `PreToolUseDecisionSchema`, `PermissionRequestBehaviorSchema`
- `HookType` enum and `ToolName` type

This file prevents circular imports between `hook-inputs.ts` and
`hook-events.ts`.

## Layer 1: Input Schemas (`src/schemas/hook-inputs.ts`)

10 Input `Schema.Class` types defining the wire format from Claude Code.
These replace the TypeScript interfaces that were in `types/hook-events.ts`.

```typescript
export class PreToolUseInput extends Schema.Class<PreToolUseInput>(
  "PreToolUseInput",
)({
  ...HookInputBaseFields,
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
}) {}
```

## Layer 2: Event Schemas (`src/schemas/hook-events.ts`)

10 Event `Schema.Class` types — the domain types handlers receive.
Each has a `static fromInput()` for decode-to-domain transformation:

```typescript
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>(
  "PreToolUseEvent",
)({
  ...HookEventBaseSchema.fields,
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
}) {
  static fromInput(input: typeof PreToolUseInput.Type): PreToolUseEvent {
    return new PreToolUseEvent({ ...input });
  }
}
```

**Schema.Class gives you:**

- Type inference (use `PreToolUseEvent` as a type)
- Runtime validation (`Schema.decodeUnknownSync(PreToolUseEvent)(data)`)
- `instanceof` checks (`event instanceof PreToolUseEvent`)

**Discriminated union:** `HookEventSchema = Schema.Union(PreToolUseEvent, ...)`
auto-discriminates on `hook_event_name`.

**Metadata:** Custom annotation symbols (`DescriptionAnnotation`,
`CapabilitiesAnnotation`) replace the old Zod registry. Retrieved via
`getSchemaMetadata(schema)`.

**HookEventSchemas facade:** Static class with `.parse(json)` and
per-event parse methods. Preserved for backward compatibility.

## Layer 3: Pipeline Output Schemas (`src/schemas/pipeline-outputs.ts`)

Discriminated unions on `status` field for each hook type:

- `ExecutionStatusSchema` — `"executed" | "skipped" | "disabled" | "cached" | "error" | "timeout"`
- `HookActionSchema` — `"allow" | "deny" | "ask" | "block" | "continue" | "modify" | "context" | "none"`
- Per-hook output schemas (e.g., `PreToolUseOutputSchema`) — union of
  status branches with different allowed fields per branch

**Note:** Output schemas use `Schema.Union(Schema.Struct(...))`, NOT
`Schema.Class`. They cannot have instance methods.

## Layer 4: Response Schemas (`src/schemas/hook-responses.ts`)

7 Response `Schema.Class` types defining the stdout JSON for Claude Code.
One per hook type (some hooks share a response class):

| Hook Type | Response Class |
| --------- | -------------- |
| PreToolUse | `PreToolUseResponse` |
| PostToolUse | `PostToolUseResponse` |
| SessionStart | `SessionStartResponse` |
| Stop, SubagentStop | `StopResponse` |
| UserPromptSubmit | `UserPromptSubmitResponse` |
| PermissionRequest | `PermissionRequestResponse` |
| SessionEnd, PreCompact, Notification | `PassthroughResponse` |

Standalone `toResponse()` functions convert pipeline outputs to responses:

```typescript
export function toPreToolUseResponse(
  output: PreToolUsePipelineOutput,
): PreToolUseResponse { ... }
```

These replace the `convertTo*ResponseData` methods that were in
`PipelineRuntime.ts`.

## Branded Types (`src/schemas/branded.ts`)

Nominal types using `Schema.brand()`:

```typescript
export const SessionIdSchema = Schema.UUID.pipe(Schema.brand("SessionId"));
export type SessionId = Branded<string, "SessionId">;
```

Types: `SessionId`, `ToolUseId`, `HookName`, `TranscriptPath`

## JSON Schemas (`src/schemas/json.ts`)

Recursive JSON validation using `Schema.suspend()`:

```typescript
const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(JsonPrimitiveSchema, Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }))
);
```

## Plugin Options

Plugin authors define options with Effect Schema:

```typescript
const Options = Schema.Struct({
  API_KEY: Schema.String,
  MAX_RETRIES: Schema.optionalWith(Schema.Number, { default: () => 3 }),
});
```

Type inference flows through `ClaudeBinaryPlugin.create()` generics via
`Schema.Schema.Type<TOptionsSchema>`.
