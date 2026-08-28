# Hooks Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor hook system from monolithic schema files into 26 per-hook-type modules with full typed handler support, two new outcomes (Retry, WatchPaths), implicit NoAction, config.ts decomposition, and PermissionDenied hook.

**Architecture:** Each hook gets its own file in `src/hooks/{HookType}.ts` co-locating input schema, event class, output schema, response schema, handler type, hook definition type, and outcome union. Shared output infrastructure stays in `src/hooks/shared.ts`. Composed types (HooksMap, InferHandlers, HookOutcomeMap) live in `src/hooks/types.ts`. `config.ts` splits into 5 focused files.

**Tech Stack:** Effect Schema, @effect/platform Path, bun:test, TypeScript

**Design spec:** `docs/superpowers/specs/2026-04-01-hooks-refactor-design.md`

---

## File Map

### New files to create

| File | Purpose |
|------|---------|
| `src/outcomes/Retry.ts` | Retry outcome for PermissionDenied |
| `src/outcomes/WatchPaths.ts` | WatchPaths outcome for CwdChanged/FileChanged |
| `src/plugin/handler.ts` | Generic handler infrastructure extracted from config.ts |
| `src/plugin/commands.ts` | Command types extracted from config.ts |
| `src/plugin/infer.ts` | Type inference utilities extracted from config.ts |
| `src/plugin/state.ts` | State and setup types extracted from config.ts |
| `src/hooks/shared.ts` | Metadata infrastructure + shared output schemas |
| `src/hooks/types.ts` | HooksMap, InferHandlers, HookOutcomeMap, runtime validation |
| `src/hooks/PreToolUse.ts` | PreToolUse hook module |
| `src/hooks/PostToolUse.ts` | PostToolUse hook module |
| `src/hooks/PostToolUseFailure.ts` | PostToolUseFailure hook module |
| `src/hooks/PermissionRequest.ts` | PermissionRequest hook module |
| `src/hooks/PermissionDenied.ts` | PermissionDenied hook module (fully new) |
| `src/hooks/SessionStart.ts` | SessionStart hook module |
| `src/hooks/SessionEnd.ts` | SessionEnd hook module |
| `src/hooks/Stop.ts` | Stop hook module |
| `src/hooks/StopFailure.ts` | StopFailure hook module |
| `src/hooks/SubagentStart.ts` | SubagentStart hook module |
| `src/hooks/SubagentStop.ts` | SubagentStop hook module |
| `src/hooks/UserPromptSubmit.ts` | UserPromptSubmit hook module |
| `src/hooks/PreCompact.ts` | PreCompact hook module |
| `src/hooks/PostCompact.ts` | PostCompact hook module |
| `src/hooks/Notification.ts` | Notification hook module |
| `src/hooks/TaskCreated.ts` | TaskCreated hook module |
| `src/hooks/TaskCompleted.ts` | TaskCompleted hook module |
| `src/hooks/TeammateIdle.ts` | TeammateIdle hook module |
| `src/hooks/InstructionsLoaded.ts` | InstructionsLoaded hook module |
| `src/hooks/ConfigChange.ts` | ConfigChange hook module |
| `src/hooks/CwdChanged.ts` | CwdChanged hook module |
| `src/hooks/FileChanged.ts` | FileChanged hook module |
| `src/hooks/WorktreeCreate.ts` | WorktreeCreate hook module |
| `src/hooks/WorktreeRemove.ts` | WorktreeRemove hook module |
| `src/hooks/Elicitation.ts` | Elicitation hook module |
| `src/hooks/ElicitationResult.ts` | ElicitationResult hook module |
| `__tests__/outcomes/Retry.test.ts` | Retry outcome tests |
| `__tests__/outcomes/WatchPaths.test.ts` | WatchPaths outcome tests |
| `__tests__/outcomes/NoAction.implicit.test.ts` | Implicit NoAction tests |
| `__tests__/hooks/PreToolUse.test.ts` | PreToolUse hook module tests |
| `__tests__/hooks/PermissionDenied.test.ts` | PermissionDenied hook tests |
| `__tests__/hooks/CwdChanged.test.ts` | CwdChanged hook tests (WatchPaths) |

### Files to modify

| File | Change |
|------|--------|
| `src/outcomes/NoAction.ts` | Add `implicit()` static factory and `implicit` field |
| `src/plugin/config.ts` | Remove all handler types, hook definitions, HooksMap, InferHandlers, commands, state — keep only PluginConfig + ClaudePlugin |
| `src/index.ts` | Update all re-exports to new file locations, add new exports |
| `src/testing.ts` | Update re-exports if needed |
| `src/layers/PluginRuntimeServiceLive.ts` | Update imports to hook modules |
| `src/types/pipeline.ts` | Update imports to hook modules |
| `src/testing/mocks.ts` | Update imports |
| `src/testing/builder.ts` | Update imports |
| `src/build/builder.ts` | Update imports |
| `src/build/HookExtractor.ts` | Update imports |
| `src/layers/CommandRunnerLive.ts` | Update imports |

### Files to delete

| File | Reason |
|------|--------|
| `src/schemas/hook-events.ts` | Moved to per-hook files |
| `src/schemas/hook-inputs.ts` | Moved to per-hook files |
| `src/schemas/hook-outputs.ts` | Shared schemas to shared.ts, per-hook schemas to hook files |
| `src/schemas/hook-responses.ts` | Moved to per-hook files |
| `src/outcomes/types.ts` | Moved to per-hook files + hooks/types.ts |

---

### Task 1: Add Retry outcome class

**Files:**
- Create: `src/outcomes/Retry.ts`
- Test: `__tests__/outcomes/Retry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/outcomes/Retry.test.ts
import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { Retry } from "../../src/outcomes/Retry.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Retry", () => {
	it("is an Outcome subclass", () => {
		const retry = new Retry({});
		expect(Outcome.isOutcome(retry)).toBe(true);
	});

	it("has _tag 'Retry'", () => {
		expect(Retry._tag).toBe("Retry");
	});

	it("toResponse returns hookSpecificOutput with retry: true", () => {
		const retry = new Retry({});
		expect(retry.toResponse()).toEqual({
			hookSpecificOutput: { retry: true },
		});
	});

	it("toTelemetry returns outcome: retry", () => {
		const retry = new Retry({});
		expect(retry.toTelemetry()).toEqual({ outcome: "retry" });
	});

	it("validates through Schema", () => {
		const decoded = Schema.decodeUnknownSync(Retry)({});
		expect(decoded).toBeInstanceOf(Retry);
	});

	it("is extensible via .extend()", () => {
		class CustomRetry extends Retry.extend<CustomRetry>("CustomRetry")({
			toolName: Schema.String,
		}) {}
		const custom = new CustomRetry({ toolName: "Bash" });
		expect(custom.toolName).toBe("Bash");
		expect(Outcome.isOutcome(custom)).toBe(true);
		expect(custom.toResponse()).toEqual({
			hookSpecificOutput: { retry: true },
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/outcomes/Retry.test.ts`
Expected: FAIL — cannot find module `../../src/outcomes/Retry.js`

- [ ] **Step 3: Write Retry implementation**

```typescript
// src/outcomes/Retry.ts
import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Retry outcome for PermissionDenied hooks.
 *
 * @remarks
 * Tells Claude Code the model may retry the denied tool call.
 * Wire format: `{ hookSpecificOutput: { retry: true } }`
 *
 * @public
 */
export class Retry extends Outcome.extend<Retry>("Retry")({}) {
	toResponse(): { hookSpecificOutput: { retry: boolean } } {
		return { hookSpecificOutput: { retry: true } };
	}

	toTelemetry(): Record<string, unknown> {
		return { outcome: "retry", ...this._extractDomainMetrics() };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/outcomes/Retry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/outcomes/Retry.ts package/__tests__/outcomes/Retry.test.ts
git commit -m "feat: add Retry outcome class for PermissionDenied hooks"
```

---

### Task 2: Add WatchPaths outcome class

**Files:**
- Create: `src/outcomes/WatchPaths.ts`
- Test: `__tests__/outcomes/WatchPaths.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/outcomes/WatchPaths.test.ts
import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { WatchPaths } from "../../src/outcomes/WatchPaths.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("WatchPaths", () => {
	it("is an Outcome subclass", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts"] });
		expect(Outcome.isOutcome(wp)).toBe(true);
	});

	it("has _tag 'WatchPaths'", () => {
		expect(WatchPaths._tag).toBe("WatchPaths");
	});

	it("stores paths array", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts", "package.json"] });
		expect(wp.paths).toEqual(["src/**/*.ts", "package.json"]);
	});

	it("toResponse returns watchPaths array", () => {
		const wp = new WatchPaths({ paths: ["src/**/*.ts"] });
		expect(wp.toResponse()).toEqual({ watchPaths: ["src/**/*.ts"] });
	});

	it("toTelemetry returns outcome and pathCount", () => {
		const wp = new WatchPaths({ paths: ["a", "b", "c"] });
		expect(wp.toTelemetry()).toEqual({
			outcome: "watchPaths",
			pathCount: 3,
		});
	});

	it("validates through Schema", () => {
		const decoded = Schema.decodeUnknownSync(WatchPaths)({
			paths: ["test"],
		});
		expect(decoded).toBeInstanceOf(WatchPaths);
	});

	it("rejects missing paths", () => {
		expect(() => Schema.decodeUnknownSync(WatchPaths)({})).toThrow();
	});

	it("is extensible via .extend()", () => {
		class TaggedWatchPaths extends WatchPaths.extend<TaggedWatchPaths>("TaggedWatchPaths")({
			reason: Schema.String,
		}) {}
		const custom = new TaggedWatchPaths({
			paths: ["*.md"],
			reason: "docs changed",
		});
		expect(custom.paths).toEqual(["*.md"]);
		expect(custom.reason).toBe("docs changed");
		expect(Outcome.isOutcome(custom)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/outcomes/WatchPaths.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write WatchPaths implementation**

```typescript
// src/outcomes/WatchPaths.ts
import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * WatchPaths outcome for CwdChanged and FileChanged hooks.
 *
 * @remarks
 * Returns path patterns for Claude Code to watch.
 * Wire format: `{ watchPaths: [...] }`
 *
 * @public
 */
