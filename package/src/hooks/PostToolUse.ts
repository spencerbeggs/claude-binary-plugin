import { Schema } from "effect";
import type { AddContext } from "../outcomes/AddContext.js";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { NoAction } from "../outcomes/NoAction.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler, ToolFilter } from "../plugin/handler.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema, ValidationResultSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PostToolUse wire format from Claude Code stdin.
 * @public
 */
export class PostToolUseInput extends Schema.Class<PostToolUseInput>("PostToolUseInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PostToolUse"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that was invoked */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Response returned by the tool (JSON object) */
	tool_response: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PostToolUse events.
 * @public
 */
export class PostToolUseEvent extends Schema.Class<PostToolUseEvent>("PostToolUseEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PostToolUse"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that was invoked */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Response returned by the tool (JSON object) */
	tool_response: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {
	static fromInput(input: PostToolUseInput): PostToolUseEvent {
		return new PostToolUseEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_response: input.tool_response,
			tool_use_id: input.tool_use_id,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PostToolUse handlers.
 * @public
 */
export type PostToolUseOutcome = Block | Continue | AddContext | NoAction | Skip;

/**
 * Set of valid outcome tags for PostToolUse hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * PostToolUse hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const PostToolUseOutputSchema = Schema.Union(
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

	// Cached state
	Schema.Struct({
		status: Schema.Literal("cached"),
		summary: Schema.String,
		action: Schema.Literal("block", "continue", "context", "none"),
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),

	// Timeout state
	Schema.Struct({
		status: Schema.Literal("timeout"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);

/** @public */
export type PostToolUseOutput = typeof PostToolUseOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for PostToolUse hooks.
 * @public
 */
export class PostToolUseResponse extends Schema.Class<PostToolUseResponse>("PostToolUseResponse")({
	additionalContext: Schema.optional(Schema.String),
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a PostToolUse pipeline output to a PostToolUseResponse.
 * @public
 */
export function toPostToolUseResponse(output: PostToolUseOutput): PostToolUseResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new PostToolUseResponse({ decision: "block", reason: output.reason });
	}
	if (action === "context" && "claudeContext" in output && output.claudeContext) {
		return new PostToolUseResponse({ additionalContext: output.claudeContext });
	}
	return new PostToolUseResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PostToolUse hooks.
 * @public
 */
export type PostToolUseHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PostToolUseInput,
	PostToolUseOutput,
	TOptions,
	TState,
	PostToolUseOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PostToolUse hooks.
 * Includes ToolFilter for per-tool filtering.
 * @public
 */
export type PostToolUseHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PostToolUseInput,
	PostToolUseOutput,
	unknown,
	TOptions,
	TState,
	PostToolUseOutcome
> &
	ToolFilter;
