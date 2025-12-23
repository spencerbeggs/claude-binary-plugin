/**
 * Zod schemas for Claude Code hook events.
 *
 * Provides runtime validation for hook event data received from Claude Code.
 * All schemas match the TypeScript interfaces defined in index.ts.
 *
 * @example
 * ```typescript
 * import { parseHookEvent, PreToolUseEventSchema } from "@savvy-web/bun-hooks/schemas";
 *
 * // Parse any hook event (discriminated union)
 * const event = parseHookEvent(jsonString);
 *
 * // Parse specific event type
 * const preToolUse = PreToolUseEventSchema.parse(data);
 * ```
 */

import { z } from "zod";

// =============================================================================
// ENUMS AND LITERALS
// =============================================================================

/**
 * Hook event names as Zod enum.
 * Matches HookEventName enum in index.ts.
 */
export const HookEventNameSchema = z.enum([
	"PreToolUse",
	"PostToolUse",
	"PermissionRequest",
	"Notification",
	"UserPromptSubmit",
	"Stop",
	"SubagentStop",
	"PreCompact",
	"SessionStart",
	"SessionEnd",
]);

/**
 * Permission modes for hook events.
 * Matches HookPermissionsMode type in index.ts.
 */
export const HookPermissionsModeSchema = z.enum(["default", "plan", "acceptEdits", "bypassPermissions"]);

/**
 * Pre-tool-use permission decisions.
 * Matches PreToolUseDecision type in index.ts.
 */
export const PreToolUseDecisionSchema = z.enum(["allow", "deny", "ask"]);

/**
 * Permission request behavior.
 * Matches PermissionRequestBehavior type in index.ts.
 */
export const PermissionRequestBehaviorSchema = z.enum(["allow", "deny"]);

/**
 * Pre-compact trigger types.
 * Matches PreCompactTrigger type in index.ts.
 */
export const PreCompactTriggerSchema = z.enum(["manual", "auto"]);

/**
 * Session start source types.
 * Matches SessionStartSource type in index.ts.
 */
export const SessionStartSourceSchema = z.enum(["startup", "resume", "clear", "compact"]);

/**
 * Session end reason types.
 * Matches SessionEndReason type in index.ts.
 */
export const SessionEndReasonSchema = z.enum(["clear", "logout", "prompt_input_exit", "other"]);

// =============================================================================
// BASE SCHEMA
// =============================================================================

/**
 * Base fields present in all hook events.
 * Matches HookEventBase interface in index.ts.
 */
export const HookEventBaseSchema = z.object({
	/** Unique identifier for the current session (UUID format) */
	session_id: z.string().uuid(),
	/** Absolute path to the conversation transcript JSON file (optional - may not be present in all events) */
	transcript_path: z.string().optional(),
	/** Current working directory (optional - may not be present in all events) */
	cwd: z.string().optional(),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: HookPermissionsModeSchema.optional(),
	/** The type of hook event */
	hook_event_name: HookEventNameSchema,
});

// =============================================================================
// EVENT-SPECIFIC SCHEMAS
// =============================================================================

/**
 * Schema for PreToolUse events.
 * Fired after Claude creates tool parameters but before the tool executes.
 */
export const PreToolUseEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("PreToolUse"),
	/** Name of the tool being invoked */
	tool_name: z.string(),
	/** Input parameters for the tool */
	tool_input: z.record(z.string(), z.unknown()),
	/** Unique identifier for this tool use */
	tool_use_id: z.string(),
});

/**
 * Schema for PostToolUse events.
 * Fired immediately after a tool completes successfully.
 */
export const PostToolUseEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("PostToolUse"),
	/** Name of the tool that was invoked */
	tool_name: z.string(),
	/** Input parameters that were passed to the tool */
	tool_input: z.record(z.string(), z.unknown()),
	/** Response returned by the tool */
	tool_response: z.record(z.string(), z.unknown()),
	/** Unique identifier for this tool use */
	tool_use_id: z.string(),
});

/**
 * Schema for PermissionRequest events.
 * Fired when a permission dialog is about to be shown to the user.
 */
export const PermissionRequestEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("PermissionRequest"),
	/** The permission message being shown */
	message: z.string(),
	/** Type of notification/permission being requested */
	notification_type: z.string(),
});

