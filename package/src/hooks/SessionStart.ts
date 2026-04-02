import { Schema } from "effect";
import type { AddContext } from "../outcomes/AddContext.js";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema, SessionStartSourceSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for SessionStart wire format from Claude Code stdin.
 * @public
 */
export class SessionStartInput extends Schema.Class<SessionStartInput>("SessionStartInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SessionStart"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** What triggered the session start */
	source: SessionStartSourceSchema,
	/** Model identifier */
	model: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for SessionStart events.
 * @public
 */
export class SessionStartEvent extends Schema.Class<SessionStartEvent>("SessionStartEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SessionStart"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** What triggered the session start */
	source: SessionStartSourceSchema,
	/** Model identifier */
	model: Schema.optional(Schema.String),
}) {
	static fromInput(input: SessionStartInput): SessionStartEvent {
		return new SessionStartEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			source: input.source,
			model: input.model,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for SessionStart handlers.
 * @public
 */
export type SessionStartOutcome = AddContext | NoAction;

/**
 * Set of valid outcome tags for SessionStart hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["AddContext", "NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * SessionStart hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const SessionStartOutputSchema = Schema.Union(
	// Executed states
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("context", "none"),
		summary: Schema.String,
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
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

	// Timeout state
	Schema.Struct({
		status: Schema.Literal("timeout"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);

/** @public */
export type SessionStartOutput = typeof SessionStartOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for SessionStart hooks.
 * @public
 */
export class SessionStartResponse extends Schema.Class<SessionStartResponse>("SessionStartResponse")({
	additionalContext: Schema.optional(Schema.String),
}) {}

/**
 * Convert a SessionStart pipeline output to a SessionStartResponse.
 * @public
 */
export function toSessionStartResponse(output: SessionStartOutput): SessionStartResponse {
	if ("claudeContext" in output && output.claudeContext) {
		return new SessionStartResponse({ additionalContext: output.claudeContext });
	}
	return new SessionStartResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for SessionStart hooks.
 * @public
 */
export type SessionStartHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	SessionStartInput,
	SessionStartOutput,
	TOptions,
	TState,
	SessionStartOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for SessionStart hooks.
 * @public
 */
export type SessionStartHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SessionStartInput,
	SessionStartOutput,
	unknown,
	TOptions,
	TState,
	SessionStartOutcome
>;
