import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { ElicitationActionSchema, HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for ElicitationResult wire format from Claude Code stdin.
 * @public
 */
export class ElicitationResultInput extends Schema.Class<ElicitationResultInput>("ElicitationResultInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("ElicitationResult"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** The user's action */
	action: ElicitationActionSchema,
	/** Form field values from the user's response */
	content: Schema.optional(JsonObjectSchema),
	/** Elicitation mode */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for ElicitationResult events.
 * @public
 */
export class ElicitationResultEvent extends Schema.Class<ElicitationResultEvent>("ElicitationResultEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("ElicitationResult"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** The user's action */
	action: ElicitationActionSchema,
	/** Form field values from the user's response */
	content: Schema.optional(JsonObjectSchema),
	/** Elicitation mode */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
}) {
	static fromInput(input: ElicitationResultInput): ElicitationResultEvent {
		return new ElicitationResultEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			mcp_server_name: input.mcp_server_name,
			action: input.action,
			content: input.content,
			mode: input.mode,
			elicitation_id: input.elicitation_id,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for ElicitationResult handlers.
 * @public
 */
export type ElicitationResultOutcome = NoAction;

/**
 * Set of valid outcome tags for ElicitationResult hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const ElicitationResultOutputSchema = PassthroughOutputSchema;

/** @public */
export type ElicitationResultOutput = typeof ElicitationResultOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as ElicitationResultResponse, toPassthroughResponse as toElicitationResultResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for ElicitationResult hooks.
 * @public
 */
export type ElicitationResultHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	ElicitationResultInput,
	ElicitationResultOutput,
	TOptions,
	TState,
	ElicitationResultOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for ElicitationResult hooks.
 * @public
 */
export type ElicitationResultHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	ElicitationResultInput,
	ElicitationResultOutput,
	unknown,
	TOptions,
	TState,
	ElicitationResultOutcome
>;
