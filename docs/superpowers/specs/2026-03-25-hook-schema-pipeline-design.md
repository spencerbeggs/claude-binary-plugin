# Hook Schema Pipeline Design

## Overview

Consolidate the dual interface+Schema.Class hook type definitions into a
four-layer schema pipeline. Each layer is a Schema.Class, providing both
TypeScript types and runtime validation from a single source of truth.
Transforms between layers are methods on the classes themselves.

## Schema Pipeline

```text
stdin JSON
  -> Schema.decode(PreToolUseInput)           validate wire format
  -> PreToolUseEvent.fromInput(input)         transform to domain
  -> handler({ input: event, ... })           plugin author's code
  -> Schema.decode(PreToolUsePipelineOutput)  validate handler return
  -> output.toResponse()                      transform to wire format
  -> JSON.stringify(response)                 serialize
  -> stdout
```

Every boundary has a schema. Every transform is a method on the class
that owns it.

## Four Schema Layers

| Layer | Direction | Example | Purpose |
| ---- | ---- | ---- | ---- |
| Input | stdin -> decode | `PreToolUseInput` | Wire format from Claude Code |
| Event | decode -> handler | `PreToolUseEvent` | Domain type handler receives |
| Output | handler -> validate | `PreToolUsePipelineOutput` | Domain type handler returns |
| Response | encode -> stdout | `PreToolUseResponse` | Wire format to Claude Code |

## Layer 1: Input Schemas (Wire Format)

New file `src/schemas/hook-inputs.ts`. Define exactly what Claude Code
sends on stdin. These are the protocol contract.

### Shared Base Fields

```typescript
const HookEventBaseFields = {
  session_id: SessionIdSchema,
  transcript_path: Schema.optional(TranscriptPathSchema),
  cwd: Schema.optional(Schema.String),
  permission_mode: Schema.optional(HookPermissionsModeSchema),
  hook_event_name: HookTypeSchema,
};
```

### Per-Hook Input Classes

One Schema.Class per hook type, extending the base fields with
hook-specific fields:

| Input Class | Hook-Specific Fields |
| ---- | ---- |
| `PreToolUseInput` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUseInput` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| `PermissionRequestInput` | `message`, `notification_type` |
| `NotificationInput` | `message`, `notification_type` |
| `UserPromptSubmitInput` | `prompt` |
| `StopInput` | `stop_hook_active` |
| `SubagentStopInput` | `stop_hook_active` |
| `PreCompactInput` | `trigger`, `custom_instructions` |
| `SessionStartInput` | `source` |
| `SessionEndInput` | `reason` |

These replace the TypeScript interfaces currently in
`src/types/hook-events.ts`.

## Layer 2: Event Schemas (Domain Type)

Existing file `src/schemas/hook-events.ts`. These are what handlers
receive. Each Event class gets:

### Static `fromInput()` Method

Constructs an Event from a decoded Input. Today this is an identity
transform (same fields). The method exists as the extension point for
future enrichment. Uses explicit field mapping to establish the pattern
for when schemas diverge:

```typescript
class PreToolUseEvent extends Schema.Class<PreToolUseEvent>(
  "PreToolUseEvent"
)({
  ...HookEventFields,
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
}) {
  static fromInput(
    input: typeof PreToolUseInput.Type
  ): PreToolUseEvent {
    return new PreToolUseEvent({
      session_id: input.session_id,
      transcript_path: input.transcript_path,
      cwd: input.cwd,
      permission_mode: input.permission_mode,
      hook_event_name: input.hook_event_name,
      tool_name: input.tool_name,
      tool_input: input.tool_input,
      tool_use_id: input.tool_use_id,
    });
  }

  get toolInputHash(): string {
    return Bun.hash(JSON.stringify(this.tool_input)).toString(16);
  }
}
```

Note: `Schema.Class` constructors validate on construction, so passing
`input` directly also works while schemas are identical. Explicit field
mapping is the required form once schemas diverge.

### Instance Methods and Computed Properties

Schema.Class supports instance methods and getters. These provide
domain logic on the event object without polluting the schema fields:

- `toolInputHash` — dedup hash for telemetry (PreToolUse, PostToolUse)
- Future: `isDestructive()`, `affectedFiles()`, etc.

Note: `Bun.hash()` returns `number | bigint`. The `.toString(16)` call
works on both types. Verify with `bun run typecheck` during
implementation.

### Shared Field Sets

Both `HookEventBaseFields` (inputs) and `HookEventFields` (events) start
identical but are defined separately. When a field needs reshaping
between wire and domain format, only the event definition changes. The
`fromInput()` static method handles the mapping.

### Future Divergence Examples

These don't happen today but the separation makes them possible:

- Adding computed `toolInputHash` during `fromInput()`
- Normalizing `cwd` to an absolute path
- Enriching `session_id` with registry metadata
- Parsing `tool_input` into typed per-tool sub-schemas

## Layer 3: Output Schemas (Handler Return)

Existing file `src/schemas/pipeline-outputs.ts`. These define what
handlers return. Each output class gets a `toResponse()` instance
method that returns the corresponding per-hook Response Schema.Class.

### `toResponse()` Method

Transforms the handler's ergonomic output into Claude Code's expected
stdout format. This pulls response-building logic out of
`PipelineRuntime` (the `convertTo*ResponseData` methods) and into the
output schemas.

```typescript
class PreToolUsePipelineOutput extends Schema.Class<PreToolUsePipelineOutput>(
  "PreToolUsePipelineOutput"
)({
  status: ExecutionStatusSchema,
  action: Schema.Literal("allow", "deny", "ask", "skip"),
  summary: Schema.String,
  claudeContext: Schema.optional(Schema.String),
  updatedInput: Schema.optional(JsonObjectSchema),
  reason: Schema.optional(Schema.String),
}) {
  toResponse(): PreToolUseResponse {
    let permissionDecision: "allow" | "deny" | "ask" = "allow";
    if (this.action === "deny") permissionDecision = "deny";
    else if (this.action === "ask") permissionDecision = "ask";

    return new PreToolUseResponse({
      permissionDecision,
      reason: this.reason,
      updatedInput: this.updatedInput,
    });
  }
}
```

Each of the 10 output classes gets its own `toResponse()` returning
its corresponding Response class.

## Layer 4: Response Schemas (Per-Hook Wire Format to Claude Code)

New file `src/schemas/hook-responses.ts`. Defines the stdout JSON format
Claude Code expects. **One Response Schema.Class per hook type**, because
each hook type writes a different JSON structure.

### Per-Hook Response Classes

```typescript
class PreToolUseResponse extends Schema.Class<PreToolUseResponse>(
  "PreToolUseResponse"
)({
  permissionDecision: Schema.Literal("allow", "deny", "ask"),
  reason: Schema.optional(Schema.String),
  updatedInput: Schema.optional(JsonObjectSchema),
}) {}

