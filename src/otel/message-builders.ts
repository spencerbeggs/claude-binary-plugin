import type { FatalErrorData, HookExecutionData } from "../services/Telemetry.js";
import type { EventData } from "./protocol.js";
import { getSdkVersion } from "./version.macro.js";

const SDK_VERSION = getSdkVersion();

/**
 * OTEL attribute name constants.
 * Aligned with Claude Code's native telemetry cardinality scheme.
 * @public
 */
export const OTEL_ATTRS = {
	SESSION_ID: "session.id",
	APP_VERSION: "app.version",
	TERMINAL_TYPE: "terminal.type",
	ORGANIZATION_ID: "organization.id",
	USER_ACCOUNT_UUID: "user.account_uuid",
	USER_EMAIL: "user.email",
	HOOK_NAME: "hook.name",
	HOOK_TYPE: "hook.type",
	TOOL_NAME: "tool.name",
	TOOL_USE_ID: "tool.use_id",
	TOOL_INPUT_HASH: "tool.input_hash",
	HOOK_DECISION: "hook.decision",
	HOOK_OUTCOME: "hook.outcome",
	DECISION_SOURCE: "decision.source",
	PROJECT_DIR: "project.dir",
	MODEL: "model",
	SOURCE: "source",
	EVENT_TIMESTAMP: "event.timestamp",
	EVENT_NAME: "event.name",
	DURATION_MS: "hook.duration_ms",
	ERROR: "error",
	PERMISSION_DECISION: "permission.decision",
	PERMISSION_DECISION_REASON: "permission.decision_reason",
	HAS_UPDATED_INPUT: "tool.input_modified",
	REASON: "reason",
	HAS_ADDITIONAL_CONTEXT: "response.has_context",
	VALIDATION_PATH: "validation.path",
	VALIDATION_ISSUE_COUNT: "validation.issue_count",
	ENV_CLASS: "env.class",
	ERROR_TYPE: "error.type",
	IS_VALIDATION_ERROR: "error.is_validation",
	PLUGIN_NAME: "plugin.name",
	PLUGIN_VERSION: "plugin.version",
} as const;

/**
 * Scope configuration for OTEL instrumentation.
 * @public
 */
export const OTEL_SCOPE = {
	NAME: "systems.savvyweb.claude_code.events",
} as const;

/**
 * Event name constants for hook telemetry.
 * @public
 */
export const OTEL_EVENT_NAMES = {
	HOOK_EXECUTION: "claude_code.hook.execution",
	SCHEMA_VALIDATION_ERROR: "claude_code.hook.validation_error",
	ENV_VALIDATION_ERROR: "claude_code.hook.env_error",
	FATAL_ERROR: "claude_code.hook.fatal_error",
} as const;

/**
 * Detect the terminal type from environment variables.
 * @internal
 */
const TERMINAL_TYPE_MAP: Record<string, string> = {
	iTerm: "iTerm",
	"iTerm.app": "iTerm",
	Apple_Terminal: "Terminal",
	vscode: "VSCode",
	cursor: "Cursor",
	Hyper: "Hyper",
	Alacritty: "Alacritty",
	WezTerm: "WezTerm",
	kitty: "kitty",
};

function getTerminalType(): string {
	if (Bun.env.TMUX) return "tmux";
	if (Bun.env.STY) return "screen";
	const termProgram = Bun.env.TERM_PROGRAM;
	if (termProgram) {
		return TERMINAL_TYPE_MAP[termProgram] ?? termProgram;
	}
	if (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.VSCODE_INJECTION) return "VSCode";
	if (Bun.env.CURSOR_TRACE_ID) return "Cursor";
	return "unknown";
}

let _cachedClaudeVersion: string | null = null;

function getClaudeVersion(): string {
	if (_cachedClaudeVersion !== null) return _cachedClaudeVersion;
	try {
		const result = Bun.spawnSync(["claude", "--version"]);
		if (result.exitCode === 0) {
			const output = result.stdout.toString().trim();
			const match = output.match(/\d+\.\d+\.\d+/);
			if (match) {
				_cachedClaudeVersion = match[0];
				return _cachedClaudeVersion;
			}
		}
	} catch {
		// Command failed or not found
	}
	_cachedClaudeVersion = "unknown";
	return _cachedClaudeVersion;
}

/**
 * Build an EventData for a hook execution event from HookExecutionData.
 *
 * @param data - The hook execution data from the Telemetry service
 * @param sessionId - The session ID for telemetry attribution
 * @returns An EventData ready to be wrapped in an EventMessage
 * @public
 */
