# Hooks Refactor — Design Spec

**Date:** 2026-04-01
**Status:** Approved design
**Context:** [2026-04-01-hooks-refactor-context.md](./2026-04-01-hooks-refactor-context.md)

## Summary

Refactor the hook system from monolithic schema files into per-hook-type modules
in `src/hooks/`. Each of the 26 hook types gets its own file co-locating input
schema, event class, output schema, response schema, handler type, hook definition
type, and outcome union. Add typed handler support for all 26 hooks (up from 10),
add the missing PermissionDenied hook, introduce two new outcome classes (Retry,
WatchPaths), and decompose `config.ts` into focused files.

## Design Decisions

### 1. One file per hook type

Each hook gets its own file: `src/hooks/{HookType}.ts` (26 files total). Maximum
co-location — everything about a hook lives in one place. No grouping by behavior
category.

### 2. No barrel exports

Follows existing project convention. No `src/hooks/index.ts`. Each hook file
exports its pieces directly. The two public entry points (`src/index.ts`,
`src/testing.ts`) re-export what's public. Internal code imports directly from
hook files.

### 3. Outcome unions owned by hook files

Each hook file defines its own outcome union type (e.g.,
`type PreToolUseOutcome = Allow | Deny | Ask | Modify | Skip`). The composed
`HookOutcomeMap` in `src/hooks/types.ts` imports and aggregates these unions.
Runtime validation (`isValidOutcomeForHook`) derives from per-hook `VALID_OUTCOME_TAGS`
sets.

### 4. Explicit registry for runtime dispatch

A registry module in `src/hooks/types.ts` collects schemas from all 26 hook files
into a lookup map keyed by hook type string. Explicit imports — no dynamic loading.
The runtime `getHookSchemas()` becomes a simple map get.

### 5. config.ts decomposition

Split `src/plugin/config.ts` (~1270 lines) into five focused files:

| File | Contents |
|------|----------|
| `config.ts` | `PluginConfig` base class, `ClaudePlugin` orchestrator |
| `handler.ts` | `PluginHandler`, `HandlerContext`, `PluginState`, `HookDefinition`, `HandlerHookDefinition`, `HookDefinitionBase`, `ToolFilter`, `PassthroughHookEntry`, `IO`, `HookEventOptions` |
| `commands.ts` | `CommandDefinition`, `CommandInlineDefinition`, `CommandDefinitionBase`, `CommandHandler`, `CommandHandlerFn`, `CommandOutput`, `CmdContext`, `CommandsMap` |
| `infer.ts` | `ExtractOptionsSchema`, `ExtractStateSchema`, `ExtractSetup`, `ExtractCommands`, `InferPluginOptions`, `InferPluginState`, `InferPluginCommands`, `ExtractSetupReturn` |
| `state.ts` | `BaseState`, `SetupContext`, `SetupFunction` |

### 6. Duplication over extension for Schema.Class fields

Each hook file defines its Input and Event as standalone `Schema.Class` declarations
with all fields written out explicitly. No spreading from a shared base fields
object. Base fields like `session_id`, `transcript_path`, `cwd` are duplicated
across files. This makes each file fully self-contained and avoids inheritance
complexity.

### 7. Input vs Event distinction sharpened with @effect/platform Path

Both Input and Event classes are kept, with a clear role distinction:

- **Input**: mirrors wire format exactly. Raw `Schema.String` for all paths. Used
  only for decoding stdin JSON.
- **Event**: developer-facing domain model. Path fields (`transcript_path`, `cwd`,
  `old_cwd`, `new_cwd`, etc.) are `@effect/platform` Path instances. This is what
  handlers receive.
- **`fromInput()`**: converts Input to Event, parsing string paths into Path
  instances. This is where cross-platform path safety happens.

Improves testability — test factories construct Events directly with Path instances
rather than round-tripping through raw JSON.

### 8. PermissionDenied modeled with new Retry outcome

New `Retry` outcome class for the PermissionDenied hook. Wire format:
`{ hookSpecificOutput: { retry: true } }`. PermissionDenied outcome union:
`Retry | NoAction`.

### 9. Passthrough hooks keep NoAction return type

Hooks with no decision control return `NoAction`, not `void`. Uniform return type
means no special-case pipeline handling, and `NoAction` carries `toResponse()` and
`toTelemetry()` for observability.

### 10. Implicit NoAction for missing handler returns

Any handler that returns `undefined`/`void` (no explicit return) gets an automatic
implicit `NoAction`. Modeled via `NoAction.implicit()` static factory that sets an
`implicit: true` field. OTEL telemetry distinguishes:

- Explicit: `{ outcome: "noAction", implicit: false }`
- Implicit: `{ outcome: "noAction", implicit: true }`

Applies to all handlers, not just passthrough hooks. Helps developers debug missed
code paths via OTEL.

### 11. WatchPaths outcome for CwdChanged/FileChanged

