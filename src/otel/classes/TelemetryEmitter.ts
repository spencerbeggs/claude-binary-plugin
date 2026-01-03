/**
 * Telemetry event emission for OTEL sidecar.
 *
 * @remarks
 * Provides a class-based API for emitting telemetry events from hooks.
 * Events are serialized and sent to the sidecar process via IPC.
 *
 * @example
 * ```typescript
 * import { TelemetryEmitter, OTELConfig } from "claude-binary-plugin";
 *
 * if (OTELConfig.isEnabled()) {
 *   await TelemetryEmitter.preconnect(sessionId);
 *
 *   TelemetryEmitter.emitHookExecution(event, "pre-bash", {
 *     hookType: "PreToolUse",
 *     pluginName: "workflow",
 *     pluginVersion: "1.0.0",
 *     durationMs: 42,
 *     success: true,
 *     outcome: "allowed",
 *   });
 * }
 * ```
 *
 * @public
 */

import type { HookEventBase } from "../../events/types.js";
import { getSidecarClient } from "../client.js";
import { CLAUDE_ATTRS, EVENT_NAMES, PLUGIN_ATTRS, SCOPE } from "../constants.js";
import type { EventData } from "../protocol.js";
import { getSdkVersion } from "../version.macro.js";
import { OTELConfig } from "./OTELConfig.js";
import { PluginInfo } from "./PluginInfo.js";

// SDK version - works both at runtime and when bundled
const SDK_VERSION = getSdkVersion();

/**
 * Semantic outcome of hook execution.
 * Used for filtering and understanding hook behavior patterns.
 * @public
 */
export type HookOutcome =
	| "skipped" // Hook didn't apply (wrong tool, disabled, etc.)
	| "allowed" // PreToolUse: explicitly allowed
	| "denied" // PreToolUse: explicitly denied
	| "modified" // Input was modified
	| "blocked" // PostToolUse/Stop: blocked continuation
	| "context_added" // Added context for Claude
	| "passthrough" // Analyzed but took no action
	| "error"; // Hook failed with error

/**
 * Decision source taxonomy aligned with Anthropic's native telemetry.
 * Indicates what/who made the permission decision.
 * @public
 */
export type DecisionSource =
	| "config" // Decision from configuration (e.g., allowlist)
	| "user_permanent" // User chose "always allow/deny"
	| "user_temporary" // User chose "allow/deny this time"
	| "hook" // Hook made the decision programmatically
	| "user_abort" // User aborted the operation
	| "user_reject"; // User rejected the permission request

/**
 * Operational metrics for hook execution.
 * Used to track performance characteristics and identify bottlenecks.
 * @public
 */
export interface HookMetrics {
	/** Number of files scanned/analyzed */
	filesScanned?: number;
	/** Number of files with errors/issues */
	filesWithErrors?: number;
	/** Number of issues found */
	issuesFound?: number;
	/** Number of issues fixed */
	issuesFixed?: number;
	/** Number of patterns matched */
	patternsMatched?: number;
	/** Estimated token count for added context */
	contextTokens?: number;
	/** Any other numeric metrics */
	[key: string]: number | undefined;
}

/**
 * Result data for hook execution event.
 * @public
 */
export interface HookExecutionResult {
	/** The hook event type (PreToolUse, PostToolUse, SessionStart, etc.) */
	hookType: string;
	/** Plugin name for telemetry (passed explicitly to avoid env var cross-contamination) */
	pluginName: string;
	/** Plugin version for telemetry */
	pluginVersion: string;
	/** Duration of hook execution in milliseconds */
	durationMs: number;
	/** Whether the hook executed successfully */
	success: boolean;
	/** Semantic outcome of the hook execution */
	outcome?: HookOutcome;
	/** Human-readable summary for log body (e.g., "auto-allowed: git status") */
	summary?: string;
	/** Error message if hook failed */
	error?: string;
	/** Tool name for tool-related hooks */
	toolName?: string;
	/** Tool use ID for correlation with Claude Code events */
	toolUseId?: string;
	/** Permission decision for PreToolUse hooks */
	permissionDecision?: "allow" | "deny" | "ask";
	/** Source of the permission decision (who/what made it) */
	decisionSource?: DecisionSource;
	/** Reason for permission decision */
	permissionDecisionReason?: string;
	/** Whether the tool input was modified */
	hasUpdatedInput?: boolean;
	/** Block decision (for blocking responses) */
	decision?: "block";
	/** Reason for blocking */
	reason?: string;
	/** Whether additional context was provided */
	hasAdditionalContext?: boolean;
	/** Additional context content (used as event body) */
	additionalContext?: string;
	/** Operational metrics for performance analysis */
	metrics?: HookMetrics;
	/** Hook-specific context attributes */
	context?: Record<string, string | number | boolean>;
}

