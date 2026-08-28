import { Schema } from "effect";
import type { AddContext } from "../outcomes/AddContext.js";
import type { Block } from "../outcomes/Block.js";
import type { Continue } from "../outcomes/Continue.js";
import type { NoAction } from "../outcomes/NoAction.js";
import type { Skip } from "../outcomes/Skip.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for UserPromptSubmit wire format from Claude Code stdin.
 * @public
 */
export class UserPromptSubmitInput extends Schema.Class<UserPromptSubmitInput>("UserPromptSubmitInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("UserPromptSubmit"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** The user's prompt text */
	prompt: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for UserPromptSubmit events.
 * @public
 */
export class UserPromptSubmitEvent extends Schema.Class<UserPromptSubmitEvent>("UserPromptSubmitEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("UserPromptSubmit"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** The user's prompt text */
	prompt: Schema.String,
}) {
	static fromInput(input: UserPromptSubmitInput): UserPromptSubmitEvent {
		return new UserPromptSubmitEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			prompt: input.prompt,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for UserPromptSubmit handlers.
 * @public
 */
export type UserPromptSubmitOutcome = Block | Continue | AddContext | NoAction | Skip;

/**
 * Set of valid outcome tags for UserPromptSubmit hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["Block", "Continue", "AddContext", "NoAction", "Skip"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * UserPromptSubmit hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const UserPromptSubmitOutputSchema = Schema.Union(
	// Executed states
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("block", "continue", "context", "none"),
		summary: Schema.String,
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
		userMessage: Schema.optional(Schema.String),
		claudeContext: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
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
export type UserPromptSubmitOutput = typeof UserPromptSubmitOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for UserPromptSubmit hooks.
 * @public
 */
export class UserPromptSubmitResponse extends Schema.Class<UserPromptSubmitResponse>("UserPromptSubmitResponse")({
	additionalContext: Schema.optional(Schema.String),
	decision: Schema.optional(Schema.Literal("block")),
	reason: Schema.optional(Schema.String),
}) {}

/**
 * Convert a UserPromptSubmit pipeline output to a UserPromptSubmitResponse.
 * @public
 */
export function toUserPromptSubmitResponse(output: UserPromptSubmitOutput): UserPromptSubmitResponse {
	const action = "action" in output ? output.action : undefined;
	if (action === "block" && "reason" in output && output.reason) {
		return new UserPromptSubmitResponse({ decision: "block", reason: output.reason });
	}
	if (action === "context" && "claudeContext" in output && output.claudeContext) {
		return new UserPromptSubmitResponse({ additionalContext: output.claudeContext });
	}
	return new UserPromptSubmitResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	UserPromptSubmitInput,
	UserPromptSubmitOutput,
	TOptions,
	TState,
	UserPromptSubmitOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	UserPromptSubmitInput,
	UserPromptSubmitOutput,
	unknown,
	TOptions,
	TState,
	UserPromptSubmitOutcome
>;
