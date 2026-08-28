import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { HookPermissionsModeSchema, SessionEndReasonSchema } from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for SessionEnd wire format from Claude Code stdin.
 * @public
 */
export class SessionEndInput extends Schema.Class<SessionEndInput>("SessionEndInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SessionEnd"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Why the session is ending */
	reason: SessionEndReasonSchema,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for SessionEnd events.
 * @public
 */
export class SessionEndEvent extends Schema.Class<SessionEndEvent>("SessionEndEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SessionEnd"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Why the session is ending */
	reason: SessionEndReasonSchema,
}) {
	static fromInput(input: SessionEndInput): SessionEndEvent {
		return new SessionEndEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			reason: input.reason,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for SessionEnd handlers.
 * @public
 */
export type SessionEndOutcome = NoAction;

/**
 * Set of valid outcome tags for SessionEnd hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const SessionEndOutputSchema = PassthroughOutputSchema;

/** @public */
export type SessionEndOutput = typeof SessionEndOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as SessionEndResponse, toPassthroughResponse as toSessionEndResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for SessionEnd hooks.
 * @public
 */
export type SessionEndHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	SessionEndInput,
	SessionEndOutput,
	TOptions,
	TState,
	SessionEndOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for SessionEnd hooks.
 * @public
 */
export type SessionEndHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SessionEndInput,
	SessionEndOutput,
	unknown,
	TOptions,
	TState,
	SessionEndOutcome
>;
