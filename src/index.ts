// =============================================================================
// CORE TYPES
// =============================================================================

import { DebugLogger } from "./debug-logger.js";
export { DebugLogger };
export type { DebugLoggerOptions, LogLevel, Timer, TimingEntry, TimingTracker } from "./debug-logger.js";

import {
	ClaudeBinaryPluginEnv,
	EnvFileLoadError,
	escapeForBashDoubleQuotes,
	formatZodError as formatZodErrorAsMarkdown,
} from "./plugin-env.js";
export { ClaudeBinaryPluginEnv, EnvFileLoadError, escapeForBashDoubleQuotes, formatZodErrorAsMarkdown };
export type {
	CommandConfig,
	CommandContextParams,
	CommandContextResult,
	EnvContext,
	HookContextParams,
	PersistResult,
	PluginEnvFileSystem,
	SessionStartContextParams,
	ValidationResult,
	ZodErrorMinimal,
	ZodIssueMinimal,
	ZodSchema,
} from "./plugin-env.js";

import { z } from "zod";
import { getSidecarClient, isOTELEnabled, parseOTELConfig } from "./otel/index.js";
import {
	HookEventSchema,
	NotificationEventSchema,
	PermissionRequestEventSchema,
	PostToolUseEventSchema,
	PreCompactEventSchema,
	PreToolUseEventSchema,
	SessionEndEventSchema,
	SessionStartEventSchema,
	StopEventSchema,
	SubagentStopEventSchema,
	UserPromptSubmitEventSchema,
} from "./schemas.js";

/**

* Permission modes that determine how Claude Code handles tool permissions.
* * `default`: Normal permission prompts
* * `plan`: Planning mode with restricted actions
* * `acceptEdits`: Auto-accept file edits
* * `bypassPermissions`: Skip all permission prompts
 */
export type HookPermissionsMode = "default" | "plan" | "acceptEdits" | "bypassPermissions";

/**

* All hook event names supported by Claude Code.
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

/**

* Standard I/O streams used by hook events.
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
 */
export interface HookEventOptions<TEnv = unknown> extends IO {
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
	 * ClaudeBinaryPluginEnv subclass for type-safe environment loading.
	 *
	 * @example
	 * ```ts
	 * const event = await SessionStartHookEvent.create({
	 *   name: "my-hook",
	 *   stdin: process.stdin,
	 *   stdout: process.stdout,
	 *   stderr: process.stderr,
	 *   envClass: WorkflowEnv
	 * });
	 * ```
	 */
	envClass: new () => TEnv;
}

// =============================================================================
// BASE EVENT INTERFACE
// =============================================================================

/**

* Base properties present in all hook events.
 */
export interface HookEventBase {
	/**Unique identifier for the current session (UUID format) */
	session_id: string;
	/** Absolute path to the conversation transcript JSON file (optional - may not be present in all events) */
	transcript_path?: string;
	/**Current working directory (optional - may not be present in all events) */
	cwd?: string;
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode?: HookPermissionsMode;
	/**The type of hook event*/
	hook_event_name: HookEventName;
}

// =============================================================================
// TOOL-RELATED TYPES
// =============================================================================

/**

* Known tool names that can be matched in PreToolUse/PostToolUse hooks.
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
* Use type narrowing based on tool_name to access specific properties.
 */
export type ToolInput = Record<string, unknown>;

/**

* Generic tool response type. Each tool has its own response shape.
* Use type narrowing based on tool_name to access specific properties.
 */
export type ToolResponse = Record<string, unknown>;

// =============================================================================
// PRETOOLUSE EVENT
// =============================================================================

/**

* Event fired after Claude creates tool parameters but before the tool executes.
* Use this to inspect, modify, or block tool calls.
 */
export interface PreToolUseEvent extends HookEventBase {
	hook_event_name: HookEventName.PreToolUse;
	/**Name of the tool being invoked */
	tool_name: ToolName;
	/** Input parameters for the tool */
	tool_input: ToolInput;
	/**Unique identifier for this tool use*/
	tool_use_id: string;
}

/**

* Permission decision for PreToolUse hooks.
* * `allow`: Proceed with tool execution
* * `deny`: Block the tool call
* * `ask`: Show permission prompt to user
 */
export type PreToolUseDecision = "allow" | "deny" | "ask";

/**

* Hook-specific output for PreToolUse events.
 */
export interface PreToolUseOutput {
	hookEventName: "PreToolUse";
	/**Decision on whether to allow the tool call */
	permissionDecision?: PreToolUseDecision;
	/** Reason for the permission decision (shown to Claude) */
	permissionDecisionReason?: string;
	/**Modified tool input to use instead of original*/
	updatedInput?: ToolInput;
}

// =============================================================================
// POSTTOOLUSE EVENT
// =============================================================================

/**

* Event fired immediately after a tool completes successfully.
* Use this to inspect results or inject additional context.
 */
export interface PostToolUseEvent extends HookEventBase {
	hook_event_name: HookEventName.PostToolUse;
	/**Name of the tool that was invoked */
	tool_name: ToolName;
	/** Input parameters that were passed to the tool */
	tool_input: ToolInput;
	/**Response returned by the tool */
	tool_response: ToolResponse;
	/** Unique identifier for this tool use */
	tool_use_id: string;
}

/**

* Hook-specific output for PostToolUse events.
 */
export interface PostToolUseOutput {
	hookEventName: "PostToolUse";
	/**Additional context to provide to Claude about the tool result*/
	additionalContext?: string;
}

// =============================================================================
// PERMISSIONREQUEST EVENT
// =============================================================================

/**

* Event fired when a permission dialog is about to be shown to the user.
* Use this to auto-approve or auto-deny certain permission requests.
 */
export interface PermissionRequestEvent extends HookEventBase {
	hook_event_name: HookEventName.PermissionRequest;
	/**The permission message being shown */
	message: string;
	/** Type of notification/permission being requested */
	notification_type: string;
}

/**

* Decision behavior for PermissionRequest hooks.
 */
