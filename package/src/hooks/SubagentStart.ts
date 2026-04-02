import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for SubagentStart wire format from Claude Code stdin.
 * @public
 */
export class SubagentStartInput extends Schema.Class<SubagentStartInput>("SubagentStartInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SubagentStart"),
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name (built-in or custom) */
	agent_type: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for SubagentStart events.
 * @public
 */
export class SubagentStartEvent extends Schema.Class<SubagentStartEvent>("SubagentStartEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SubagentStart"),
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name (built-in or custom) */
	agent_type: Schema.optional(Schema.String),
}) {
	static fromInput(input: SubagentStartInput): SubagentStartEvent {
		return new SubagentStartEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for SubagentStart handlers.
 * @public
 */
export type SubagentStartOutcome = NoAction;

/**
 * Set of valid outcome tags for SubagentStart hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const SubagentStartOutputSchema = PassthroughOutputSchema;

/** @public */
export type SubagentStartOutput = typeof SubagentStartOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as SubagentStartResponse, toPassthroughResponse as toSubagentStartResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for SubagentStart hooks.
 * @public
 */
export type SubagentStartHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	SubagentStartInput,
	SubagentStartOutput,
	TOptions,
	TState,
	SubagentStartOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for SubagentStart hooks.
 * @public
 */
export type SubagentStartHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SubagentStartInput,
	SubagentStartOutput,
	unknown,
	TOptions,
	TState,
	SubagentStartOutcome
>;