export class WatchPaths extends Outcome.extend<WatchPaths>("WatchPaths")({
	paths: Schema.Array(Schema.String),
}) {
	toResponse(): { watchPaths: readonly string[] } {
		return { watchPaths: this.paths };
	}

	toTelemetry(): Record<string, unknown> {
		return {
			outcome: "watchPaths",
			pathCount: this.paths.length,
			...this._extractDomainMetrics(),
		};
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/outcomes/WatchPaths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/outcomes/WatchPaths.ts package/__tests__/outcomes/WatchPaths.test.ts
git commit -m "feat: add WatchPaths outcome class for CwdChanged/FileChanged hooks"
```

---

### Task 3: Add NoAction.implicit() static factory

**Files:**
- Modify: `src/outcomes/NoAction.ts`
- Test: `__tests__/outcomes/NoAction.implicit.test.ts`

Read the current `src/outcomes/NoAction.ts` first to understand its structure.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/outcomes/NoAction.implicit.test.ts
import { describe, expect, it } from "bun:test";
import { NoAction } from "../../src/outcomes/NoAction.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("NoAction.implicit()", () => {
	it("returns a NoAction instance", () => {
		const implicit = NoAction.implicit();
		expect(implicit).toBeInstanceOf(NoAction);
		expect(Outcome.isOutcome(implicit)).toBe(true);
	});

	it("has implicit: true", () => {
		const implicit = NoAction.implicit();
		expect(implicit.implicit).toBe(true);
	});

	it("explicit NoAction has implicit: false by default", () => {
		const explicit = new NoAction({});
		expect(explicit.implicit).toBe(false);
	});

	it("toTelemetry includes implicit flag", () => {
		const implicit = NoAction.implicit();
		const telemetry = implicit.toTelemetry();
		expect(telemetry.outcome).toBe("noAction");
		expect(telemetry.implicit).toBe(true);
	});

	it("explicit toTelemetry has implicit: false", () => {
		const explicit = new NoAction({});
		const telemetry = explicit.toTelemetry();
		expect(telemetry.outcome).toBe("noAction");
		expect(telemetry.implicit).toBe(false);
	});

	it("toResponse is the same for both", () => {
		const implicit = NoAction.implicit();
		const explicit = new NoAction({});
		expect(implicit.toResponse()).toEqual(explicit.toResponse());
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/outcomes/NoAction.implicit.test.ts`
Expected: FAIL — `NoAction.implicit is not a function` or `implicit` property doesn't exist

- [ ] **Step 3: Modify NoAction to add implicit field and factory**

Read `src/outcomes/NoAction.ts` first. Then modify it to:
1. Add `implicit` field with `Schema.optionalWith(Schema.Boolean, { default: () => false })`
2. Add static `implicit()` factory that returns `new NoAction({ implicit: true })`
3. Update `toTelemetry()` to include the `implicit` flag

The `implicit` field defaults to `false` so existing `new NoAction({})` calls still work.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/outcomes/NoAction.implicit.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd package && bun test`
Expected: All tests pass (993+)

- [ ] **Step 6: Commit**

```bash
git add package/src/outcomes/NoAction.ts package/__tests__/outcomes/NoAction.implicit.test.ts
git commit -m "feat: add NoAction.implicit() for distinguishing missing handler returns"
```

---

### Task 4: Split config.ts into focused files

**Files:**
- Modify: `src/plugin/config.ts` (remove extracted code)
- Create: `src/plugin/handler.ts`
- Create: `src/plugin/commands.ts`
- Create: `src/plugin/infer.ts`
- Create: `src/plugin/state.ts`

Read `src/plugin/config.ts` in full before starting. This is a pure structural move — no logic changes.

- [ ] **Step 1: Create `src/plugin/state.ts`**

Extract from `config.ts`:
- `BaseState` interface
- `SetupContext` interface
- `SetupFunction` type
- `ExtractSetupReturn` type

These have no dependencies on other config.ts types.

- [ ] **Step 2: Create `src/plugin/handler.ts`**

Extract from `config.ts`:
- `IO` interface
- `HookEventOptions` interface
- `PluginState` type (imports `BaseState` from `./state.js`)
- `HandlerContext` interface
- `PluginHandler` type (imports `AnyOutcome` from outcomes)
- `HookDefinitionBase` interface
- `ToolFilter` interface
- `HandlerHookDefinition` interface
- `PassthroughHookEntry` interface
- `HookDefinition` type

- [ ] **Step 3: Create `src/plugin/commands.ts`**

Extract from `config.ts`:
- `CmdContext` interface (imports `PluginState` from `./handler.js`)
- `CommandHandler` type
- `CommandOutput` interface
- `CommandInlineDefinition` interface
- `CommandDefinition` type
- `CommandDefinitionBase` interface
- `CommandHandlerFn` type
- `CommandsMap` type

- [ ] **Step 4: Create `src/plugin/infer.ts`**

Extract from `config.ts`:
- `ExtractOptionsSchema` type
- `ExtractStateSchema` type
- `ExtractSetup` type
- `ExtractCommands` type
- `InferPluginOptions` type
- `InferPluginState` type
- `InferPluginCommands` type

These import from `./commands.js` and `./state.js` for the `CommandDefinitionBase`, `SetupContext` types.

- [ ] **Step 5: Trim config.ts**

Remove all extracted types from `config.ts`. What remains:
- `PluginConfig` class
- `ClaudePlugin` class
- `PluginBuildOptions` interface
- `PluginConfigOptions` interface

Update imports in `config.ts` to reference the new files. `config.ts` imports from `./handler.js`, `./commands.js`, `./state.js`, `./infer.js`.

- [ ] **Step 6: Update all internal imports**

Update every file that imports from `../plugin/config.js` to import from the correct new file:
- `src/layers/PluginRuntimeServiceLive.ts` — `BaseState`, `PluginHandler`, `PluginState`, `SetupFunction` → from `../plugin/handler.js` and `../plugin/state.js`
- `src/layers/CommandRunnerLive.ts` — `BaseState` → from `../plugin/state.js`
- `src/types/pipeline.ts` — `HandlerHookDefinition`, `HookDefinition` → from `../plugin/handler.js`
- `src/testing/mocks.ts` — `IO` → from `../plugin/handler.js`
- `src/testing/builder.ts` — `BaseState`, `CommandDefinition`, `CommandHandler`, `CommandOutput`, `PluginHandler`, `PluginState` → from `../plugin/handler.js`, `../plugin/commands.js`, `../plugin/state.js`
- `src/build/builder.ts` — `PassthroughHookEntry` → from `../plugin/handler.js`
- `src/build/HookExtractor.ts` — `PassthroughHookEntry` → from `../plugin/handler.js`

- [ ] **Step 7: Update `src/index.ts` re-exports**

All types previously exported from `./plugin/config.js` now come from their new files. Update the re-export paths. The public-facing export names stay the same.

- [ ] **Step 8: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass — this was a pure structural move.

- [ ] **Step 9: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add package/src/plugin/
git commit -m "refactor: split config.ts into handler, commands, infer, state files"
```

---

### Task 5: Create shared hook infrastructure

**Files:**
- Create: `src/hooks/shared.ts`

- [ ] **Step 1: Create `src/hooks/shared.ts`**

This file contains two categories:

**A) Metadata infrastructure** (from `hook-events.ts`):
- `HookEventSchemaMetadata` interface
- `DescriptionAnnotation` symbol
- `CapabilitiesAnnotation` symbol
- `getSchemaMetadata()` function

**B) Shared output schemas** (from `hook-outputs.ts`):
- `ExecutionStatusSchema` and `ExecutionStatus` type
- `HookActionSchema` and `HookAction` type
- `ValidationResultSchema` and `ValidationResult` type
- `ExecutionQualitySchema` and `ExecutionQuality` type
- `HookMetricsSchema` and `HookMetrics` type
- `HookOutputBaseSchema` and `HookOutputBase` type

These are used by all 26 hook output schemas and should not be duplicated.

