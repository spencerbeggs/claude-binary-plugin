# Hook Schema Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate dual interface+Schema.Class hook types into a
four-layer schema pipeline: Input (wire in), Event (domain), Output
(handler return), Response (wire out).

**Architecture:** Input Schema.Classes replace TypeScript interfaces for
wire format validation. Event Schema.Classes gain `static fromInput()`
for decode-to-domain transforms. Response Schema.Classes (per-hook)
replace imperative response building. Output schemas stay as
`Schema.Union(Schema.Struct)` with standalone `toResponse()` functions.

**Tech Stack:** Effect Schema.Class, `bun:test`, Biome

**Spec:** `docs/superpowers/specs/2026-03-25-hook-schema-pipeline-design.md`

**Important implementation note:** The pipeline output schemas in
`pipeline-outputs.ts` use `Schema.Union(Schema.Struct(...))`, NOT
`Schema.Class`. You cannot add instance methods to `Schema.Struct`.
The `toResponse()` functions are standalone functions co-located with
the Response classes in `hook-responses.ts`, not methods on the output
types.

---

## Task 1: Extract Shared Literal Schemas and Create Input Schema.Classes

**Files:**

- Create: `src/schemas/hook-literals.ts` (shared literal schemas)
- Create: `src/schemas/hook-inputs.ts`
- Modify: `src/schemas/hook-events.ts` (import literals from new file)
- Create: `__tests__/schemas/hook-inputs.test.ts`

**CRITICAL: Circular import prevention.** `hook-events.ts` currently
defines `HookTypeSchema`, `HookPermissionsModeSchema`, and other literal
schemas marked `@internal`. Task 3 will add `import { PreToolUseInput }
from "./hook-inputs.js"` to `hook-events.ts`. If `hook-inputs.ts` also
imports literals from `hook-events.ts`, we get a circular dependency.

**Solution:** Extract shared literals to `src/schemas/hook-literals.ts`.
Both `hook-inputs.ts` and `hook-events.ts` import from `hook-literals.ts`
but never from each other (until Task 3 adds the one-way `fromInput`
import).

- [ ] **Step 1: Write failing tests**

Test that each of the 10 Input Schema.Classes can decode valid JSON
from Claude Code's stdin format. Test shared base fields. Test that
invalid JSON fails decode with ParseError.

Key test cases per hook type:

- `PreToolUseInput` decodes `{ hook_event_name: "PreToolUse", session_id, tool_name, tool_input, tool_use_id }`
- `PostToolUseInput` decodes with `tool_response` field
- `SessionStartInput` decodes with `source` field
- Invalid `hook_event_name` value fails
- Missing required fields fail

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/schemas/hook-inputs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create hook-literals.ts**

Create `src/schemas/hook-literals.ts` with the shared literal schemas
extracted from `hook-events.ts`:

- `HookTypeSchema` (Literal of all 10 hook event names)
- `HookPermissionsModeSchema` (Literal "default" | "plan" | etc.)
- `PreCompactTriggerSchema` (Literal "manual" | "auto")
- `SessionStartSourceSchema` (Literal "startup" | "resume" | etc.)
- `SessionEndReasonSchema` (Literal "clear" | "logout" | etc.)
- `PreToolUseDecisionSchema` (Literal "allow" | "deny" | "ask")
- `PermissionRequestBehaviorSchema` (Literal "allow" | "deny")
- `HookType` enum (moved from `types/hook-events.ts`)
- `ToolName` type (moved from `types/hook-events.ts`)

Update `src/schemas/hook-events.ts` to import these from
`./hook-literals.js` instead of defining them locally.

- [ ] **Step 4: Implement Input schemas**

Create `src/schemas/hook-inputs.ts`:

- Import shared literals from `./hook-literals.js` (NOT from
  `hook-events.js` — this avoids circular imports)
- Define `HookEventBaseFields` shared field set using `SessionIdSchema`,
  `TranscriptPathSchema`, `HookPermissionsModeSchema`
- Define 10 Schema.Classes: `PreToolUseInput`, `PostToolUseInput`,
  `PermissionRequestInput`, `NotificationInput`, `UserPromptSubmitInput`,
  `StopInput`, `SubagentStopInput`, `PreCompactInput`,
  `SessionStartInput`, `SessionEndInput`
