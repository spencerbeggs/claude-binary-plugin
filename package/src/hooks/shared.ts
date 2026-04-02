import { Schema } from "effect";
import { JsonObjectSchema } from "../schemas/json.js";

// =============================================================================
// SCHEMA METADATA
// =============================================================================

/**
 * Metadata structure for hook event schemas.
 *
 * @remarks
 * This metadata is attached to schemas via custom annotations,
 * enabling documentation generation and introspection.
 *
 * @public
 */
export interface HookEventSchemaMetadata {
	/** Human-readable description of when this event fires */
	description: string;
	/** Capabilities this hook provides (e.g., ["allow", "deny", "modify"]) */
	capabilities?: string[];
}

/** Custom annotation key for hook event description. */
export const DescriptionAnnotation = Symbol.for("HookEventDescription");

/** Custom annotation key for hook event capabilities. */
export const CapabilitiesAnnotation = Symbol.for("HookEventCapabilities");

/**
 * Retrieve metadata from a schema's annotations.
 *
 * @param schema - An Effect Schema instance
 * @returns The metadata if present, or undefined
 * @public
 */
export function getSchemaMetadata(schema: Schema.Schema.Any): HookEventSchemaMetadata | undefined {
	const annotations = (schema.ast as { annotations?: Record<symbol, unknown> }).annotations;
	if (!annotations) return undefined;
	const description = annotations[DescriptionAnnotation];
	if (!description) return undefined;
	const capabilities = annotations[CapabilitiesAnnotation] as string[] | undefined;
	const meta: HookEventSchemaMetadata = { description: description as string };
	if (capabilities) {
		meta.capabilities = capabilities;
	}
	return meta;
}

// =============================================================================
// EXECUTION STATUS
// =============================================================================

/**
 * Execution status indicating whether the hook ran and how.
 *
 * @remarks
 * The status field is the discriminator for hook output types. Each status
 * has different valid fields and actions:
 *
 * | Status | Meaning | Has Action? |
 * |--------|---------|-------------|
 * | `executed` | Hook ran normally | Yes (required) |
 * | `skipped` | Hook didn't apply (filter mismatch, not applicable) | No |
 * | `disabled` | Preconditions failed (missing tool, config error) | No |
 * | `cached` | Used cached result from previous invocation | Yes |
 * | `error` | Uncaught exception during execution | No |
 * | `timeout` | Exceeded configured time limit | No |
 *
 * @schema
 * @public
 */
export const ExecutionStatusSchema = Schema.Literal(
	"executed", // Hook ran normally
	"skipped", // Didn't need to run (filter, not applicable)
	"disabled", // Couldn't run (preconditions failed)
	"cached", // Used cached result from previous run
	"error", // Unexpected failure (exception thrown)
	"timeout", // Exceeded time limit
);

/** @public */
export type ExecutionStatus = typeof ExecutionStatusSchema.Type;

// =============================================================================
// HOOK ACTION
// =============================================================================

/**
 * Hook action indicating what decision the hook made.
 *
 * @remarks
 * The action field is only present when `status` is `"executed"` or `"cached"`.
 * Valid actions depend on the hook type:
 *
 * **Permission decisions** (PreToolUse, PermissionRequest):
 * - `allow` - Permit the tool/action to proceed
 * - `deny` - Reject the tool/action with a reason
 * - `ask` - Defer decision to the user (PreToolUse only)
 *
 * **Continuation control** (Stop, SubagentStop, PostToolUse, UserPromptSubmit):
 * - `block` - Prevent the agent from stopping (requires `reason`)
 * - `continue` - Allow normal flow to proceed
 *
 * **Content modification** (SessionStart, PostToolUse, UserPromptSubmit):
 * - `modify` - Changed the tool input (PreToolUse) via `updatedInput`
 * - `context` - Added context for Claude via `claudeContext`
 *
 * **No-op** (all hooks):
 * - `none` - Hook analyzed but took no action
 *
 * @schema
 * @public
 */
export const HookActionSchema = Schema.Literal(
	// Permission decisions (PreToolUse, PermissionRequest)
	"allow", // Permitted the action
	"deny", // Rejected the action
	"ask", // Deferred to user for decision

	// Continuation control (Stop, SubagentStop, PostToolUse)
	"block", // Prevented continuation
	"continue", // Allowed continuation

	// Content changes
	"modify", // Changed input or output
	"context", // Added context for Claude

	// No-op
	"none", // Analyzed but took no action
);

/** @public */
export type HookAction = typeof HookActionSchema.Type;

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Validation result - For hooks that perform linting/checking.
 * Optional field, only for validation-oriented hooks.
 * @schema
 * @public
 */
export const ValidationResultSchema = Schema.Literal(
	"passed", // All checks passed
	"fixed", // Found issues, auto-fixed them
	"failed", // Found unfixable issues
	"warning", // Passed but with warnings
);

/** @public */
export type ValidationResult = typeof ValidationResultSchema.Type;

// =============================================================================
// EXECUTION QUALITY
// =============================================================================

/**
 * Execution quality indicators.
 * Tracks degraded or partial execution states.
 * @schema
 * @public
 */
export const ExecutionQualitySchema = Schema.Struct({
	/** Hook ran with reduced functionality */
	degraded: Schema.optional(Schema.Boolean),
	/** Why execution was degraded (e.g., "shellcheck unavailable") */
	degradedReason: Schema.optional(Schema.String),
	/** Hook only partially completed */
	partial: Schema.optional(Schema.Boolean),
	/** Hook used fallback behavior */
	fallback: Schema.optional(Schema.Boolean),
});

