/**
 * Pipeline output types for structured hook results.
 *
 * @remarks
 * This module defines Zod-validated output schemas for all hook types. Pipeline
 * outputs follow a **three-audience model**:
 *
 * 1. **Telemetry** - `status`, `action`, `metrics` for observability
 * 2. **User** - `userMessage` shown in terminal, `summary` for logs
 * 3. **Claude** - `claudeContext` for detailed context, `reason` for decisions
 *
 * Each hook type has a discriminated union schema based on `status`:
 *
 * | Status | Description | Valid Actions |
 * |--------|-------------|---------------|
 * | `executed` | Hook ran normally | Hook-specific |
 * | `skipped` | Didn't need to run | - |
 * | `disabled` | Preconditions failed | - |
 * | `cached` | Used cached result | Same as executed |
 * | `error` | Exception thrown | - |
 * | `timeout` | Exceeded time limit | - |
 *
 * **Valid actions by hook type:**
 *
 * | Hook Type | Actions |
 * |-----------|---------|
 * | PreToolUse | `allow`, `deny`, `ask`, `modify` |
 * | PostToolUse | `block`, `continue`, `context`, `none` |
 * | SessionStart | `context`, `none` |
 * | Stop/SubagentStop | `block`, `continue` |
 * | UserPromptSubmit | `block`, `continue`, `context`, `none` |
 * | PermissionRequest | `allow`, `deny` |
 * | Passthrough (SessionEnd, PreCompact, Notification) | `none` |
 *
 * @example
 * ```typescript
 * import type { PreToolUseOutput } from "claude-binary-plugin";
 *
 * const output: PreToolUseOutput = {
 *   status: "executed",
 *   action: "deny",
 *   summary: "Blocked dangerous rm -rf command",
 *   reason: "rm -rf commands are not allowed",
 *   userMessage: "⚠️ Command blocked for safety",
 * };
 * ```
 *
 * @see {@link isPipelineOutput} - Type guard for pipeline outputs
 * @see {@link OutputSchemas} - Map of hook types to output schemas
 * @module
 */

import { z } from "zod";

// =============================================================================
// EXECUTION STATUS
// =============================================================================

/**
 * Execution status indicating whether the hook ran and how.
 *
 * @remarks
 * The status field is the discriminator for pipeline output types. Each status
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
 * @public
 */
export const ExecutionStatusSchema = z.enum([
	"executed", // Hook ran normally
	"skipped", // Didn't need to run (filter, not applicable)
	"disabled", // Couldn't run (preconditions failed)
	"cached", // Used cached result from previous run
	"error", // Unexpected failure (exception thrown)
	"timeout", // Exceeded time limit
]);

/** @public */
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

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
 * @public
 */
export const HookActionSchema = z.enum([
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
]);

/** @public */
export type HookAction = z.infer<typeof HookActionSchema>;

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Validation result - For hooks that perform linting/checking.
 * Optional field, only for validation-oriented hooks.
 * @public
 */
export const ValidationResultSchema = z.enum([
	"passed", // All checks passed
	"fixed", // Found issues, auto-fixed them
	"failed", // Found unfixable issues
	"warning", // Passed but with warnings
]);

/** @public */
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// =============================================================================
// EXECUTION QUALITY
// =============================================================================

/**
 * Execution quality indicators.
 * Tracks degraded or partial execution states.
 * @public
 */
export const ExecutionQualitySchema = z
	.object({
		/** Hook ran with reduced functionality */
		degraded: z.boolean().optional(),
		/** Why execution was degraded (e.g., "shellcheck unavailable") */
		degradedReason: z.string().optional(),
		/** Hook only partially completed */
		partial: z.boolean().optional(),
		/** Hook used fallback behavior */
		fallback: z.boolean().optional(),
	})
	.strict();

/** @public */
export type ExecutionQuality = z.infer<typeof ExecutionQualitySchema>;

// =============================================================================
// PIPELINE METRICS
// =============================================================================

/**
 * User-provided metrics for telemetry.
 * Domain-specific metrics that require hook knowledge.
 * @public
 */