- Each extends `HookEventBaseFields` with `hook_event_name` narrowed
  to its specific literal

Reference `src/types/hook-events.ts` for the interface shapes being
replaced.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/schemas/hook-inputs.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `bun run test:ai`
Expected: All pass (new file, no consumers yet)

- [ ] **Step 6: Commit**

```bash
git add src/schemas/hook-inputs.ts __tests__/schemas/hook-inputs.test.ts
git commit -m "feat: add Input Schema.Classes for hook wire format

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Migrate Consumers from Interfaces to Input Schemas

**Files:**

- Modify: `src/plugin/config.ts` (import from `hook-inputs.ts`)
- Modify: `src/testing/mocks.ts` (import from schemas)
- Modify: `src/plugin/config.ts` (absorb `IO`, `HookEventOptions`)
- Modify: `src/index.ts` (update exports)
- Delete: `src/types/hook-events.ts`

- [ ] **Step 1: Move `IO` and `HookEventOptions` to plugin/config.ts**

Read `src/types/hook-events.ts`. Copy the `IO` interface and
`HookEventOptions` interface to `src/plugin/config.ts` — these have
non-serializable fields (stream objects, constructors) and can't be
Schema.Classes.

- [ ] **Step 2: Update plugin/config.ts imports**

Replace:

```typescript
import type {
  NotificationInput, PermissionRequestInput, PostToolUseInput,
  PreCompactInput, PreToolUseInput, SessionEndInput,
  SessionStartInput, StopInput, SubagentStopInput,
  ToolName, UserPromptSubmitInput,
} from "../types/hook-events.js";
```

With imports from `../schemas/hook-inputs.js`. The Input Schema.Class
`.Type` is structurally identical to the old interface, so handler type
signatures remain compatible.

- [ ] **Step 3: Update testing/mocks.ts imports**

Replace imports of `HookEventBase` and `IO` from `types/hook-events.ts`
with imports from `schemas/hook-inputs.ts` (for `HookEventBase` type)
and `plugin/config.ts` (for `IO`).

- [ ] **Step 4: Update src/index.ts exports**

Remove re-exports from `./types/hook-events.js`. Add re-exports from
`./schemas/hook-inputs.js` for Input classes, `HookType`, `ToolName`,
and shared literal types.

Keep `HookEventBase` as `type HookEventBase = typeof PreToolUseInput.Type & ...`
or export a base type from `hook-inputs.ts`.

- [ ] **Step 5: Search for remaining imports of types/hook-events.ts**

Search `src/` and `__tests__/` for any remaining imports from
`types/hook-events`. Fix all references.

- [ ] **Step 6: Delete types/hook-events.ts**

```bash
rm src/types/hook-events.ts
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `bun run test:ai && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: migrate hook type consumers to Input Schema.Classes

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Add `fromInput()` to Event Schema.Classes

**Files:**

- Modify: `src/schemas/hook-events.ts`
- Modify: `__tests__/schemas/hook-events.test.ts` (append new tests — file already exists)

- [ ] **Step 1: Write failing tests**

Test that each Event class has a `static fromInput()` that accepts
the corresponding Input type and returns an Event instance:

```typescript
import { Schema } from "effect";
import { PreToolUseInput } from "../../src/schemas/hook-inputs.js";
import { PreToolUseEvent } from "../../src/schemas/hook-events.js";

test("PreToolUseEvent.fromInput creates event from input", () => {
  const raw = {
    hook_event_name: "PreToolUse",
    session_id: "abc-123",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_use_id: "tu_abc",
  };
  const input = Schema.decodeUnknownSync(PreToolUseInput)(raw);
  const event = PreToolUseEvent.fromInput(input);
  expect(event).toBeInstanceOf(PreToolUseEvent);
  expect(event.tool_name).toBe("Bash");
  expect(event.session_id).toBe("abc-123");
});
```

Test all 10 Event classes. Test that `instanceof` works on the result.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/schemas/hook-events.test.ts`
Expected: FAIL — `fromInput` is not a function

- [ ] **Step 3: Add `fromInput()` to each Event class**

In `src/schemas/hook-events.ts`, add a `static fromInput()` method
to each of the 10 Event Schema.Classes. Use explicit field mapping:

