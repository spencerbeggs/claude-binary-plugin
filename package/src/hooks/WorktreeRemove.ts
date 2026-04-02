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
 * Input schema for WorktreeRemove wire format from Claude Code stdin.
 * @public
 */
export class WorktreeRemoveInput extends Schema.Class<WorktreeRemoveInput>("WorktreeRemoveInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("WorktreeRemove"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the worktree being removed */
	worktree_path: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for WorktreeRemove events.
 * @public
 */
export class WorktreeRemoveEvent extends Schema.Class<WorktreeRemoveEvent>("WorktreeRemoveEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("WorktreeRemove"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the worktree being removed */
	worktree_path: Schema.String,
}) {
	static fromInput(input: WorktreeRemoveInput): WorktreeRemoveEvent {
		return new WorktreeRemoveEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for WorktreeRemove handlers.
 * @public
 */
export type WorktreeRemoveOutcome = NoAction;

/**
 * Set of valid outcome tags for WorktreeRemove hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const WorktreeRemoveOutputSchema = PassthroughOutputSchema;

/** @public */
export type WorktreeRemoveOutput = typeof WorktreeRemoveOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as WorktreeRemoveResponse, toPassthroughResponse as toWorktreeRemoveResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for WorktreeRemove hooks.
 * @public
 */
export type WorktreeRemoveHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	WorktreeRemoveInput,
	WorktreeRemoveOutput,
	TOptions,
	TState,
	WorktreeRemoveOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for WorktreeRemove hooks.
 * @public
 */
export type WorktreeRemoveHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	WorktreeRemoveInput,
	WorktreeRemoveOutput,
	unknown,
	TOptions,
	TState,
	WorktreeRemoveOutcome
>;