export type PermissionRequestBehavior = "allow" | "deny";

/**

* Decision object for PermissionRequest hooks.
 */
export interface PermissionRequestDecision {
	/**Whether to allow or deny the permission */
	behavior: PermissionRequestBehavior;
	/** Modified input to use (only for allow) */
	updatedInput?: ToolInput;
	/**Message to show when denying */
	message?: string;
	/** If true, interrupts Claude's execution (only for deny) */
	interrupt?: boolean;
}

/**

* Hook-specific output for PermissionRequest events.
 */
export interface PermissionRequestOutput {
	hookEventName: "PermissionRequest";
	/**The permission decision*/
	decision: PermissionRequestDecision;
}

// =============================================================================
// NOTIFICATION EVENT
// =============================================================================

/**

* Known notification types that can be matched in Notification hooks.
 */
export type NotificationType =
	| "permission_prompt"
	| "idle_prompt"
	| "auth_success"
	| "elicitation_dialog"
	| (string & {}); // Allow custom notification types

/**

* Event fired when Claude Code sends a notification.
 */
export interface NotificationEvent extends HookEventBase {
	hook_event_name: HookEventName.Notification;
	/**The notification message */
	message: string;
	/** Type of notification */
	notification_type: NotificationType;
}

// =============================================================================
// USERPROMPTSUBMIT EVENT
// =============================================================================

/**

* Event fired when the user submits a prompt, before Claude processes it.
* Use this to inject context, validate input, or block certain prompts.
 */
export interface UserPromptSubmitEvent extends HookEventBase {
	hook_event_name: HookEventName.UserPromptSubmit;
	/**The user's prompt text*/
	prompt: string;
}

/**

* Hook-specific output for UserPromptSubmit events.
 */
export interface UserPromptSubmitOutput {
	hookEventName: "UserPromptSubmit";
	/**Additional context to inject for Claude*/
	additionalContext?: string;
}

// =============================================================================
// STOP / SUBAGENTSTOP EVENTS
// =============================================================================

/**

* Event fired when the main Claude Code agent finishes responding.
* Use this to keep Claude working on additional tasks.
 */
export interface StopEvent extends HookEventBase {
	hook_event_name: HookEventName.Stop;
	/**Whether a stop hook is currently active*/
	stop_hook_active: boolean;
}

/**

* Event fired when a subagent (Task tool) finishes responding.
 */
export interface SubagentStopEvent extends HookEventBase {
	hook_event_name: HookEventName.SubagentStop;
	/**Whether a stop hook is currently active*/
	stop_hook_active: boolean;
}

// =============================================================================
// PRECOMPACT EVENT
// =============================================================================

/**

* Trigger type for PreCompact events.
 */
export type PreCompactTrigger = "manual" | "auto";

/**

* Event fired before Claude Code compacts the context window.
 */
export interface PreCompactEvent extends HookEventBase {
	hook_event_name: HookEventName.PreCompact;
	/**What triggered the compact operation */
	trigger: PreCompactTrigger;
	/** Custom instructions for the compact operation */
	custom_instructions: string;
}

// =============================================================================
// SESSIONSTART EVENT
// =============================================================================

/**

* Source that triggered the session start.
 */
export type SessionStartSource = "startup" | "resume" | "clear" | "compact";

/**

* Event fired when Claude Code starts or resumes a session.
* Use this to load development context or set up the environment.
 */
export interface SessionStartEvent extends HookEventBase {
	hook_event_name: HookEventName.SessionStart;
	/**What triggered the session start*/
	source: SessionStartSource;
}

/**

* Hook-specific output for SessionStart events.
 */
export interface SessionStartOutput {
	hookEventName: "SessionStart";
	/**Context to inject into the session for Claude*/
	additionalContext?: string;
}

// =============================================================================
// SESSIONEND EVENT
// =============================================================================

/**

* Reason for session termination.
 */
export type SessionEndReason = "clear" | "logout" | "prompt_input_exit" | "other";

/**

* Event fired when a Claude Code session terminates.
* Use this for cleanup and logging. Cannot prevent termination.
 */
export interface SessionEndEvent extends HookEventBase {
	hook_event_name: HookEventName.SessionEnd;
	/**Why the session is ending*/
	reason: SessionEndReason;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**

* Decision type for hooks that can block operations.
 */
export type BlockDecision = "block" | undefined;

/**

* Base hook response output structure.
* All hook responses can include these optional fields.
 */
export interface HookResponse {
	/**Whether Claude should continue after the hook. Defaults to true. */
	continue?: boolean;
	/** Message shown when continue is false */
	stopReason?: string;
	/**Hide stdout from the transcript */
	suppressOutput?: boolean;
	/** Optional warning message to show to the user */
	systemMessage?: string;
	/**Hook-specific output data */
	hookSpecificOutput?: Record<string, unknown>;
	/** Decision to block the operation (for applicable hooks) */
	decision?: BlockDecision;
	/**Reason for blocking (required when decision is "block")*/
	reason?: string;
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

/**
 * Estimate token count for a string.
 * Uses a simple heuristic: ~4 characters per token on average.
 * This is a rough estimate suitable for telemetry, not billing.
 */
export function estimateTokenCount(text: string): number {
	// Average of ~4 chars per token for English text
	// This is a rough heuristic - actual tokenization varies
	return Math.ceil(text.length / 4);
}

/**
 * Hook outcome type for telemetry.
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
 * Operational metrics for hook telemetry.
 */
export interface HookMetrics {
	filesScanned?: number;
	filesWithErrors?: number;
	issuesFound?: number;
	issuesFixed?: number;
	patternsMatched?: number;
	contextTokens?: number;
	[key: string]: number | undefined;
}

/**

* Base builder for constructing hook responses with a fluent API.
*
* @example

* ```ts
* const response = new HookResponseBuilder()
* .continue(true)
* .systemMessage("Warning: large file detected")
* .build();

* ```

 */
export class HookResponseBuilder {
	protected response: HookResponse = {};
	protected _summary: string | undefined;
	protected _outcome: HookOutcome | undefined;
	protected _metrics: HookMetrics = {};
	protected _context: Record<string, string | number | boolean> = {};

