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
 * Input schema for SubagentStop wire format from Claude Code stdin.
 * @public
 */
export class SubagentStopInput extends Schema.Class<SubagentStopInput>("SubagentStopInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SubagentStop"),
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name */
	agent_type: Schema.optional(Schema.String),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Path to the subagent's own transcript */
	agent_transcript_path: Schema.optional(Schema.String),
	/** Text content of the subagent's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for SubagentStop events.
 * @public
 */
export class SubagentStopEvent extends Schema.Class<SubagentStopEvent>("SubagentStopEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("SubagentStop"),
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name */
	agent_type: Schema.optional(Schema.String),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Path to the subagent's own transcript */
	agent_transcript_path: Schema.optional(Schema.String),
	/** Text content of the subagent's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: SubagentStopInput): SubagentStopEvent {
		return new SubagentStopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			stop_hook_active: input.stop_hook_active,
			agent_transcript_path: input.agent_transcript_path,
			last_assistant_message: input.last_assistant_message,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for SubagentStop handlers.
 * @public
 */
export type SubagentStopOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for SubagentStop hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * SubagentStop hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const SubagentStopOutputSchema = Schema.Union(
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
export type SubagentStopOutput = typeof SubagentStopOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for SubagentStop hooks.
 * @public
 */
export class SubagentStopResponse extends Schema.Class<SubagentStopResponse>("SubagentStopResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a SubagentStop pipeline output to a SubagentStopResponse.
 * @public
 */
export function toSubagentStopResponse(output: SubagentStopOutput): SubagentStopResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new SubagentStopResponse({ decision: "block", reason: output.reason });
	}
	return new SubagentStopResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for SubagentStop hooks.
 * @public
 */
export type SubagentStopHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	SubagentStopInput,
	SubagentStopOutput,
	TOptions,
	TState,
	SubagentStopOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for SubagentStop hooks.
 * @public
 */
export type SubagentStopHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SubagentStopInput,
	SubagentStopOutput,
	unknown,
	TOptions,
	TState,
	SubagentStopOutcome
>;
