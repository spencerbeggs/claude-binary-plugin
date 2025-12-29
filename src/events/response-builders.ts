/**
 * Hook response builder classes with fluent API.
 * @module
 */

import type { HookMetrics, HookOutcome, HookResponse } from "./response-types.js";
import { estimateTokenCount } from "./response-types.js";
import type { PermissionRequestDecision, ToolInput } from "./types.js";

/**
 * Base builder for constructing hook responses with a fluent API.
 * @public
 */
export class HookResponseBuilder {
	protected response: HookResponse = {};
	protected _summary: string | undefined;
	protected _outcome: HookOutcome | undefined;
	protected _metrics: HookMetrics = {};
	protected _context: Record<string, string | number | boolean> = {};

	/**
	 * Set a custom summary message for debug logging.
	 * @param message - Short description of what the hook did
	 */
	summary(message: string): this {
		this._summary = message;
		return this;
	}

	/**
	 * Get the summary message for logging.
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
 * Response builder for PreToolUse hooks.
 * @public
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
 * @public
 */
export class PostToolUseResponseBuilder extends HookResponseBuilder {
	/**
	 * Add additional context about the tool result for Claude.
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
 * Response builder for UserPromptSubmit hooks.
 * @public
 */
export class UserPromptSubmitResponseBuilder extends HookResponseBuilder {
	/**
	 * Add additional context for Claude about the user's prompt.
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
 * @public
 */
export class StopResponseBuilder extends HookResponseBuilder {
	/**
	 * Add additional context about why Claude is being blocked.
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
 * @public
 */
export class SessionStartResponseBuilder extends HookResponseBuilder {
	/**
	 * Add context to inject into the session for Claude.
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