	/**
	 * Set a custom summary message for debug logging.
	 * This appears in the single-line log output when the hook completes.
	 * @param message - Short description of what the hook did (e.g., "skipped: tool is Read")
	 */
	summary(message: string): this {
		this._summary = message;
		return this;
	}

	/**
	 * Get the summary message for logging.
	 * Returns custom summary if set, otherwise generates one from response state.
	 */
	getSummary(): string {
		if (this._summary) {
			return this._summary;
		}
		// Generate summary from response state
		const parts: string[] = [];
		const hookOutput = this.response.hookSpecificOutput as Record<string, unknown> | undefined;

		// Check for PreToolUse decisions
		if (hookOutput?.permissionDecision) {
			const decision = hookOutput.permissionDecision as string;
			if (decision === "allow") {
				parts.push("allowed");
			} else if (decision === "deny") {
				const reason = hookOutput.permissionDecisionReason as string | undefined;
				parts.push(reason ? `denied: ${reason}` : "denied");
			} else if (decision === "ask") {
				parts.push("ask user");
			}
		}
		// Check for block decision
		else if (this.response.decision === "block") {
			parts.push(`blocked: ${this.response.reason || "no reason"}`);
		}
		// Check for continue=false (stop)
		else if (this.response.continue === false) {
			parts.push(this.response.stopReason ? `stopped: ${this.response.stopReason}` : "stopped");
		}
		// Check for additional context (PostToolUse)
		else if (hookOutput?.additionalContext) {
			const ctx = hookOutput.additionalContext as string;
			parts.push(`context: ${ctx.slice(0, 50)}${ctx.length > 50 ? "..." : ""}`);
		}
		// Default
		else {
			parts.push("completed");
		}

		return parts.join(", ");
	}

	/**
	 * Get the additional context from the response, if any.
	 * Used for verbose logging of the full context being returned.
	 */
	getAdditionalContext(): string | undefined {
		const hookOutput = this.response.hookSpecificOutput as Record<string, unknown> | undefined;
		return hookOutput?.additionalContext as string | undefined;
	}

	/**
	 * Get telemetry-relevant data from the response.
	 * Used by HookEvent.emitTelemetry() for auto-instrumentation.
	 */
	getTelemetryData(): {
		permissionDecision?: "allow" | "deny" | "ask";
		permissionDecisionReason?: string;
		hasUpdatedInput?: boolean;
		decision?: "block";
		reason?: string;
		outcome?: HookOutcome;
		metrics?: HookMetrics;
		context?: Record<string, string | number | boolean>;
	} {
		const hookOutput = this.response.hookSpecificOutput as Record<string, unknown> | undefined;

		// Auto-calculate contextTokens if additionalContext is set and not already calculated
		const metrics = { ...this._metrics };
		const additionalContext = hookOutput?.additionalContext as string | undefined;
		if (additionalContext && metrics.contextTokens === undefined) {
			metrics.contextTokens = estimateTokenCount(additionalContext);
		}

		return {
			permissionDecision: hookOutput?.permissionDecision as "allow" | "deny" | "ask" | undefined,
			permissionDecisionReason: hookOutput?.permissionDecisionReason as string | undefined,
			hasUpdatedInput: hookOutput?.updatedInput !== undefined,
			decision: this.response.decision as "block" | undefined,
			reason: this.response.reason,
			outcome: this._outcome,
			metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
			context: Object.keys(this._context).length > 0 ? this._context : undefined,
		};
	}

	/**
	 * Set the semantic outcome for telemetry.
	 * @param outcome - The outcome classification
	 */
	outcome(outcome: HookOutcome): this {
		this._outcome = outcome;
		return this;
	}

	/**
	 * Get the current outcome.
	 */
	getOutcome(): HookOutcome | undefined {
		return this._outcome;
	}

	/**
	 * Set operational metrics for telemetry.
	 * @param metrics - Metrics object (merged with existing)
	 */
	metrics(metrics: HookMetrics): this {
		this._metrics = { ...this._metrics, ...metrics };
		return this;
	}

	/**
	 * Set a single metric value.
	 * @param key - Metric name
	 * @param value - Metric value
	 */
	metric(key: string, value: number): this {
		this._metrics[key] = value;
		return this;
	}

	/**
	 * Set hook-specific context for telemetry.
	 * @param context - Context object (merged with existing)
	 */
	context(context: Record<string, string | number | boolean>): this {
		this._context = { ...this._context, ...context };
		return this;
	}

	/**
	 * Set whether Claude should continue after this hook.
	 * @param value - If false, Claude will stop processing
	 */
	continue(value: boolean = true): this {
		this.response.continue = value;
		return this;
	}

	/**
	 * Stop Claude with a reason message.
	 * Shorthand for `continue(false).stopReason(reason)`.
	 * @param reason - Message explaining why processing stopped
	 */
	stop(reason: string): this {
		this.response.continue = false;
		this.response.stopReason = reason;
		return this;
	}

	/**
	 * Hide the hook's stdout from the transcript.
	 * @param value - Whether to suppress output
	 */
	suppressOutput(value: boolean = true): this {
		this.response.suppressOutput = value;
		return this;
	}

	/**
	 * Add a warning message shown to the user.
	 * @param message - The warning message
	 */
	systemMessage(message: string): this {
		this.response.systemMessage = message;
		return this;
	}

	/**
	 * Set raw hook-specific output data.
	 * Prefer using typed methods on subclasses when available.
	 * @param output - The hook-specific output object
	 */
	hookSpecificOutput(output: Record<string, unknown>): this {
		this.response.hookSpecificOutput = output;
		return this;
	}

	/**
	 * Block the current operation with a reason.
	 * @param reason - Explanation for why the operation was blocked
	 */
	block(reason: string): this {
		this.response.decision = "block";
		this.response.reason = reason;
		return this;
	}