```typescript
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
```

Add import of Input classes from `./hook-inputs.js`.

Optionally add instance methods where useful (e.g., `toolInputHash`
getter on PreToolUseEvent and PostToolUseEvent).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/schemas/hook-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/hook-events.ts __tests__/schemas/hook-events.test.ts
git commit -m "feat: add static fromInput() to Event Schema.Classes

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Update PipelineRuntime to Use Input Decode + fromInput

**Files:**

- Modify: `src/layers/PipelineRuntime.ts`
- Modify: `__tests__/layers/PipelineRuntime.test.ts`

- [ ] **Step 1: Write failing test**

Test that the pipeline decode path uses Input schemas and
`Event.fromInput()`. Verify the event passed to the handler is an
`instanceof` the Event Schema.Class.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: FAIL

- [ ] **Step 3: Update PipelineRuntime decode path**

In `PipelineRuntime.run()`, replace direct `Schema.decodeUnknownSync`
against Event schemas with:

1. Decode against Input schema: `Schema.decodeUnknownSync(PreToolUseInput)(json)`
2. Transform: `PreToolUseEvent.fromInput(input)`

The `hookType` switch that selects the schema per hook type needs
updating to select the Input schema and the corresponding Event class.

This is a surgical change — only the decode+construct section changes.
Handler invocation, output validation, and response building stay the
same (Phase 3 handles response).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:ai`
Expected: All pass — same data flows through, just decoded differently

- [ ] **Step 5: Commit**

```bash
git add src/layers/PipelineRuntime.ts __tests__/layers/PipelineRuntime.test.ts
git commit -m "feat: use Input decode + Event.fromInput() in pipeline

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 5: Create Response Schema.Classes

**Files:**

- Create: `src/schemas/hook-responses.ts`
- Create: `__tests__/schemas/hook-responses.test.ts`

- [ ] **Step 1: Write failing tests**

Test that each Response Schema.Class validates the correct wire format.
Test each hook type's response shape matches what PipelineRuntime
currently writes to stdout.

Key test cases:

- `PreToolUseResponse` accepts `{ permissionDecision: "allow" }`
- `PostToolUseResponse` accepts `{ additionalContext: "..." }`
- `StopResponse` accepts `{ decision: "block", reason: "..." }`
- `PermissionRequestResponse` accepts `{ behavior: "deny", message: "..." }`
- `PassthroughResponse` accepts `{}`
- Invalid fields are rejected

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/schemas/hook-responses.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Response schemas**

Create `src/schemas/hook-responses.ts` with 7 Schema.Classes matching
the current `convertTo*ResponseData` methods in PipelineRuntime:

```typescript
class PreToolUseResponse extends Schema.Class<PreToolUseResponse>(
  "PreToolUseResponse"
)({
  permissionDecision: Schema.Literal("allow", "deny", "ask"),
  reason: Schema.optional(Schema.String),
  updatedInput: Schema.optional(JsonObjectSchema),
}) {}
```

Full list:

- `PreToolUseResponse` — permissionDecision, reason, updatedInput
- `PostToolUseResponse` — additionalContext, decision, reason
- `SessionStartResponse` — additionalContext
- `StopResponse` — decision, reason
- `UserPromptSubmitResponse` — additionalContext, decision, reason
- `PermissionRequestResponse` — behavior, message, interrupt, updatedInput
- `PassthroughResponse` — empty (for SessionEnd, PreCompact, Notification)

Also create `toResponse()` standalone functions — one per hook type.
These convert a `*PipelineOutput` to its corresponding `*Response`:

```typescript
export function toPreToolUseResponse(
  output: PreToolUsePipelineOutput
): PreToolUseResponse { ... }
```

Port logic directly from `PipelineRuntime.convertTo*ResponseData()`
methods. Same mapping, same field selection.

**Union narrowing:** The `*PipelineOutput` types are discriminated
unions on the `status` field. Use a `switch (output.status)` or
`if ("action" in output)` to narrow to variants that have `action`,
`reason`, etc. Match the pattern in the existing
`convertTo*ResponseData` methods (which use `"action" in output ?`
guards). The existing methods are the ground truth for field access
patterns.

