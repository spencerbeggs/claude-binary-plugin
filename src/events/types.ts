/**
 * Hook event type definitions and interfaces.
 * @module
 */

import type { HookPermissionsMode, HookType } from "./enums.js";

// =============================================================================
// I/O TYPES
// =============================================================================

/**
 * Standard I/O streams used by hook events.
 * @public
 */
export interface IO {
	stdin: typeof process.stdin;
	stdout: typeof process.stdout;
	stderr: typeof process.stderr;
	/**
	 * Pre-loaded input text, bypasses stdin reading.
	 * Useful for testing without mocking Bun.stdin.
	 */
	inputText?: string;
}

/**
 * Options for creating a HookEvent.
 * @public
 */
export interface HookEventOptions<TState = unknown> extends IO {
	/** Name for the debug logger (e.g., "workflow-context", "code-check") */
	name?: string;
	/**
	 * Plugin name for telemetry and debug logging.
	 * Passed explicitly from compiled entrypoint to avoid env var cross-contamination.
	 */
	pluginName?: string;
	/**
	 * Plugin version for telemetry.
	 * Passed explicitly from compiled entrypoint to avoid env var cross-contamination.
	 */
	pluginVersion?: string;
	/**
	 * PluginEnv subclass for type-safe state loading.
	 */
	stateClass: new () => TState;
}

// =============================================================================
// BASE EVENT INTERFACE
// =============================================================================

/**
 * Base properties present in all hook events.
 * @public
 */
export interface HookEventBase {
	/** Unique identifier for the current session (UUID format) */
	session_id: string;
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path?: string;
	/** Current working directory (optional) */
	cwd?: string;
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode?: HookPermissionsMode;
	/** The type of hook event */
	hook_event_name: HookType;
}

// =============================================================================
// TOOL-RELATED TYPES
// =============================================================================

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

/**
 * Generic tool input type. Each tool has its own input shape.
 * @public
 */
export type ToolInput = Record<string, unknown>;

/**
 * Generic tool response type. Each tool has its own response shape.
 * @public
 */
export type ToolResponse = Record<string, unknown>;

// =============================================================================
// PRETOOLUSE EVENT
// =============================================================================

/**
 * Event fired after Claude creates tool parameters but before the tool executes.
 * @public
 */
export interface PreToolUseInput extends HookEventBase {
	hook_event_name: HookType.PreToolUse;
	/** Name of the tool being invoked */
	tool_name: ToolName;
	/** Input parameters for the tool */
	tool_input: ToolInput;
	/** Unique identifier for this tool use */
	tool_use_id: string;
}

/**
 * Permission decision for PreToolUse hooks.
 * @public
 */
export type PreToolUseDecision = "allow" | "deny" | "ask";

/**
 * Hook-specific output for PreToolUse events.
 * @public
 */
export interface PreToolUseOutput {
	hookEventName: "PreToolUse";
	/** Decision on whether to allow the tool call */
	permissionDecision?: PreToolUseDecision;
	/** Reason for the permission decision (shown to Claude) */
	permissionDecisionReason?: string;
	/** Modified tool input to use instead of original */
	updatedInput?: ToolInput;
}

// =============================================================================
// POSTTOOLUSE EVENT
// =============================================================================

/**
 * Event fired immediately after a tool completes successfully.
 * @public
 */
export interface PostToolUseInput extends HookEventBase {
	hook_event_name: HookType.PostToolUse;
	/** Name of the tool that was invoked */
	tool_name: ToolName;
	/** Input parameters that were passed to the tool */
	tool_input: ToolInput;
	/** Response returned by the tool */
	tool_response: ToolResponse;
	/** Unique identifier for this tool use */
	tool_use_id: string;
}

/**
 * Hook-specific output for PostToolUse events.
 * @public
 */
export interface PostToolUseOutput {
	hookEventName: "PostToolUse";
	/** Additional context to provide to Claude about the tool result */
	additionalContext?: string;
}

// =============================================================================
// PERMISSIONREQUEST EVENT
// =============================================================================

/**
 * Event fired when a permission dialog is about to be shown to the user.
 * @public
 */
export interface PermissionRequestInput extends HookEventBase {
	hook_event_name: HookType.PermissionRequest;
	/** The permission message being shown */
	message: string;
	/** Type of notification/permission being requested */
	notification_type: string;
}