New `WatchPaths` outcome class carrying a `paths: string[]` array. Wire format:
`{ watchPaths: [...] }`. CwdChanged and FileChanged outcome union:
`WatchPaths | NoAction`.

## Per-Hook File Structure

Each file in `src/hooks/{HookType}.ts` exports:

```typescript
// Input Schema — raw wire format from stdin
export class {HookType}Input extends Schema.Class<...>({
  // All fields explicit, no spreading from shared base
  session_id: SessionIdSchema,
  transcript_path: Schema.optional(TranscriptPathSchema),
  cwd: Schema.optional(Schema.String),
  permission_mode: Schema.optional(HookPermissionsModeSchema),
  hook_event_name: Schema.Literal("{HookType}"),
  agent_id: Schema.optional(Schema.String),
  agent_type: Schema.optional(Schema.String),
  // ... hook-specific fields
}) {}

// Event Class — domain model with Path instances
export class {HookType}Event extends Schema.Class<...>({
  // Path fields use @effect/platform Path
  // hook_event_name narrowed to literal
  // ... hook-specific fields
}) {
  static fromInput(input: {HookType}Input): {HookType}Event { ... }
}

// Outcome Union
export type {HookType}Outcome = ...;

// Valid outcome tags for runtime validation
export const VALID_OUTCOME_TAGS = new Set([...]);

// Output Schema
export const {HookType}OutputSchema = Schema.Union(...);
export type {HookType}Output = typeof {HookType}OutputSchema.Type;

// Response Schema
export const {HookType}ResponseSchema = Schema.Struct({ ... });
export type {HookType}Response = typeof {HookType}ResponseSchema.Type;

// Handler Type
export type {HookType}Handler<TOptions, TState> = PluginHandler<
  {HookType}Input, {HookType}Output, TOptions, TState, {HookType}Outcome
>;

// Hook Definition Type
// PreToolUse and PostToolUse add `& ToolFilter` for tool name filtering
export type {HookType}HookDefinition<TOptions, TState> = HookDefinition<
  {HookType}Input, {HookType}Output, unknown, TOptions, TState, {HookType}Outcome
>;
```

## All 26 Hook Files

| File | Outcome Union | Status |
|------|--------------|--------|
| `PreToolUse.ts` | `Allow \| Deny \| Ask \| Modify \| Skip` | Existing, move |
| `PostToolUse.ts` | `Block \| Continue \| AddContext \| NoAction \| Skip` | Existing, move |
| `PostToolUseFailure.ts` | `Block \| Continue \| AddContext \| NoAction \| Skip` | New handler |
| `PermissionRequest.ts` | `Allow \| Deny` | Existing, move |
| `PermissionDenied.ts` | `Retry \| NoAction` | Fully new |
| `SessionStart.ts` | `AddContext \| NoAction` | Existing, move |
| `SessionEnd.ts` | `NoAction` | Existing, move |
| `Stop.ts` | `Block \| Continue \| Skip` | Existing, move |
| `StopFailure.ts` | `NoAction` | New handler |
| `SubagentStart.ts` | `NoAction` | New handler |
| `SubagentStop.ts` | `Block \| Continue \| Skip` | Existing, move |
| `UserPromptSubmit.ts` | `Block \| Continue \| AddContext \| NoAction \| Skip` | Existing, move |
| `PreCompact.ts` | `NoAction` | Existing, move |
| `PostCompact.ts` | `NoAction` | New handler |
| `Notification.ts` | `NoAction` | Existing, move |
| `TaskCreated.ts` | `Block \| Continue \| Skip` | New handler |
| `TaskCompleted.ts` | `Block \| Continue \| Skip` | New handler |
| `TeammateIdle.ts` | `Block \| Continue \| Skip` | New handler |
| `InstructionsLoaded.ts` | `NoAction` | New handler |
| `ConfigChange.ts` | `Block \| Continue \| Skip` | New handler |
| `CwdChanged.ts` | `WatchPaths \| NoAction` | New handler + new outcome |
| `FileChanged.ts` | `WatchPaths \| NoAction` | New handler + new outcome |
| `WorktreeCreate.ts` | `NoAction` | New handler |
| `WorktreeRemove.ts` | `NoAction` | New handler |
| `Elicitation.ts` | `NoAction` | New handler |
| `ElicitationResult.ts` | `NoAction` | New handler |

**Status key:**
- "Existing, move" = has typed handler today, moves from config.ts into own file
- "New handler" = has Input/Event schemas today, gains handler type in this refactor
- "Fully new" = nothing exists yet, built from Anthropic docs

## Shared Infrastructure

### `src/hooks/shared.ts`

Metadata infrastructure only (no base field objects):
- `HookEventSchemaMetadata` interface
- `DescriptionAnnotation`, `CapabilitiesAnnotation` symbols
- `getSchemaMetadata()` function

### `src/hooks/types.ts`

