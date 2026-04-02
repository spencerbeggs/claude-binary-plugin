import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { WatchPaths } from "../outcomes/WatchPaths.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for CwdChanged wire format from Claude Code stdin.
 * @public
 */
export class CwdChangedInput extends Schema.Class<CwdChangedInput>("CwdChangedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("CwdChanged"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Previous working directory */
	old_cwd: Schema.String,
	/** New working directory */
	new_cwd: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for CwdChanged events.
 * @public
 */
export class CwdChangedEvent extends Schema.Class<CwdChangedEvent>("CwdChangedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("CwdChanged"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Previous working directory */
	old_cwd: Schema.String,
	/** New working directory */
	new_cwd: Schema.String,
}) {
	static fromInput(input: CwdChangedInput): CwdChangedEvent {
		return new CwdChangedEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for CwdChanged handlers.
 * @public
 */
export type CwdChangedOutcome = WatchPaths | NoAction;

/**
 * Set of valid outcome tags for CwdChanged hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["WatchPaths", "NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * CwdChanged hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const CwdChangedOutputSchema = Schema.Union(
	// Executed state
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		watchPaths: Schema.optional(Schema.Array(Schema.String)),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
	}),

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
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
	}),
);

/** @public */
export type CwdChangedOutput = typeof CwdChangedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for CwdChanged hooks.
 * @public
 */
export class CwdChangedResponse extends Schema.Class<CwdChangedResponse>("CwdChangedResponse")({
	watchPaths: Schema.optional(Schema.Array(Schema.String)),
}) {}

/**
 * Convert a CwdChanged pipeline output to a CwdChangedResponse.
 * @public
 */
export function toCwdChangedResponse(output: CwdChangedOutput): CwdChangedResponse {
	if ("watchPaths" in output && output.watchPaths) {
		return new CwdChangedResponse({ watchPaths: output.watchPaths });
	}
	return new CwdChangedResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for CwdChanged hooks.
 * @public
 */
export type CwdChangedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	CwdChangedInput,
	CwdChangedOutput,
	TOptions,
	TState,
	CwdChangedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for CwdChanged hooks.
 * @public
 */
export type CwdChangedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	CwdChangedInput,
	CwdChangedOutput,
	unknown,
	TOptions,
	TState,
	CwdChangedOutcome
>;