/** @public */
export type ExecutionQuality = typeof ExecutionQualitySchema.Type;

// =============================================================================
// HOOK METRICS
// =============================================================================

/**
 * User-provided metrics for telemetry.
 * Domain-specific metrics that require hook knowledge.
 * @schema
 * @public
 */
export const HookMetricsSchema = Schema.Struct({
	// Validation metrics
	issuesFound: Schema.optional(Schema.Number),
	issuesFixed: Schema.optional(Schema.Number),
	filesScanned: Schema.optional(Schema.Number),
	filesWithErrors: Schema.optional(Schema.Number),

	// Performance metrics
	cacheHit: Schema.optional(Schema.Boolean),
}).pipe(
	Schema.extend(
		Schema.Record({ key: Schema.String, value: Schema.Union(Schema.Number, Schema.Boolean, Schema.String) }),
	),
);

/** @public */
export type HookMetrics = typeof HookMetricsSchema.Type;

// =============================================================================
// HOOK OUTPUT BASE
// =============================================================================

/**
 * Base schema for all hook outputs defining common fields.
 *
 * @remarks
 * All hook-specific output schemas extend this base schema. Fields are organized
 * by their target audience:
 *
 * **Required (Telemetry):**
 * - `status` - Execution status (discriminator)
 * - `summary` - Human-readable log message
 *
 * **Conditional (Based on status):**
 * - `action` - Hook decision (required when `status === "executed"`)
 * - `validation` - For linting/validation hooks
 * - `quality` - Degradation indicators
 * - `metrics` - Custom domain metrics
 *
 * **Optional (User-facing):**
 * - `userMessage` - Shown in terminal via `systemMessage`
 *
 * **Optional (Claude-facing):**
 * - `claudeContext` - Detailed context via `additionalContext`
 * - `reason` - Concise decision reason
 *
 * **Hook-specific:**
 * - `updatedInput` - Modified tool input (PreToolUse only)
 *
 * @schema
 * @public
 */
export const HookOutputBaseSchema = Schema.Struct({
	// ─────────────────────────────────────────────────────────────────────────
	// REQUIRED: Telemetry
	// ─────────────────────────────────────────────────────────────────────────

	/** Execution status - did the hook run? */
	status: ExecutionStatusSchema,

	/** Human-readable summary for logs */
	summary: Schema.String,

	// ─────────────────────────────────────────────────────────────────────────
	// CONDITIONAL: Based on status
	// ─────────────────────────────────────────────────────────────────────────

	/** What action was taken (required when status is "executed") */
	action: Schema.optional(HookActionSchema),

	/** Validation result (optional, for linting/checking hooks) */
	validation: Schema.optional(ValidationResultSchema),

	/** Quality indicators */
	quality: Schema.optional(ExecutionQualitySchema),

	/** User-provided metrics for telemetry */
	metrics: Schema.optional(HookMetricsSchema),

	// ─────────────────────────────────────────────────────────────────────────
	// OPTIONAL: User-facing messages (shown in terminal)
	// ─────────────────────────────────────────────────────────────────────────

	/** Message shown to user in terminal (-\> systemMessage) */
	userMessage: Schema.optional(Schema.String),

	// ─────────────────────────────────────────────────────────────────────────
	// OPTIONAL: Claude-facing content
	// ─────────────────────────────────────────────────────────────────────────

	/** Detailed context/instructions for Claude (-\> additionalContext) */
	claudeContext: Schema.optional(Schema.String),

	/** Concise reason shown to Claude (-\> permissionDecisionReason, block reason) */
	reason: Schema.optional(Schema.String),

	// ─────────────────────────────────────────────────────────────────────────
	// HOOK-SPECIFIC: Tool input modification
	// ─────────────────────────────────────────────────────────────────────────

	/** Modified tool input (PreToolUse only) */
	updatedInput: Schema.optional(JsonObjectSchema),
});

/** @public */
export type HookOutputBase = typeof HookOutputBaseSchema.Type;

// =============================================================================
// PASSTHROUGH OUTPUT
// =============================================================================

/**
 * Output schema for passthrough hooks.
 *
 * @remarks
 * Passthrough hooks that only support executed/skipped/disabled/error states.
 * @schema
 * @public
 */
export const PassthroughOutputSchema = Schema.Union(
	// Executed state
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
	}),

	// Skipped state
	Schema.Struct({
		status: Schema.Literal("skipped"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),

	// Disabled state
	Schema.Struct({
		status: Schema.Literal("disabled"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
	}),
);

/** @public */
export type PassthroughOutput = typeof PassthroughOutputSchema.Type;

// =============================================================================
// PASSTHROUGH RESPONSE
// =============================================================================

/**
 * Response schema for passthrough hooks (SessionEnd, PreCompact, Notification).
 *
 * @remarks
 * These hooks produce no response data. The empty object `{}` is written to stdout.
 *
 * @public
 */
export class PassthroughResponse extends Schema.Class<PassthroughResponse>("PassthroughResponse")({}) {}

/**
 * Convert a passthrough pipeline output to a PassthroughResponse.
 *
 * @remarks
 * Passthrough hooks (SessionEnd, PreCompact, Notification) always produce `{}`.
 *
 * @param _output - The passthrough pipeline output (ignored)
 * @returns A PassthroughResponse instance (empty object)
 * @public
 */
export function toPassthroughResponse(_output: PassthroughOutput): PassthroughResponse {
	return new PassthroughResponse({});
}
