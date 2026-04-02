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
 * Input schema for WorktreeCreate wire format from Claude Code stdin.
 * @public
 */
export class WorktreeCreateInput extends Schema.Class<WorktreeCreateInput>("WorktreeCreateInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("WorktreeCreate"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Slug identifier for the new worktree */
	name: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for WorktreeCreate events.
 * @public
 */
export class WorktreeCreateEvent extends Schema.Class<WorktreeCreateEvent>("WorktreeCreateEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("WorktreeCreate"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Slug identifier for the new worktree */
	name: Schema.String,
}) {
	static fromInput(input: WorktreeCreateInput): WorktreeCreateEvent {
		return new WorktreeCreateEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for WorktreeCreate handlers.
 * @public
 */
export type WorktreeCreateOutcome = NoAction;

/**
 * Set of valid outcome tags for WorktreeCreate hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const WorktreeCreateOutputSchema = PassthroughOutputSchema;

/** @public */
export type WorktreeCreateOutput = typeof WorktreeCreateOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as WorktreeCreateResponse, toPassthroughResponse as toWorktreeCreateResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for WorktreeCreate hooks.
 * @public
 */
export type WorktreeCreateHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	WorktreeCreateInput,
	WorktreeCreateOutput,
	TOptions,
	TState,
	WorktreeCreateOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for WorktreeCreate hooks.
 * @public
 */
export type WorktreeCreateHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	WorktreeCreateInput,
	WorktreeCreateOutput,
	unknown,
	TOptions,
	TState,
	WorktreeCreateOutcome
>;