/**
 * Decision behavior for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestBehavior = "allow" | "deny";

/**
 * Decision object for PermissionRequest hooks.
 * @public
 */
export interface PermissionRequestDecision {
	/** Whether to allow or deny the permission */
	behavior: PermissionRequestBehavior;
	/** Modified input to use (only for allow) */
	updatedInput?: ToolInput;
	/** Message to show when denying */
	message?: string;
	/** If true, interrupts Claude's execution (only for deny) */
	interrupt?: boolean;
}

/**
 * Hook-specific output for PermissionRequest events.
 * @public
 */
export interface PermissionRequestOutput {
	hookEventName: "PermissionRequest";
	/** The permission decision */
	decision: PermissionRequestDecision;
}

// =============================================================================
// NOTIFICATION EVENT
// =============================================================================

/**
 * Known notification types that can be matched in Notification hooks.
 * @public
 */
export type NotificationType =
	| "permission_prompt"
	| "idle_prompt"
	| "auth_success"
	| "elicitation_dialog"
	| (string & {}); // Allow custom notification types

/**
 * Event fired when Claude Code sends a notification.
 * @public
 */
export interface NotificationInput extends HookEventBase {
	hook_event_name: HookType.Notification;
	/** The notification message */
	message: string;
	/** Type of notification */
	notification_type: NotificationType;
}

// =============================================================================
// USERPROMPTSUBMIT EVENT
// =============================================================================

/**
 * Event fired when the user submits a prompt, before Claude processes it.
 * @public
 */
export interface UserPromptSubmitInput extends HookEventBase {
	hook_event_name: HookType.UserPromptSubmit;
	/** The user's prompt text */
	prompt: string;
}

/**
 * Hook-specific output for UserPromptSubmit events.
 * @public
 */
export interface UserPromptSubmitOutput {
	hookEventName: "UserPromptSubmit";
	/** Additional context to inject for Claude */
	additionalContext?: string;
}

// =============================================================================
// STOP / SUBAGENTSTOP EVENTS
// =============================================================================

/**
 * Event fired when the main Claude Code agent finishes responding.
 * @public
 */
export interface StopInput extends HookEventBase {
	hook_event_name: HookType.Stop;
	/** Whether a stop hook is currently active */
	stop_hook_active: boolean;
}

/**
 * Event fired when a subagent (Task tool) finishes responding.
 * @public
 */
export interface SubagentStopInput extends HookEventBase {
	hook_event_name: HookType.SubagentStop;
	/** Whether a stop hook is currently active */
	stop_hook_active: boolean;
}

// =============================================================================
// PRECOMPACT EVENT
// =============================================================================

/**
 * Trigger type for PreCompact events.
 * @public
 */
export type PreCompactTrigger = "manual" | "auto";

/**
 * Event fired before Claude Code compacts the context window.
 * @public
 */
export interface PreCompactInput extends HookEventBase {
	hook_event_name: HookType.PreCompact;
	/** What triggered the compact operation */
	trigger: PreCompactTrigger;
	/** Custom instructions for the compact operation */
	custom_instructions: string;
}

// =============================================================================
// SESSIONSTART EVENT
// =============================================================================

/**
 * Source that triggered the session start.
 * @public
 */
export type SessionStartSource = "startup" | "resume" | "clear" | "compact";

/**
 * Event fired when Claude Code starts or resumes a session.
 * @public
 */
export interface SessionStartInput extends HookEventBase {
	hook_event_name: HookType.SessionStart;
	/** What triggered the session start */
	source: SessionStartSource;
}

/**
 * Hook-specific output for SessionStart events.
 * @public
 */
export interface SessionStartOutput {
	hookEventName: "SessionStart";
	/** Context to inject into the session for Claude */
	additionalContext?: string;
}

// =============================================================================
// SESSIONEND EVENT
// =============================================================================

/**
 * Reason for session termination.
 * @public
 */
export type SessionEndReason = "clear" | "logout" | "prompt_input_exit" | "other";

/**
 * Event fired when a Claude Code session terminates.
 * @public
 */
export interface SessionEndInput extends HookEventBase {
	hook_event_name: HookType.SessionEnd;
	/** Why the session is ending */
	reason: SessionEndReason;
}