	/**
	 * Build the final response object.
	 */
	build(): HookResponse {
		return this.response;
	}

	/**
	 * Serialize the response to JSON.
	 */
	toJSON(): string {
		return JSON.stringify(this.response);
	}
}

/**

* Response builder for PreToolUse hooks.
*
* @example

* ```ts
* // Allow the tool call
* event.end(event.response().allow());
*
* // Deny with a reason
* event.end(event.response().deny("This operation is not allowed"));
*
* // Modify the input
* event.end(event.response().allow().updateInput({ timeout: 5000 }));

* ```

 */
export class PreToolUseResponseBuilder extends HookResponseBuilder {
	/**
	 * Allow the tool call to proceed.
	 */
	allow(): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "PreToolUse",
			permissionDecision: "allow",
		};
		return this;
	}

	/**
	 * Deny the tool call.
	 * @param reason - Explanation shown to Claude
	 */
	deny(reason?: string): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			...(reason && { permissionDecisionReason: reason }),
		};
		return this;
	}

	/**
	 * Prompt the user for permission.
	 */
	ask(): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "PreToolUse",
			permissionDecision: "ask",
		};
		return this;
	}

	/**
	 * Modify the tool input before execution.
	 * @param input - The modified input parameters
	 */
	updateInput(input: ToolInput): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "PreToolUse",
			updatedInput: input,
		};
		return this;
	}
}

/**

* Response builder for PostToolUse hooks.
*
* @example

* ```ts
* // Add context about the result
* event.end(event.response().additionalContext("File contains sensitive data"));

* ```

 */
export class PostToolUseResponseBuilder extends HookResponseBuilder {
	/**
	 * Add additional context about the tool result for Claude.
	 *@param context - Context information
	 */
	additionalContext(context: string): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "PostToolUse",
			additionalContext: context,
		};
		return this;
	}
}

/**

* Response builder for PermissionRequest hooks.
*
* @example

* ```ts
* // Auto-approve
* event.end(event.response().allow());
*
* // Auto-deny with interruption
* event.end(event.response().deny("Not allowed").interrupt());

* ```

 */
export class PermissionRequestResponseBuilder extends HookResponseBuilder {
	private decision: PermissionRequestDecision = { behavior: "allow" };

	/**
	 * Allow the permission request.
	 */
	allow(): this {
		this.decision.behavior = "allow";
		this.updateHookOutput();
		return this;
	}

	/**
	 * Deny the permission request.
	 * @param message - Message explaining the denial
	 */
	deny(message?: string): this {
		this.decision.behavior = "deny";
		if (message) this.decision.message = message;
		this.updateHookOutput();
		return this;
	}

	/**
	 * Interrupt Claude's execution (only applies to deny).
	 */
	interrupt(value: boolean = true): this {
		this.decision.interrupt = value;
		this.updateHookOutput();
		return this;
	}

	/**
	 * Provide modified input (only applies to allow).
	 * @param input - The modified input parameters
	 */
	updateInput(input: ToolInput): this {
		this.decision.updatedInput = input;
		this.updateHookOutput();
		return this;
	}

	private updateHookOutput(): void {
		this.response.hookSpecificOutput = {
			hookEventName: "PermissionRequest",
			decision: this.decision,
		};
	}
}

/**

* Response builder for UserPromptSubmit hooks.
*
* @example

* ```ts
* // Inject context
* event.end(event.response().additionalContext("User is working on auth feature"));
*
* // Block the prompt
* event.end(event.response().block("Please rephrase your request"));

* ```

 */
export class UserPromptSubmitResponseBuilder extends HookResponseBuilder {
	/**
	 * Add additional context for Claude about the user's prompt.
	 *@param context - Context information
	 */
	additionalContext(context: string): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "UserPromptSubmit",
			additionalContext: context,
		};
		return this;
	}
}

/**

* Response builder for Stop and SubagentStop hooks.
*
* @example

* ```ts
* // Keep Claude working
* event.end(event.response().block("Please also run the tests"));
*
* // Allow stopping
* event.end(event.response().continue(true));

* ```

 */
export class StopResponseBuilder extends HookResponseBuilder {
	// Inherits block() from base class which is the primary method for Stop hooks

	/**
	 * Add additional context about why Claude is being blocked.
	 * @param context - Context information explaining what needs to be fixed
	 */
	additionalContext(context: string): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "Stop",
			additionalContext: context,
		};
		return this;
	}
}

/**

* Response builder for SessionStart hooks.
*
* @example

* ```ts
* event.end(event.response().additionalContext("Project uses TypeScript 5.0"));

* ```

 */
export class SessionStartResponseBuilder extends HookResponseBuilder {
	/**
	 * Add context to inject into the session for Claude.
	 *@param context - Context information about the project/session
	 */
	additionalContext(context: string): this {
		this.response.hookSpecificOutput = {
			...this.response.hookSpecificOutput,
			hookEventName: "SessionStart",
			additionalContext: context,
		};
		return this;
	}
}

// =============================================================================
// TWO-STAGE SCHEMA VALIDATION WITH OTEL
// =============================================================================

/**
 * Extract session_id from raw JSON data for early OTEL initialization.
 * Returns null if session_id cannot be extracted.
 */
function extractSessionId(rawJson: string): string | null {
	try {
		const data = JSON.parse(rawJson) as unknown;
		if (typeof data === "object" && data !== null && "session_id" in data) {
			const sessionId = (data as { session_id: unknown }).session_id;
			if (typeof sessionId === "string" && sessionId.length > 0) {
				return sessionId;
			}
		}
	} catch {
		// JSON parse failed - will be caught by schema validation
	}
	return null;
}

/**
 * Format ZodError issues into a readable error message.
 */
function formatZodError(error: z.ZodError): { message: string; path: string; issueCount: number } {
	const issues = error.issues;
	const firstIssue = issues[0];
	const path = firstIssue?.path.join(".") || "root";
	const message = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
	return { message, path, issueCount: issues.length };
}

