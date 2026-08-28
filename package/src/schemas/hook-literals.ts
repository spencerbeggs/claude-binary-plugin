import { Schema } from "effect";

// =============================================================================
// SHARED LITERAL SCHEMAS
// =============================================================================
// Extracted from hook-events.ts to prevent circular imports.
// Both hook-events.ts and hook-inputs.ts import from this file.

/**
 * Hook event names as literal union.
 * @public
 */
export const HookTypeSchema = Schema.Literal(
	"PreToolUse",
	"PostToolUse",
	"PostToolUseFailure",
	"PermissionRequest",
	"Notification",
	"UserPromptSubmit",
	"Stop",
	"StopFailure",
	"SubagentStart",
	"SubagentStop",
	"TaskCreated",
	"TaskCompleted",
	"TeammateIdle",
	"InstructionsLoaded",
	"ConfigChange",
	"CwdChanged",
	"FileChanged",
	"WorktreeCreate",
	"WorktreeRemove",
	"PreCompact",
	"PostCompact",
	"Elicitation",
	"ElicitationResult",
	"SessionStart",
	"SessionEnd",
);

/**
 * Inferred type for hook event names.
 * @public
 */
export type HookTypeName = typeof HookTypeSchema.Type;

/**
 * Permission modes for hook events.
 * @public
 */
export const HookPermissionsModeSchema = Schema.Literal(
	"default",
	"plan",
	"acceptEdits",
	"auto",
	"dontAsk",
	"bypassPermissions",
);

/**
 * Session permission modes that control Claude Code's behavior.
 * @public
 */
export type HookPermissionsMode = typeof HookPermissionsModeSchema.Type;

/**
 * Pre-tool-use permission decisions.
 * @public
 */
export const PreToolUseDecisionSchema = Schema.Literal("allow", "deny", "ask");

/**
 * Permission decision for PreToolUse hooks.
 * @public
 */
export type PreToolUseDecision = typeof PreToolUseDecisionSchema.Type;

/**
 * Permission request behavior.
 * @public
 */
export const PermissionRequestBehaviorSchema = Schema.Literal("allow", "deny");

/**
 * Decision behavior for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestBehavior = typeof PermissionRequestBehaviorSchema.Type;

/**
 * Pre-compact trigger types.
 * @public
 */
export const PreCompactTriggerSchema = Schema.Literal("manual", "auto");

/**
 * Trigger type for PreCompact events.
 * @public
 */
export type PreCompactTrigger = typeof PreCompactTriggerSchema.Type;

/**
 * Session start source types.
 * @public
 */
export const SessionStartSourceSchema = Schema.Literal("startup", "resume", "clear", "compact");

/**
 * Source that triggered the session start.
 * @public
 */
export type SessionStartSource = typeof SessionStartSourceSchema.Type;

/**
 * Session end reason types.
 * @public
 */
export const SessionEndReasonSchema = Schema.Literal(
	"clear",
	"resume",
	"logout",
	"prompt_input_exit",
	"bypass_permissions_disabled",
	"other",
);

/**
 * Reason for session termination.
 * @public
 */
export type SessionEndReason = typeof SessionEndReasonSchema.Type;

// =============================================================================
// ENUM AND TYPE ALIASES
// =============================================================================

/**
 * All hook event names supported by Claude Code.
 * @public
 */
export enum HookType {
	PreToolUse = "PreToolUse",
	PostToolUse = "PostToolUse",
	PostToolUseFailure = "PostToolUseFailure",
	PermissionRequest = "PermissionRequest",
	Notification = "Notification",
	UserPromptSubmit = "UserPromptSubmit",
	Stop = "Stop",
	StopFailure = "StopFailure",
	SubagentStart = "SubagentStart",
	SubagentStop = "SubagentStop",
	TaskCreated = "TaskCreated",
	TaskCompleted = "TaskCompleted",
	TeammateIdle = "TeammateIdle",
	InstructionsLoaded = "InstructionsLoaded",
	ConfigChange = "ConfigChange",
	CwdChanged = "CwdChanged",
	FileChanged = "FileChanged",
	WorktreeCreate = "WorktreeCreate",
	WorktreeRemove = "WorktreeRemove",
	PreCompact = "PreCompact",
	PostCompact = "PostCompact",
	Elicitation = "Elicitation",
	ElicitationResult = "ElicitationResult",
	SessionStart = "SessionStart",
	SessionEnd = "SessionEnd",
}

/**
 * Stop failure error types.
 * @public
 */
export const StopFailureErrorSchema = Schema.Literal(
	"rate_limit",
	"authentication_failed",
	"billing_error",
	"invalid_request",
	"server_error",
	"max_output_tokens",
	"unknown",
);

/** @public */
export type StopFailureError = typeof StopFailureErrorSchema.Type;

/**
 * Instructions loaded reasons.
 * @public
 */
export const InstructionsLoadedReasonSchema = Schema.Literal(
	"session_start",
	"nested_traversal",
	"path_glob_match",
	"include",
	"compact",
);

/** @public */
export type InstructionsLoadedReason = typeof InstructionsLoadedReasonSchema.Type;

/**
 * Instructions loaded memory types.
 * @public
 */
export const InstructionsMemoryTypeSchema = Schema.Literal("User", "Project", "Local", "Managed");

/** @public */
export type InstructionsMemoryType = typeof InstructionsMemoryTypeSchema.Type;

/**
 * Config change source types.
 * @public
 */
export const ConfigChangeSourceSchema = Schema.Literal(
	"user_settings",
	"project_settings",
	"local_settings",
	"policy_settings",
	"skills",
);

/** @public */
export type ConfigChangeSource = typeof ConfigChangeSourceSchema.Type;

/**
 * File change event types.
 * @public
 */
export const FileChangeEventSchema = Schema.Literal("change", "add", "unlink");

/** @public */
export type FileChangeEvent = typeof FileChangeEventSchema.Type;

/**
 * Notification type values.
 * @public
 */
export const NotificationTypeSchema = Schema.Literal(
	"permission_prompt",
	"idle_prompt",
	"auth_success",
	"elicitation_dialog",
);

/** @public */
export type NotificationType = typeof NotificationTypeSchema.Type;

/**
 * Elicitation action values.
 * @public
 */
export const ElicitationActionSchema = Schema.Literal("accept", "decline", "cancel");

/** @public */
export type ElicitationAction = typeof ElicitationActionSchema.Type;

/**
 * Known tool names that can be matched in PreToolUse/PostToolUse hooks.
 * @public
 */
export type ToolName =
	| "Task"
	| "Bash"
	| "Glob"
	| "Grep"
	| "Read"
	| "Edit"
	| "Write"
	| "WebFetch"
	| "WebSearch"
	| "NotebookEdit"
	| "TodoRead"
	| "TodoWrite"
	| (string & {}); // Allow custom/MCP tool names
