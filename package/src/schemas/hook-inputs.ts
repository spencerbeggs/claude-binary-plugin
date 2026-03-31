import { Schema } from "effect";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "./branded.js";
import type { HookPermissionsMode } from "./hook-literals.js";
import {
	ConfigChangeSourceSchema,
	ElicitationActionSchema,
	FileChangeEventSchema,
	HookPermissionsModeSchema,
	HookTypeSchema,
	InstructionsLoadedReasonSchema,
	InstructionsMemoryTypeSchema,
	PreCompactTriggerSchema,
	SessionEndReasonSchema,
	SessionStartSourceSchema,
	StopFailureErrorSchema,
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
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
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
	/** Name of the tool requesting permission */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Permission suggestions (always-allow options) */
	permission_suggestions: Schema.optional(Schema.Array(JsonObjectSchema)),
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
	/** Optional title for the notification */
	title: Schema.optional(Schema.String),
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
	/** Text content of Claude's final response */
	last_assistant_message: Schema.optional(Schema.String),
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
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name */
	agent_type: Schema.optional(Schema.String),
	/** Path to the subagent's own transcript */
	agent_transcript_path: Schema.optional(Schema.String),
	/** Text content of the subagent's final response */
	last_assistant_message: Schema.optional(Schema.String),
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
	/** Model identifier */
	model: Schema.optional(Schema.String),
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
// NEW HOOK EVENT INPUT CLASSES
// =============================================================================

/**
 * Input schema for PostToolUseFailure wire format from Claude Code stdin.
 * @public
 */
export class PostToolUseFailureInput extends Schema.Class<PostToolUseFailureInput>("PostToolUseFailureInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PostToolUseFailure"),
	/** Name of the tool that failed */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
	/** Error description */
	error: Schema.String,
	/** Whether the failure was caused by user interruption */
	is_interrupt: Schema.optional(Schema.Boolean),
}) {}

/**
 * Input schema for StopFailure wire format from Claude Code stdin.
 * @public
 */
