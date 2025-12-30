/**
 * OTEL event emitters for hook telemetry.
 *
 * @remarks
 * This module provides functions for emitting telemetry events from hooks.
 * Events are serialized and sent to the sidecar process via IPC.
 *
 * **Key design principle:**
 * No OTEL SDK imports in hook code - only data serialization and IPC.
 * This keeps hooks lightweight and avoids bundling heavy OTEL dependencies.
 *
 * **Available emitters:**
 * - {@link emitHookExecution} - Main event for hook completion
 * - {@link emitSchemaValidationError} - Zod validation failures
 * - {@link emitEnvValidationError} - Environment validation failures
 *
 * **Event attributes include:**
 * - Session/tool context (session.id, tool.name, tool.use_id)
 * - Hook metadata (hook.name, hook.type, hook.duration_ms)
 * - Decision data (permission.decision, decision.source)
 * - Plugin info (plugin.name, plugin.version)
 *
 * @example
 * ```typescript
 * await emitHookExecution(event, "my-hook", {
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
 * @see docs/SCHEMA.md - Event attribute specifications
 * @module
 */

import type { HookEventBase } from "../index.js";
import { getSidecarClient } from "./client.js";
import { getClaudeVersion, getTerminalType, isOTELEnabled } from "./config.js";
import { CLAUDE_ATTRS, EVENT_NAMES, PLUGIN_ATTRS, SCOPE } from "./constants.js";
import { getPluginInfo } from "./plugin-info.js";
import type { EventData } from "./protocol.js";
import { getSdkVersion } from "./version.macro.js";

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
 * Emit a consolidated hook_execution event.
 *
 * This is the primary event emitter aligned with Claude Code's native telemetry schema.
 * It emits a single event containing all hook execution details.
 *
 * @param event - The hook event base containing session info
 * @param hookName - The custom hook name (e.g., "pre-edit-code", "docs-access")
 * @param result - The hook execution result data
 * @public
 */
export function emitHookExecution(event: HookEventBase, hookName: string, result: HookExecutionResult): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(event.session_id);
	const now = new Date();

	// Build attributes with aligned naming
	const attributes: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
		[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.HOOK_EXECUTION,
		[CLAUDE_ATTRS.APP_VERSION]: getClaudeVersion(),
		[CLAUDE_ATTRS.TERMINAL_TYPE]: getTerminalType(),
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
 * Emit a schema_validation_error event when hook event parsing fails.
 *
 * This is emitted when Claude Code sends malformed event data that doesn't
 * match the expected Zod schema. Useful for debugging protocol issues.
 *
 * @param sessionId - The session ID (may be extracted from partial data)
 * @param hookName - The custom hook name
 * @param result - The validation error details
 * @public
 */
export function emitSchemaValidationError(
	sessionId: string,
	hookName: string,
	result: SchemaValidationErrorResult,
): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(sessionId);
	const now = new Date();

	const attributes: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.SESSION_ID]: sessionId,
		[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.SCHEMA_VALIDATION_ERROR,
		[CLAUDE_ATTRS.APP_VERSION]: getClaudeVersion(),
		[CLAUDE_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[CLAUDE_ATTRS.HOOK_NAME]: hookName,
		[CLAUDE_ATTRS.SOURCE]: "hook",
		[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[CLAUDE_ATTRS.ERROR]: result.errorMessage,
		[CLAUDE_ATTRS.VALIDATION_PATH]: result.validationPath,
		[CLAUDE_ATTRS.VALIDATION_ISSUE_COUNT]: result.issueCount,
		[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
		[PLUGIN_ATTRS.VERSION]: getPluginInfo().version,
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
 * Emit an env_validation_error event when environment variable validation fails.
 *
 * This is emitted when hook environment variables don't match the expected schema.
 * Useful for debugging misconfigured environments or missing env vars.
 *
 * @param sessionId - The session ID
 * @param hookName - The custom hook name
 * @param result - The validation error details
 * @public
 */
export function emitEnvValidationError(sessionId: string, hookName: string, result: EnvValidationErrorResult): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(sessionId);
	const now = new Date();

	const attributes: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.SESSION_ID]: sessionId,
		[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.ENV_VALIDATION_ERROR,
		[CLAUDE_ATTRS.APP_VERSION]: getClaudeVersion(),
		[CLAUDE_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[CLAUDE_ATTRS.HOOK_NAME]: hookName,
		[CLAUDE_ATTRS.SOURCE]: "hook",
		[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[CLAUDE_ATTRS.ERROR]: result.errorMessage,
		[CLAUDE_ATTRS.VALIDATION_PATH]: result.validationPath,
		[CLAUDE_ATTRS.VALIDATION_ISSUE_COUNT]: result.issueCount,
		[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
		[PLUGIN_ATTRS.VERSION]: getPluginInfo().version,
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
 * Emit a fatal_error event when an uncaught exception or unhandled rejection occurs.
 *
 * This is emitted from the global error handlers in hooks. Since the hook is crashing,
 * we try to emit as much context as possible for debugging.
 *
 * Unlike other emit functions, this returns a Promise that resolves when the message
 * has been flushed to the sidecar. This allows the error handler to wait before exiting.
 *
 * @param sessionId - The session ID (may be "unknown" if not yet parsed)
 * @param result - The fatal error details
 * @param flushTimeoutMs - Maximum time to wait for flush (default: 500ms)
 * @returns Promise that resolves when message is sent (or timeout)
 * @public
 */
export async function emitFatalError(
	sessionId: string,
	result: FatalErrorResult,
	flushTimeoutMs = 500,
): Promise<boolean> {
	if (!isOTELEnabled()) return false;

	const client = getSidecarClient(sessionId);
	const now = new Date();

	const attributes: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.SESSION_ID]: sessionId,
		[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.FATAL_ERROR,
		[CLAUDE_ATTRS.APP_VERSION]: getClaudeVersion(),
		[CLAUDE_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[CLAUDE_ATTRS.HOOK_NAME]: result.hookName,
		[CLAUDE_ATTRS.SOURCE]: "hook",
		[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[CLAUDE_ATTRS.ERROR]: result.errorMessage,
		[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
		[PLUGIN_ATTRS.VERSION]: getPluginInfo().version,
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
 * Emit a hook_execution event without requiring an event object.
 *
 * This is used for errors that occur before the event object is created,
 * such as when a plugin receives an unknown hook name.
 *
 * @param result - The hook execution result data including sessionId
 * @public
 */
export function emitHookExecutionDirect(result: HookExecutionDirectResult): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(result.sessionId);
	const now = new Date();

	// Build attributes with aligned naming
	const attributes: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.SESSION_ID]: result.sessionId,
		[CLAUDE_ATTRS.EVENT_NAME]: EVENT_NAMES.HOOK_EXECUTION,
		[CLAUDE_ATTRS.APP_VERSION]: getClaudeVersion(),
		[CLAUDE_ATTRS.TERMINAL_TYPE]: getTerminalType(),
		[CLAUDE_ATTRS.HOOK_NAME]: result.hookName,
		[CLAUDE_ATTRS.HOOK_TYPE]: result.hookType,
		[CLAUDE_ATTRS.SOURCE]: "hook",
		[CLAUDE_ATTRS.EVENT_TIMESTAMP]: now.toISOString(),
		[CLAUDE_ATTRS.DURATION_MS]: result.durationMs,
		[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
		[PLUGIN_ATTRS.VERSION]: getPluginInfo().version,
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