```typescript
// src/hooks/shared.ts
import { Schema } from "effect";
import { JsonObjectSchema } from "../schemas/json.js";

// =============================================================================
// SCHEMA METADATA
// =============================================================================

export interface HookEventSchemaMetadata {
	description: string;
	capabilities?: string[];
}

export const DescriptionAnnotation = Symbol.for("HookEventDescription");
export const CapabilitiesAnnotation = Symbol.for("HookEventCapabilities");

export function getSchemaMetadata(schema: Schema.Schema.Any): HookEventSchemaMetadata | undefined {
	const annotations = (schema.ast as { annotations?: Record<symbol, unknown> }).annotations;
	if (!annotations) return undefined;
	const description = annotations[DescriptionAnnotation] as string | undefined;
	if (!description) return undefined;
	const meta: HookEventSchemaMetadata = { description };
	const capabilities = annotations[CapabilitiesAnnotation] as string[] | undefined;
	if (capabilities) {
		meta.capabilities = capabilities;
	}
	return meta;
}

// =============================================================================
// SHARED OUTPUT SCHEMAS
// =============================================================================

export const ExecutionStatusSchema = Schema.Literal(
	"executed", "skipped", "disabled", "cached", "error", "timeout",
);
export type ExecutionStatus = typeof ExecutionStatusSchema.Type;

export const HookActionSchema = Schema.Literal(
	"allow", "deny", "ask", "block", "continue", "modify", "context", "none",
);
export type HookAction = typeof HookActionSchema.Type;

export const ValidationResultSchema = Schema.Literal(
	"passed", "fixed", "failed", "warning",
);
export type ValidationResult = typeof ValidationResultSchema.Type;

export const ExecutionQualitySchema = Schema.Struct({
	degraded: Schema.optional(Schema.Boolean),
	degradedReason: Schema.optional(Schema.String),
	partial: Schema.optional(Schema.Boolean),
	fallback: Schema.optional(Schema.Boolean),
});
export type ExecutionQuality = typeof ExecutionQualitySchema.Type;

export const HookMetricsSchema = Schema.Struct({
	issuesFound: Schema.optional(Schema.Number),
	issuesFixed: Schema.optional(Schema.Number),
	filesScanned: Schema.optional(Schema.Number),
	filesWithErrors: Schema.optional(Schema.Number),
	cacheHit: Schema.optional(Schema.Boolean),
}).pipe(
	Schema.extend(
		Schema.Record({ key: Schema.String, value: Schema.Union(Schema.Number, Schema.Boolean, Schema.String) }),
	),
);
export type HookMetrics = typeof HookMetricsSchema.Type;

export const HookOutputBaseSchema = Schema.Struct({
	status: ExecutionStatusSchema,
	summary: Schema.String,
	action: Schema.optional(HookActionSchema),
	validation: Schema.optional(ValidationResultSchema),
	quality: Schema.optional(ExecutionQualitySchema),
	metrics: Schema.optional(HookMetricsSchema),
	userMessage: Schema.optional(Schema.String),
	claudeContext: Schema.optional(Schema.String),
	reason: Schema.optional(Schema.String),
	updatedInput: Schema.optional(JsonObjectSchema),
});
export type HookOutputBase = typeof HookOutputBaseSchema.Type;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add package/src/hooks/shared.ts
git commit -m "feat: create shared hook infrastructure (metadata + output schemas)"
```

---

### Task 6: Create PreToolUse hook module (reference implementation)

This is the most complex hook — it serves as the template for all others.

**Files:**
- Create: `src/hooks/PreToolUse.ts`
- Create: `__tests__/hooks/PreToolUse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/hooks/PreToolUse.test.ts
import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	PreToolUseInput,
	PreToolUseEvent,
	PreToolUseOutputSchema,
	PreToolUseResponse,
	toPreToolUseResponse,
	VALID_OUTCOME_TAGS,
} from "../../src/hooks/PreToolUse.js";
import type { PreToolUseOutcome, PreToolUseHandler, PreToolUseHookDefinition } from "../../src/hooks/PreToolUse.js";

describe("PreToolUse hook module", () => {
	const validInput = {
		session_id: "test-session-123",
		hook_event_name: "PreToolUse" as const,
		tool_name: "Bash",
		tool_input: { command: "ls" },
		tool_use_id: "tool-123",
	};

	describe("PreToolUseInput", () => {
		it("decodes valid wire format", () => {
			const input = Schema.decodeUnknownSync(PreToolUseInput)(validInput);
			expect(input).toBeInstanceOf(PreToolUseInput);
			expect(input.tool_name).toBe("Bash");
			expect(input.hook_event_name).toBe("PreToolUse");
		});

		it("rejects wrong hook_event_name", () => {
			expect(() =>
				Schema.decodeUnknownSync(PreToolUseInput)({
					...validInput,
					hook_event_name: "PostToolUse",
				}),
			).toThrow();
		});
	});

	describe("PreToolUseEvent", () => {
		it("converts from input via fromInput", () => {
			const input = Schema.decodeUnknownSync(PreToolUseInput)(validInput);
			const event = PreToolUseEvent.fromInput(input);
			expect(event).toBeInstanceOf(PreToolUseEvent);
			expect(event.tool_name).toBe("Bash");
		});
	});

	describe("PreToolUseOutputSchema", () => {
		it("accepts executed output with allow action", () => {
			const output = Schema.decodeUnknownSync(PreToolUseOutputSchema)({
				status: "executed",
				action: "allow",
				summary: "allowed tool",
			});
			expect(output.status).toBe("executed");
		});

		it("accepts skipped output", () => {
			const output = Schema.decodeUnknownSync(PreToolUseOutputSchema)({
				status: "skipped",
				summary: "not applicable",
			});
			expect(output.status).toBe("skipped");
		});
	});

	describe("toPreToolUseResponse", () => {
		it("maps allow action to permissionDecision: allow", () => {
			const response = toPreToolUseResponse({
				status: "executed" as const,
				action: "allow" as const,
				summary: "allowed",
			});
			expect(response).toBeInstanceOf(PreToolUseResponse);
			expect(response.permissionDecision).toBe("allow");
		});

		it("maps deny action to permissionDecision: deny", () => {
			const response = toPreToolUseResponse({
				status: "executed" as const,
				action: "deny" as const,
				summary: "denied",
				reason: "dangerous",
			});
			expect(response.permissionDecision).toBe("deny");
			expect(response.reason).toBe("dangerous");
		});
	});

	describe("VALID_OUTCOME_TAGS", () => {
		it("contains correct tags", () => {
			expect(VALID_OUTCOME_TAGS).toEqual(new Set(["Allow", "Deny", "Ask", "Modify", "Skip"]));
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/hooks/PreToolUse.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write PreToolUse hook module**

```typescript
// src/hooks/PreToolUse.ts
import { Schema } from "effect";
import type { Allow } from "../outcomes/Allow.js";
import type { Ask } from "../outcomes/Ask.js";
import type { Deny } from "../outcomes/Deny.js";
import type { Modify } from "../outcomes/Modify.js";
import type { AnyOutcome } from "../outcomes/types.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler, ToolFilter } from "../plugin/handler.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema, HookTypeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import {
	ExecutionQualitySchema,
	HookMetricsSchema,
	ValidationResultSchema,
} from "./shared.js";

// =============================================================================
// INPUT SCHEMA — raw wire format from Claude Code stdin
// =============================================================================

export class PreToolUseInput extends Schema.Class<PreToolUseInput>("PreToolUseInput")({
	session_id: SessionIdSchema,
	transcript_path: Schema.optional(TranscriptPathSchema),
	cwd: Schema.optional(Schema.String),
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	hook_event_name: Schema.Literal("PreToolUse"),
	agent_id: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
	tool_name: Schema.String,
	tool_input: JsonObjectSchema,
	tool_use_id: ToolUseIdSchema,
}) {}

// =============================================================================
// EVENT CLASS — domain model (handlers receive this)
// =============================================================================

export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>("PreToolUseEvent")({
	session_id: SessionIdSchema,
	transcript_path: Schema.optional(TranscriptPathSchema),
	cwd: Schema.optional(Schema.String),
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	hook_event_name: Schema.Literal("PreToolUse"),
	agent_id: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
	tool_name: Schema.String,
	tool_input: JsonObjectSchema,
	tool_use_id: ToolUseIdSchema,
}) {
	static fromInput(input: PreToolUseInput): PreToolUseEvent {
		return new PreToolUseEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_use_id: input.tool_use_id,
		});
	}
}

// =============================================================================
// OUTCOME UNION
// =============================================================================

export type PreToolUseOutcome = Allow | Deny | Ask | Modify | Skip;
export const VALID_OUTCOME_TAGS = new Set(["Allow", "Deny", "Ask", "Modify", "Skip"]);

// =============================================================================
// OUTPUT SCHEMA
// =============================================================================