export const PipelineMetricsSchema = z
	.object({
		// Validation metrics
		issuesFound: z.number().optional(),
		issuesFixed: z.number().optional(),
		filesScanned: z.number().optional(),
		filesWithErrors: z.number().optional(),

		// Performance metrics
		cacheHit: z.boolean().optional(),
	})
	.catchall(z.union([z.number(), z.boolean(), z.string()]));

/** @public */
export type PipelineMetrics = z.infer<typeof PipelineMetricsSchema>;

// =============================================================================
// TOKEN METRICS (auto-calculated)
// =============================================================================

/**
 * Token metrics automatically calculated by the runtime.
 *
 * @remarks
 * These metrics are extracted from pipeline output fields to track context
 * consumption. Token counts are estimated using a simple heuristic (4 chars = 1 token).
 *
 * The runtime calculates these automatically - hooks don't need to provide them.
 *
 * @see {@link TokenMetrics.extractFromOutput} - Extracts these from pipeline output
 * @public
 */
export interface TokenMetricsData {
	/** Estimated tokens in `claudeContext` field */
	claudeContext: number;
	/** Estimated tokens in `userMessage` field */
	userMessage: number;
	/** Estimated tokens in `reason` field */
	reason: number;
	/** Sum of claudeContext + userMessage + reason */
	hookTotal: number;
	/** Estimated tokens in tool input (PreToolUse only) */
	toolInput?: number;
	/** Estimated tokens in tool response (PostToolUse only) */
	toolResponse?: number;
	/** Estimated tokens in file content (Write tool) */
	fileContent?: number;
}

// =============================================================================
// CONTENT TYPE (for token estimation)
// =============================================================================

/**
 * Content type for token estimation accuracy.
 * @public
 */
export type ContentType = "code" | "json" | "markdown" | "prose";

// =============================================================================
// PIPELINE OUTPUT BASE
// =============================================================================

/**
 * Base schema for all pipeline outputs defining common fields.
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
 * @public
 */
export const PipelineOutputBaseSchema = z.object({
	// ─────────────────────────────────────────────────────────────────────────
	// REQUIRED: Telemetry
	// ─────────────────────────────────────────────────────────────────────────

	/** Execution status - did the hook run? */
	status: ExecutionStatusSchema,

	/** Human-readable summary for logs */
	summary: z.string(),

	// ─────────────────────────────────────────────────────────────────────────
	// CONDITIONAL: Based on status
	// ─────────────────────────────────────────────────────────────────────────

	/** What action was taken (required when status is "executed") */
	action: HookActionSchema.optional(),

	/** Validation result (optional, for linting/checking hooks) */
	validation: ValidationResultSchema.optional(),

	/** Quality indicators */
	quality: ExecutionQualitySchema.optional(),

	/** User-provided metrics for telemetry */
	metrics: PipelineMetricsSchema.optional(),

	// ─────────────────────────────────────────────────────────────────────────
	// OPTIONAL: User-facing messages (shown in terminal)
	// ─────────────────────────────────────────────────────────────────────────

	/** Message shown to user in terminal (-> systemMessage) */
	userMessage: z.string().optional(),

	// ─────────────────────────────────────────────────────────────────────────
	// OPTIONAL: Claude-facing content
	// ─────────────────────────────────────────────────────────────────────────

	/** Detailed context/instructions for Claude (-> additionalContext) */
	claudeContext: z.string().optional(),

	/** Concise reason shown to Claude (-> permissionDecisionReason, block reason) */
	reason: z.string().optional(),

	// ─────────────────────────────────────────────────────────────────────────
	// HOOK-SPECIFIC: Tool input modification
	// ─────────────────────────────────────────────────────────────────────────

	/** Modified tool input (PreToolUse only) */
	updatedInput: z.record(z.string(), z.unknown()).optional(),
});

/** @public */
export type PipelineOutputBase = z.infer<typeof PipelineOutputBaseSchema>;

// =============================================================================
// PRETOOLUSE OUTPUT
// =============================================================================

