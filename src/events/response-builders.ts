/**
 * Fluent response builders for constructing Claude Code hook responses.
 *
 * This module provides builder classes that make it easy to construct properly
 * formatted responses for each hook type. Each builder uses the fluent pattern,
 * allowing method chaining for a clean, readable API.
 *
 * @remarks
 * Response builders are used with the {@link HookEvent.end} method to send
 * responses back to Claude Code. Each hook type has a specialized builder
 * that provides type-safe methods for that hook's capabilities.
 *
 * For pipeline-based development, you typically don't use these builders
 * directly - the pipeline runtime handles response construction based on
 * your handler's output. These builders are primarily for raw handler
 * development.
 *
 * @example
 * ```typescript
 * // PreToolUse - Allow a tool call
 * event.end(event.response().allow());
 *
 * // PreToolUse - Deny with reason
 * event.end(event.response().deny("rm -rf not permitted"));
 *
 * // PostToolUse - Add context for Claude
 * event.end(event.response().additionalContext("File was modified successfully"));
 *
 * // SessionStart - Inject project context
 * event.end(event.response().additionalContext("# Project uses TypeScript"));
 *
 * // Stop - Block Claude from stopping
 * event.end(event.response().block("Tests must pass before stopping"));
 * ```
 *
 * @see {@link HookEvent.response} - Creates the appropriate builder for each event type
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @module
 */

import type { HookMetrics, HookOutcome, HookResponse } from "./response-types.js";
import { estimateTokenCount } from "./response-types.js";
import type { PermissionRequestDecision, ToolInput } from "./types.js";

/**
 * Base builder for constructing hook responses with a fluent API.
 *
 * @remarks
 * HookResponseBuilder provides the core response construction functionality
 * that all specialized builders inherit. It includes:
 *
 * - **Response data**: The actual response sent to Claude Code
 * - **Summary**: Human-readable description for logs
 * - **Outcome**: Semantic classification for telemetry
 * - **Metrics**: Operational metrics for observability
 * - **Context**: Key-value pairs for telemetry attributes
 *
 * Methods return `this` to enable fluent chaining. Call `toJSON()`
 * or `build()` to get the final response.
 *
 * @example
 * ```typescript
 * // Chain multiple methods
 * const response = new HookResponseBuilder()
 *   .summary("processed tool call")
 *   .outcome("allowed")
 *   .metrics({ durationMs: 15 })
 *   .context({ toolName: "Bash" })
 *   .continue(true);
 *
 * // Get JSON for stdout
 * const json = response.toJSON();
 * ```
 *
 * @see {@link PreToolUseResponseBuilder} - Specialized for PreToolUse hooks
 * @see {@link PostToolUseResponseBuilder} - Specialized for PostToolUse hooks
 * @see {@link SessionStartResponseBuilder} - Specialized for SessionStart hooks
 * @public
 */
export class HookResponseBuilder {
	/**
	 * The response object being built.
	 * @internal
	 */
	protected response: HookResponse = {};
	/**
	 * Custom summary message for logging.
	 * @internal
	 */
	protected _summary: string | undefined;
	/**
	 * Semantic outcome for telemetry classification.
	 * @internal
	 */
	protected _outcome: HookOutcome | undefined;
	/**
	 * Operational metrics for telemetry.
	 * @internal
	 */
	protected _metrics: HookMetrics = {};
	/**
	 * Key-value context for telemetry attributes.
	 * @internal
	 */
	protected _context: Record<string, string | number | boolean> = {};

	/**
	 * Sets a custom summary message for debug logging.
	 *
	 * @param message - Short description of what the hook did
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * The summary appears in debug logs and helps identify what the hook did.
	 * Keep it concise (under 50 characters is ideal).
	 *
	 * @example
	 * ```typescript
	 * builder.summary("blocked dangerous command");
	 * ```
	 * @public
	 */
	summary(message: string): this {
		this._summary = message;
		return this;
	}

	/**
	 * Gets the summary message for logging.
	 *
	 * @returns The custom summary or an auto-generated one based on response content
	 *
	 * @remarks
	 * If no custom summary was set, generates one based on the response:
	 * - Permission decisions: "allowed", "denied: reason", "ask user"
	 * - Block decisions: "blocked: reason"
	 * - Stop decisions: "stopped: reason"
	 * - Context additions: "context: first 50 chars..."
	 * - Default: "completed"
	 * @public
	 */
	getSummary(): string {
		if (this._summary) {
			return this._summary;
		}
		const parts: string[] = [];
		const hookOutput = this.response.hookSpecificOutput as Record<string, unknown> | undefined;

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
		} else if (this.response.decision === "block") {
			parts.push(`blocked: ${this.response.reason || "no reason"}`);
		} else if (this.response.continue === false) {
			parts.push(this.response.stopReason ? `stopped: ${this.response.stopReason}` : "stopped");
		} else if (hookOutput?.additionalContext) {
			const ctx = hookOutput.additionalContext as string;
			parts.push(`context: ${ctx.slice(0, 50)}${ctx.length > 50 ? "..." : ""}`);
		} else {
			parts.push("completed");
		}