/**
 * Result data for schema validation error event.
 * @public
 */
export interface SchemaValidationErrorResult {
	/** The hook name that encountered the error */
	hookName: string;
	/** Number of validation issues */
	issueCount: number;
	/** Primary validation path (first issue) */
	validationPath: string;
	/** Formatted error message */
	errorMessage: string;
	/** Raw JSON that failed validation (truncated if large) */
	rawInput?: string;
}

/**
 * Result data for environment validation error event.
 * @public
 */
export interface EnvValidationErrorResult {
	/** The hook name that encountered the error */
	hookName: string;
	/** Number of validation issues */
	issueCount: number;
	/** Primary validation path (first issue) */
	validationPath: string;
	/** Formatted error message */
	errorMessage: string;
	/** The env class that failed validation */
	envClassName?: string;
}

/**
 * Result data for fatal error event.
 * @public
 */
export interface FatalErrorResult {
	/** The hook name that encountered the error */
	hookName: string;
	/** Error type (uncaughtException, unhandledRejection, ZodError, etc.) */
	errorType: string;
	/** Error message */
	errorMessage: string;
	/** Error stack trace if available */
	errorStack?: string;
	/** Whether the error was a validation error */
	isValidationError?: boolean;
	/** Number of validation issues (for validation errors) */
	issueCount?: number;
	/** First validation path (for validation errors) */
	validationPath?: string;
}

/**
 * Direct hook execution result for use without an event object.
 * Used for errors that occur before the event object is created (e.g., unknown hook).
 * @public
 */
export interface HookExecutionDirectResult {
	/** Session ID for telemetry */
	sessionId: string;
	/** The hook name (e.g., "PreToolUse/unknown-hook") */
	hookName: string;
	/** The hook event type */
	hookType: string;
	/** Duration of hook execution in milliseconds */
	durationMs: number;
	/** Whether the hook executed successfully */
	success: boolean;
	/** Semantic outcome of the hook execution */
	outcome?: HookOutcome;
	/** Human-readable summary for log body */
	summary?: string;
	/** Error message if hook failed */
	error?: string;
}

/**
 * Telemetry event emitter.
 *
 * @remarks
 * Provides static methods for emitting telemetry events. All methods
 * are fire-and-forget by default to avoid blocking hook execution.
 *
 * @example
 * ```typescript
 * // Pre-connect for faster emission
 * await TelemetryEmitter.preconnect(sessionId);
 *
 * // Emit hook execution event
 * TelemetryEmitter.emitHookExecution(event, "my-hook", {
 *   hookType: "PreToolUse",
 *   pluginName: "workflow",
 *   pluginVersion: "1.0.0",
 *   durationMs: 42,
 *   success: true,
 *   outcome: "allowed",
 * });
 * ```
 *
 * @public
 */
export class TelemetryEmitter {
	/**
	 * Pre-connect to the OTEL sidecar for faster emission.
	 *
	 * @remarks
	 * Should be called during hook initialization to ensure the socket
	 * is ready when telemetry is emitted. The sidecar is spawned on-demand
	 * if not already running.
	 *
	 * @param sessionId - The Claude Code session ID
	 *
	 * @example
	 * ```typescript
	 * if (OTELConfig.isEnabled()) {
	 *   await TelemetryEmitter.preconnect(sessionId);
	 * }
	 * ```
	 *
	 * @public
	 */
	static async preconnect(sessionId: string): Promise<void> {
		if (!OTELConfig.isEnabled()) return;
		const client = getSidecarClient(sessionId);
		await client.preconnect();
	}

