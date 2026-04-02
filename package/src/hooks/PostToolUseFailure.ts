import { Schema } from "effect";
import type { AddContext } from "../outcomes/AddContext.js";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { NoAction } from "../outcomes/NoAction.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema, ValidationResultSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PostToolUseFailure wire format from Claude Code stdin.
 * @public
 */
export class PostToolUseFailureInput extends Schema.Class<PostToolUseFailureInput>("PostToolUseFailureInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PostToolUseFailure"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that failed */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
	/** Error description */
	error: Schema.String,
	/** Whether the failure was caused by user interruption */
	is_interrupt: Schema.optional(Schema.Boolean),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PostToolUseFailure events.
 * @public
 */
export class PostToolUseFailureEvent extends Schema.Class<PostToolUseFailureEvent>("PostToolUseFailureEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PostToolUseFailure"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that failed */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
	/** Error description */
	error: Schema.String,
	/** Whether the failure was caused by user interruption */
	is_interrupt: Schema.optional(Schema.Boolean),
}) {
	static fromInput(input: PostToolUseFailureInput): PostToolUseFailureEvent {
		return new PostToolUseFailureEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PostToolUseFailure handlers.
 * @public
 */
export type PostToolUseFailureOutcome = Block | Continue | AddContext | NoAction | Skip;

/**
 * Set of valid outcome tags for PostToolUseFailure hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * PostToolUseFailure hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const PostToolUseFailureOutputSchema = Schema.Union(
	// Executed states
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("block", "continue", "context", "none"),
		summary: Schema.String,
		validation: Schema.optional(ValidationResultSchema),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
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
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);

/** @public */
export type PostToolUseFailureOutput = typeof PostToolUseFailureOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for PostToolUseFailure hooks.
 * @public
 */
export class PostToolUseFailureResponse extends Schema.Class<PostToolUseFailureResponse>("PostToolUseFailureResponse")({
	additionalContext: Schema.optional(Schema.String),
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a PostToolUseFailure pipeline output to a PostToolUseFailureResponse.
 * @public
 */
export function toPostToolUseFailureResponse(output: PostToolUseFailureOutput): PostToolUseFailureResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new PostToolUseFailureResponse({ decision: "block", reason: output.reason });
	}
	if (action === "context" && "claudeContext" in output && output.claudeContext) {
		return new PostToolUseFailureResponse({ additionalContext: output.claudeContext });
	}
	return new PostToolUseFailureResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PostToolUseFailure hooks.
 * @public
 */
export type PostToolUseFailureHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PostToolUseFailureInput,
	PostToolUseFailureOutput,
	TOptions,
	TState,
	PostToolUseFailureOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PostToolUseFailure hooks.
 * @public
 */
export type PostToolUseFailureHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PostToolUseFailureInput,
	PostToolUseFailureOutput,
	unknown,
	TOptions,
	TState,
	PostToolUseFailureOutcome
>;