export const PreToolUseOutputSchema = Schema.Union(
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("allow", "deny", "ask", "modify"),
		summary: Schema.String,
		validation: Schema.optional(ValidationResultSchema),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
		updatedInput: Schema.optional(JsonObjectSchema),
	}),
	Schema.Struct({
		status: Schema.Literal("skipped"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("disabled"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("cached"),
		summary: Schema.String,
		action: Schema.Literal("allow", "deny", "ask", "modify"),
		reason: Schema.optional(Schema.String),
		updatedInput: Schema.optional(JsonObjectSchema),
	}),
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("timeout"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);
export type PreToolUseOutput = typeof PreToolUseOutputSchema.Type;

// =============================================================================
// RESPONSE SCHEMA
// =============================================================================

export class PreToolUseResponse extends Schema.Class<PreToolUseResponse>("PreToolUseResponse")({
	permissionDecision: Schema.Literal("allow", "deny", "ask"),
	reason: Schema.optional(Schema.String),
	updatedInput: Schema.optional(JsonObjectSchema),
}) {}

export function toPreToolUseResponse(output: PreToolUseOutput): PreToolUseResponse {
	const action = "action" in output ? output.action : undefined;
	let permissionDecision: "allow" | "deny" | "ask" = "allow";
	if (action === "deny") permissionDecision = "deny";
	else if (action === "ask") permissionDecision = "ask";
	return new PreToolUseResponse({
		permissionDecision,
		reason: "reason" in output ? output.reason : undefined,
		updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
	});
}

// =============================================================================
// HANDLER & HOOK DEFINITION TYPES
// =============================================================================

export type PreToolUseHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PreToolUseInput,
	PreToolUseOutput,
	TOptions,
	TState,
	PreToolUseOutcome
>;

export type PreToolUseHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PreToolUseInput,
	PreToolUseOutput,
	unknown,
	TOptions,
	TState,
	PreToolUseOutcome
> & ToolFilter;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/hooks/PreToolUse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/hooks/PreToolUse.ts package/__tests__/hooks/PreToolUse.test.ts
git commit -m "feat: create PreToolUse per-hook module (reference implementation)"
```

---

### Task 7: Create remaining 9 existing hook modules

Create per-hook files for the other 9 hooks that already have typed handlers. Each follows the PreToolUse pattern from Task 6. Read the existing schemas from `hook-events.ts`, `hook-inputs.ts`, `hook-outputs.ts`, and `hook-responses.ts` to get the exact fields.

**Files to create:**
- `src/hooks/PostToolUse.ts`
- `src/hooks/PermissionRequest.ts`
- `src/hooks/SessionStart.ts`
- `src/hooks/SessionEnd.ts`
- `src/hooks/Stop.ts`
- `src/hooks/SubagentStop.ts`
- `src/hooks/UserPromptSubmit.ts`
- `src/hooks/PreCompact.ts`
- `src/hooks/Notification.ts`

For each hook, read the source files for exact fields:

**Hook-specific fields per Input class** (beyond base fields):

| Hook | Extra Input Fields |
|------|-------------------|
| PostToolUse | `tool_name: String`, `tool_input: JsonObject`, `tool_response: JsonObject`, `tool_use_id: ToolUseIdSchema` |
| PermissionRequest | `tool_name: String`, `tool_input: JsonObject`, `tool_use_id: ToolUseIdSchema` |
| SessionStart | `source: SessionStartSourceSchema` |
| SessionEnd | `reason: SessionEndReasonSchema` |
| Stop | `stop_hook_active: optional(Boolean)` |
| SubagentStop | `stop_hook_active: optional(Boolean)`, `agent_id: optional(String)`, `agent_type: optional(String)` |
| UserPromptSubmit | `user_prompt: String` |
| PreCompact | `trigger: PreCompactTriggerSchema`, `transcript_length: optional(Number)`, `estimated_tokens: optional(Number)` |
| Notification | `message: String`, `level: optional(String)`, `title: optional(String)`, `action_url: optional(String)` |

**Outcome unions per hook:**

| Hook | Outcome Union | Output Actions |
|------|--------------|----------------|
| PostToolUse | `Block \| Continue \| AddContext \| NoAction \| Skip` | `block, continue, context, none` |
| PermissionRequest | `Allow \| Deny` | `allow, deny` |
| SessionStart | `AddContext \| NoAction` | `context, none` |
| SessionEnd | `NoAction` (passthrough) | `none` |
| Stop | `Block \| Continue \| Skip` | `block, continue` |
| SubagentStop | `Block \| Continue \| Skip` | `block, continue` |
| UserPromptSubmit | `Block \| Continue \| AddContext \| NoAction \| Skip` | `block, continue, context, none` |
| PreCompact | `NoAction` (passthrough) | `none` |
| Notification | `NoAction` (passthrough) | `none` |

**Response classes per hook** (from `hook-responses.ts`):

| Hook | Response Class | Key Fields |
|------|---------------|------------|
| PostToolUse | `PostToolUseResponse` | `additionalContext?, decision?: "block", reason?` |
| PermissionRequest | `PermissionRequestResponse` | `behavior: "allow"\|"deny", message?, interrupt?, updatedInput?` |
| SessionStart | `SessionStartResponse` | `additionalContext?` |
| SessionEnd | `PassthroughResponse` | (empty) |
| Stop | `StopResponse` | `decision?: "block", reason?` |
| SubagentStop | `StopResponse` (shared with Stop) | `decision?: "block", reason?` |
| UserPromptSubmit | `UserPromptSubmitResponse` | `additionalContext?, decision?: "block", reason?` |
| PreCompact | `PassthroughResponse` | (empty) |
| Notification | `PassthroughResponse` | (empty) |

Note: `SubagentStop` reuses `StopResponse` and `StopOutputSchema`. In the per-hook structure, `SubagentStop.ts` should define its own output schema (identical to Stop's) and import `StopResponse` from `Stop.ts` or define its own.

**For passthrough hooks** (SessionEnd, PreCompact, Notification): they share the `PassthroughOutputSchema` and `PassthroughResponse`. Each hook file should define its own output schema (duplicated, same shape) and its own `PassthroughResponse` class. Alternatively, import `PassthroughOutputSchema` and `PassthroughResponse` from `shared.ts`.

Decision: Add `PassthroughOutputSchema`, `PassthroughResponse`, and `toPassthroughResponse` to `src/hooks/shared.ts` since they're used by many passthrough hooks. Each passthrough hook file imports from shared and re-exports with aliased types:

```typescript
// In SessionEnd.ts
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";
export { PassthroughResponse as SessionEndResponse };
export { toPassthroughResponse as toSessionEndResponse };
export const SessionEndOutputSchema = PassthroughOutputSchema;
export type SessionEndOutput = typeof SessionEndOutputSchema.Type;
```

- [ ] **Step 1: Add PassthroughOutputSchema and PassthroughResponse to shared.ts**

Add to `src/hooks/shared.ts`:

```typescript
// At the bottom of shared.ts

export const PassthroughOutputSchema = Schema.Union(
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
	}),
	Schema.Struct({
		status: Schema.Literal("skipped"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("disabled"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
	}),
);
export type PassthroughOutput = typeof PassthroughOutputSchema.Type;

export class PassthroughResponse extends Schema.Class<PassthroughResponse>("PassthroughResponse")({}) {}

export function toPassthroughResponse(_output: PassthroughOutput): PassthroughResponse {
	return new PassthroughResponse({});
}
```

- [ ] **Step 2: Create all 9 hook module files**

Create each file following the PreToolUse pattern. For each:
1. Read exact fields from `hook-inputs.ts` and `hook-events.ts`
2. Define Input class with all fields explicit (no spreading)
3. Define Event class with `fromInput()` static method
4. Define outcome union type and `VALID_OUTCOME_TAGS`
5. Define output schema (copy from `hook-outputs.ts` or use `PassthroughOutputSchema` from shared)
6. Define response class and `toResponse` function (copy from `hook-responses.ts` or use shared)
7. Define handler type alias and hook definition type

- [ ] **Step 3: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 4: Write tests for each hook module**

At minimum, test that:
- Input decodes valid wire format and rejects wrong `hook_event_name`
- Event converts from Input via `fromInput()`
- `VALID_OUTCOME_TAGS` contains correct tags
- Output schema accepts valid executed output
- `toResponse` produces correct wire format

- [ ] **Step 5: Run tests**

Run: `cd package && bun test __tests__/hooks/`
Expected: All new hook tests pass

- [ ] **Step 6: Commit**

```bash
git add package/src/hooks/ package/__tests__/hooks/
git commit -m "feat: create per-hook modules for 9 existing typed hooks"
```

---

### Task 8: Create 15 new handler hook modules

These hooks have Input and Event schemas in the monolithic files but no handler types. Each gets a full per-hook file with handler type added.

**Files to create:**
- `src/hooks/PostToolUseFailure.ts`
- `src/hooks/StopFailure.ts`
- `src/hooks/SubagentStart.ts`
- `src/hooks/TaskCreated.ts`
- `src/hooks/TaskCompleted.ts`
- `src/hooks/TeammateIdle.ts`
- `src/hooks/InstructionsLoaded.ts`
- `src/hooks/ConfigChange.ts`
- `src/hooks/CwdChanged.ts`
- `src/hooks/FileChanged.ts`
- `src/hooks/WorktreeCreate.ts`
- `src/hooks/WorktreeRemove.ts`
- `src/hooks/PostCompact.ts`
- `src/hooks/Elicitation.ts`
- `src/hooks/ElicitationResult.ts`

**Hook-specific fields** (beyond base fields):

| Hook | Extra Input Fields | Outcome Union |
|------|-------------------|---------------|
| PostToolUseFailure | `tool_name, tool_input, tool_use_id, error: String` | `Block \| Continue \| AddContext \| NoAction \| Skip` |
| StopFailure | `error: StopFailureErrorSchema` | `NoAction` |
| SubagentStart | `agent_id: optional(String), agent_type: optional(String)` | `NoAction` |
| TaskCreated | `task_id: String, subject: String, description: optional(String)` | `Block \| Continue \| Skip` |
| TaskCompleted | `task_id: String, subject: String, status: String` | `Block \| Continue \| Skip` |
| TeammateIdle | `agent_id: optional(String), agent_type: optional(String)` | `Block \| Continue \| Skip` |
| InstructionsLoaded | `reason: InstructionsLoadedReasonSchema, memory_type: optional(InstructionsMemoryTypeSchema), source: optional(String)` | `NoAction` |
| ConfigChange | `source: ConfigChangeSourceSchema, key: optional(String)` | `Block \| Continue \| Skip` |
| CwdChanged | `old_cwd: String, new_cwd: String` | `WatchPaths \| NoAction` |
| FileChanged | `file_path: String, event: FileChangeEventSchema` | `WatchPaths \| NoAction` |
| WorktreeCreate | `worktree_path: String, branch: optional(String)` | `NoAction` |
| WorktreeRemove | `worktree_path: String` | `NoAction` |
| PostCompact | `original_tokens: optional(Number), compacted_tokens: optional(Number)` | `NoAction` |
| Elicitation | `elicitation_id: String, action: ElicitationActionSchema, fields: optional(JsonObject)` | `NoAction` |
| ElicitationResult | `elicitation_id: String, result: optional(JsonObject)` | `NoAction` |

Read exact field definitions from `src/schemas/hook-inputs.ts` and `src/schemas/hook-events.ts` before implementing.

**CwdChanged and FileChanged special handling:**

These hooks use `WatchPaths` outcome. Their response format includes `watchPaths`:

```typescript
// In CwdChanged.ts
export class CwdChangedResponse extends Schema.Class<CwdChangedResponse>("CwdChangedResponse")({
	watchPaths: Schema.optional(Schema.Array(Schema.String)),
}) {}

export function toCwdChangedResponse(output: CwdChangedOutput): CwdChangedResponse {
	// WatchPaths outcome handled by pipeline; this is for legacy output format
	return new CwdChangedResponse({});
}
```

**For hooks with StopOutcome** (TaskCreated, TaskCompleted, TeammateIdle, ConfigChange): They use the same output schema pattern as Stop (block/continue actions). Import or duplicate the Stop output schema structure.

- [ ] **Step 1: Create all 15 hook module files**

Follow the same pattern as Task 6/7. For each:
1. All fields explicit in Input and Event classes
2. `fromInput()` on Event
3. Outcome union and `VALID_OUTCOME_TAGS`
4. Output schema (passthrough hooks use `PassthroughOutputSchema` from shared, stop-like hooks use Stop's pattern)
5. Response class and `toResponse` function
6. Handler type and hook definition type

- [ ] **Step 2: Create CwdChanged test with WatchPaths**

```typescript
// __tests__/hooks/CwdChanged.test.ts
import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { CwdChangedInput, CwdChangedEvent, VALID_OUTCOME_TAGS } from "../../src/hooks/CwdChanged.js";
import { WatchPaths } from "../../src/outcomes/WatchPaths.js";
import { NoAction } from "../../src/outcomes/NoAction.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("CwdChanged hook module", () => {
	const validInput = {
		session_id: "test-session",
		hook_event_name: "CwdChanged" as const,
		old_cwd: "/old/path",
		new_cwd: "/new/path",
	};

	it("decodes valid input", () => {
		const input = Schema.decodeUnknownSync(CwdChangedInput)(validInput);
		expect(input.old_cwd).toBe("/old/path");
		expect(input.new_cwd).toBe("/new/path");
	});

	it("converts to event", () => {
		const input = Schema.decodeUnknownSync(CwdChangedInput)(validInput);
		const event = CwdChangedEvent.fromInput(input);
		expect(event.old_cwd).toBe("/old/path");
	});

	it("VALID_OUTCOME_TAGS includes WatchPaths and NoAction", () => {
		expect(VALID_OUTCOME_TAGS).toEqual(new Set(["WatchPaths", "NoAction"]));
	});

	it("WatchPaths is a valid outcome", () => {
		const wp = new WatchPaths({ paths: ["src/**"] });
		expect(Outcome.isOutcome(wp)).toBe(true);
	});

	it("NoAction is a valid outcome", () => {
		const na = new NoAction({});
		expect(Outcome.isOutcome(na)).toBe(true);
	});
});
```

- [ ] **Step 3: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 4: Run tests**

Run: `cd package && bun test __tests__/hooks/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add package/src/hooks/ package/__tests__/hooks/
git commit -m "feat: create per-hook modules for 15 newly-typed hooks"
```

---

### Task 9: Create PermissionDenied hook module

This is the only hook with no existing code. Build from Anthropic docs.

**Files:**
- Create: `src/hooks/PermissionDenied.ts`
- Create: `__tests__/hooks/PermissionDenied.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/hooks/PermissionDenied.test.ts
import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
	PermissionDeniedInput,
	PermissionDeniedEvent,
	PermissionDeniedResponse,
	toPermissionDeniedResponse,
	VALID_OUTCOME_TAGS,
} from "../../src/hooks/PermissionDenied.js";
import { Retry } from "../../src/outcomes/Retry.js";
import { NoAction } from "../../src/outcomes/NoAction.js";

