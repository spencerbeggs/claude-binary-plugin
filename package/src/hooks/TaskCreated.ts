import { Schema } from "effect";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for TaskCreated wire format from Claude Code stdin.
 * @public
 */
export class TaskCreatedInput extends Schema.Class<TaskCreatedInput>("TaskCreatedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TaskCreated"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Identifier of the task being created */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate creating the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for TaskCreated events.
 * @public
 */
export class TaskCreatedEvent extends Schema.Class<TaskCreatedEvent>("TaskCreatedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TaskCreated"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Identifier of the task being created */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate creating the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {
	static fromInput(input: TaskCreatedInput): TaskCreatedEvent {
		return new TaskCreatedEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for TaskCreated handlers.
 * @public
 */
export type TaskCreatedOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for TaskCreated hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * TaskCreated hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const TaskCreatedOutputSchema = Schema.Union(
	// Executed state (block or continue)
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("block", "continue"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
	}).pipe(
		Schema.filter((data) => {
			if (data.action === "block" && data.reason === undefined) {
				return "reason is required when action is 'block'";
			}
			return true;
		}),
	),

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

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);

/** @public */
export type TaskCreatedOutput = typeof TaskCreatedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for TaskCreated hooks.
 * @public
 */
export class TaskCreatedResponse extends Schema.Class<TaskCreatedResponse>("TaskCreatedResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a TaskCreated pipeline output to a TaskCreatedResponse.
 * @public
 */
export function toTaskCreatedResponse(output: TaskCreatedOutput): TaskCreatedResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new TaskCreatedResponse({ decision: "block", reason: output.reason });
	}
	return new TaskCreatedResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for TaskCreated hooks.
 * @public
 */
export type TaskCreatedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	TaskCreatedInput,
	TaskCreatedOutput,
	TOptions,
	TState,
	TaskCreatedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for TaskCreated hooks.
 * @public
 */
export type TaskCreatedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	TaskCreatedInput,
	TaskCreatedOutput,
	unknown,
	TOptions,
	TState,
	TaskCreatedOutcome
>;