/**
 * Emit schema validation error to OTEL and flush before returning.
 * Safe to call even if OTEL is not initialized.
 *
 * @returns Promise that resolves when telemetry is flushed
 */
async function emitValidationErrorToOTEL(sessionId: string | null, hookName: string, error: z.ZodError): Promise<void> {
	if (!sessionId) return;

	try {
		const { isOTELEnabled } = require("./otel/config.js") as { isOTELEnabled: () => boolean };
		if (!isOTELEnabled()) return;

		const { emitSchemaValidationError } = require("./otel/events.js") as {
			emitSchemaValidationError: typeof import("./otel/events.js").emitSchemaValidationError;
		};
		const { getSidecarClient } = require("./otel/client.js") as {
			getSidecarClient: typeof import("./otel/client.js").getSidecarClient;
		};

		const formatted = formatZodError(error);
		emitSchemaValidationError(sessionId, hookName, {
			hookName,
			issueCount: formatted.issueCount,
			validationPath: formatted.path,
			errorMessage: formatted.message,
		});

		// Flush to ensure telemetry is sent before process exits
		const client = getSidecarClient(sessionId);
		await client.flush(500);
	} catch {
		// Silently ignore OTEL errors - don't block hook execution
	}
}

/**
 * Two-stage schema validation that enables OTEL error capture.
 *
 * Stage 1: Extract session_id from raw JSON (minimal parsing)
 * Stage 2: Full schema validation with OTEL error emission on failure
 *
 * @param rawJson - The raw JSON string from stdin
 * @param schema - The Zod schema to validate against
 * @param hookName - The hook name for OTEL attribution
 * @returns The validated and typed event data
 * @throws ZodError if validation fails (after emitting to OTEL)
 */
async function parseWithOTEL<T>(rawJson: string, schema: z.ZodType<T>, hookName: string): Promise<T> {
	// DEBUG: Log raw input to understand what Claude Code is sending
	// This helps debug schema validation failures
	if (Bun.env.CLAUDE_DEBUG === "1") {
		const truncated = rawJson.length > 2000 ? `${rawJson.slice(0, 2000)}... (${rawJson.length} chars)` : rawJson;
		console.error(`[${hookName}] DEBUG raw input: ${truncated}`);
	}

	// Stage 1: Extract session_id for early OTEL init
	const sessionId = extractSessionId(rawJson);

	// Initialize OTEL if we have a session ID
	if (sessionId) {
		try {
			const { preconnectTelemetry } = await import("./otel/index.js");
			await preconnectTelemetry(sessionId);
		} catch {
			// Silently ignore telemetry errors - don't block hook initialization
		}
	}

	// Stage 2: Full schema validation
	let data: unknown;
	try {
		data = JSON.parse(rawJson);
	} catch (e) {
		// JSON parse error - create a synthetic ZodError for OTEL
		const parseError = new z.ZodError([
			{
				code: "custom",
				path: [],
				message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
			},
		]);
		// Emit and flush before throwing
		await emitValidationErrorToOTEL(sessionId, hookName, parseError);
		throw parseError;
	}

	const result = schema.safeParse(data);

	if (!result.success) {
		// Log the raw input that failed validation (always, not just in debug mode)
		// This is critical for understanding what Claude Code is sending
		const truncated = rawJson.length > 500 ? `${rawJson.slice(0, 500)}... (${rawJson.length} chars)` : rawJson;
		console.error(`[${hookName}] Validation failed. Raw input: ${truncated}`);

		// Emit and flush validation error to OTEL before throwing
		await emitValidationErrorToOTEL(sessionId, hookName, result.error);
		throw result.error;
	}

	return result.data;
}

// =============================================================================
// HOOK EVENT CLASSES
// =============================================================================

/**

* Base class for all hook events.
* Provides common functionality for reading events and sending responses.
 */
export class HookEvent<TEnv = unknown> implements HookEventBase {
	name: string;
	/**Unique session identifier */
	session_id: string;
	/** Path to the conversation transcript (optional - may not be present in all events) */
	transcript_path?: string;
	/**Current working directory (optional - may not be present in all events) */
	cwd?: string;
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode?: HookPermissionsMode;
	/**The type of hook event*/
	hook_event_name: HookEventName;
	/** Debug logger for this hook event */
	readonly log: DebugLogger;
	/** Loaded environment (if envLoader was provided) */
	readonly env?: TEnv;

	protected in: typeof process.stdin;
	protected out: typeof process.stdout;
	protected err: typeof process.stderr;
	private startTime: number;
	/**
	 * Plugin name for telemetry - passed explicitly from entrypoint.
	 * Falls back to env var for backward compatibility.
	 */
	private readonly pluginName: string;
	/**
	 * Plugin version for telemetry - passed explicitly from entrypoint.
	 * Falls back to env var for backward compatibility.
	 */
	private readonly pluginVersion: string;
	/**
	 * Flag to prevent duplicate telemetry emission.
	 * Set to true by pipeline runtime after it emits telemetry.
	 */
	private telemetryEmitted = false;

	constructor(params: HookEventBase, options: HookEventOptions<TEnv>, env?: TEnv) {
		this.name = options.name ?? params.hook_event_name;
		this.session_id = params.session_id;
		this.transcript_path = params.transcript_path;
		this.cwd = params.cwd;
		this.permission_mode = params.permission_mode;
		this.hook_event_name = params.hook_event_name;
		this.in = options.stdin;
		this.out = options.stdout;
		this.err = options.stderr;
		this.startTime = performance.now();
		// Store plugin info - passed explicitly from compiled entrypoint
		this.pluginName = options.pluginName ?? "unknown";
		this.pluginVersion = options.pluginVersion ?? "0.0.0";
		this.log = DebugLogger.create(options.name ?? params.hook_event_name, {
			pluginName: options.pluginName,
			sessionId: params.session_id,
		});
		this.env = env;
	}

