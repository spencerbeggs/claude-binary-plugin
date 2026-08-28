/**
 * Hook event types and I/O dependency interfaces.
 */

export type HookEventType =
	| "PreToolUse"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "StopFailure"
	| "SubagentStart"
	| "SubagentStop"
	| "TaskCreated"
	| "TaskCompleted"
	| "TeammateIdle"
	| "InstructionsLoaded"
	| "ConfigChange"
	| "CwdChanged"
	| "FileChanged"
	| "WorktreeCreate"
	| "WorktreeRemove"
	| "UserPromptSubmit"
	| "PreCompact"
	| "PostCompact"
	| "Elicitation"
	| "ElicitationResult"
	| "Notification"
	| "PermissionRequest";

export interface IODependencies {
	stdin?: NodeJS.ReadableStream;
	stdout?: NodeJS.WritableStream;
	stderr?: NodeJS.WritableStream;
	exit?: (code: number) => never;
	cwd?: () => string;
	inputText?: string;
}
