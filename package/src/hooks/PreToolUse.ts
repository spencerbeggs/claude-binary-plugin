import { Schema } from "effect";
import type { Allow } from "../outcomes/Allow.js";
import type { Ask } from "../outcomes/Ask.js";
import type { Deny } from "../outcomes/Deny.js";
import type { Modify } from "../outcomes/Modify.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler, ToolFilter } from "../plugin/handler.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { JsonObjectSchema } from "../schemas/json.js";
import { ExecutionQualitySchema, HookMetricsSchema, ValidationResultSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for PreToolUse wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PreToolUseInput)(data)` to parse.
 *
 * @public
 */
export class PreToolUseInput extends Schema.Class<PreToolUseInput>("PreToolUseInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PreToolUse"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool being invoked */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for PreToolUse events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PreToolUseEvent)(data)` to parse.
 *
 * @public
 */
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>("PreToolUseEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("PreToolUse"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Name of the tool being invoked */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {
	static fromInput(input: PreToolUseInput): PreToolUseEvent {
		return new PreToolUseEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_use_id: input.tool_use_id,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for PreToolUse handlers.
 * @public
 */
export type PreToolUseOutcome = Allow | Deny | Ask | Modify | Skip;

/**
 * Set of valid outcome tags for PreToolUse hooks.
 * Used for compile-time and runtime outcome type checking.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Allow", "Deny", "Ask", "Modify", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * PreToolUse hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const PreToolUseOutputSchema = Schema.Union(
	// Executed states
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("allow", "deny", "ask", "modify"),
		summary: Schema.String,
		validation: Schema.optional(ValidationResultSchema),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
		updatedInput: Schema.optional(JsonObjectSchema),
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

	// Cached state
	Schema.Struct({
		status: Schema.Literal("cached"),
		summary: Schema.String,
		action: Schema.Literal("allow", "deny", "ask", "modify"),
		reason: Schema.optional(Schema.String),
		updatedInput: Schema.optional(JsonObjectSchema),
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),

	// Timeout state
	Schema.Struct({
		status: Schema.Literal("timeout"),
		summary: Schema.String,
		reason: Schema.String,
		userMessage: Schema.optional(Schema.String),
	}),
);

/** @public */
export type PreToolUseOutput = typeof PreToolUseOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for PreToolUse hooks.
 *
 * @remarks
 * Maps the pipeline output `action` field to Claude Code's `permissionDecision` wire format.
 * - `action: "allow"` maps to `permissionDecision: "allow"`
 * - `action: "deny"` maps to `permissionDecision: "deny"`
 * - `action: "ask"` maps to `permissionDecision: "ask"`
 *
 * @public
 */
export class PreToolUseResponse extends Schema.Class<PreToolUseResponse>("PreToolUseResponse")({
	permissionDecision: Schema.Literal("allow", "deny", "ask"),
	reason: Schema.optional(Schema.String),
	updatedInput: Schema.optional(JsonObjectSchema),
}) {}

/**
 * Convert a PreToolUse pipeline output to a PreToolUseResponse.
 *
 * @remarks
 * Maps `action` to `permissionDecision`:
 * - `"deny"` maps to `"deny"`
 * - `"ask"` maps to `"ask"`
 * - anything else maps to `"allow"`
 *
 * @param output - The PreToolUse pipeline output (discriminated union)
 * @returns A validated PreToolUseResponse instance
 * @public
 */
export function toPreToolUseResponse(output: PreToolUseOutput): PreToolUseResponse {
	const action = "action" in output ? output.action : undefined;
	let permissionDecision: "allow" | "deny" | "ask" = "allow";
	if (action === "deny") permissionDecision = "deny";
	else if (action === "ask") permissionDecision = "ask";
	return new PreToolUseResponse({
		permissionDecision,
		reason: "reason" in output ? output.reason : undefined,
		updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
	});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for PreToolUse hooks.
 *
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @public
 */
export type PreToolUseHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	PreToolUseInput,
	PreToolUseOutput,
	TOptions,
	TState,
	PreToolUseOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for PreToolUse hooks.
 * Includes ToolFilter for per-tool filtering.
 *
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @public
 */
export type PreToolUseHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PreToolUseInput,
	PreToolUseOutput,
	unknown,
	TOptions,
	TState,
	PreToolUseOutcome
> &
	ToolFilter;