**Spec note:** The spec shows `toResponse()` as instance methods on
output Schema.Classes. The actual output schemas are
`Schema.Union(Schema.Struct)` — not classes. The standalone functions
in this file are the correct implementation. The spec's Layer 3 section
describes the intent, not the exact API shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/schemas/hook-responses.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/hook-responses.ts __tests__/schemas/hook-responses.test.ts
git commit -m "feat: add per-hook Response Schema.Classes with toResponse functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 6: Update PipelineRuntime to Use Response Schemas

**Files:**

- Modify: `src/layers/PipelineRuntime.ts`
- Modify: `__tests__/layers/PipelineRuntime.test.ts`

- [ ] **Step 1: Write failing test**

Test that the pipeline output path uses `toResponse()` functions and
produces the same stdout JSON as before.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/layers/PipelineRuntime.test.ts`
Expected: FAIL

- [ ] **Step 3: Replace convertToResponse switch**

In `PipelineRuntime.ts`:

1. Import `toResponse` functions from `../schemas/hook-responses.js`
2. Replace the `convertToResponse` switch statement with calls to
   the appropriate `to*Response()` function
3. Delete all `convertTo*ResponseData` private static methods
   (7 methods, ~110 lines)
4. Delete the `convertToResponse` switch method
5. Delete the `*ResponseData` exported interfaces at the top of
   PipelineRuntime.ts (`PreToolUseResponseData`,
   `PostToolUseResponseData`, `SessionStartResponseData`,
   `StopResponseData`, `UserPromptSubmitResponseData`,
   `PermissionRequestResponseData`) — these are replaced by the
   Response Schema.Classes. Remove their re-exports from
   `src/index.ts` if present.

The new code:

```typescript
// In the response-building section:
const response = toPreToolUseResponse(output);
process.stdout.write(JSON.stringify(response));
```

The hook-type switch that selects the right `toResponse` function
remains, but it's now a single-line call per case instead of a
multi-line method.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:ai`
Expected: All pass — same stdout output, just built differently

- [ ] **Step 5: Commit**

```bash
git add src/layers/PipelineRuntime.ts __tests__/layers/PipelineRuntime.test.ts
git commit -m "refactor: use Response schemas in PipelineRuntime, delete convertTo* methods

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 7: Update Public API Exports

**Files:**

- Modify: `src/index.ts`
- Modify: `__tests__/services/index.test.ts`

- [ ] **Step 1: Update src/index.ts**

Add exports for new schema files:

- Input classes from `./schemas/hook-inputs.js`
- Response classes from `./schemas/hook-responses.js`
- `toResponse` functions from `./schemas/hook-responses.js`

Remove any stale exports that referenced `types/hook-events.ts`
(should already be done in Task 2, but verify).

- [ ] **Step 2: Update index tests**

Verify new exports are accessible in `__tests__/services/index.test.ts`
or `__tests__/index.test.ts`.

- [ ] **Step 3: Run tests, typecheck, lint**

Run: `bun run test:ai && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/index.ts __tests__/services/index.test.ts
git commit -m "feat: export Input and Response schemas from public API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 8: Final Verification and Cleanup

- [ ] **Step 1: Run full test suite**

Run: `bun run test:ai`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix`
Expected: Clean

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 5: Verify types/hook-events.ts is deleted**

```bash
test -f src/types/hook-events.ts && echo "STILL EXISTS" || echo "DELETED"
```

Expected: DELETED

- [ ] **Step 6: Verify no remaining interface-only hook types**

Search for any remaining `interface.*Input extends HookEventBase`:

```bash
grep -r "interface.*Input extends" src/
```

Expected: No matches (all replaced by Schema.Class)

- [ ] **Step 7: Verify HookEventSchemas.parse*() still works**

The `HookEventSchemas` class in `hook-events.ts` has public `parse*()`
methods that decode against Event schemas. Verify these still produce
correct results by running the existing hook-events tests:

Run: `bun test __tests__/schemas/hook-events.test.ts`
Expected: All pass (Event schemas unchanged, just gained fromInput)

- [ ] **Step 8: Update design docs**

Update `.claude/design/schema.md` to document the four-layer pipeline.
Update `.claude/design/architecture.md` if the types/ directory
description changed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: final cleanup for hook schema pipeline

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