class PostToolUseResponse extends Schema.Class<PostToolUseResponse>(
  "PostToolUseResponse"
)({
  additionalContext: Schema.optional(Schema.String),
  decision: Schema.optional(Schema.Literal("block")),
  reason: Schema.optional(Schema.String),
}) {}

class SessionStartResponse extends Schema.Class<SessionStartResponse>(
  "SessionStartResponse"
)({
  additionalContext: Schema.optional(Schema.String),
}) {}

class StopResponse extends Schema.Class<StopResponse>(
  "StopResponse"
)({
  decision: Schema.optional(Schema.Literal("block")),
  reason: Schema.optional(Schema.String),
}) {}

class UserPromptSubmitResponse extends Schema.Class<UserPromptSubmitResponse>(
  "UserPromptSubmitResponse"
)({
  additionalContext: Schema.optional(Schema.String),
  decision: Schema.optional(Schema.Literal("block")),
  reason: Schema.optional(Schema.String),
}) {}

class PermissionRequestResponse extends Schema.Class<PermissionRequestResponse>(
  "PermissionRequestResponse"
)({
  behavior: Schema.Literal("allow", "deny"),
  message: Schema.optional(Schema.String),
  interrupt: Schema.optional(Schema.Boolean),
  updatedInput: Schema.optional(JsonObjectSchema),
}) {}

class PassthroughResponse extends Schema.Class<PassthroughResponse>(
  "PassthroughResponse"
)({}) {}
```

These match exactly what the current `convertTo*ResponseData` methods
in `PipelineRuntime.ts` produce. No wire protocol changes.

### Response Schema Usage

| Hook Type | Response Class | Notes |
| ---- | ---- | ---- |
| `PreToolUse` | `PreToolUseResponse` | Maps `action` to `permissionDecision` |
| `PostToolUse` | `PostToolUseResponse` | `block` action or `additionalContext` |
| `SessionStart` | `SessionStartResponse` | Optional `additionalContext` |
| `SessionEnd` | `PassthroughResponse` | Empty object |
| `PreCompact` | `PassthroughResponse` | Empty object |
| `Notification` | `PassthroughResponse` | Empty object |
| `Stop` | `StopResponse` | Optional `block` decision |
| `SubagentStop` | `StopResponse` | Shares format with Stop |
| `UserPromptSubmit` | `UserPromptSubmitResponse` | `block` or `additionalContext` |
| `PermissionRequest` | `PermissionRequestResponse` | Maps `action` to `behavior` |

## PipelineRuntime Integration

`PipelineRuntime.run()` simplifies. The `convertToResponse` switch and
all `convertTo*ResponseData` methods are deleted. Replaced by:

```typescript
// Decode stdin
const rawJson = JSON.parse(stdinText);
const input = Schema.decodeUnknownSync(PreToolUseInput)(rawJson);