	/**
	 * Emit a hook execution event.
	 *
	 * @remarks
	 * This is the primary event emitter for hook telemetry. It emits a single
	 * `claude_code.hook.execution` event containing all hook execution details.
	 *
	 * @param event - The hook event base containing session info
	 * @param hookName - The custom hook name (e.g., "pre-bash", "docs-access")
	 * @param result - The hook execution result data
	 *
	 * @example
	 * ```typescript
	 * TelemetryEmitter.emitHookExecution(event, "pre-bash", {
	 *   hookType: "PreToolUse",
	 *   pluginName: "workflow",
	 *   pluginVersion: "1.0.0",
	 *   durationMs: 42,
	 *   success: true,
	 *   outcome: "allowed",
	 *   summary: "auto-allowed: git status",
	 * });
	 * ```
	 *
	 * @public
	 */
	static emitHookExecution(event: HookEventBase, hookName: string, result: HookExecutionResult): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);
		const now = new Date();

		// Build attributes with aligned naming
		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
			[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.HOOK_EXECUTION,
			[CLAUDE_ATTRS.APP_VERSION]: TelemetryEmitter.getClaudeVersion(),
			[CLAUDE_ATTRS.TERMINAL_TYPE]: TelemetryEmitter.getTerminalType(),
			[CLAUDE_ATTRS.HOOK_NAME]: hookName,
			[CLAUDE_ATTRS.HOOK_TYPE]: result.hookType,
			[CLAUDE_ATTRS.SOURCE]: "hook",
			[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
			[CLAUDE_ATTRS.DURATION_MS]: result.durationMs,
			[PLUGIN_ATTRS.NAME]: result.pluginName,
			[PLUGIN_ATTRS.VERSION]: result.pluginVersion,
		};

		// Add semantic outcome for easy filtering
		if (result.outcome) {
			attributes[CLAUDE_ATTRS.HOOK_OUTCOME] = result.outcome;
		}

		// Add tool.use_id for correlation with Claude Code events
		if (result.toolUseId) {
			attributes[CLAUDE_ATTRS.TOOL_USE_ID] = result.toolUseId;
		}

		// Add optional attributes
		if (result.toolName) {
			attributes[CLAUDE_ATTRS.TOOL_NAME] = result.toolName;
		}
		if (result.error) {
			attributes[CLAUDE_ATTRS.ERROR] = result.error;
		}
		if (result.permissionDecision) {
			attributes[CLAUDE_ATTRS.PERMISSION_DECISION] = result.permissionDecision;
		}
		if (result.decisionSource) {
			attributes[CLAUDE_ATTRS.DECISION_SOURCE] = result.decisionSource;
		}
		if (result.permissionDecisionReason) {
			attributes[CLAUDE_ATTRS.PERMISSION_DECISION_REASON] = result.permissionDecisionReason;
		}
		if (result.hasUpdatedInput !== undefined) {
			attributes[CLAUDE_ATTRS.HAS_UPDATED_INPUT] = result.hasUpdatedInput;
		}
		if (result.decision) {
			attributes[CLAUDE_ATTRS.HOOK_DECISION] = result.decision;
		}
		if (result.reason) {
			attributes[CLAUDE_ATTRS.REASON] = result.reason;
		}
		if (result.hasAdditionalContext !== undefined) {
			attributes[CLAUDE_ATTRS.HAS_ADDITIONAL_CONTEXT] = result.hasAdditionalContext;
		}

		// Add operational metrics for performance analysis
		if (result.metrics) {
			for (const [key, value] of Object.entries(result.metrics)) {
				if (value !== undefined) {
					attributes[`metrics.${key}`] = value;
				}
			}
		}

		// Add hook-specific context attributes
		if (result.context) {
			for (const [key, value] of Object.entries(result.context)) {
				attributes[`context.${key}`] = value;
			}
		}

		// Body priority: summary > additionalContext > generic message
		// Summary is human-readable (e.g., "auto-allowed: git status")
		const body =
			result.summary ||
			result.additionalContext ||
			`${hookName} (${result.hookType}): ${result.success ? "success" : "failed"}`;

		const eventData: EventData = {
			name: EVENT_NAMES.HOOK_EXECUTION,
			timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
			severity: result.success ? "info" : "error",
			body,
			attributes,
			scope: {
				name: SCOPE.NAME,
				version: SDK_VERSION,
			},
		};

		client.emit({
			type: "event",
			sessionId: event.session_id,
			data: eventData,
		});
	}

	/**
	 * Emit a hook execution event without requiring an event object.
	 *
	 * @remarks
	 * Used for errors that occur before the event object is created,
	 * such as when a plugin receives an unknown hook name.
	 *
	 * @param result - The hook execution result data including sessionId
	 *
	 * @example
	 * ```typescript
	 * TelemetryEmitter.emitHookExecutionDirect({
	 *   sessionId: "abc-123",
	 *   hookName: "PreToolUse/unknown",
	 *   hookType: "PreToolUse",
	 *   durationMs: 1,
	 *   success: false,
	 *   outcome: "error",
	 *   error: "Unknown hook: unknown",
	 * });
	 * ```
	 *
	 * @public
	 */
	static emitHookExecutionDirect(result: HookExecutionDirectResult): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(result.sessionId);
		const now = new Date();

		// Build attributes with aligned naming
		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.SESSION_ID]: result.sessionId,
			[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.HOOK_EXECUTION,
			[CLAUDE_ATTRS.APP_VERSION]: TelemetryEmitter.getClaudeVersion(),
			[CLAUDE_ATTRS.TERMINAL_TYPE]: TelemetryEmitter.getTerminalType(),
			[CLAUDE_ATTRS.HOOK_NAME]: result.hookName,
			[CLAUDE_ATTRS.HOOK_TYPE]: result.hookType,
			[CLAUDE_ATTRS.SOURCE]: "hook",
			[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
			[CLAUDE_ATTRS.DURATION_MS]: result.durationMs,
			[PLUGIN_ATTRS.NAME]: PluginInfo.get().name,
			[PLUGIN_ATTRS.VERSION]: PluginInfo.get().version,
		};

		// Add semantic outcome for easy filtering
		if (result.outcome) {
			attributes[CLAUDE_ATTRS.HOOK_OUTCOME] = result.outcome;
		}

		// Add error
		if (result.error) {
			attributes[CLAUDE_ATTRS.ERROR] = result.error;
		}

		// Body priority: summary > error > generic message
		const body =
			result.summary ||
			result.error ||
			`${result.hookName} (${result.hookType}): ${result.success ? "success" : "failed"}`;

		const eventData: EventData = {
			name: EVENT_NAMES.HOOK_EXECUTION,
			timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
			severity: result.success ? "info" : "error",
			body,
			attributes,
			scope: {
				name: SCOPE.NAME,
				version: SDK_VERSION,
			},
		};

		client.emit({
			type: "event",
			sessionId: result.sessionId,
			data: eventData,
		});
	}

	/**
	 * Emit a schema validation error event.
	 *
	 * @remarks
	 * Emitted when Claude Code sends malformed event data that doesn't
	 * match the expected Zod schema. Useful for debugging protocol issues.
	 *
	 * @param sessionId - The session ID
	 * @param hookName - The custom hook name
	 * @param result - The validation error details
	 *
	 * @example
	 * ```typescript
	 * TelemetryEmitter.emitSchemaValidationError(sessionId, "pre-bash", {
	 *   hookName: "pre-bash",
	 *   issueCount: 2,
	 *   validationPath: "tool_input.command",
	 *   errorMessage: "Required field missing",
	 * });
	 * ```
	 *
	 * @public
	 */
	static emitSchemaValidationError(sessionId: string, hookName: string, result: SchemaValidationErrorResult): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(sessionId);
		const now = new Date();

		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.SESSION_ID]: sessionId,
			[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.SCHEMA_VALIDATION_ERROR,
			[CLAUDE_ATTRS.APP_VERSION]: TelemetryEmitter.getClaudeVersion(),
			[CLAUDE_ATTRS.TERMINAL_TYPE]: TelemetryEmitter.getTerminalType(),
			[CLAUDE_ATTRS.HOOK_NAME]: hookName,
			[CLAUDE_ATTRS.SOURCE]: "hook",
			[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
			[CLAUDE_ATTRS.ERROR]: result.errorMessage,
			[CLAUDE_ATTRS.VALIDATION_PATH]: result.validationPath,
			[CLAUDE_ATTRS.VALIDATION_ISSUE_COUNT]: result.issueCount,
			[PLUGIN_ATTRS.NAME]: PluginInfo.get().name,
			[PLUGIN_ATTRS.VERSION]: PluginInfo.get().version,
		};

		// Body contains the formatted error for searchability
		const body = `Schema validation failed in ${hookName}: ${result.errorMessage}`;

		const eventData: EventData = {
			name: EVENT_NAMES.SCHEMA_VALIDATION_ERROR,
			timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
			severity: "error",
			body,
			attributes,
			scope: {
				name: SCOPE.NAME,
				version: SDK_VERSION,
			},
		};

		client.emit({
			type: "event",
			sessionId,
			data: eventData,
		});
	}

	/**
	 * Emit an environment validation error event.
	 *
	 * @remarks
	 * Emitted when hook environment variables don't match the expected schema.
	 * Useful for debugging misconfigured environments or missing env vars.
	 *
	 * @param sessionId - The session ID
	 * @param hookName - The custom hook name
	 * @param result - The validation error details
	 *
	 * @example
	 * ```typescript
	 * TelemetryEmitter.emitEnvValidationError(sessionId, "pre-bash", {
	 *   hookName: "pre-bash",
	 *   issueCount: 1,
	 *   validationPath: "API_KEY",
	 *   errorMessage: "Required environment variable missing",
	 *   envClassName: "WorkflowEnv",
	 * });
	 * ```
	 *
	 * @public
	 */
	static emitEnvValidationError(sessionId: string, hookName: string, result: EnvValidationErrorResult): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(sessionId);
		const now = new Date();

		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.SESSION_ID]: sessionId,
			[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.ENV_VALIDATION_ERROR,
			[CLAUDE_ATTRS.APP_VERSION]: TelemetryEmitter.getClaudeVersion(),
			[CLAUDE_ATTRS.TERMINAL_TYPE]: TelemetryEmitter.getTerminalType(),
			[CLAUDE_ATTRS.HOOK_NAME]: hookName,
			[CLAUDE_ATTRS.SOURCE]: "hook",
			[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
			[CLAUDE_ATTRS.ERROR]: result.errorMessage,
			[CLAUDE_ATTRS.VALIDATION_PATH]: result.validationPath,
			[CLAUDE_ATTRS.VALIDATION_ISSUE_COUNT]: result.issueCount,
			[PLUGIN_ATTRS.NAME]: PluginInfo.get().name,
			[PLUGIN_ATTRS.VERSION]: PluginInfo.get().version,
		};

		if (result.envClassName) {
			attributes[CLAUDE_ATTRS.ENV_CLASS] = result.envClassName;
		}

		// Body contains the formatted error for searchability
		const body = `Environment validation failed in ${hookName}: ${result.errorMessage}`;

		const eventData: EventData = {
			name: EVENT_NAMES.ENV_VALIDATION_ERROR,
			timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
			severity: "error",
			body,
			attributes,
			scope: {
				name: SCOPE.NAME,
				version: SDK_VERSION,
			},
		};

		client.emit({
			type: "event",
			sessionId,
			data: eventData,
		});
	}

	/**
	 * Emit a fatal error event.
	 *
	 * @remarks
	 * Emitted from global error handlers when an uncaught exception or
	 * unhandled rejection occurs. Unlike other emit methods, this waits
	 * for the message to be flushed before returning.
	 *
	 * @param sessionId - The session ID (may be "unknown" if not yet parsed)
	 * @param result - The fatal error details
	 * @param flushTimeoutMs - Maximum time to wait for flush (default: 500ms)
	 * @returns Promise that resolves when message is sent (or timeout)
	 *
	 * @example
	 * ```typescript
	 * process.on("uncaughtException", async (error) => {
	 *   await TelemetryEmitter.emitFatalError(sessionId, {
	 *     hookName: "pre-bash",
	 *     errorType: "uncaughtException",
	 *     errorMessage: error.message,
	 *     errorStack: error.stack,
	 *   });
	 *   process.exit(1);
	 * });
	 * ```
	 *
	 * @public
	 */
	static async emitFatalError(sessionId: string, result: FatalErrorResult, flushTimeoutMs = 500): Promise<boolean> {
		if (!OTELConfig.isEnabled()) return false;

		const client = getSidecarClient(sessionId);
		const now = new Date();

		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.SESSION_ID]: sessionId,
			[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.FATAL_ERROR,
			[CLAUDE_ATTRS.APP_VERSION]: TelemetryEmitter.getClaudeVersion(),
			[CLAUDE_ATTRS.TERMINAL_TYPE]: TelemetryEmitter.getTerminalType(),
			[CLAUDE_ATTRS.HOOK_NAME]: result.hookName,
			[CLAUDE_ATTRS.SOURCE]: "hook",
			[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
			[CLAUDE_ATTRS.ERROR]: result.errorMessage,
			[PLUGIN_ATTRS.NAME]: PluginInfo.get().name,
			[PLUGIN_ATTRS.VERSION]: PluginInfo.get().version,
			[CLAUDE_ATTRS.ERROR_TYPE]: result.errorType,
		};

		if (result.isValidationError !== undefined) {
			attributes[CLAUDE_ATTRS.IS_VALIDATION_ERROR] = result.isValidationError;
		}
		if (result.issueCount !== undefined) {
			attributes[CLAUDE_ATTRS.VALIDATION_ISSUE_COUNT] = result.issueCount;
		}
		if (result.validationPath !== undefined) {
			attributes[CLAUDE_ATTRS.VALIDATION_PATH] = result.validationPath;
		}

		// Body contains error message and stack for searchability
		let body = `Fatal error in ${result.hookName}: ${result.errorMessage}`;
		if (result.errorStack) {
			// Truncate stack to first 1000 chars to avoid huge payloads
			const truncatedStack = result.errorStack.slice(0, 1000);
			body += `\n\nStack:\n${truncatedStack}`;
			if (result.errorStack.length > 1000) {
				body += "\n... (truncated)";
			}
		}

		const eventData: EventData = {
			name: EVENT_NAMES.FATAL_ERROR,
			timeNs: BigInt(now.getTime()) * BigInt(1_000_000),
			severity: "fatal",
			body,
			attributes,
			scope: {
				name: SCOPE.NAME,
				version: SDK_VERSION,
			},
		};

		client.emit({
			type: "event",
			sessionId,
			data: eventData,
		});

		// Wait for the message to be flushed before returning
		return client.flush(flushTimeoutMs);
	}

	// Private constructor prevents instantiation
	private constructor() {}

	/**
	 * Cached Claude Code version to avoid repeated subprocess calls.
	 * @internal
	 */
	private static _cachedClaudeVersion: string | null = null;

	/**
	 * Known terminal type mappings from TERM_PROGRAM values.
	 * @internal
	 */
	private static readonly TERMINAL_TYPE_MAP: Record<string, string> = {
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

	/**
	 * Detect the Claude Code binary version.
	 *
	 * @remarks
	 * Parses output from `claude --version` to extract the version number.
	 * Results are cached for the lifetime of the process.
	 *
	 * @returns Claude Code version (e.g., "1.0.30"), or "unknown" if detection fails
	 *
	 * @internal
	 */
	private static getClaudeVersion(): string {
		if (TelemetryEmitter._cachedClaudeVersion !== null) {
			return TelemetryEmitter._cachedClaudeVersion;
		}

		try {
			// Synchronous subprocess call - we cache this so it only happens once
			const result = Bun.spawnSync(["claude", "--version"]);
			if (result.exitCode === 0) {
				const output = result.stdout.toString().trim();
				// Extract version number (e.g., "1.0.30" from "claude 1.0.30")
				const match = output.match(/\d+\.\d+\.\d+/);
				if (match) {
					TelemetryEmitter._cachedClaudeVersion = match[0];
					return TelemetryEmitter._cachedClaudeVersion;
				}
			}
		} catch {
			// Command failed or not found
		}

		TelemetryEmitter._cachedClaudeVersion = "unknown";
		return TelemetryEmitter._cachedClaudeVersion;
	}

	/**
	 * Detect the terminal type from environment variables.
	 *
	 * @remarks
	 * Checks TERM_PROGRAM and other indicators to determine the terminal.
	 * Aligns with Anthropic's terminal.type attribute values.
	 *
	 * @returns Terminal type (e.g., "iTerm", "vscode", "cursor", "tmux"), or "unknown"
	 *
	 * @internal
	 */
	private static getTerminalType(): string {
		// Check for tmux first (can be nested in any terminal)
		if (Bun.env.TMUX) {
			return "tmux";
		}

		// Check for screen
		if (Bun.env.STY) {
			return "screen";
		}

		// Check TERM_PROGRAM for common terminals
		const termProgram = Bun.env.TERM_PROGRAM;
		if (termProgram) {
			const mapped = TelemetryEmitter.TERMINAL_TYPE_MAP[termProgram];
			if (mapped) {
				return mapped;
			}
			// Return the value as-is if not in map (preserve original casing)
			return termProgram;
		}

		// Check for VS Code specific indicators
		if (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.VSCODE_INJECTION) {
			return "VSCode";
		}

		// Check for Cursor specific indicators
		if (Bun.env.CURSOR_TRACE_ID) {
			return "Cursor";
		}

		return "unknown";
	}
}
