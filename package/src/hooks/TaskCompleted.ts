import { Schema } from "effect";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for TaskCompleted wire format from Claude Code stdin.
 * @public
 */
export class TaskCompletedInput extends Schema.Class<TaskCompletedInput>("TaskCompletedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TaskCompleted"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Identifier of the task being completed */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate completing the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for TaskCompleted events.
 * @public
 */
export class TaskCompletedEvent extends Schema.Class<TaskCompletedEvent>("TaskCompletedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TaskCompleted"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Identifier of the task being completed */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate completing the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {
	static fromInput(input: TaskCompletedInput): TaskCompletedEvent {
		return new TaskCompletedEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			task_id: input.task_id,
			task_subject: input.task_subject,
			task_description: input.task_description,
			teammate_name: input.teammate_name,
			team_name: input.team_name,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for TaskCompleted handlers.
 * @public
 */
export type TaskCompletedOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for TaskCompleted hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * TaskCompleted hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const TaskCompletedOutputSchema = Schema.Union(
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
export type TaskCompletedOutput = typeof TaskCompletedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for TaskCompleted hooks.
 * @public
 */
export class TaskCompletedResponse extends Schema.Class<TaskCompletedResponse>("TaskCompletedResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a TaskCompleted pipeline output to a TaskCompletedResponse.
 * @public
 */
export function toTaskCompletedResponse(output: TaskCompletedOutput): TaskCompletedResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new TaskCompletedResponse({ decision: "block", reason: output.reason });
	}
	return new TaskCompletedResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for TaskCompleted hooks.
 * @public
 */
export type TaskCompletedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	TaskCompletedInput,
	TaskCompletedOutput,
	TOptions,
	TState,
	TaskCompletedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for TaskCompleted hooks.
 * @public
 */
export type TaskCompletedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	TaskCompletedInput,
	TaskCompletedOutput,
	unknown,
	TOptions,
	TState,
	TaskCompletedOutcome
>;