	/**
	 * Create a response builder for this event.
	 */
	response(): HookResponseBuilder {
		return new HookResponseBuilder();
	}

	/**
	 * Mark telemetry as already emitted.
	 * Called by pipeline runtime after it emits telemetry to prevent
	 * duplicate emission from end().
	 */
	markTelemetryEmitted(): void {
		this.telemetryEmitted = true;
	}

	/**
	 * Pre-connect to OTEL sidecar for telemetry.
	 *
	 * Should be called in each hook event's create() method after parsing
	 * the event to ensure the socket is ready when end() emits telemetry.
	 *
	 * @param sessionId - The Claude Code session ID
	 */
	protected static async initTelemetry(sessionId: string): Promise<void> {
		try {
			// Lazy import to avoid circular dependency
			const { preconnectTelemetry } = await import("./otel/index.js");
			await preconnectTelemetry(sessionId);
		} catch {
			// Silently ignore telemetry errors - don't block hook initialization
		}
	}

	/**
	 * Set up global error handlers for uncaught exceptions and unhandled rejections.
	 * Called automatically by create() methods - hooks don't need their own error handlers.
	 *
	 * Note: Schema validation errors are already handled by parseWithOTEL which
	 * emits telemetry and flushes before throwing. This handler catches any
	 * other uncaught errors and logs them nicely.
	 *
	 * @param hookName - Name of the hook for error messages
	 */
	protected static setupGlobalErrorHandlers(hookName: string): void {
		const errorHandler = (error: unknown) => {
			// Format ZodErrors specially to show received values
			if (error instanceof z.ZodError) {
				const formatted = formatZodErrorAsMarkdown(error);
				console.error(`[${hookName}] Validation error:\n${formatted}`);
			} else {
				console.error(`[${hookName}] Fatal error: ${error}`);
			}
			process.exit(2);
		};

		process.on("uncaughtException", errorHandler);
		process.on("unhandledRejection", errorHandler);
	}

	/**
	 * End the hook with an optional response.
	 * @param code - Exit code (0 for success, 2 for blocking error)
	 */
	end(code?: number): never;
	/**
	 * End the hook with a response builder.
	 * @param builder - The response builder
	 * @param code - Exit code (default: 0)
	 */
	end(builder: HookResponseBuilder, code?: number): never;
	end(builderOrCode?: HookResponseBuilder | number, code: number = 0): never {
		const elapsedMs = performance.now() - this.startTime;
		const timing = `(${elapsedMs.toFixed(2)}ms)`;

		if (builderOrCode === undefined || typeof builderOrCode === "number") {
			// No response builder - log simple completion
			this.log.debug(`✓ completed ${timing}`);
			// Emit telemetry for simple completion
			this.emitTelemetry(Math.round(elapsedMs), true);
			process.exit(builderOrCode ?? 0);
		}

		// Get summary from builder and log at DEBUG level (timing/diagnostics)
		const summary = builderOrCode.getSummary();
		const isError = code !== 0 || summary.startsWith("blocked") || summary.startsWith("denied");
		if (isError) {
			this.log.debug(`✗ ${summary} ${timing}`);
		} else {
			this.log.debug(`✓ ${summary} ${timing}`);
		}

		// Log additional context at INFO level (full multi-line output)
		const additionalContext = builderOrCode.getAdditionalContext();
		if (additionalContext) {
			this.log.info(additionalContext);
		}

		// Emit telemetry with response details
		this.emitTelemetry(Math.round(elapsedMs), !isError, builderOrCode);

		this.out.write(builderOrCode.toJSON());
		process.exit(code);
	}

	/**
	 * Emit OTEL telemetry for hook execution.
	 * Fire-and-forget - errors are silently ignored to not block hooks.
	 */
	private emitTelemetry(durationMs: number, success: boolean, builder?: HookResponseBuilder): void {
		// Skip if telemetry was already emitted (e.g., by pipeline runtime)
		if (this.telemetryEmitted) return;

		try {
			// Lazy import to avoid circular dependency
			const { isOTELEnabled } = require("./otel/config.js") as { isOTELEnabled: () => boolean };
			if (!isOTELEnabled()) return;

			const { emitHookExecution } = require("./otel/events.js") as {
				emitHookExecution: (
					event: HookEventBase,
					hookName: string,
					result: {
						hookType: string;
						durationMs: number;
						success: boolean;
						outcome?: HookOutcome;
						summary?: string;
						toolName?: string;
						toolUseId?: string;
						permissionDecision?: "allow" | "deny" | "ask";
						permissionDecisionReason?: string;
						hasUpdatedInput?: boolean;
						decision?: "block";
						reason?: string;
						metrics?: HookMetrics;
						context?: Record<string, string | number | boolean>;
					},
				) => void;
			};

			// Build result from builder metadata if available
			// Plugin name/version are instance properties set at construction time
			const result: {
				hookType: string;
				pluginName: string;
				pluginVersion: string;
				durationMs: number;
				success: boolean;
				outcome?: HookOutcome;
				summary?: string;
				toolName?: string;
				toolUseId?: string;
				permissionDecision?: "allow" | "deny" | "ask";
				permissionDecisionReason?: string;
				hasUpdatedInput?: boolean;
				decision?: "block";
				reason?: string;
				metrics?: HookMetrics;
				context?: Record<string, string | number | boolean>;
			} = {
				hookType: this.hook_event_name,
				pluginName: this.pluginName,
				pluginVersion: this.pluginVersion,
				durationMs,
				success,
			};

			// Extract tool name and tool_use_id if this is a tool-related event
			if ("tool_name" in this) {
				result.toolName = (this as unknown as { tool_name: string }).tool_name;
			}
			if ("tool_use_id" in this) {
				result.toolUseId = (this as unknown as { tool_use_id: string }).tool_use_id;
			}

			// Extract response details from builder
			if (builder) {
				const telemetryData = builder.getTelemetryData();

				// Use summary from builder for human-readable log body
				result.summary = builder.getSummary();

				if (telemetryData.outcome) {
					result.outcome = telemetryData.outcome;
				}
				if (telemetryData.permissionDecision) {
					result.permissionDecision = telemetryData.permissionDecision;
				}
				if (telemetryData.permissionDecisionReason) {
					result.permissionDecisionReason = telemetryData.permissionDecisionReason;
				}
				if (telemetryData.hasUpdatedInput !== undefined) {
					result.hasUpdatedInput = telemetryData.hasUpdatedInput;
				}
				if (telemetryData.decision) {
					result.decision = telemetryData.decision;
				}
				if (telemetryData.reason) {
					result.reason = telemetryData.reason;
				}
				if (telemetryData.metrics) {
					result.metrics = telemetryData.metrics;
				}
				if (telemetryData.context) {
					result.context = telemetryData.context;
				}
			}

			emitHookExecution(this, this.name, result);
		} catch {
			// Silently ignore telemetry errors - don't block hook execution
		}
	}

