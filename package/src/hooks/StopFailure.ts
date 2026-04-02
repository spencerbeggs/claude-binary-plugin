import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema, StopFailureErrorSchema } from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for StopFailure wire format from Claude Code stdin.
 * @public
 */
export class StopFailureInput extends Schema.Class<StopFailureInput>("StopFailureInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("StopFailure"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Error type */
	error: StopFailureErrorSchema,
	/** Additional error details */
	error_details: Schema.optional(Schema.String),
	/** The rendered error text shown in the conversation */
	last_assistant_message: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for StopFailure events.
 * @public
 */
export class StopFailureEvent extends Schema.Class<StopFailureEvent>("StopFailureEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("StopFailure"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Error type */
	error: StopFailureErrorSchema,
	/** Additional error details */
	error_details: Schema.optional(Schema.String),
	/** The rendered error text shown in the conversation */
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: StopFailureInput): StopFailureEvent {
		return new StopFailureEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for StopFailure handlers.
 * @public
 */
export type StopFailureOutcome = NoAction;

/**
 * Set of valid outcome tags for StopFailure hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const StopFailureOutputSchema = PassthroughOutputSchema;

/** @public */
export type StopFailureOutput = typeof StopFailureOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as StopFailureResponse, toPassthroughResponse as toStopFailureResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for StopFailure hooks.
 * @public
 */
export type StopFailureHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	StopFailureInput,
	StopFailureOutput,
	TOptions,
	TState,
	StopFailureOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for StopFailure hooks.
 * @public
 */
export type StopFailureHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	StopFailureInput,
	StopFailureOutput,
	unknown,
	TOptions,
	TState,
	StopFailureOutcome
>;