// Transform to domain event
const event = PreToolUseEvent.fromInput(input);

// Call handler
const rawOutput = yield* handler({ input: event, options, state });

// Validate handler return
const output = Schema.decodeUnknownSync(
  PreToolUsePipelineOutput
)(rawOutput);

// Transform to wire format and write
const response = output.toResponse();
process.stdout.write(JSON.stringify(response));
```

The `hookType` switch statement still exists to select the right
Input/Event/Output schemas per hook type, but the response-building
logic moves to the output classes.

## Existing Public API: HookEventSchemas

`src/schemas/hook-events.ts` contains a `HookEventSchemas` static class
with `parse*()` methods that are public API. After this design:

- These methods continue to parse against Event schemas (Layer 2)
- When Input and Event schemas are identical, this is correct
- If schemas diverge, `HookEventSchemas` should be updated to parse
  via the full pipeline (decode Input, then `fromInput()`)
- This is a future concern, not Phase 1

## Deprecated Schema Aliases

`hook-events.ts` has `@deprecated` re-export aliases
(`PreToolUseEventSchema`, etc.) pointing to Event classes. These
survive all phases unchanged — they point to Event classes (Layer 2),
not Input classes (Layer 1).

## Types That Cannot Be Schema.Class

`IO` (has `stdin`/`stdout`/`stderr` stream fields and `exit` function)
and `HookEventOptions` (has `stateClass` constructor field) contain
non-serializable types. These stay as plain interfaces and move to
`src/plugin/config.ts` where they're consumed.

`ToolName` (string union with `& {}` for extensibility) moves to
`src/schemas/hook-inputs.ts` as a type.

## File Disposition

### New Files

| File | Purpose |
| ---- | ---- |
| `src/schemas/hook-inputs.ts` | 10 Input Schema.Classes (wire from Claude Code) |
| `src/schemas/hook-responses.ts` | 7 Response Schema.Classes (wire to Claude Code) |

### Modified Files

| File | Change |
| ---- | ---- |
| `src/schemas/hook-events.ts` | Add shared field sets, `static fromInput()`, instance methods |
| `src/schemas/pipeline-outputs.ts` | Add `toResponse()` instance methods |
| `src/layers/PipelineRuntime.ts` | Use schema pipeline; delete `convertTo*ResponseData` methods |
| `src/plugin/config.ts` | Import from `hook-inputs.ts`; absorb `IO`, `HookEventOptions` |
| `src/index.ts` | Export new schemas, update re-exports |
| `src/testing/mocks.ts` | Import from schemas instead of types |

### Deleted Files

| File | Reason |
| ---- | ---- |
| `src/types/hook-events.ts` | Fully replaced by schema layers |

### Unchanged Files

| File | Reason |
| ---- | ---- |
| `src/types/common.ts` | Pure utility types from type-fest |
| `src/types/json.ts` | Pure JSON types from type-fest |
| `src/types/pipeline.ts` | TokenMetrics, Pipeline class (separate concern) |
| `src/types/plugin-state.ts` | Validation formatting (separate concern) |
| `src/types/tool-inputs.ts` | Tool input interfaces (separate concern) |

## Implementation Phases

### Phase 1: Input Schemas

Create `src/schemas/hook-inputs.ts` with all 10 Input Schema.Classes
using shared base fields. Move `IO`, `HookEventOptions`, `ToolName` to
their new homes. Update `plugin/config.ts` imports. Delete
`types/hook-events.ts`.

### Phase 2: Event Schema Enrichment

Add `static fromInput()` to each Event Schema.Class. Add instance
methods. Update `PipelineRuntime` to use `decode(Input)` then
`Event.fromInput()`.

### Phase 3: Response Schemas and Output Methods

Create `src/schemas/hook-responses.ts` with 7 per-hook Response
Schema.Classes matching current wire format exactly. Add `toResponse()`
to each pipeline output class. Update `PipelineRuntime` to use
`output.toResponse()` and delete `convertTo*ResponseData` methods.

### Phase 4: Cleanup

Remove dead code. Update design docs. Verify full test suite,
typecheck, build.
