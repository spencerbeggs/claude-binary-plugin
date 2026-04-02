import { Schema } from "effect";
import type { Allow } from "../outcomes/Allow.js";
import type { Deny } from "../outcomes/Deny.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PermissionRequest wire format from Claude Code stdin.
 * @public
 */
export class PermissionRequestInput extends Schema.Class<PermissionRequestInput>("PermissionRequestInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PermissionRequest"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool requesting permission */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Permission suggestions (always-allow options) */
	permission_suggestions: Schema.optional(Schema.Array(JsonObjectSchema)),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PermissionRequest events.
 * @public
 */
export class PermissionRequestEvent extends Schema.Class<PermissionRequestEvent>("PermissionRequestEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PermissionRequest"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool requesting permission */
	tool_name: Schema.String,
	/** Input parameters for the tool */
	tool_input: JsonObjectSchema,
	/** Permission suggestions (always-allow options) */
	permission_suggestions: Schema.optional(Schema.Array(JsonObjectSchema)),
}) {
	static fromInput(input: PermissionRequestInput): PermissionRequestEvent {
		return new PermissionRequestEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			permission_suggestions: input.permission_suggestions,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PermissionRequest handlers.
 * @public
 */
export type PermissionRequestOutcome = Allow | Deny;

/**
 * Set of valid outcome tags for PermissionRequest hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Allow", "Deny"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * PermissionRequest hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const PermissionRequestOutputSchema = Schema.Union(
	// Executed states
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("allow", "deny"),
		summary: Schema.String,
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
		updatedInput: Schema.optional(JsonObjectSchema),
		interrupt: Schema.optional(Schema.Boolean),
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
export type PermissionRequestOutput = typeof PermissionRequestOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for PermissionRequest hooks.
 * @public
 */
export class PermissionRequestResponse extends Schema.Class<PermissionRequestResponse>("PermissionRequestResponse")({
	behavior: Schema.Literal("allow", "deny"),
	message: Schema.optional(Schema.String),
	interrupt: Schema.optional(Schema.Boolean),
	updatedInput: Schema.optional(JsonObjectSchema),
}) {}

/**
 * Convert a PermissionRequest pipeline output to a PermissionRequestResponse.
 * @public
 */
export function toPermissionRequestResponse(output: PermissionRequestOutput): PermissionRequestResponse {
	const action = "action" in output ? output.action : undefined;
	return new PermissionRequestResponse({
		behavior: action === "deny" ? "deny" : "allow",
		message: "reason" in output ? output.reason : undefined,
		interrupt: "interrupt" in output ? output.interrupt : undefined,
		updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
	});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PermissionRequestInput,
	PermissionRequestOutput,
	TOptions,
	TState,
	PermissionRequestOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PermissionRequestInput,
	PermissionRequestOutput,
	unknown,
	TOptions,
	TState,
	PermissionRequestOutcome
>;
