import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for Elicitation wire format from Claude Code stdin.
 * @public
 */
export class ElicitationInput extends Schema.Class<ElicitationInput>("ElicitationInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Elicitation"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** Message from the MCP server */
	message: Schema.String,
	/** Elicitation mode: form or url */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** URL for browser-based authentication */
	url: Schema.optional(Schema.String),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
	/** JSON Schema for requested form fields */
	requested_schema: Schema.optional(JsonObjectSchema),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for Elicitation events.
 * @public
 */
export class ElicitationEvent extends Schema.Class<ElicitationEvent>("ElicitationEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Elicitation"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** Message from the MCP server */
	message: Schema.String,
	/** Elicitation mode: form or url */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** URL for browser-based authentication */
	url: Schema.optional(Schema.String),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
	/** JSON Schema for requested form fields */
	requested_schema: Schema.optional(JsonObjectSchema),
}) {
	static fromInput(input: ElicitationInput): ElicitationEvent {
		return new ElicitationEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			mcp_server_name: input.mcp_server_name,
			message: input.message,
			mode: input.mode,
			url: input.url,
			elicitation_id: input.elicitation_id,
			requested_schema: input.requested_schema,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for Elicitation handlers.
 * @public
 */
export type ElicitationOutcome = NoAction;

/**
 * Set of valid outcome tags for Elicitation hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const ElicitationOutputSchema = PassthroughOutputSchema;

/** @public */
export type ElicitationOutput = typeof ElicitationOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as ElicitationResponse, toPassthroughResponse as toElicitationResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for Elicitation hooks.
 * @public
 */
export type ElicitationHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	ElicitationInput,
	ElicitationOutput,
	TOptions,
	TState,
	ElicitationOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for Elicitation hooks.
 * @public
 */
export type ElicitationHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	ElicitationInput,
	ElicitationOutput,
	unknown,
	TOptions,
	TState,
	ElicitationOutcome
>;