		return parts.join(", ");
	}

	/**
	 * Get the additional context from the response, if any.
	 */
	getAdditionalContext(): string | undefined {
		const hookOutput = this.response.hookSpecificOutput as Record<string, unknown> | undefined;
		return hookOutput?.additionalContext as string | undefined;
	}

	/**
	 * Get telemetry-relevant data from the response.
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
	 */
	metrics(metrics: HookMetrics): this {
		this._metrics = { ...this._metrics, ...metrics };
		return this;
	}

	/**
	 * Set a single metric value.
	 */
	metric(key: string, value: number): this {
		this._metrics[key] = value;
		return this;
	}

	/**
	 * Set hook-specific context for telemetry.
	 */
	context(context: Record<string, string | number | boolean>): this {
		this._context = { ...this._context, ...context };
		return this;
	}

	/**
	 * Set whether Claude should continue after this hook.
	 */
	continue(value: boolean = true): this {
		this.response.continue = value;
		return this;
	}

	/**
	 * Stop Claude with a reason message.
	 */
	stop(reason: string): this {
		this.response.continue = false;
		this.response.stopReason = reason;
		return this;
	}

	/**
	 * Hide the hook's stdout from the transcript.
	 */
	suppressOutput(value: boolean = true): this {
		this.response.suppressOutput = value;
		return this;
	}

	/**
	 * Add a warning message shown to the user.
	 */
	systemMessage(message: string): this {
		this.response.systemMessage = message;
		return this;
	}

	/**
	 * Set raw hook-specific output data.
	 */
	hookSpecificOutput(output: Record<string, unknown>): this {
		this.response.hookSpecificOutput = output;
		return this;
	}

	/**
	 * Block the current operation with a reason.
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
 * Response builder for PreToolUse hooks with permission control methods.
 *
 * @remarks
 * PreToolUseResponseBuilder provides methods for the three permission decisions
 * available in PreToolUse hooks:
 *
 * - `allow()` - Permit the tool call to proceed
 * - `deny()` - Block the tool call with a reason
 * - `ask()` - Defer to the user for interactive permission
 *
 * Additionally, `updateInput()` allows modifying the tool input before
 * execution (useful for sanitizing or augmenting parameters).
 *
 * @example
 * ```typescript
 * // Allow a tool call
 * event.end(event.response().allow());
 *
 * // Deny with explanation
 * event.end(event.response().deny("rm -rf is not permitted"));
 *
 * // Modify input before allowing
 * event.end(event.response().updateInput({
 *   ...input.tool_input,
 *   timeout: 30000  // Add timeout
 * }).allow());
 * ```
 *
 * @see {@link PreToolUseHookEvent} - The event type this builder is used with
 * @see {@link PreToolUsePipelineOutput} - Pipeline output equivalent
 * @public
 */
