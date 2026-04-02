import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { Retry } from "../outcomes/Retry.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import {
	NormalizedPathSchema,
	SessionIdSchema,
	ToolUseIdSchema,
	TranscriptPathSchema,
	normalizePath,
} from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PermissionDenied wire format from Claude Code stdin.
 *
 * @remarks
 * Fired when a permission request is denied, allowing the plugin to
 * optionally tell Claude Code the model may retry the denied tool call.
 *
 * @public
 */
export class PermissionDeniedInput extends Schema.Class<PermissionDeniedInput>("PermissionDeniedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PermissionDenied"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that was denied */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
	/** Reason the permission was denied */
	denial_reason: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PermissionDenied events.
 * @public
 */
export class PermissionDeniedEvent extends Schema.Class<PermissionDeniedEvent>("PermissionDeniedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PermissionDenied"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool that was denied */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
	/** Reason the permission was denied */
	denial_reason: Schema.optional(Schema.String),
}) {
	static fromInput(input: PermissionDeniedInput): PermissionDeniedEvent {
		return new PermissionDeniedEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_use_id: input.tool_use_id,
			denial_reason: input.denial_reason,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PermissionDenied handlers.
 * @public
 */
export type PermissionDeniedOutcome = Retry | NoAction;

/**
 * Set of valid outcome tags for PermissionDenied hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Retry", "NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * PermissionDenied hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const PermissionDeniedOutputSchema = Schema.Union(
	// Executed state
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		retry: Schema.optional(Schema.Boolean),
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
export type PermissionDeniedOutput = typeof PermissionDeniedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for PermissionDenied hooks.
 *
 * @remarks
 * Wire format: `{ hookSpecificOutput?: { retry: boolean } }`
 *
 * @public
 */
export class PermissionDeniedResponse extends Schema.Class<PermissionDeniedResponse>("PermissionDeniedResponse")({
	hookSpecificOutput: Schema.optional(
		Schema.Struct({
			retry: Schema.Boolean,
		}),
	),
}) {}

/**
 * Convert a PermissionDenied pipeline output to a PermissionDeniedResponse.
 * @public
 */
export function toPermissionDeniedResponse(output: PermissionDeniedOutput): PermissionDeniedResponse {
	if ("retry" in output && output.retry === true) {
		return new PermissionDeniedResponse({ hookSpecificOutput: { retry: true } });
	}
	return new PermissionDeniedResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PermissionDenied hooks.
 * @public
 */
export type PermissionDeniedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PermissionDeniedInput,
	PermissionDeniedOutput,
	TOptions,
	TState,
	PermissionDeniedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PermissionDenied hooks.
 * @public
 */
export type PermissionDeniedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PermissionDeniedInput,
	PermissionDeniedOutput,
	unknown,
	TOptions,
	TState,
	PermissionDeniedOutcome
>;
