import { Schema } from "effect";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "./branded.js";
import type { HookPermissionsMode } from "./hook-literals.js";
import {
	HookPermissionsModeSchema,
	HookTypeSchema,
	PreCompactTriggerSchema,
	SessionEndReasonSchema,
	SessionStartSourceSchema,
} from "./hook-literals.js";
import { JsonObjectSchema } from "./json.js";

// =============================================================================
// BASE FIELDS
// =============================================================================

/**
 * Shared base fields present in all hook input payloads from Claude Code.
 *
 * @remarks
 * These fields are spread into each Input Schema.Class definition.
 * The `hook_event_name` field is overridden per-class with a narrowed literal.
 *
 * @internal
 */
const HookInputBaseFields = {
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: HookTypeSchema,
};

// =============================================================================
// INPUT SCHEMA CLASSES
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
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PreToolUse"),
	/** Name of the tool being invoked */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {}

/**
 * Input schema for PostToolUse wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PostToolUseInput)(data)` to parse.
 *
 * @public
 */
export class PostToolUseInput extends Schema.Class<PostToolUseInput>("PostToolUseInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PostToolUse"),
	/** Name of the tool that was invoked */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Response returned by the tool (JSON object) */
	tool_response: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {}

/**
 * Input schema for PermissionRequest wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PermissionRequestInput)(data)` to parse.
 *
 * @public
 */
export class PermissionRequestInput extends Schema.Class<PermissionRequestInput>("PermissionRequestInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PermissionRequest"),
	/** The permission message being shown */
	message: Schema.String,
	/** Type of notification/permission being requested */
	notification_type: Schema.String,
}) {}

/**
 * Input schema for Notification wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(NotificationInput)(data)` to parse.
 *
 * @public
 */
export class NotificationInput extends Schema.Class<NotificationInput>("NotificationInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("Notification"),
	/** The notification message */
	message: Schema.String,
	/** Type of notification */
	notification_type: Schema.String,
}) {}

/**
 * Input schema for UserPromptSubmit wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(UserPromptSubmitInput)(data)` to parse.
 *
 * @public
 */
export class UserPromptSubmitInput extends Schema.Class<UserPromptSubmitInput>("UserPromptSubmitInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("UserPromptSubmit"),
	/** The user's prompt text */
	prompt: Schema.String,
}) {}

/**
 * Input schema for Stop wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(StopInput)(data)` to parse.
 *
 * @public
 */
export class StopInput extends Schema.Class<StopInput>("StopInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("Stop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
}) {}

/**
 * Input schema for SubagentStop wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SubagentStopInput)(data)` to parse.
 *
 * @public
 */
export class SubagentStopInput extends Schema.Class<SubagentStopInput>("SubagentStopInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("SubagentStop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
}) {}

/**
 * Input schema for PreCompact wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PreCompactInput)(data)` to parse.
 *
 * @public
 */
export class PreCompactInput extends Schema.Class<PreCompactInput>("PreCompactInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PreCompact"),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** Custom instructions for the compact operation */
	custom_instructions: Schema.String,
}) {}

/**
 * Input schema for SessionStart wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SessionStartInput)(data)` to parse.
 *
 * @public
 */
export class SessionStartInput extends Schema.Class<SessionStartInput>("SessionStartInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("SessionStart"),
	/** What triggered the session start */
	source: SessionStartSourceSchema,
}) {}

/**
 * Input schema for SessionEnd wire format from Claude Code stdin.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SessionEndInput)(data)` to parse.
 *
 * @public
 */
export class SessionEndInput extends Schema.Class<SessionEndInput>("SessionEndInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("SessionEnd"),
	/** Why the session is ending */
	reason: SessionEndReasonSchema,
}) {}

// =============================================================================
// DERIVED TYPES
// =============================================================================

/**
 * Base properties present in all hook events.
 * Derived from the Input Schema.Class base fields.
 * @public
 */
export interface HookEventBase {
	/** Unique identifier for the current session (UUID format) */
	session_id: string;
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path?: string | undefined;
	/** Current working directory (optional) */
	cwd?: string | undefined;
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode?: HookPermissionsMode | undefined;
	/** The type of hook event */
	hook_event_name: typeof HookTypeSchema.Type;
}
