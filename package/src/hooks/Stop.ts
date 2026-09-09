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
 * Input schema for Stop wire format from Claude Code stdin.
 * @public
 */
export class StopInput extends Schema.Class<StopInput>("StopInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Stop"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Text content of Claude's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for Stop events.
 * @public
 */
export class StopEvent extends Schema.Class<StopEvent>("StopEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Stop"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Text content of Claude's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: StopInput): StopEvent {
		return new StopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			stop_hook_active: input.stop_hook_active,
			last_assistant_message: input.last_assistant_message,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for Stop handlers.
 * @public
 */
export type StopOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for Stop hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * Stop hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const StopOutputSchema = Schema.Union(
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
export type StopOutput = typeof StopOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for Stop hooks.
 * @public
 */
export class StopResponse extends Schema.Class<StopResponse>("StopResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a Stop pipeline output to a StopResponse.
 * @public
 */
export function toStopResponse(output: StopOutput): StopResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new StopResponse({ decision: "block", reason: output.reason });
	}
	return new StopResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for Stop hooks.
 * @public
 */
export type StopHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	StopInput,
	StopOutput,
	TOptions,
	TState,
	StopOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for Stop hooks.
 * @public
 */
export type StopHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	StopInput,
	StopOutput,
	unknown,
	TOptions,
	TState,
	StopOutcome
>;