/**
 * Schema for Notification events.
 * Fired when Claude Code sends a notification.
 */
export const NotificationEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("Notification"),
	/** The notification message */
	message: z.string(),
	/** Type of notification */
	notification_type: z.string(),
});

/**
 * Schema for UserPromptSubmit events.
 * Fired when the user submits a prompt, before Claude processes it.
 */
export const UserPromptSubmitEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("UserPromptSubmit"),
	/** The user's prompt text */
	prompt: z.string(),
});

/**
 * Schema for Stop events.
 * Fired when the main Claude Code agent finishes responding.
 */
export const StopEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("Stop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: z.boolean(),
});

/**
 * Schema for SubagentStop events.
 * Fired when a subagent (Task tool) finishes responding.
 */
export const SubagentStopEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("SubagentStop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: z.boolean(),
});

/**
 * Schema for PreCompact events.
 * Fired before Claude Code compacts the context window.
 */
export const PreCompactEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("PreCompact"),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** Custom instructions for the compact operation */
	custom_instructions: z.string(),
});

/**
 * Schema for SessionStart events.
 * Fired when Claude Code starts or resumes a session.
 */
export const SessionStartEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("SessionStart"),
	/** What triggered the session start */
	source: SessionStartSourceSchema,
});

/**
 * Schema for SessionEnd events.
 * Fired when a Claude Code session terminates.
 */
export const SessionEndEventSchema = HookEventBaseSchema.extend({
	hook_event_name: z.literal("SessionEnd"),
	/** Why the session is ending */
	reason: SessionEndReasonSchema,
});

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================

/**
 * Discriminated union schema for all hook event types.
 * Uses hook_event_name as the discriminator field.
 *
 * @example
 * ```typescript
 * const event = HookEventSchema.parse(data);
 * switch (event.hook_event_name) {
 *   case "PreToolUse":
 *     console.log(event.tool_name); // TypeScript knows this exists
 *     break;
 *   case "SessionStart":
 *     console.log(event.source); // TypeScript knows this exists
 *     break;
 * }
 * ```
 */
export const HookEventSchema = z.discriminatedUnion("hook_event_name", [
	PreToolUseEventSchema,
	PostToolUseEventSchema,
	PermissionRequestEventSchema,
	NotificationEventSchema,
	UserPromptSubmitEventSchema,
	StopEventSchema,
	SubagentStopEventSchema,
	PreCompactEventSchema,
	SessionStartEventSchema,
	SessionEndEventSchema,
]);

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/** Inferred type for any hook event (discriminated union) */
export type HookEventParsed = z.infer<typeof HookEventSchema>;

/** Inferred type for PreToolUse events */
export type PreToolUseEventParsed = z.infer<typeof PreToolUseEventSchema>;

/** Inferred type for PostToolUse events */
export type PostToolUseEventParsed = z.infer<typeof PostToolUseEventSchema>;

/** Inferred type for PermissionRequest events */
export type PermissionRequestEventParsed = z.infer<typeof PermissionRequestEventSchema>;

/** Inferred type for Notification events */
export type NotificationEventParsed = z.infer<typeof NotificationEventSchema>;

/** Inferred type for UserPromptSubmit events */
export type UserPromptSubmitEventParsed = z.infer<typeof UserPromptSubmitEventSchema>;

/** Inferred type for Stop events */
export type StopEventParsed = z.infer<typeof StopEventSchema>;

/** Inferred type for SubagentStop events */
export type SubagentStopEventParsed = z.infer<typeof SubagentStopEventSchema>;

/** Inferred type for PreCompact events */
export type PreCompactEventParsed = z.infer<typeof PreCompactEventSchema>;

/** Inferred type for SessionStart events */
export type SessionStartEventParsed = z.infer<typeof SessionStartEventSchema>;

/** Inferred type for SessionEnd events */
export type SessionEndEventParsed = z.infer<typeof SessionEndEventSchema>;

// =============================================================================
// PARSING HELPERS
// =============================================================================