export class PreToolUseResponseBuilder extends HookResponseBuilder {
	/**
	 * Allows the tool call to proceed unchanged.
	 *
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * Use this when the hook has validated the tool call and it should proceed.
	 * This is the most common response for PreToolUse hooks.
	 * @public
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
	 * Denies the tool call with an optional reason.
	 *
	 * @param reason - Explanation shown to Claude explaining why the tool was blocked
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * The reason is shown to Claude so it can understand why the operation
	 * was blocked and potentially try a different approach.
	 * @public
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
	 * Defers the permission decision to the user.
	 *
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * The user will see the standard permission dialog and can choose
	 * to allow or deny the operation interactively.
	 * @public
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
	 * Modifies the tool input before execution.
	 *
	 * @param input - The modified tool input to use instead of the original
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * Use this to sanitize, augment, or modify tool parameters before the
	 * tool executes. The modified input replaces the original.
	 *
	 * @example
	 * ```typescript
	 * // Add a timeout to Bash commands
	 * builder.updateInput({
	 *   ...event.tool_input,
	 *   timeout: 30000
	 * });
	 * ```
	 * @public
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
 * Response builder for PostToolUse hooks with context injection methods.
 *
 * @remarks
 * PostToolUseResponseBuilder allows hooks to add context to Claude after
 * a tool has completed. This is useful for providing additional information
 * about the tool result, such as explanations, warnings, or related context.
 *
 * @example
 * ```typescript
 * // Add context about the tool result
 * event.end(
 *   event.response()
 *     .additionalContext("Note: This file was auto-formatted by Prettier")
 * );
 * ```
 *
 * @see {@link PostToolUseHookEvent} - The event type this builder is used with
 * @see {@link PostToolUsePipelineOutput} - Pipeline output equivalent
 * @public
 */
export class PostToolUseResponseBuilder extends HookResponseBuilder {
	/**
	 * Adds additional context about the tool result for Claude.
	 *
	 * @param context - Markdown-formatted context to show Claude
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * The context is shown to Claude after the tool result. Use markdown
	 * formatting for better readability.
	 * @public
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
 * Response builder for PermissionRequest hooks with permission automation.
 *
 * @remarks
 * PermissionRequestResponseBuilder handles responses to Claude Code's
 * permission dialogs. It can automatically allow or deny permissions,
 * optionally with a custom message or modified input.
 *
 * @example
 * ```typescript
 * // Auto-allow git operations
 * event.end(event.response().allow());
 *
 * // Deny with message
 * event.end(event.response().deny("Operation not permitted").interrupt());
 * ```
 *
 * @see {@link PermissionRequestHookEvent} - The event type this builder is used with
 * @see {@link PermissionRequestPipelineOutput} - Pipeline output equivalent
 * @public
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
 * Response builder for UserPromptSubmit hooks with context injection.
 *
 * @remarks
 * UserPromptSubmitResponseBuilder allows hooks to add context for Claude
 * when a user submits a prompt. This context is shown to Claude before
 * it begins processing the user's request.
 *
 * @example
 * ```typescript
 * // Add project context when user mentions deploy
 * event.end(
 *   event.response()
 *     .additionalContext("Current branch: main\nLast deploy: 2 hours ago")
 * );
 * ```
 *
 * @see {@link UserPromptSubmitHookEvent} - The event type this builder is used with
 * @see {@link UserPromptSubmitPipelineOutput} - Pipeline output equivalent
 * @public
 */
export class UserPromptSubmitResponseBuilder extends HookResponseBuilder {
	/**
	 * Adds additional context for Claude about the user's prompt.
	 *
	 * @param context - Markdown-formatted context to show Claude
	 * @returns `this` for method chaining
	 * @public
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
 * Response builder for Stop and SubagentStop hooks with blocking control.
 *
 * @remarks
 * StopResponseBuilder is used for both {@link StopHookEvent} (main agent)
 * and {@link SubagentStopHookEvent} (subagents). It allows hooks to block
 * Claude from stopping and provide context about why.
 *
 * Use the inherited `block()` method to prevent stopping.
 *
 * @example
 * ```typescript
 * // Block stopping until tests pass
 * event.end(
 *   event.response()
 *     .block("Tests must pass before stopping")
 *     .additionalContext("3 tests are still failing")
 * );
 *
 * // Allow stopping
 * event.end(event.response().continue());
 * ```
 *
 * @see {@link StopHookEvent} - Main agent stop event
 * @see {@link SubagentStopHookEvent} - Subagent stop event
 * @see {@link StopPipelineOutput} - Pipeline output equivalent
 * @public
 */
export class StopResponseBuilder extends HookResponseBuilder {
	/**
	 * Adds additional context about why Claude is being blocked.
	 *
	 * @param context - Explanation for Claude about why it cannot stop
	 * @returns `this` for method chaining
	 * @public
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
 * Response builder for SessionStart hooks with context injection.
 *
 * @remarks
 * SessionStartResponseBuilder allows hooks to inject context at the start
 * of a Claude Code session. This context is shown to Claude before it
 * begins processing any user requests.
 *
 * This is the primary mechanism for providing project-specific information
 * like coding standards, available tools, or environment details.
 *
 * @example
 * ```typescript
 * // Inject project context at session start
 * event.end(
 *   event.response()
 *     .additionalContext([
 *       "# Project: my-app",
 *       "Package manager: bun",
 *       "Testing: bun:test",
 *       "Linting: biome"
 *     ].join("\n"))
 * );
 * ```
 *
 * @see {@link SessionStartHookEvent} - The event type this builder is used with
 * @see {@link SessionStartPipelineOutput} - Pipeline output equivalent
 * @public
 */
export class SessionStartResponseBuilder extends HookResponseBuilder {
	/**
	 * Adds context to inject into the session for Claude.
	 *
	 * @param context - Markdown-formatted context shown to Claude at session start
	 * @returns `this` for method chaining
	 *
	 * @remarks
	 * Use markdown formatting for better readability. The context appears
	 * in Claude's initial context window.
	 * @public
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