export function buildHookExecutionEvent(data: HookExecutionData, sessionId: string): EventData {
	const now = new Date();

	const attributes: Record<string, string | number | boolean> = {
		[OTEL_ATTRS.SESSION_ID]: sessionId,
		[OTEL_ATTRS.EVENT_NAME]: OTEL_EVENT_NAMES.HOOK_EXECUTION,
		[OTEL_ATTRS.APP_VERSION]: getClaudeVersion(),
		[OTEL_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[OTEL_ATTRS.HOOK_NAME]: data.hookName,
		[OTEL_ATTRS.HOOK_TYPE]: data.hookType,
		[OTEL_ATTRS.SOURCE]: "hook",
		[OTEL_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[OTEL_ATTRS.DURATION_MS]: data.durationMs,
		[OTEL_ATTRS.PLUGIN_NAME]: data.pluginName,
		[OTEL_ATTRS.PLUGIN_VERSION]: data.pluginVersion,
	};

	if (data.outcome) {
		attributes[OTEL_ATTRS.HOOK_OUTCOME] = data.outcome;
	}

	// Add metrics if present
	if (data.metrics) {
		for (const [key, value] of Object.entries(data.metrics)) {
			if (value !== undefined) {
				attributes[`metrics.${key}`] = value as string | number | boolean;
			}
		}
	}

	const body = data.summary || `${data.hookName} (${data.hookType}): ${data.success ? "success" : "failed"}`;

	return {
		name: OTEL_EVENT_NAMES.HOOK_EXECUTION,
		timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
		severity: data.success ? "info" : "error",
		body,
		attributes,
		scope: {
			name: OTEL_SCOPE.NAME,
			version: SDK_VERSION,
		},
	};
}

/**
 * Build an EventData for an error event.
 *
 * @param error - The error to report
 * @param sessionId - The session ID for telemetry attribution
 * @returns An EventData ready to be wrapped in an EventMessage
 * @public
 */
export function buildErrorEvent(error: unknown, sessionId: string): EventData {
	const now = new Date();
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	const attributes: Record<string, string | number | boolean> = {
		[OTEL_ATTRS.SESSION_ID]: sessionId,
		[OTEL_ATTRS.EVENT_NAME]: OTEL_EVENT_NAMES.FATAL_ERROR,
		[OTEL_ATTRS.APP_VERSION]: getClaudeVersion(),
		[OTEL_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[OTEL_ATTRS.SOURCE]: "hook",
		[OTEL_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[OTEL_ATTRS.ERROR]: errorMessage,
		[OTEL_ATTRS.ERROR_TYPE]: error instanceof Error ? error.constructor.name : "unknown",
	};

	let body = `Error: ${errorMessage}`;
	if (errorStack) {
		const truncatedStack = errorStack.slice(0, 1000);
		body += `\n\nStack:\n${truncatedStack}`;
		if (errorStack.length > 1000) {
			body += "\n... (truncated)";
		}
	}

	return {
		name: OTEL_EVENT_NAMES.FATAL_ERROR,
		timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
		severity: "error",
		body,
		attributes,
		scope: {
			name: OTEL_SCOPE.NAME,
			version: SDK_VERSION,
		},
	};
}

/**
 * Build an EventData for a fatal error event from FatalErrorData.
 *
 * @param data - The fatal error data from the Telemetry service
 * @param sessionId - The session ID for telemetry attribution
 * @returns An EventData ready to be wrapped in an EventMessage
 * @public
 */
export function buildFatalErrorEvent(data: FatalErrorData, sessionId: string): EventData {
	const now = new Date();

	const attributes: Record<string, string | number | boolean> = {
		[OTEL_ATTRS.SESSION_ID]: sessionId,
		[OTEL_ATTRS.EVENT_NAME]: OTEL_EVENT_NAMES.FATAL_ERROR,
		[OTEL_ATTRS.APP_VERSION]: getClaudeVersion(),
		[OTEL_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[OTEL_ATTRS.HOOK_NAME]: data.hookName,
		[OTEL_ATTRS.SOURCE]: "hook",
		[OTEL_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[OTEL_ATTRS.ERROR]: data.errorMessage,
		[OTEL_ATTRS.ERROR_TYPE]: data.errorType,
	};

	let body = `Fatal error in ${data.hookName}: ${data.errorMessage}`;
	if (data.errorStack) {
		const truncatedStack = data.errorStack.slice(0, 1000);
		body += `\n\nStack:\n${truncatedStack}`;
		if (data.errorStack.length > 1000) {
			body += "\n... (truncated)";
		}
	}

	return {
		name: OTEL_EVENT_NAMES.FATAL_ERROR,
		timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
		severity: "fatal",
		body,
		attributes,
		scope: {
			name: OTEL_SCOPE.NAME,
			version: SDK_VERSION,
		},
	};
}
