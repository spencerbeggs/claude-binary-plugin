import { Schema } from "effect";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { ConfigChangeSourceSchema, HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for ConfigChange wire format from Claude Code stdin.
 * @public
 */
export class ConfigChangeInput extends Schema.Class<ConfigChangeInput>("ConfigChangeInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("ConfigChange"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Which configuration type changed */
	source: ConfigChangeSourceSchema,
	/** Path to the specific file that was modified */
	file_path: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for ConfigChange events.
 * @public
 */
export class ConfigChangeEvent extends Schema.Class<ConfigChangeEvent>("ConfigChangeEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("ConfigChange"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Which configuration type changed */
	source: ConfigChangeSourceSchema,
	/** Path to the specific file that was modified */
	file_path: Schema.optional(NormalizedPathSchema),
}) {
	static fromInput(input: ConfigChangeInput): ConfigChangeEvent {
		return new ConfigChangeEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			source: input.source,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			file_path: input.file_path ? normalizePath(input.file_path) : undefined,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for ConfigChange handlers.
 * @public
 */
export type ConfigChangeOutcome = Block | Continue | Skip;

/**
 * Set of valid outcome tags for ConfigChange hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * ConfigChange hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const ConfigChangeOutputSchema = Schema.Union(
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
export type ConfigChangeOutput = typeof ConfigChangeOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for ConfigChange hooks.
 * @public
 */
export class ConfigChangeResponse extends Schema.Class<ConfigChangeResponse>("ConfigChangeResponse")({
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a ConfigChange pipeline output to a ConfigChangeResponse.
 * @public
 */
export function toConfigChangeResponse(output: ConfigChangeOutput): ConfigChangeResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new ConfigChangeResponse({ decision: "block", reason: output.reason });
	}
	return new ConfigChangeResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for ConfigChange hooks.
 * @public
 */
export type ConfigChangeHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	ConfigChangeInput,
	ConfigChangeOutput,
	TOptions,
	TState,
	ConfigChangeOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for ConfigChange hooks.
 * @public
 */
export type ConfigChangeHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	ConfigChangeInput,
	ConfigChangeOutput,
	unknown,
	TOptions,
	TState,
	ConfigChangeOutcome
>;