export class StopFailureInput extends Schema.Class<StopFailureInput>("StopFailureInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("StopFailure"),
	/** Error type */
	error: StopFailureErrorSchema,
	/** Additional error details */
	error_details: Schema.optional(Schema.String),
	/** The rendered error text shown in the conversation */
	last_assistant_message: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for SubagentStart wire format from Claude Code stdin.
 * @public
 */
export class SubagentStartInput extends Schema.Class<SubagentStartInput>("SubagentStartInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("SubagentStart"),
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name (built-in or custom) */
	agent_type: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for TaskCreated wire format from Claude Code stdin.
 * @public
 */
export class TaskCreatedInput extends Schema.Class<TaskCreatedInput>("TaskCreatedInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("TaskCreated"),
	/** Identifier of the task being created */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate creating the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for TaskCompleted wire format from Claude Code stdin.
 * @public
 */
export class TaskCompletedInput extends Schema.Class<TaskCompletedInput>("TaskCompletedInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("TaskCompleted"),
	/** Identifier of the task being completed */
	task_id: Schema.String,
	/** Title of the task */
	task_subject: Schema.String,
	/** Detailed description of the task */
	task_description: Schema.optional(Schema.String),
	/** Name of the teammate completing the task */
	teammate_name: Schema.optional(Schema.String),
	/** Name of the team */
	team_name: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for TeammateIdle wire format from Claude Code stdin.
 * @public
 */
export class TeammateIdleInput extends Schema.Class<TeammateIdleInput>("TeammateIdleInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("TeammateIdle"),
	/** Name of the teammate that is about to go idle */
	teammate_name: Schema.String,
	/** Name of the team */
	team_name: Schema.String,
}) {}

/**
 * Input schema for InstructionsLoaded wire format from Claude Code stdin.
 * @public
 */
export class InstructionsLoadedInput extends Schema.Class<InstructionsLoadedInput>("InstructionsLoadedInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("InstructionsLoaded"),
	/** Absolute path to the instruction file that was loaded */
	file_path: Schema.String,
	/** Scope of the file */
	memory_type: InstructionsMemoryTypeSchema,
	/** Why the file was loaded */
	load_reason: InstructionsLoadedReasonSchema,
	/** Path glob patterns from the file's paths: frontmatter */
	globs: Schema.optional(Schema.Array(Schema.String)),
	/** Path to the file whose access triggered this load */
	trigger_file_path: Schema.optional(Schema.String),
	/** Path to the parent instruction file that included this one */
	parent_file_path: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for ConfigChange wire format from Claude Code stdin.
 * @public
 */
export class ConfigChangeInput extends Schema.Class<ConfigChangeInput>("ConfigChangeInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("ConfigChange"),
	/** Which configuration type changed */
	source: ConfigChangeSourceSchema,
	/** Path to the specific file that was modified */
	file_path: Schema.optional(Schema.String),
}) {}

/**
 * Input schema for CwdChanged wire format from Claude Code stdin.
 * @public
 */
export class CwdChangedInput extends Schema.Class<CwdChangedInput>("CwdChangedInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("CwdChanged"),
	/** Previous working directory */
	old_cwd: Schema.String,
	/** New working directory */
	new_cwd: Schema.String,
}) {}

/**
 * Input schema for FileChanged wire format from Claude Code stdin.
 * @public
 */
export class FileChangedInput extends Schema.Class<FileChangedInput>("FileChangedInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("FileChanged"),
	/** Absolute path to the file that changed */
	file_path: Schema.String,
	/** What happened: change, add, or unlink */
	event: FileChangeEventSchema,
}) {}

/**
 * Input schema for WorktreeCreate wire format from Claude Code stdin.
 * @public
 */
export class WorktreeCreateInput extends Schema.Class<WorktreeCreateInput>("WorktreeCreateInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("WorktreeCreate"),
	/** Slug identifier for the new worktree */
	name: Schema.String,
}) {}

/**
 * Input schema for WorktreeRemove wire format from Claude Code stdin.
 * @public
 */
export class WorktreeRemoveInput extends Schema.Class<WorktreeRemoveInput>("WorktreeRemoveInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("WorktreeRemove"),
	/** Absolute path to the worktree being removed */
	worktree_path: Schema.String,
}) {}

/**
 * Input schema for PostCompact wire format from Claude Code stdin.
 * @public
 */
export class PostCompactInput extends Schema.Class<PostCompactInput>("PostCompactInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("PostCompact"),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** The conversation summary generated by the compact operation */
	compact_summary: Schema.String,
}) {}

/**
 * Input schema for Elicitation wire format from Claude Code stdin.
 * @public
 */
export class ElicitationInput extends Schema.Class<ElicitationInput>("ElicitationInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("Elicitation"),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** Message from the MCP server */
	message: Schema.String,
	/** Elicitation mode: form or url */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** URL for browser-based authentication */
	url: Schema.optional(Schema.String),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
	/** JSON Schema for requested form fields */
	requested_schema: Schema.optional(JsonObjectSchema),
}) {}

/**
 * Input schema for ElicitationResult wire format from Claude Code stdin.
 * @public
 */
export class ElicitationResultInput extends Schema.Class<ElicitationResultInput>("ElicitationResultInput")({
	...HookInputBaseFields,
	hook_event_name: Schema.Literal("ElicitationResult"),
	/** MCP server name */
	mcp_server_name: Schema.String,
	/** The user's action */
	action: ElicitationActionSchema,
	/** Form field values from the user's response */
	content: Schema.optional(JsonObjectSchema),
	/** Elicitation mode */
	mode: Schema.optional(Schema.Literal("form", "url")),
	/** Unique identifier for this elicitation */
	elicitation_id: Schema.optional(Schema.String),
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
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id?: string | undefined;
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type?: string | undefined;
}
