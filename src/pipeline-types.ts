/**
 * Pipeline telemetry types for structured hook outputs.
 *
 * This module defines the compound result structure that provides
 * detailed observability for pipeline hooks.
 *
 * @see docs/PIPELINE_TELEMETRY_DESIGN.md
 */

import { z } from "zod";

// =============================================================================
// EXECUTION STATUS
// =============================================================================

/**
 * Execution status - Did the hook run?
 */
export const ExecutionStatusSchema = z.enum([
	"executed", // Hook ran normally
	"skipped", // Didn't need to run (filter, not applicable)
	"disabled", // Couldn't run (preconditions failed)
	"cached", // Used cached result from previous run
	"error", // Unexpected failure (exception thrown)
	"timeout", // Exceeded time limit
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// =============================================================================
// HOOK ACTION
// =============================================================================

/**
 * Hook action - What did the hook decide to do?
 * Only present when status is "executed".
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

export type HookAction = z.infer<typeof HookActionSchema>;

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Validation result - For hooks that perform linting/checking.
 * Optional field, only for validation-oriented hooks.
 */
export const ValidationResultSchema = z.enum([
	"passed", // All checks passed
	"fixed", // Found issues, auto-fixed them
	"failed", // Found unfixable issues
	"warning", // Passed but with warnings
]);

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// =============================================================================
// EXECUTION QUALITY
// =============================================================================

/**
 * Execution quality indicators.
 * Tracks degraded or partial execution states.
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

export type ExecutionQuality = z.infer<typeof ExecutionQualitySchema>;

// =============================================================================
// PIPELINE METRICS
// =============================================================================

/**
 * User-provided metrics for telemetry.
 * Domain-specific metrics that require hook knowledge.
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

export type PipelineMetrics = z.infer<typeof PipelineMetricsSchema>;

// =============================================================================
// TOKEN METRICS (auto-calculated)
// =============================================================================

/**
 * Token metrics calculated by the runtime.
 * These are auto-instrumented from the output fields.
 */
export interface TokenMetrics {
	/** Tokens in claudeContext */
	claudeContext: number;
	/** Tokens in userMessage */
	userMessage: number;
	/** Tokens in reason */
	reason: number;
	/** Sum of above */
	hookTotal: number;
	/** Tokens in tool input (PreToolUse) */
	toolInput?: number;
	/** Tokens in tool response (PostToolUse) */
	toolResponse?: number;
	/** Tokens in file content (Write tool) */
	fileContent?: number;
}

// =============================================================================
// CONTENT TYPE (for token estimation)
// =============================================================================

/**
 * Content type for token estimation accuracy.
 */
export type ContentType = "code" | "json" | "markdown" | "prose";

// =============================================================================
// PIPELINE OUTPUT BASE
// =============================================================================

/**
 * Base schema for all pipeline outputs.
 * Defines the three-audience model fields.
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

export type PipelineOutputBase = z.infer<typeof PipelineOutputBaseSchema>;

// =============================================================================
// PRETOOLUSE OUTPUT
// =============================================================================

/**
 * PreToolUse pipeline output with discriminated union for type safety.
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

export type PreToolUseOutput = z.infer<typeof PreToolUseOutputSchema>;

// =============================================================================
// POSTTOOLUSE OUTPUT
// =============================================================================

/**
 * PostToolUse pipeline output with discriminated union for type safety.
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

export type PostToolUseOutput = z.infer<typeof PostToolUseOutputSchema>;

// =============================================================================
// SESSIONSTART OUTPUT
// =============================================================================

/**
 * SessionStart pipeline output with discriminated union for type safety.
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

export type SessionStartOutput = z.infer<typeof SessionStartOutputSchema>;

// =============================================================================
// STOP / SUBAGENTSTOP OUTPUT
// =============================================================================

/**
 * Stop/SubagentStop pipeline output with discriminated union for type safety.
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

export type StopOutput = z.infer<typeof StopOutputSchema>;

// Alias for SubagentStop
export const SubagentStopOutputSchema = StopOutputSchema;
export type SubagentStopOutput = StopOutput;

// =============================================================================
// USERPROMPTSUBMIT OUTPUT
// =============================================================================

/**
 * UserPromptSubmit pipeline output with discriminated union for type safety.
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

export type UserPromptSubmitOutput = z.infer<typeof UserPromptSubmitOutputSchema>;

// =============================================================================
// PERMISSIONREQUEST OUTPUT
// =============================================================================

/**
 * PermissionRequest pipeline output with discriminated union for type safety.
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

export type PermissionRequestOutput = z.infer<typeof PermissionRequestOutputSchema>;

// =============================================================================
// PASSTHROUGH OUTPUTS (SessionEnd, PreCompact, Notification)
// =============================================================================

/**
 * Passthrough hooks that only support executed/skipped/disabled/error states.
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

export type PassthroughOutput = z.infer<typeof PassthroughOutputSchema>;

// Aliases for specific passthrough hooks
export const SessionEndOutputSchema = PassthroughOutputSchema;
export type SessionEndOutput = PassthroughOutput;

export const PreCompactOutputSchema = PassthroughOutputSchema;
export type PreCompactOutput = PassthroughOutput;

export const NotificationOutputSchema = PassthroughOutputSchema;
export type NotificationOutput = PassthroughOutput;

// =============================================================================
// OUTPUT SCHEMA MAP
// =============================================================================

/**
 * Map of hook types to their output schemas.
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
 * Check if an output uses the pipeline format (has status and summary fields).
 */
export function isPipelineOutput(output: unknown): output is AnyPipelineOutput {
	return typeof output === "object" && output !== null && "status" in output && "summary" in output;
}
