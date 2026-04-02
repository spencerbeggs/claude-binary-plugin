import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for Notification wire format from Claude Code stdin.
 * @public
 */
export class NotificationInput extends Schema.Class<NotificationInput>("NotificationInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Notification"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** The notification message */
	message: Schema.String,
	/** Optional title for the notification */
	title: Schema.optional(Schema.String),
	/** Type of notification */
	notification_type: Schema.String,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for Notification events.
 * @public
 */
export class NotificationEvent extends Schema.Class<NotificationEvent>("NotificationEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("Notification"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** The notification message */
	message: Schema.String,
	/** Optional title for the notification */
	title: Schema.optional(Schema.String),
	/** Type of notification */
	notification_type: Schema.String,
}) {
	static fromInput(input: NotificationInput): NotificationEvent {
		return new NotificationEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			message: input.message,
			title: input.title,
			notification_type: input.notification_type,
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for Notification handlers.
 * @public
 */
export type NotificationOutcome = NoAction;

/**
 * Set of valid outcome tags for Notification hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const NotificationOutputSchema = PassthroughOutputSchema;

/** @public */
export type NotificationOutput = typeof NotificationOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as NotificationResponse, toPassthroughResponse as toNotificationResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for Notification hooks.
 * @public
 */
export type NotificationHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	NotificationInput,
	NotificationOutput,
	TOptions,
	TState,
	NotificationOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for Notification hooks.
 * @public
 */
export type NotificationHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	NotificationInput,
	NotificationOutput,
	unknown,
	TOptions,
	TState,
	NotificationOutcome
>;