/**
 * Parse a JSON string into a validated hook event.
 * Throws ZodError with detailed message on invalid data.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated and typed hook event
 * @throws {z.ZodError} When the data doesn't match any hook event schema
 * @throws {SyntaxError} When the JSON is malformed
 *
 * @example
 * ```typescript
 * try {
 *   const event = parseHookEvent(jsonString);
 *   console.log(event.hook_event_name, event.session_id);
 * } catch (e) {
 *   if (e instanceof z.ZodError) {
 *     console.error("Invalid hook event:", e.issues);
 *   }
 * }
 * ```
 */
export function parseHookEvent(json: string): HookEventParsed {
	const data: unknown = JSON.parse(json);
	return HookEventSchema.parse(data);
}

/**
 * Parse a JSON string into a PreToolUse event.
 * Use when you know the event type in advance (e.g., in a PreToolUse hook handler).
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated PreToolUse event
 * @throws {z.ZodError} When the data doesn't match PreToolUseEventSchema
 */
export function parsePreToolUseEvent(json: string): PreToolUseEventParsed {
	const data: unknown = JSON.parse(json);
	return PreToolUseEventSchema.parse(data);
}

/**
 * Parse a JSON string into a PostToolUse event.
 * Use when you know the event type in advance (e.g., in a PostToolUse hook handler).
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated PostToolUse event
 * @throws {z.ZodError} When the data doesn't match PostToolUseEventSchema
 */
export function parsePostToolUseEvent(json: string): PostToolUseEventParsed {
	const data: unknown = JSON.parse(json);
	return PostToolUseEventSchema.parse(data);
}

/**
 * Parse a JSON string into a PermissionRequest event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated PermissionRequest event
 * @throws {z.ZodError} When the data doesn't match PermissionRequestEventSchema
 */
export function parsePermissionRequestEvent(json: string): PermissionRequestEventParsed {
	const data: unknown = JSON.parse(json);
	return PermissionRequestEventSchema.parse(data);
}

/**
 * Parse a JSON string into a Notification event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated Notification event
 * @throws {z.ZodError} When the data doesn't match NotificationEventSchema
 */
export function parseNotificationEvent(json: string): NotificationEventParsed {
	const data: unknown = JSON.parse(json);
	return NotificationEventSchema.parse(data);
}

/**
 * Parse a JSON string into a UserPromptSubmit event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated UserPromptSubmit event
 * @throws {z.ZodError} When the data doesn't match UserPromptSubmitEventSchema
 */
export function parseUserPromptSubmitEvent(json: string): UserPromptSubmitEventParsed {
	const data: unknown = JSON.parse(json);
	return UserPromptSubmitEventSchema.parse(data);
}

/**
 * Parse a JSON string into a Stop event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated Stop event
 * @throws {z.ZodError} When the data doesn't match StopEventSchema
 */
export function parseStopEvent(json: string): StopEventParsed {
	const data: unknown = JSON.parse(json);
	return StopEventSchema.parse(data);
}

/**
 * Parse a JSON string into a SubagentStop event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated SubagentStop event
 * @throws {z.ZodError} When the data doesn't match SubagentStopEventSchema
 */
export function parseSubagentStopEvent(json: string): SubagentStopEventParsed {
	const data: unknown = JSON.parse(json);
	return SubagentStopEventSchema.parse(data);
}

/**
 * Parse a JSON string into a PreCompact event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated PreCompact event
 * @throws {z.ZodError} When the data doesn't match PreCompactEventSchema
 */
export function parsePreCompactEvent(json: string): PreCompactEventParsed {
	const data: unknown = JSON.parse(json);
	return PreCompactEventSchema.parse(data);
}

/**
 * Parse a JSON string into a SessionStart event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated SessionStart event
 * @throws {z.ZodError} When the data doesn't match SessionStartEventSchema
 */
export function parseSessionStartEvent(json: string): SessionStartEventParsed {
	const data: unknown = JSON.parse(json);
	return SessionStartEventSchema.parse(data);
}

/**
 * Parse a JSON string into a SessionEnd event.
 *
 * @param json - Raw JSON string from Claude Code
 * @returns Validated SessionEnd event
 * @throws {z.ZodError} When the data doesn't match SessionEndEventSchema
 */
export function parseSessionEndEvent(json: string): SessionEndEventParsed {
	const data: unknown = JSON.parse(json);
	return SessionEndEventSchema.parse(data);
}