/**
 * PreToolUse pipeline output with discriminated union for type safety.
 * @public
 */
export const PreToolUseOutputSchema = z.discriminatedUnion("status", [
	// Executed states
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["allow", "deny", "ask", "modify"]),
			summary: z.string(),
			validation: ValidationResultSchema.optional(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
			reason: z.string().optional(),
			updatedInput: z.record(z.string(), z.unknown()).optional(),
		})
		.strict(),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Cached state
	z
		.object({
			status: z.literal("cached"),
			summary: z.string(),
			action: z.enum(["allow", "deny", "ask", "modify"]),
			reason: z.string().optional(),
			updatedInput: z.record(z.string(), z.unknown()).optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),

	// Timeout state
	z
		.object({
			status: z.literal("timeout"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type PreToolUseOutput = z.infer<typeof PreToolUseOutputSchema>;

// =============================================================================
// POSTTOOLUSE OUTPUT
// =============================================================================

/**
 * PostToolUse pipeline output with discriminated union for type safety.
 * @public
 */
export const PostToolUseOutputSchema = z.discriminatedUnion("status", [
	// Executed states
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["block", "continue", "context", "none"]),
			summary: z.string(),
			validation: ValidationResultSchema.optional(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
			reason: z.string().optional(),
		})
		.strict(),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Cached state
	z
		.object({
			status: z.literal("cached"),
			summary: z.string(),
			action: z.enum(["block", "continue", "context", "none"]),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),

	// Timeout state
	z
		.object({
			status: z.literal("timeout"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type PostToolUseOutput = z.infer<typeof PostToolUseOutputSchema>;

// =============================================================================
// SESSIONSTART OUTPUT
// =============================================================================

/**
 * SessionStart pipeline output with discriminated union for type safety.
 * @public
 */
export const SessionStartOutputSchema = z.discriminatedUnion("status", [
	// Executed states
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["context", "none"]),
			summary: z.string(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),

	// Timeout state
	z
		.object({
			status: z.literal("timeout"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type SessionStartOutput = z.infer<typeof SessionStartOutputSchema>;

// =============================================================================
// STOP / SUBAGENTSTOP OUTPUT
// =============================================================================

/**
 * Stop/SubagentStop pipeline output with discriminated union for type safety.
 * @public
 */
export const StopOutputSchema = z.discriminatedUnion("status", [
	// Executed state (block or continue)
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["block", "continue"]),
			summary: z.string(),
			reason: z.string().optional(), // Required for block, optional for continue
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict()
		.refine((data) => data.action !== "block" || data.reason !== undefined, {
			message: "reason is required when action is 'block'",
		}),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type StopOutput = z.infer<typeof StopOutputSchema>;

// Alias for SubagentStop
/** @public */
export const SubagentStopOutputSchema = StopOutputSchema;
/** @public */
export type SubagentStopOutput = StopOutput;

// =============================================================================
// USERPROMPTSUBMIT OUTPUT
// =============================================================================

/**
 * UserPromptSubmit pipeline output with discriminated union for type safety.
 * @public
 */
export const UserPromptSubmitOutputSchema = z.discriminatedUnion("status", [
	// Executed states
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["block", "continue", "context", "none"]),
			summary: z.string(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
			reason: z.string().optional(),
		})
		.strict(),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type UserPromptSubmitOutput = z.infer<typeof UserPromptSubmitOutputSchema>;

// =============================================================================
// PERMISSIONREQUEST OUTPUT
// =============================================================================

/**
 * PermissionRequest pipeline output with discriminated union for type safety.
 * @public
 */
export const PermissionRequestOutputSchema = z.discriminatedUnion("status", [
	// Executed states
	z
		.object({
			status: z.literal("executed"),
			action: z.enum(["allow", "deny"]),
			summary: z.string(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
			reason: z.string().optional(),
			updatedInput: z.record(z.string(), z.unknown()).optional(),
			interrupt: z.boolean().optional(),
		})
		.strict(),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
			userMessage: z.string().optional(),
			claudeContext: z.string().optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
			userMessage: z.string().optional(),
		})
		.strict(),
]);

/** @public */
export type PermissionRequestOutput = z.infer<typeof PermissionRequestOutputSchema>;

// =============================================================================
// PASSTHROUGH OUTPUTS (SessionEnd, PreCompact, Notification)
// =============================================================================

/**
 * Passthrough hooks that only support executed/skipped/disabled/error states.
 * @public
 */
export const PassthroughOutputSchema = z.discriminatedUnion("status", [
	// Executed state
	z
		.object({
			status: z.literal("executed"),
			action: z.literal("none"),
			summary: z.string(),
			quality: ExecutionQualitySchema.optional(),
			metrics: PipelineMetricsSchema.optional(),
		})
		.strict(),

	// Skipped state
	z
		.object({
			status: z.literal("skipped"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Disabled state
	z
		.object({
			status: z.literal("disabled"),
			summary: z.string(),
			reason: z.string().optional(),
		})
		.strict(),

	// Error state
	z
		.object({
			status: z.literal("error"),
			summary: z.string(),
			reason: z.string(),
		})
		.strict(),
]);

/** @public */
export type PassthroughOutput = z.infer<typeof PassthroughOutputSchema>;

// Aliases for specific passthrough hooks
/** @public */
export const SessionEndOutputSchema = PassthroughOutputSchema;
/** @public */
export type SessionEndOutput = PassthroughOutput;

/** @public */
export const PreCompactOutputSchema = PassthroughOutputSchema;
/** @public */
export type PreCompactOutput = PassthroughOutput;

/** @public */
export const NotificationOutputSchema = PassthroughOutputSchema;
/** @public */
export type NotificationOutput = PassthroughOutput;

// =============================================================================
// OUTPUT SCHEMA MAP
// =============================================================================

/**
 * Map of hook event names to their Zod output schemas.
 *
 * @remarks
 * This map enables runtime validation of pipeline outputs based on hook type.
 * Use with `OutputSchemas[hookType].parse(output)` to validate outputs.
 *
 * @example
 * ```typescript
 * const hookType = "PreToolUse";
 * const schema = OutputSchemas[hookType];
 * const validatedOutput = schema.parse(output);
 * ```
 *
 * @public
 */
export const OutputSchemas = {
	SessionStart: SessionStartOutputSchema,
	SessionEnd: SessionEndOutputSchema,
	PreToolUse: PreToolUseOutputSchema,
	PostToolUse: PostToolUseOutputSchema,
	Stop: StopOutputSchema,
	SubagentStop: SubagentStopOutputSchema,
	UserPromptSubmit: UserPromptSubmitOutputSchema,
	PreCompact: PreCompactOutputSchema,
	Notification: NotificationOutputSchema,
	PermissionRequest: PermissionRequestOutputSchema,
} as const;

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Union of all pipeline output types.
 * @public
 */
export type AnyPipelineOutput =
	| PreToolUseOutput
	| PostToolUseOutput
	| SessionStartOutput
	| SessionEndOutput
	| StopOutput
	| SubagentStopOutput
	| UserPromptSubmitOutput
	| PreCompactOutput
	| NotificationOutput
	| PermissionRequestOutput;

/**
 * Type guard to check if an output uses the pipeline format.
 *
 * @remarks
 * Pipeline outputs are identified by having both `status` and `summary` fields.
 * This guard is used by the runtime to distinguish between pipeline handlers
 * (which return structured outputs) and raw handlers (which return arbitrary data).
 *
 * @param output - The output to check
 * @returns `true` if the output is a pipeline output with `status` and `summary`
 *
 * @example
 * ```typescript
 * const result = await handler(context);
 * if (isPipelineOutput(result)) {
 *   // result is typed as AnyPipelineOutput
 *   console.log(result.status, result.summary);
 * }
 * ```
 *
 * @public
 */
export function isPipelineOutput(output: unknown): output is AnyPipelineOutput {
	return typeof output === "object" && output !== null && "status" in output && "summary" in output;
}
