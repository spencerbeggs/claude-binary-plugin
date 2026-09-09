import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { HookPermissionsModeSchema, PreCompactTriggerSchema } from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PreCompact wire format from Claude Code stdin.
 * @public
 */
export class PreCompactInput extends Schema.Class<PreCompactInput>("PreCompactInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PreCompact"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** Custom instructions for the compact operation */
	custom_instructions: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PreCompact events.
 * @public
 */
export class PreCompactEvent extends Schema.Class<PreCompactEvent>("PreCompactEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PreCompact"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** Custom instructions for the compact operation */
	custom_instructions: Schema.String,
}) {
	static fromInput(input: PreCompactInput): PreCompactEvent {
		return new PreCompactEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			trigger: input.trigger,
			custom_instructions: input.custom_instructions,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PreCompact handlers.
 * @public
 */
export type PreCompactOutcome = NoAction;

/**
 * Set of valid outcome tags for PreCompact hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const PreCompactOutputSchema = PassthroughOutputSchema;

/** @public */
export type PreCompactOutput = typeof PreCompactOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as PreCompactResponse, toPassthroughResponse as toPreCompactResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PreCompact hooks.
 * @public
 */
export type PreCompactHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PreCompactInput,
	PreCompactOutput,
	TOptions,
	TState,
	PreCompactOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PreCompact hooks.
 * @public
 */
export type PreCompactHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PreCompactInput,
	PreCompactOutput,
	unknown,
	TOptions,
	TState,
	PreCompactOutcome
>;
