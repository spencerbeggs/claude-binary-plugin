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
	"PermissionRequest",
	"Notification",
	"UserPromptSubmit",
	"Stop",
	"SubagentStop",
	"PreCompact",
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
export const HookPermissionsModeSchema = Schema.Literal("default", "plan", "acceptEdits", "bypassPermissions");

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
export const SessionEndReasonSchema = Schema.Literal("clear", "logout", "prompt_input_exit", "other");

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
	PermissionRequest = "PermissionRequest",
	Notification = "Notification",
	UserPromptSubmit = "UserPromptSubmit",
	Stop = "Stop",
	SubagentStop = "SubagentStop",
	PreCompact = "PreCompact",
	SessionStart = "SessionStart",
	SessionEnd = "SessionEnd",
}

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