Composed types spanning all hooks:
- `HooksMap<TOptions, TState>` — imports all 26 hook definition types
- `InferHandlers<T>` — imports all 26 handler types
- `HookOutcomeMap` — imports all 26 outcome unions
- `VALID_OUTCOME_TAGS` — composed from per-hook tag sets
- `isValidOutcomeForHook()` — runtime validation using composed tags

## New Outcome Classes

### `src/outcomes/Retry.ts`

For PermissionDenied hooks. Tells Claude Code the model may retry.

- Wire format: `{ hookSpecificOutput: { retry: true } }`
- Telemetry: `{ outcome: "retry" }`
- Extensible via `.extend()` like all outcomes

### `src/outcomes/WatchPaths.ts`

For CwdChanged and FileChanged hooks. Returns path patterns to watch.

- Fields: `paths: Schema.Array(Schema.String)`
- Wire format: `{ watchPaths: [...] }`
- Telemetry: `{ outcome: "watchPaths", pathCount: N }`
- Extensible via `.extend()`

### `NoAction.implicit()` (modification to existing class)

Static factory returning `NoAction` with `implicit: true` field.

- Telemetry: `{ outcome: "noAction", implicit: true }` vs `{ outcome: "noAction", implicit: false }`
- Pipeline wraps undefined handler returns with `NoAction.implicit()`

## Files Deleted

| File | Lines | Reason |
|------|-------|--------|
| `src/schemas/hook-events.ts` | 1163 | All event classes move to per-hook files |
| `src/schemas/hook-inputs.ts` | 506 | All input classes move to per-hook files |
| `src/schemas/hook-outputs.ts` | 675 | Output schemas move to per-hook files |
| `src/schemas/hook-responses.ts` | 261 | Response schemas move to per-hook files |
| `src/outcomes/types.ts` | 121 | Outcome unions + HookOutcomeMap move to per-hook files and types.ts |

## Files Kept

| File | Reason |
|------|--------|
| `src/schemas/hook-literals.ts` | Enums, literal schemas, shared constants referenced by hook files |
| `src/schemas/branded.ts` | `SessionIdSchema`, `ToolUseIdSchema`, `TranscriptPathSchema` |
| `src/schemas/json.ts` | `JsonObjectSchema` |
| `src/outcomes/Allow.ts` through `Skip.ts` | 9 outcome classes unchanged |
| `src/outcomes/Outcome.ts` | Base class unchanged |
| `src/outcomes/ContextBuilder.ts` | Utility unchanged |

## Testing Strategy

### Existing tests (993 passing)

Import paths update to new file locations. Public API (`claude-binary-plugin`,
`claude-binary-plugin/testing`) stays stable, so tests importing from the package
don't change. Tests importing from internal paths need path updates.

### New tests

- **Retry outcome**: `toResponse()`, `toTelemetry()`, Schema validation, extensibility
- **WatchPaths outcome**: `toResponse()`, `toTelemetry()`, Schema validation, extensibility
- **NoAction.implicit()**: implicit flag in telemetry, distinguishes from explicit
- **PermissionDenied hook**: full Input → Event → Handler → Outcome → Response round-trip
- **15 newly-typed handlers**: compile-time type tests (`@ts-expect-error` for wrong outcomes)
- **Path conversion**: Input raw strings → Event `@effect/platform` Path instances

### No new test patterns

Existing `PluginTester` fluent API and test layer factories cover the handler
testing pattern. New hooks get new entries in the tester.

## Migration Order

Each step keeps tests passing incrementally:

1. **New outcome classes** — add `Retry.ts`, `WatchPaths.ts`, `NoAction.implicit()` with tests. Purely additive, zero breakage.

2. **Split config.ts** — extract `handler.ts`, `commands.ts`, `infer.ts`, `state.ts`. Update internal imports. Public API unchanged.

3. **Create hook files for 10 existing hooks** — move Input, Event, Output, Response, handler type, hook definition, outcome union into per-hook files. Build `src/hooks/types.ts` with composed `HooksMap` and `InferHandlers`. Delete entries from monolithic files as each hook migrates. Run tests after each hook.

4. **Create hook files for 15 partially-supported hooks** — same structure, plus new handler types, hook definition types, and `HooksMap`/`InferHandlers` entries. Tests for each new handler type.

5. **Create PermissionDenied.ts** — fully new hook built from Anthropic docs. Input schema, event class, output, response, handler type with `Retry | NoAction` outcome.

6. **Add @effect/platform Path conversion** — update all Event classes to parse string paths into Path instances in `fromInput()`. Update tests.

7. **Delete monolithic files** — `hook-events.ts`, `hook-inputs.ts`, `hook-outputs.ts`, `hook-responses.ts`, `outcomes/types.ts`. Verify no remaining imports.

8. **Update public API** — `src/index.ts` re-exports from new locations, adds exports for 15 newly-typed handlers, `Retry`, `WatchPaths`, `PermissionDenied*` types.
