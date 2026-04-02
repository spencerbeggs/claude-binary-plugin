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
 * Input schema for TeammateIdle wire format from Claude Code stdin.
 * @public
 */
export class TeammateIdleInput extends Schema.Class<TeammateIdleInput>("TeammateIdleInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TeammateIdle"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the teammate that is about to go idle */
	teammate_name: Schema.String,
	/** Name of the team */
	team_name: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for TeammateIdle events.
 * @public
 */
export class TeammateIdleEvent extends Schema.Class<TeammateIdleEvent>("TeammateIdleEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("TeammateIdle"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the teammate that is about to go idle */
	teammate_name: Schema.String,
	/** Name of the team */
	team_name: Schema.String,
}) {
	static fromInput(input: TeammateIdleInput): TeammateIdleEvent {
		return new TeammateIdleEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for TeammateIdle handlers.
 * @public
 */
export type TeammateIdleOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for TeammateIdle hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * TeammateIdle hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const TeammateIdleOutputSchema = Schema.Union(
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
export type TeammateIdleOutput = typeof TeammateIdleOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for TeammateIdle hooks.
 * @public
 */
export class TeammateIdleResponse extends Schema.Class<TeammateIdleResponse>("TeammateIdleResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a TeammateIdle pipeline output to a TeammateIdleResponse.
 * @public
 */
export function toTeammateIdleResponse(output: TeammateIdleOutput): TeammateIdleResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new TeammateIdleResponse({ decision: "block", reason: output.reason });
	}
	return new TeammateIdleResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for TeammateIdle hooks.
 * @public
 */
export type TeammateIdleHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	TeammateIdleInput,
	TeammateIdleOutput,
	TOptions,
	TState,
	TeammateIdleOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for TeammateIdle hooks.
 * @public
 */
export type TeammateIdleHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	TeammateIdleInput,
	TeammateIdleOutput,
	unknown,
	TOptions,
	TState,
	TeammateIdleOutcome
>;
