/**
 * Unified Pipeline class for hook execution and metrics.
 *
 * @remarks
 * The `Pipeline` class consolidates all pipeline-related functions into a
 * single, discoverable API. This includes hook execution, output validation,
 * type guards, and token/metric utilities.
 *
 * @module
 */

import type { HookDefinition, PipelineHookDefinition, RawHookDefinition } from "./config.js";
import { TokenMetrics } from "./metrics.js";
import type { PipelineConfig, RunRawHandlerOptions } from "./runtime.js";
import type { AnyPipelineOutput } from "./types.js";

/**
 * Pipeline execution and utilities.
 *
 * @remarks
 * The `Pipeline` class provides a single entry point for all pipeline-related
 * operations including hook execution, output validation, and metrics extraction.
 *
 * **Class Organization:**
 *
 * | Category | Methods |
 * |----------|---------|
 * | Execution | `run`, `runRaw`, `handleUnknown` |
 * | Type Guards | `isOutput`, `isPipelineHook`, `isRawHook` |
 * | Metrics | `Metrics.*` (static property) |
 *
 * @example
 * ```typescript
 * import { Pipeline } from "claude-binary-plugin";
 *
 * // Execute a pipeline handler
 * await Pipeline.run({
 *   hookType: "PreToolUse",
 *   hookName: "security",
 *   pipeline: myHandler,
 *   envClass: MyEnv,
 * });
 *
 * // Check if output is valid pipeline format
 * if (Pipeline.isOutput(result)) {
 *   console.log(result.status, result.summary);
 * }
 *
 * // Estimate tokens for context
 * const tokens = Pipeline.Metrics.estimateTokens(content, "code");
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export class Pipeline {
	// Private constructor prevents instantiation
	private constructor() {}

	// =========================================================================
	// EXECUTION
	// =========================================================================

	/**
	 * Execute a pipeline handler.
	 *
	 * @remarks
	 * Main entry point for executing pipeline-style hooks. Handles the full
	 * lifecycle: parsing stdin, loading environment, running the handler,
	 * emitting telemetry, and writing the response.
	 *
	 * @param options - Pipeline execution options
	 * @returns Never (exits process after writing response)
	 *
	 * @example
	 * ```typescript
	 * await Pipeline.run({
	 *   hookType: "PreToolUse",
	 *   hookName: "security",
	 *   pluginName: "my-plugin",
	 *   pluginVersion: "1.0.0",
	 *   pipeline: async ({ input, options, env }) => {
	 *     return { status: "executed", action: "allow", summary: "allowed" };
	 *   },
	 *   envClass: MyEnv,
	 *   tools: ["Bash", "Write"],
	 * });
	 * ```
	 *
	 * @see {@link PipelineConfig}
	 * @public
	 */
	static async run<TOptions = unknown, TState = Record<string, string>>(
		options: PipelineConfig<TOptions, TState>,
	): Promise<never> {
		// Dynamic import to avoid circular dependency
		const { runPipeline } = await import("./runtime.js");
		return runPipeline(options);
	}

	/**
	 * Execute a raw handler.
	 *
	 * @remarks
	 * Entry point for raw handlers that need direct access to the HookEvent
	 * object. Raw handlers are responsible for calling `event.end()` themselves.
	 *
	 * @param options - Raw handler execution options
	 * @returns Never (exits process after handler completes)
	 *
	 * @example
	 * ```typescript
	 * await Pipeline.runRaw({
	 *   hookType: "PreToolUse",
	 *   hookName: "custom",
	 *   handler: async ({ event, options, env }) => {
	 *     event.end(event.response().allow());
	 *   },
	 *   envClass: MyEnv,
	 * });
	 * ```
	 *
	 * @see {@link RunRawHandlerOptions}
	 * @public
	 */
	static async runRaw<TOptions, TState = Record<string, string>>(
		options: RunRawHandlerOptions<TOptions, TState>,
	): Promise<void> {
		// Dynamic import to avoid circular dependency
		const { runRawHandler } = await import("./runtime.js");
		return runRawHandler(options);
	}

	/**
	 * Handle an unknown hook key.
	 *
	 * @remarks
	 * Called when the plugin receives an unrecognized hook key. Emits telemetry,
	 * logs an error, and exits with a passthrough response.
	 *
	 * @param hookKey - The unknown hook key (e.g., "PreToolUse/unknown")
	 * @param validHooks - Array of valid hook keys for error message
	 * @returns Never (exits process)
	 *
	 * @example
	 * ```typescript
	 * if (!validHooks.includes(hookKey)) {
	 *   await Pipeline.handleUnknown(hookKey, validHooks);
	 * }
	 * ```
	 *
	 * @public
	 */
	static async handleUnknown(hookKey: string, validHooks: string[]): Promise<never> {
		// Dynamic import to avoid circular dependency
		const { handleUnknownHook } = await import("./runtime.js");
		return handleUnknownHook(hookKey, validHooks);
	}

	// =========================================================================
	// TYPE GUARDS
	// =========================================================================

	/**
	 * Check if a value is a valid pipeline output.
	 *
	 * @remarks
	 * Type guard that checks for the required `status` and `summary` fields.
	 * Used by the runtime to distinguish pipeline outputs from raw handler returns.
	 *
	 * @param output - Value to check
	 * @returns `true` if output has `status` and `summary` fields
	 *
	 * @example
	 * ```typescript
	 * const result = await handler(context);
	 * if (Pipeline.isOutput(result)) {
	 *   console.log(result.status, result.action);
	 * }
	 * ```
	 *
	 * @public
	 */
	static isOutput(output: unknown): output is AnyPipelineOutput {
		return typeof output === "object" && output !== null && "status" in output && "summary" in output;
	}

	/**
	 * Check if a hook definition uses pipeline mode.
	 *
	 * @remarks
	 * Returns true if the hook has a `pipeline` property, indicating it
	 * returns structured output rather than using raw HookEvent access.
	 *
	 * @param hook - Hook definition to check
	 * @returns `true` if hook uses pipeline mode
	 *
	 * @public
	 */
	static isPipelineHook<TInput, TOutput, TEvent, TOptions, TState = Record<string, string>>(
		hook: HookDefinition<TInput, TOutput, TEvent, TOptions, TState>,
	): hook is PipelineHookDefinition<TInput, TOutput, TOptions> {
		return "pipeline" in hook && hook.pipeline !== undefined;
	}

	/**
	 * Check if a hook definition uses raw handler mode.
	 *
	 * @remarks
	 * Returns true if the hook has a `handler` property, indicating it
	 * receives the full HookEvent object and manages its own response.
	 *
	 * @param hook - Hook definition to check
	 * @returns `true` if hook uses raw handler mode
	 *
	 * @public
	 */
	static isRawHook<TInput, TOutput, TEvent, TOptions, TState = Record<string, string>>(
		hook: HookDefinition<TInput, TOutput, TEvent, TOptions, TState>,
	): hook is RawHookDefinition<TEvent, TOptions, TState> {
		return "handler" in hook && hook.handler !== undefined;
	}

	// =========================================================================
	// METRICS SUB-NAMESPACE
	// =========================================================================

	/**
	 * Token and metric utilities for pipeline telemetry.
	 *
	 * @remarks
	 * The `Metrics` property provides utilities for estimating token counts,
	 * extracting metrics from outputs, and tracking session-level token usage.
	 *
	 * @example
	 * ```typescript
	 * // Estimate tokens
	 * const tokens = Pipeline.Metrics.estimateTokens(code, "code");
	 *
	 * // Extract metrics from output
	 * const metrics = Pipeline.Metrics.extractTokens(output);
	 *
	 * // Track session tokens
	 * const state = Pipeline.Metrics.createSessionState();
	 * Pipeline.Metrics.updateSession(state, tokens, "PreToolUse");
	 * ```
	 *
	 * @public
	 */
	static readonly Metrics = {
		/**
		 * Estimate token count for a string.
		 *
		 * @remarks
		 * Uses content-type-aware heuristics:
		 * - Prose/Markdown: ~4 chars/token
		 * - Code: ~3.5 chars/token
		 * - JSON: ~3 chars/token
		 *
		 * @param text - Text to estimate tokens for
		 * @param contentType - Content type for better accuracy
		 * @returns Estimated token count
		 *
		 * @example
		 * ```typescript
		 * const tokens = Pipeline.Metrics.estimateTokens(sourceCode, "code");
		 * ```
		 *
		 * @public
		 */
		estimateTokens: TokenMetrics.estimate,

		/**
		 * Detect content type from file path or content.
		 *
		 * @param input - Object with file_path and/or content
		 * @returns Detected content type
		 *
		 * @public
		 */
		detectContentType: TokenMetrics.detectContentType,

		/**
		 * Extract token metrics from a pipeline output.
		 *
		 * @remarks
		 * Calculates token counts for claudeContext, userMessage, and reason fields.
		 *
		 * @param output - Pipeline output to analyze
		 * @returns Token metrics object
		 *
		 * @public
		 */
		extractTokens: TokenMetrics.extractFromOutput,

		/**
		 * Extract token metrics from tool use events.
		 *
		 * @remarks
		 * Calculates token counts for tool input/response, including file
		 * operations and bash commands.
		 *
		 * @param event - Event with tool_name and tool_input
		 * @param response - Optional tool response
		 * @returns Token metrics object
		 *
		 * @public
		 */
		extractToolTokens: TokenMetrics.extractFromTool,

		/**
		 * Extract all auto-metrics from an output and event.
		 *
		 * @remarks
		 * Combines token metrics, tool metrics, and quality metrics into
		 * a single metrics object for telemetry.
		 *
		 * @param output - Pipeline output
		 * @param event - Hook event (optional)
		 * @returns Complete metrics object
		 *
		 * @public
		 */
		extractAuto: TokenMetrics.extractAuto,

		/**
		 * Create a new session token tracking state.
		 *
		 * @returns Fresh session token state object
		 *
		 * @public
		 */
		createSessionState: TokenMetrics.createSessionState,

		/**
		 * Update session token state with new tokens.
		 *
		 * @param state - Session state to update
		 * @param tokens - Token metrics to add
		 * @param hookType - Hook type for categorization
		 *
		 * @public
		 */
		updateSession: TokenMetrics.updateSession,

		/**
		 * Get OTEL attributes for session token state.
		 *
		 * @param state - Session token state
		 * @returns Attributes for telemetry
		 *
		 * @public
		 */
		getSessionAttributes: TokenMetrics.getSessionAttributes,

		/**
		 * Default token budget thresholds.
		 *
		 * @public
		 */
		DEFAULT_BUDGET: TokenMetrics.DEFAULT_BUDGET,

		/**
		 * Check if token count exceeds budget thresholds.
		 *
		 * @param current - Current token count
		 * @param budget - Budget configuration
		 * @returns Warning level if threshold exceeded
		 *
		 * @public
		 */
		checkBudget: TokenMetrics.checkBudget,
	} as const;
}