	/**
	 * End the hook with a blocking error.
	 * Writes to stderr and exits with code 2.
	 * @param message - Error message shown to Claude
	 */
	error(message: string): never {
		const elapsedMs = performance.now() - this.startTime;
		const timing = `(${elapsedMs.toFixed(2)}ms)`;
		const shortMsg = message.length > 50 ? `${message.slice(0, 50)}...` : message;
		this.log.info(`✗ error: ${shortMsg} ${timing}`);
		// Emit telemetry for error
		this.emitTelemetryError(Math.round(elapsedMs), message);
		this.err.write(message);
		process.exit(2);
	}

	/**
	 * Emit OTEL telemetry for hook error.
	 * Fire-and-forget - errors are silently ignored to not block hooks.
	 */
	private emitTelemetryError(durationMs: number, errorMessage: string): void {
		try {
			const { isOTELEnabled } = require("./otel/config.js") as { isOTELEnabled: () => boolean };
			if (!isOTELEnabled()) return;

			const { emitHookExecution } = require("./otel/events.js") as {
				emitHookExecution: (
					event: HookEventBase,
					hookName: string,
					result: {
						hookType: string;
						durationMs: number;
						success: boolean;
						error?: string;
						toolName?: string;
					},
				) => void;
			};

			// Plugin name/version are instance properties set at construction time
			const result: {
				hookType: string;
				pluginName: string;
				pluginVersion: string;
				durationMs: number;
				success: boolean;
				error: string;
				toolName?: string;
			} = {
				hookType: this.hook_event_name,
				pluginName: this.pluginName,
				pluginVersion: this.pluginVersion,
				durationMs,
				success: false,
				error: errorMessage,
			};

			// Extract tool name if this is a tool-related event
			if ("tool_name" in this) {
				result.toolName = (this as unknown as { tool_name: string }).tool_name;
			}

			emitHookExecution(this, this.name, result);
		} catch {
			// Silently ignore telemetry errors - don't block hook execution
		}
	}

	/**
	 * Reads input text from options.inputText or Bun.stdin.
	 * Allows testing without mocking Bun.stdin.
	 */
	protected static async readInputText(options: IO): Promise<string> {
		if (options.inputText !== undefined) {
			return options.inputText;
		}
		return Bun.stdin.text();
	}

	/**
	 * Create a HookEvent from stdin using Bun.stdin.
	 * Uses two-stage parsing to enable OTEL error capture on schema validation failures.
	 * @param options - The I/O streams and optional name
	 */
	static async create<TEnv = unknown>(options: HookEventOptions<TEnv>): Promise<{ event: HookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "HookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const params = await HookEvent.readInputText(options);
		if (params) {
			// Two-stage parsing: extracts session_id first, inits OTEL, then validates
			const parsed = (await parseWithOTEL(params, HookEventSchema, hookName)) as HookEventBase;
			// Get session-env dir from mapping file (Claude Code doesn't source hook files)
			const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
			// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
			const env = (await (options.envClass as any).forContext("hook", {
				sessionId: parsed.session_id,
				sessionEnvDir,
				hookName,
			})) as TEnv;
			const event = new HookEvent(parsed, options, env);
			return { event, env };
		}
		throw new Error("Failed to read HookEvent from stdin");
	}
}

/**

* Hook event for PreToolUse - fired before a tool executes.
 */
export class PreToolUseHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PreToolUseEvent {
	override hook_event_name = HookEventName.PreToolUse as const;
	/**Name of the tool being invoked */
	tool_name: ToolName;
	/** Input parameters for the tool */
	tool_input: ToolInput;
	/**Unique identifier for this tool use*/
	tool_use_id: string;

	constructor(params: PreToolUseEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PreToolUseResponseBuilder {
		return new PreToolUseResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PreToolUseHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PreToolUseHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreToolUseEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PreToolUseEventSchema, hookName)) as PreToolUseEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PreToolUseHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for PostToolUse - fired after a tool completes.
 */
export class PostToolUseHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PostToolUseEvent {
	override hook_event_name = HookEventName.PostToolUse as const;
	/**Name of the tool that was invoked */
	tool_name: ToolName;
	/** Input parameters that were passed to the tool */
	tool_input: ToolInput;
	/**Response returned by the tool */
	tool_response: ToolResponse;
	/** Unique identifier for this tool use */
	tool_use_id: string;

	constructor(params: PostToolUseEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_response = params.tool_response;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PostToolUseResponseBuilder {
		return new PostToolUseResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PostToolUseHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PostToolUseHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PostToolUseEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PostToolUseEventSchema, hookName)) as PostToolUseEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PostToolUseHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for PermissionRequest - fired when permission dialog is shown.
 */
export class PermissionRequestHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PermissionRequestEvent {
	override hook_event_name = HookEventName.PermissionRequest as const;
	/**The permission message being shown */
	message: string;
	/** Type of notification/permission being requested */
	notification_type: string;

