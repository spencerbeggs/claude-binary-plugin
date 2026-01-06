/**
 * Hook event enumerations and permission types for Claude Code hooks.
 *
 * @remarks
 * This module provides the core enum and type definitions used throughout
 * the hook system. The {@link HookType} enum identifies hook event types,
 * and {@link HookPermissionsMode} controls Claude Code's permission behavior.
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @module
 */

/**
 * Session permission modes that control Claude Code's behavior.
 *
 * @remarks
 * These modes are set by Claude Code based on user configuration and
 * affect how the agent interacts with permission-requiring tools.
 *
 * | Mode | Description |
 * |------|-------------|
 * | `"default"` | Normal permission prompts - user must approve sensitive actions |
 * | `"plan"` | Planning mode - Claude discusses plans without taking action |
 * | `"acceptEdits"` | Auto-accept file edits without prompting |
 * | `"bypassPermissions"` | Skip all permission prompts (dangerous) |
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @public
 */
export type HookPermissionsMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

/**
 * All hook event names supported by Claude Code.
 *
 * @remarks
 * Each event corresponds to a specific point in Claude Code's execution lifecycle.
 * Plugins can register handlers for any combination of these events.
 *
 * **Lifecycle Events:**
 * - `SessionStart` - Fired once at the beginning of a session
 * - `SessionEnd` - Fired when a session ends
 *
 * **Tool Events:**
 * - `PreToolUse` - Before a tool executes (can allow/deny/modify)
 * - `PostToolUse` - After a tool completes (can add context or block)
 * - `PermissionRequest` - When a tool needs permission (can auto-approve/deny)
 *
 * **User Events:**
 * - `UserPromptSubmit` - When the user submits a message
 * - `Notification` - Informational notifications
 *
 * **Agent Events:**
 * - `Stop` - When Claude is about to stop responding (can block)
 * - `SubagentStop` - When a subagent is about to complete
 * - `PreCompact` - Before context compaction occurs
 *
 * @example
 * ```typescript
 * import { HookType } from "claude-binary-plugin";
 *
 * // Use in switch statements
 * function handleEvent(name: HookType) {
 *   switch (name) {
 *     case HookType.PreToolUse:
 *       return "Security check required";
 *     case HookType.SessionStart:
 *       return "Initialize session";
 *     default:
 *       return "No action";
 *   }
 * }
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @public
 */
export enum HookType {
	/**
	 * Fired before a tool executes.
	 * Can allow, deny, modify input, or defer to user.
	 */
	PreToolUse = "PreToolUse",
	/**
	 * Fired after a tool completes.
	 * Can add context for Claude or block further processing.
	 */
	PostToolUse = "PostToolUse",
	/**
	 * Fired when a tool requests permission.
	 * Can auto-approve, auto-deny, or defer to user.
	 */
	PermissionRequest = "PermissionRequest",
	/**
	 * Fired for informational notifications.
	 * Typically used for logging or user feedback.
	 */
	Notification = "Notification",
	/**
	 * Fired when the user submits a message.
	 * Can add context, modify the prompt, or block submission.
	 */
	UserPromptSubmit = "UserPromptSubmit",
	/**
	 * Fired when Claude is about to stop responding.
	 * Can block with a reason to keep Claude working.
	 */
	Stop = "Stop",
	/**
	 * Fired when a subagent is about to complete.
	 * Can block with a reason to keep the subagent working.
	 */
	SubagentStop = "SubagentStop",
	/**
	 * Fired before context compaction occurs.
	 * Currently passthrough-only (no actions available).
	 */
	PreCompact = "PreCompact",
	/**
	 * Fired once at the beginning of a session.
	 * Use for initialization, setup detection, and context injection.
	 */
	SessionStart = "SessionStart",
	/**
	 * Fired when a session ends.
	 * Use for cleanup and telemetry finalization.
	 */
	SessionEnd = "SessionEnd",
}
