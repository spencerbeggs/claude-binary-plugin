/**
 * Hook event enums and permission types.
 * @module
 */

/**
 * Session permission modes that control Claude's behavior.
 * * `default`: Normal permission prompts
 * * `plan`: Planning mode with restricted actions
 * * `acceptEdits`: Auto-accept file edits
 * * `bypassPermissions`: Skip all permission prompts
 * @public
 */
export type HookPermissionsMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

/**
 * All hook event names supported by Claude Code.
 * @public
 */
export enum HookEventName {
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