describe("PermissionDenied hook module", () => {
	const validInput = {
		session_id: "test-session",
		hook_event_name: "PermissionDenied" as const,
		tool_name: "Bash",
		tool_input: { command: "rm -rf /" },
		tool_use_id: "tool-456",
		denial_reason: "User denied dangerous command",
	};

	describe("PermissionDeniedInput", () => {
		it("decodes valid wire format", () => {
			const input = Schema.decodeUnknownSync(PermissionDeniedInput)(validInput);
			expect(input.tool_name).toBe("Bash");
			expect(input.denial_reason).toBe("User denied dangerous command");
		});

		it("rejects wrong hook_event_name", () => {
			expect(() =>
				Schema.decodeUnknownSync(PermissionDeniedInput)({
					...validInput,
					hook_event_name: "PreToolUse",
				}),
			).toThrow();
		});
	});

	describe("PermissionDeniedEvent", () => {
		it("converts from input", () => {
			const input = Schema.decodeUnknownSync(PermissionDeniedInput)(validInput);
			const event = PermissionDeniedEvent.fromInput(input);
			expect(event.tool_name).toBe("Bash");
		});
	});

	describe("VALID_OUTCOME_TAGS", () => {
		it("contains Retry and NoAction", () => {
			expect(VALID_OUTCOME_TAGS).toEqual(new Set(["Retry", "NoAction"]));
		});
	});

	describe("toPermissionDeniedResponse", () => {
		it("produces retry response from Retry outcome", () => {
			const output = {
				status: "executed" as const,
				action: "none" as const,
				summary: "retrying",
				retry: true,
			};
			const response = toPermissionDeniedResponse(output);
			expect(response).toBeInstanceOf(PermissionDeniedResponse);
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/hooks/PermissionDenied.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write PermissionDenied hook module**

```typescript
// src/hooks/PermissionDenied.ts
import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { Retry } from "../outcomes/Retry.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export class PermissionDeniedInput extends Schema.Class<PermissionDeniedInput>("PermissionDeniedInput")({
	session_id: SessionIdSchema,
	transcript_path: Schema.optional(TranscriptPathSchema),
	cwd: Schema.optional(Schema.String),
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	hook_event_name: Schema.Literal("PermissionDenied"),
	agent_id: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
	tool_name: Schema.String,
	tool_input: JsonObjectSchema,
	tool_use_id: ToolUseIdSchema,
	denial_reason: Schema.optional(Schema.String),
}) {}

// =============================================================================
// EVENT CLASS
// =============================================================================

export class PermissionDeniedEvent extends Schema.Class<PermissionDeniedEvent>("PermissionDeniedEvent")({
	session_id: SessionIdSchema,
	transcript_path: Schema.optional(TranscriptPathSchema),
	cwd: Schema.optional(Schema.String),
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	hook_event_name: Schema.Literal("PermissionDenied"),
	agent_id: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
	tool_name: Schema.String,
	tool_input: JsonObjectSchema,
	tool_use_id: ToolUseIdSchema,
	denial_reason: Schema.optional(Schema.String),
}) {
	static fromInput(input: PermissionDeniedInput): PermissionDeniedEvent {
		return new PermissionDeniedEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_use_id: input.tool_use_id,
			denial_reason: input.denial_reason,
		});
	}
}

// =============================================================================
// OUTCOME UNION
// =============================================================================

export type PermissionDeniedOutcome = Retry | NoAction;
export const VALID_OUTCOME_TAGS = new Set(["Retry", "NoAction"]);

// =============================================================================
// OUTPUT SCHEMA
// =============================================================================

export const PermissionDeniedOutputSchema = Schema.Union(
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		retry: Schema.optional(Schema.Boolean),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
	}),
	Schema.Struct({
		status: Schema.Literal("skipped"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
	}),
);
export type PermissionDeniedOutput = typeof PermissionDeniedOutputSchema.Type;

// =============================================================================
// RESPONSE SCHEMA
// =============================================================================

export class PermissionDeniedResponse extends Schema.Class<PermissionDeniedResponse>("PermissionDeniedResponse")({
	hookSpecificOutput: Schema.optional(Schema.Struct({
		retry: Schema.Boolean,
	})),
}) {}

export function toPermissionDeniedResponse(output: PermissionDeniedOutput): PermissionDeniedResponse {
	if ("retry" in output && output.retry) {
		return new PermissionDeniedResponse({
			hookSpecificOutput: { retry: true },
		});
	}
	return new PermissionDeniedResponse({});
}

// =============================================================================
// HANDLER & HOOK DEFINITION TYPES
// =============================================================================

export type PermissionDeniedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PermissionDeniedInput,
	PermissionDeniedOutput,
	TOptions,
	TState,
	PermissionDeniedOutcome
>;

export type PermissionDeniedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PermissionDeniedInput,
	PermissionDeniedOutput,
	unknown,
	TOptions,
	TState,
	PermissionDeniedOutcome
>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/hooks/PermissionDenied.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/hooks/PermissionDenied.ts package/__tests__/hooks/PermissionDenied.test.ts
git commit -m "feat: add PermissionDenied hook with Retry outcome"
```

---

### Task 10: Create hooks/types.ts (composed types)

**Files:**
- Create: `src/hooks/types.ts`

- [ ] **Step 1: Create `src/hooks/types.ts`**

This file imports from all 26 hook modules and composes:

```typescript
// src/hooks/types.ts
import type { PreToolUseHookDefinition, PreToolUseOutcome, PreToolUseHandler } from "./PreToolUse.js";
import type { PostToolUseHookDefinition, PostToolUseOutcome, PostToolUseHandler } from "./PostToolUse.js";
import type { PostToolUseFailureHookDefinition, PostToolUseFailureOutcome, PostToolUseFailureHandler } from "./PostToolUseFailure.js";
import type { PermissionRequestHookDefinition, PermissionRequestOutcome, PermissionRequestHandler } from "./PermissionRequest.js";
import type { PermissionDeniedHookDefinition, PermissionDeniedOutcome, PermissionDeniedHandler } from "./PermissionDenied.js";
import type { SessionStartHookDefinition, SessionStartOutcome, SessionStartHandler } from "./SessionStart.js";
import type { SessionEndHookDefinition, SessionEndOutcome, SessionEndHandler } from "./SessionEnd.js";
import type { StopHookDefinition, StopOutcome, StopHandler } from "./Stop.js";
import type { StopFailureHookDefinition, StopFailureOutcome, StopFailureHandler } from "./StopFailure.js";
import type { SubagentStartHookDefinition, SubagentStartOutcome, SubagentStartHandler } from "./SubagentStart.js";
import type { SubagentStopHookDefinition, SubagentStopOutcome, SubagentStopHandler } from "./SubagentStop.js";
import type { UserPromptSubmitHookDefinition, UserPromptSubmitOutcome, UserPromptSubmitHandler } from "./UserPromptSubmit.js";
import type { PreCompactHookDefinition, PreCompactOutcome, PreCompactHandler } from "./PreCompact.js";
import type { PostCompactHookDefinition, PostCompactOutcome, PostCompactHandler } from "./PostCompact.js";
import type { NotificationHookDefinition, NotificationOutcome, NotificationHandler } from "./Notification.js";
import type { TaskCreatedHookDefinition, TaskCreatedOutcome, TaskCreatedHandler } from "./TaskCreated.js";
import type { TaskCompletedHookDefinition, TaskCompletedOutcome, TaskCompletedHandler } from "./TaskCompleted.js";
import type { TeammateIdleHookDefinition, TeammateIdleOutcome, TeammateIdleHandler } from "./TeammateIdle.js";
import type { InstructionsLoadedHookDefinition, InstructionsLoadedOutcome, InstructionsLoadedHandler } from "./InstructionsLoaded.js";
import type { ConfigChangeHookDefinition, ConfigChangeOutcome, ConfigChangeHandler } from "./ConfigChange.js";
import type { CwdChangedHookDefinition, CwdChangedOutcome, CwdChangedHandler } from "./CwdChanged.js";
import type { FileChangedHookDefinition, FileChangedOutcome, FileChangedHandler } from "./FileChanged.js";
import type { WorktreeCreateHookDefinition, WorktreeCreateOutcome, WorktreeCreateHandler } from "./WorktreeCreate.js";
import type { WorktreeRemoveHookDefinition, WorktreeRemoveOutcome, WorktreeRemoveHandler } from "./WorktreeRemove.js";
import type { ElicitationHookDefinition, ElicitationOutcome, ElicitationHandler } from "./Elicitation.js";
import type { ElicitationResultHookDefinition, ElicitationResultOutcome, ElicitationResultHandler } from "./ElicitationResult.js";

import { VALID_OUTCOME_TAGS as PreToolUseTags } from "./PreToolUse.js";
import { VALID_OUTCOME_TAGS as PostToolUseTags } from "./PostToolUse.js";
import { VALID_OUTCOME_TAGS as PostToolUseFailureTags } from "./PostToolUseFailure.js";
import { VALID_OUTCOME_TAGS as PermissionRequestTags } from "./PermissionRequest.js";
import { VALID_OUTCOME_TAGS as PermissionDeniedTags } from "./PermissionDenied.js";
import { VALID_OUTCOME_TAGS as SessionStartTags } from "./SessionStart.js";
import { VALID_OUTCOME_TAGS as SessionEndTags } from "./SessionEnd.js";
import { VALID_OUTCOME_TAGS as StopTags } from "./Stop.js";
import { VALID_OUTCOME_TAGS as StopFailureTags } from "./StopFailure.js";
import { VALID_OUTCOME_TAGS as SubagentStartTags } from "./SubagentStart.js";
import { VALID_OUTCOME_TAGS as SubagentStopTags } from "./SubagentStop.js";
import { VALID_OUTCOME_TAGS as UserPromptSubmitTags } from "./UserPromptSubmit.js";
import { VALID_OUTCOME_TAGS as PreCompactTags } from "./PreCompact.js";
import { VALID_OUTCOME_TAGS as PostCompactTags } from "./PostCompact.js";
import { VALID_OUTCOME_TAGS as NotificationTags } from "./Notification.js";
import { VALID_OUTCOME_TAGS as TaskCreatedTags } from "./TaskCreated.js";
import { VALID_OUTCOME_TAGS as TaskCompletedTags } from "./TaskCompleted.js";
import { VALID_OUTCOME_TAGS as TeammateIdleTags } from "./TeammateIdle.js";
import { VALID_OUTCOME_TAGS as InstructionsLoadedTags } from "./InstructionsLoaded.js";
import { VALID_OUTCOME_TAGS as ConfigChangeTags } from "./ConfigChange.js";
import { VALID_OUTCOME_TAGS as CwdChangedTags } from "./CwdChanged.js";
import { VALID_OUTCOME_TAGS as FileChangedTags } from "./FileChanged.js";
import { VALID_OUTCOME_TAGS as WorktreeCreateTags } from "./WorktreeCreate.js";
import { VALID_OUTCOME_TAGS as WorktreeRemoveTags } from "./WorktreeRemove.js";
import { VALID_OUTCOME_TAGS as ElicitationTags } from "./Elicitation.js";
import { VALID_OUTCOME_TAGS as ElicitationResultTags } from "./ElicitationResult.js";

import type { InferPluginOptions, InferPluginState } from "../plugin/infer.js";
import { Outcome } from "../outcomes/Outcome.js";

// =============================================================================
// HOOKS MAP
// =============================================================================

export interface HooksMap<TOptions, TState = Record<string, unknown>> {
	SessionStart?: SessionStartHookDefinition<TOptions, TState>[];
	SessionEnd?: SessionEndHookDefinition<TOptions, TState>[];
	PreToolUse?: PreToolUseHookDefinition<TOptions, TState>[];
	PostToolUse?: PostToolUseHookDefinition<TOptions, TState>[];
	PostToolUseFailure?: PostToolUseFailureHookDefinition<TOptions, TState>[];
	PermissionRequest?: PermissionRequestHookDefinition<TOptions, TState>[];
	PermissionDenied?: PermissionDeniedHookDefinition<TOptions, TState>[];
	Stop?: StopHookDefinition<TOptions, TState>[];
	StopFailure?: StopFailureHookDefinition<TOptions, TState>[];
	SubagentStart?: SubagentStartHookDefinition<TOptions, TState>[];
	SubagentStop?: SubagentStopHookDefinition<TOptions, TState>[];
	UserPromptSubmit?: UserPromptSubmitHookDefinition<TOptions, TState>[];
	PreCompact?: PreCompactHookDefinition<TOptions, TState>[];
	PostCompact?: PostCompactHookDefinition<TOptions, TState>[];
	Notification?: NotificationHookDefinition<TOptions, TState>[];
	TaskCreated?: TaskCreatedHookDefinition<TOptions, TState>[];
	TaskCompleted?: TaskCompletedHookDefinition<TOptions, TState>[];
	TeammateIdle?: TeammateIdleHookDefinition<TOptions, TState>[];
	InstructionsLoaded?: InstructionsLoadedHookDefinition<TOptions, TState>[];
	ConfigChange?: ConfigChangeHookDefinition<TOptions, TState>[];
	CwdChanged?: CwdChangedHookDefinition<TOptions, TState>[];
	FileChanged?: FileChangedHookDefinition<TOptions, TState>[];
	WorktreeCreate?: WorktreeCreateHookDefinition<TOptions, TState>[];
	WorktreeRemove?: WorktreeRemoveHookDefinition<TOptions, TState>[];
	Elicitation?: ElicitationHookDefinition<TOptions, TState>[];
	ElicitationResult?: ElicitationResultHookDefinition<TOptions, TState>[];
}

// =============================================================================
// INFER HANDLERS
// =============================================================================

export interface InferHandlers<T> {
	SessionStart: SessionStartHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SessionEnd: SessionEndHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreToolUse: PreToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PostToolUse: PostToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PostToolUseFailure: PostToolUseFailureHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PermissionRequest: PermissionRequestHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PermissionDenied: PermissionDeniedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	Stop: StopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	StopFailure: StopFailureHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SubagentStart: SubagentStartHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SubagentStop: SubagentStopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	UserPromptSubmit: UserPromptSubmitHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreCompact: PreCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PostCompact: PostCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;
	Notification: NotificationHandler<InferPluginOptions<T>, InferPluginState<T>>;
	TaskCreated: TaskCreatedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	TaskCompleted: TaskCompletedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	TeammateIdle: TeammateIdleHandler<InferPluginOptions<T>, InferPluginState<T>>;
	InstructionsLoaded: InstructionsLoadedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	ConfigChange: ConfigChangeHandler<InferPluginOptions<T>, InferPluginState<T>>;
	CwdChanged: CwdChangedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	FileChanged: FileChangedHandler<InferPluginOptions<T>, InferPluginState<T>>;
	WorktreeCreate: WorktreeCreateHandler<InferPluginOptions<T>, InferPluginState<T>>;
	WorktreeRemove: WorktreeRemoveHandler<InferPluginOptions<T>, InferPluginState<T>>;
	Elicitation: ElicitationHandler<InferPluginOptions<T>, InferPluginState<T>>;
	ElicitationResult: ElicitationResultHandler<InferPluginOptions<T>, InferPluginState<T>>;
}

// =============================================================================
// HOOK OUTCOME MAP
// =============================================================================

export interface HookOutcomeMap {
	PreToolUse: PreToolUseOutcome;
	PostToolUse: PostToolUseOutcome;
	PostToolUseFailure: PostToolUseFailureOutcome;
	SessionStart: SessionStartOutcome;
	SessionEnd: SessionEndOutcome;
	Stop: StopOutcome;
	StopFailure: StopFailureOutcome;
	SubagentStart: SubagentStartOutcome;
	SubagentStop: SubagentStopOutcome;
	TaskCreated: TaskCreatedOutcome;
	TaskCompleted: TaskCompletedOutcome;
	TeammateIdle: TeammateIdleOutcome;
	InstructionsLoaded: InstructionsLoadedOutcome;
	ConfigChange: ConfigChangeOutcome;
	CwdChanged: CwdChangedOutcome;
	FileChanged: FileChangedOutcome;
	WorktreeCreate: WorktreeCreateOutcome;
	WorktreeRemove: WorktreeRemoveOutcome;
	UserPromptSubmit: UserPromptSubmitOutcome;
	PreCompact: PreCompactOutcome;
	PostCompact: PostCompactOutcome;
	Elicitation: ElicitationOutcome;
	ElicitationResult: ElicitationResultOutcome;
	Notification: NotificationOutcome;
	PermissionRequest: PermissionRequestOutcome;
	PermissionDenied: PermissionDeniedOutcome;
}

// =============================================================================
// RUNTIME VALIDATION
// =============================================================================

const ALL_VALID_OUTCOME_TAGS: Record<string, Set<string>> = {
	PreToolUse: PreToolUseTags,
	PostToolUse: PostToolUseTags,
	PostToolUseFailure: PostToolUseFailureTags,
	PermissionRequest: PermissionRequestTags,
	PermissionDenied: PermissionDeniedTags,
	SessionStart: SessionStartTags,
	SessionEnd: SessionEndTags,
	Stop: StopTags,
	StopFailure: StopFailureTags,
	SubagentStart: SubagentStartTags,
	SubagentStop: SubagentStopTags,
	UserPromptSubmit: UserPromptSubmitTags,
	PreCompact: PreCompactTags,
	PostCompact: PostCompactTags,
	Notification: NotificationTags,
	TaskCreated: TaskCreatedTags,
	TaskCompleted: TaskCompletedTags,
	TeammateIdle: TeammateIdleTags,
	InstructionsLoaded: InstructionsLoadedTags,
	ConfigChange: ConfigChangeTags,
	CwdChanged: CwdChangedTags,
	FileChanged: FileChangedTags,
	WorktreeCreate: WorktreeCreateTags,
	WorktreeRemove: WorktreeRemoveTags,
	Elicitation: ElicitationTags,
	ElicitationResult: ElicitationResultTags,
};

export function isValidOutcomeForHook(hookType: string, outcome: unknown): boolean {
	if (!Outcome.isOutcome(outcome)) return false;
	const validTags = ALL_VALID_OUTCOME_TAGS[hookType];
	if (!validTags) return false;
	const tag = (outcome.constructor as { _tag?: string })._tag;
	if (!tag) return false;
	if (validTags.has(tag)) return true;
	let proto = Object.getPrototypeOf(outcome);
	while (proto && proto !== Outcome.prototype) {
		const protoTag = (proto.constructor as { _tag?: string })._tag;
		if (protoTag && validTags.has(protoTag)) return true;
		proto = Object.getPrototypeOf(proto);
	}
	return false;
}
```

Fill in all 26 `VALID_OUTCOME_TAGS` imports in the `ALL_VALID_OUTCOME_TAGS` record.

- [ ] **Step 2: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add package/src/hooks/types.ts
git commit -m "feat: create composed HooksMap, InferHandlers, HookOutcomeMap from per-hook modules"
```

---

### Task 11: Update internal consumers to use hook modules

**Files to modify:**
- `src/layers/PluginRuntimeServiceLive.ts`
- `src/types/pipeline.ts`
- `src/testing/mocks.ts`
- `src/testing/builder.ts`

- [ ] **Step 1: Update PluginRuntimeServiceLive.ts**

This is the most complex consumer. It imports Events, Inputs, Outputs, Responses, and `isValidOutcomeForHook`. Change all imports to come from per-hook files and `hooks/types.ts`:

- Event imports: `import { PreToolUseEvent } from "../hooks/PreToolUse.js"`
- Input imports: `import { PreToolUseInput } from "../hooks/PreToolUse.js"`
- Output imports: `import type { PreToolUseOutput } from "../hooks/PreToolUse.js"`
- Response imports: `import { toPreToolUseResponse } from "../hooks/PreToolUse.js"`
- Validation: `import { isValidOutcomeForHook } from "../hooks/types.js"`
- Handler types: `import type { PluginHandler } from "../plugin/handler.js"`

Read the file first to see all imports and update each one.

- [ ] **Step 2: Update types/pipeline.ts**

Change imports of Output types and `HandlerHookDefinition` to new locations.

- [ ] **Step 3: Update testing/mocks.ts**

Change `IO` import to `../plugin/handler.js` and `HookEventBase` to the correct hook module or shared location.

Note: `HookEventBase` is a type alias in `hook-inputs.ts`. Since we're not keeping that file, define `HookEventBase` in `src/hooks/shared.ts` as a type representing the common base fields.

- [ ] **Step 4: Update testing/builder.ts**

Change imports to new locations.

- [ ] **Step 5: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add package/src/layers/ package/src/types/ package/src/testing/
git commit -m "refactor: update internal consumers to import from per-hook modules"
```

---

### Task 12: Update config.ts to use hooks/types.ts

**Files:**
- Modify: `src/plugin/config.ts`

- [ ] **Step 1: Remove handler types and HooksMap from config.ts**

Now that `HooksMap` and `InferHandlers` live in `src/hooks/types.ts`, remove:
- All 10 handler type aliases (`SessionStartHandler`, `PreToolUseHandler`, etc.)
- All 10 hook definition types
- `HooksMap` interface
- `InferHandlers` interface

`config.ts` now imports `HooksMap` from `../hooks/types.js` for use in `ClaudePlugin` and `PluginConfigOptions`.

- [ ] **Step 2: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 3: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add package/src/plugin/config.ts
git commit -m "refactor: remove handler types from config.ts, import from hooks/types.ts"
```

---

### Task 13: Delete monolithic schema files

**Files to delete:**
- `src/schemas/hook-events.ts`
- `src/schemas/hook-inputs.ts`
- `src/schemas/hook-outputs.ts`
- `src/schemas/hook-responses.ts`
- `src/outcomes/types.ts`

- [ ] **Step 1: Verify no remaining imports**

Search for any remaining imports from the files about to be deleted:

Run: `cd package && grep -r "hook-events\|hook-inputs\|hook-outputs\|hook-responses\|outcomes/types" src/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules`

Fix any remaining imports before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm package/src/schemas/hook-events.ts
rm package/src/schemas/hook-inputs.ts
rm package/src/schemas/hook-outputs.ts
rm package/src/schemas/hook-responses.ts
rm package/src/outcomes/types.ts
```

- [ ] **Step 3: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -u package/src/schemas/ package/src/outcomes/
git commit -m "refactor: delete monolithic hook schema files (moved to per-hook modules)"
```

---

### Task 14: Update test file imports

**Files to modify:**
- `__tests__/schemas/hook-events.test.ts`
- `__tests__/schemas/hook-inputs.test.ts`
- `__tests__/schemas/hook-outputs.test.ts`
- `__tests__/schemas/hook-responses.test.ts`
- `__tests__/outcomes/types.test.ts`
- `__tests__/plugin/config.test.ts`
- `__tests__/plugin/pluginconfig.test.ts`
- `__tests__/testing/mocks.test.ts`
- `__tests__/testing/builder.test.ts`

- [ ] **Step 1: Update or reorganize test files**

The old test files (`hook-events.test.ts`, `hook-inputs.test.ts`, etc.) tested the monolithic files. Options:
1. Move their test cases into per-hook test files (e.g., `__tests__/hooks/PreToolUse.test.ts` gets the PreToolUse cases)
2. Update import paths to point at per-hook modules

Option 1 is cleaner for the long term but is more work. Option 2 is faster.

Choose option 2 for now: update imports in existing test files to point at the new module locations. The test logic stays the same.

For each test file, read it first, then update imports:
- `hook-events.test.ts`: Event imports come from `../../src/hooks/{HookType}.js`
- `hook-inputs.test.ts`: Input imports come from `../../src/hooks/{HookType}.js`
- `hook-outputs.test.ts`: Output schema imports come from `../../src/hooks/{HookType}.js` and `../../src/hooks/shared.js`
- `hook-responses.test.ts`: Response imports come from `../../src/hooks/{HookType}.js`
- `types.test.ts`: `isValidOutcomeForHook` import comes from `../../src/hooks/types.js`
- `config.test.ts`: Verify all imports still resolve
- `pluginconfig.test.ts`: `InferHandlers` import comes from `../../src/hooks/types.js`

- [ ] **Step 2: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass (993+, plus new tests from Tasks 1-9)

- [ ] **Step 3: Commit**

```bash
git add package/__tests__/
git commit -m "refactor: update test imports to per-hook module locations"
```

---

### Task 15: Update public API (index.ts)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read current index.ts**

Read `src/index.ts` to see all current re-exports.

- [ ] **Step 2: Update re-export paths**

All existing exports keep the same names, just come from new source files:

```typescript
// Outcome types — from per-hook modules via hooks/types.ts
export type { HookOutcomeMap, HooksMap, InferHandlers } from "./hooks/types.js";
export { isValidOutcomeForHook } from "./hooks/types.js";

// Per-hook types — from individual hook modules
export { PreToolUseInput, PreToolUseEvent, PreToolUseResponse, toPreToolUseResponse } from "./hooks/PreToolUse.js";
export type { PreToolUseOutcome, PreToolUseOutput, PreToolUseHandler, PreToolUseHookDefinition } from "./hooks/PreToolUse.js";
// ... repeat for all 26 hooks

// New exports
export { Retry } from "./outcomes/Retry.js";
export { WatchPaths } from "./outcomes/WatchPaths.js";
export { PermissionDeniedInput, PermissionDeniedEvent } from "./hooks/PermissionDenied.js";
export type { PermissionDeniedOutcome, PermissionDeniedHandler } from "./hooks/PermissionDenied.js";

// 15 newly-typed handler exports
export type { PostToolUseFailureHandler, PostToolUseFailureHookDefinition } from "./hooks/PostToolUseFailure.js";
export type { StopFailureHandler, StopFailureHookDefinition } from "./hooks/StopFailure.js";
// ... etc for all 15 new handlers

// Plugin config — from split files
export { PluginConfig, ClaudePlugin } from "./plugin/config.js";
export type { PluginBuildOptions } from "./plugin/config.js";
export type { PluginHandler, HandlerContext, HookDefinition, ToolFilter, IO } from "./plugin/handler.js";
export type { CommandDefinition, CommandHandler, CommandOutput } from "./plugin/commands.js";
export type { InferPluginOptions, InferPluginState, InferPluginCommands } from "./plugin/infer.js";
export type { BaseState, SetupContext, SetupFunction } from "./plugin/state.js";

// Shared schemas
export {
	ExecutionStatusSchema, HookActionSchema, ValidationResultSchema,
	ExecutionQualitySchema, HookMetricsSchema, HookOutputBaseSchema,
	getSchemaMetadata,
} from "./hooks/shared.js";
export type {
	ExecutionStatus, HookAction, ValidationResult,
	ExecutionQuality, HookMetrics, HookOutputBase,
	HookEventSchemaMetadata,
} from "./hooks/shared.js";
```

- [ ] **Step 3: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 4: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add package/src/index.ts
git commit -m "refactor: update public API exports to per-hook module locations"
```

---

### Task 16: Add @effect/platform Path conversion to Event classes

**Files to modify:** All 26 `src/hooks/*.ts` files (Event classes)

- [ ] **Step 1: Determine which fields become Path**

Fields that are file paths across all hooks:
- `transcript_path` (optional, all hooks) — absolute file path
- `cwd` (optional, most hooks) — absolute directory path
- `old_cwd` (CwdChanged) — absolute directory path
- `new_cwd` (CwdChanged) — absolute directory path
- `file_path` (FileChanged) — absolute file path
- `worktree_path` (WorktreeCreate, WorktreeRemove) — absolute directory path

These should be normalized in `fromInput()`. Since `@effect/platform` `Path` is a service (not a value type), the practical approach is:

1. Use Node.js `path.normalize()` in `fromInput()` to normalize paths
2. Keep the fields as branded string types in the Event (same as Input)
3. The normalization provides cross-platform safety

Alternatively, create a `NormalizedPath` branded type in `src/schemas/branded.ts`:

```typescript
export const NormalizedPathSchema = Schema.String.pipe(Schema.brand("NormalizedPath"));
export type NormalizedPath = typeof NormalizedPathSchema.Type;
```

And use it in Event classes for path fields, with `fromInput()` normalizing via `path.normalize()`.

- [ ] **Step 2: Add NormalizedPath branded type to branded.ts**

```typescript
// Add to src/schemas/branded.ts
import { normalize } from "node:path";

export const NormalizedPathSchema = Schema.String.pipe(Schema.brand("NormalizedPath"));
export type NormalizedPath = typeof NormalizedPathSchema.Type;

export function normalizePath(p: string): NormalizedPath {
	return normalize(p) as NormalizedPath;
}
```

- [ ] **Step 3: Update Event classes to use NormalizedPath**

In each hook's Event class, change path fields from `Schema.String` or `TranscriptPathSchema` to `NormalizedPathSchema`. Update `fromInput()` to normalize:

```typescript
// Example in PreToolUse.ts Event class
static fromInput(input: PreToolUseInput): PreToolUseEvent {
	return new PreToolUseEvent({
		...input,
		cwd: input.cwd ? normalizePath(input.cwd) : undefined,
		transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
	});
}
```

- [ ] **Step 4: Update tests for path normalization**

Add tests that verify `fromInput()` normalizes paths.

- [ ] **Step 5: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add package/src/schemas/branded.ts package/src/hooks/ package/__tests__/
git commit -m "feat: add NormalizedPath branded type, normalize paths in Event.fromInput()"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd package && bun test`
Expected: All tests pass (993+ original + new tests)

- [ ] **Step 2: Run type check**

Run: `cd package && bun run typecheck`
Expected: 0 errors

- [ ] **Step 3: Run lint**

Run: `cd package && bun run lint:fix`
Expected: Clean or only auto-fixable issues

- [ ] **Step 4: Verify no old imports remain**

Run: `cd package && grep -r "schemas/hook-events\|schemas/hook-inputs\|schemas/hook-outputs\|schemas/hook-responses\|outcomes/types" src/ __tests__/ --include="*.ts" | grep -v node_modules`

Expected: No matches

- [ ] **Step 5: Verify deleted files don't exist**

```bash
ls package/src/schemas/hook-events.ts 2>&1  # Should say "No such file"
ls package/src/schemas/hook-inputs.ts 2>&1
ls package/src/schemas/hook-outputs.ts 2>&1
ls package/src/schemas/hook-responses.ts 2>&1
ls package/src/outcomes/types.ts 2>&1
```

- [ ] **Step 6: Build test plugin to verify end-to-end**

Run: `cd plugin && bun run build`
Expected: Build succeeds

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final hooks refactor cleanup and verification"
```