	constructor(params: PermissionRequestEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	override response(): PermissionRequestResponseBuilder {
		return new PermissionRequestResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PermissionRequestHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PermissionRequestHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PermissionRequestEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PermissionRequestEventSchema, hookName)) as PermissionRequestEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PermissionRequestHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for Notification - fired when Claude Code sends notifications.
 */
export class NotificationHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements NotificationEvent {
	override hook_event_name = HookEventName.Notification as const;
	/**The notification message */
	message: string;
	/** Type of notification */
	notification_type: NotificationType;

	constructor(params: NotificationEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: NotificationHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "NotificationHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read NotificationEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, NotificationEventSchema, hookName)) as NotificationEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new NotificationHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for UserPromptSubmit - fired when user submits a prompt.
 */
export class UserPromptSubmitHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements UserPromptSubmitEvent {
	override hook_event_name = HookEventName.UserPromptSubmit as const;
	/**The user's prompt text*/
	prompt: string;

	constructor(params: UserPromptSubmitEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.prompt = params.prompt;
	}

	override response(): UserPromptSubmitResponseBuilder {
		return new UserPromptSubmitResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: UserPromptSubmitHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "UserPromptSubmitHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read UserPromptSubmitEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, UserPromptSubmitEventSchema, hookName)) as UserPromptSubmitEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new UserPromptSubmitHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for Stop - fired when main agent finishes responding.
 */
export class StopHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements StopEvent {
	override hook_event_name = HookEventName.Stop as const;
	/**Whether a stop hook is currently active*/
	stop_hook_active: boolean;

	constructor(params: StopEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponseBuilder {
		return new StopResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: StopHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "StopHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read StopEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, StopEventSchema, hookName)) as StopEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new StopHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for SubagentStop - fired when a subagent finishes responding.
 */
export class SubagentStopHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SubagentStopEvent {
	override hook_event_name = HookEventName.SubagentStop as const;
	/**Whether a stop hook is currently active*/
	stop_hook_active: boolean;

	constructor(params: SubagentStopEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponseBuilder {
		return new StopResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SubagentStopHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SubagentStopHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SubagentStopEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SubagentStopEventSchema, hookName)) as SubagentStopEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new SubagentStopHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for PreCompact - fired before context compaction.
 */
export class PreCompactHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PreCompactEvent {
	override hook_event_name = HookEventName.PreCompact as const;
	/**What triggered the compact operation */
	trigger: PreCompactTrigger;
	/** Custom instructions for the compact operation */
	custom_instructions: string;

	constructor(params: PreCompactEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.trigger = params.trigger;
		this.custom_instructions = params.custom_instructions;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PreCompactHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PreCompactHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreCompactEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PreCompactEventSchema, hookName)) as PreCompactEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PreCompactHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for SessionStart - fired when a session starts or resumes.
 */
export class SessionStartHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SessionStartEvent {
	override hook_event_name = HookEventName.SessionStart as const;
	/**What triggered the session start*/
	source: SessionStartSource;

	constructor(params: SessionStartEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.source = params.source;
	}

	override response(): SessionStartResponseBuilder {
		return new SessionStartResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SessionStartHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SessionStartHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionStartEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SessionStartEventSchema, hookName)) as SessionStartEvent;
		const name = options.name ?? parsed.hook_event_name;

		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const { env } = (await (options.envClass as any).initializeSession({
			hookName: name,
			sessionId: parsed.session_id,
		})) as { env: TEnv; persisted: unknown };

		// Initialize OTEL sidecar if telemetry is enabled
		if (isOTELEnabled()) {
			const client = getSidecarClient(parsed.session_id);
			const config = parseOTELConfig();
			await client.ensureRunning(config);
		}

		const event = new SessionStartHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**

* Hook event for SessionEnd - fired when a session terminates.
 */
export class SessionEndHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SessionEndEvent {
	override hook_event_name = HookEventName.SessionEnd as const;
	/**Why the session is ending*/
	reason: SessionEndReason;

	constructor(params: SessionEndEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.reason = params.reason;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SessionEndHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SessionEndHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionEndEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SessionEndEventSchema, hookName)) as SessionEndEvent;
		// Get session-env dir from mapping file (Claude Code doesn't source hook files)
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: This is ugly, but fine for now
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new SessionEndHookEvent(parsed, options, env);
		return { event, env };
	}
}

// =============================================================================
// TYPED TOOL INPUTS
// =============================================================================

export * from "./tool-inputs.js";

// =============================================================================
// BRANDED TYPES
// =============================================================================

export * from "./branded-types.js";

// =============================================================================
// COMMAND TYPES
// =============================================================================

export type { EmptyArgs, RunCommandOptions } from "./command-runtime.js";

export {
	CommandArgumentError,
	emptyArgsSchema,
	parseCommandArgs,
	parseRawArgs,
	runCommand,
} from "./command-runtime.js";
export type {
	CommandContext,
	CommandDefinition,
	CommandHandler,
	CommandOutput,
	CommandsMap,
} from "./pipeline.js";

// =============================================================================
// OTEL TELEMETRY
// =============================================================================

export type {
	EnvValidationErrorResult,
	EventData,
	HookExecutionResult,
	MetricData,
	OTELConfig,
	SchemaValidationErrorResult,
	SpanData,
} from "./otel/index.js";
export {
	// Constants
	CLAUDE_ATTRS,
	METRIC_NAMES,
	PLUGIN_ATTRS,
	SPAN_NAMES,
	// Client
	SidecarClient,
	// Events
	emitEnvValidationError,
	emitHookExecution,
	emitSchemaValidationError,
	getSessionEnvDir,
	getSidecarClient,
	instrumentHook,
	instrumentToolHook,
	// Config
	isOTELEnabled,
	parseOTELConfig,
	// Pre-connect
	preconnectTelemetry,
	recordCounter,
	recordGauge,
	recordHistogram,
	recordHookDecision,
	// Metrics
	recordHookExecution,
	withChildSpan,
	// Instrumentation
	withHookSpan,
} from "./otel/index.js";
