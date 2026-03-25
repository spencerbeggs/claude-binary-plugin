import { extname } from "node:path";
import type { HookDefinition, PipelineHookDefinition, RawHookDefinition } from "../plugin/config.js";
import type {
	ExecutionQuality,
	NotificationPipelineOutput,
	PassthroughPipelineOutput,
	PermissionRequestPipelineOutput,
	PipelineMetrics,
	PostToolUsePipelineOutput,
	PreCompactPipelineOutput,
	PreToolUsePipelineOutput,
	SessionEndPipelineOutput,
	SessionStartPipelineOutput,
	StopPipelineOutput,
	SubagentStopPipelineOutput,
	UserPromptSubmitPipelineOutput,
} from "../schemas/pipeline-outputs.js";

// =============================================================================
// NON-SCHEMA TYPES (from pipeline/types.ts)
// =============================================================================

/**
 * Token metrics automatically calculated by the runtime.
 *
 * @remarks
 * These metrics are extracted from pipeline output fields to track context
 * consumption. Token counts are estimated using a simple heuristic (4 chars = 1 token).
 *
 * The runtime calculates these automatically - hooks don't need to provide them.
 *
 * @see {@link TokenMetrics.extractFromOutput} - Extracts these from pipeline output
 * @public
 */
export interface TokenMetricsData {
	/** Estimated tokens in `claudeContext` field */
	claudeContext: number;
	/** Estimated tokens in `userMessage` field */
	userMessage: number;
	/** Estimated tokens in `reason` field */
	reason: number;
	/** Sum of claudeContext + userMessage + reason */
	hookTotal: number;
	/** Estimated tokens in tool input (PreToolUse only) */
	toolInput?: number;
	/** Estimated tokens in tool response (PostToolUse only) */
	toolResponse?: number;
	/** Estimated tokens in file content (Write tool) */
	fileContent?: number;
}

/**
 * Content type for token estimation accuracy.
 * @public
 */
export type ContentType = "code" | "json" | "markdown" | "prose";

/**
 * Union of all pipeline output types.
 * @public
 */
export type AnyPipelineOutput =
	| PreToolUsePipelineOutput
	| PostToolUsePipelineOutput
	| SessionStartPipelineOutput
	| SessionEndPipelineOutput
	| StopPipelineOutput
	| SubagentStopPipelineOutput
	| UserPromptSubmitPipelineOutput
	| PreCompactPipelineOutput
	| NotificationPipelineOutput
	| PermissionRequestPipelineOutput;

/**
 * Type guard to check if an output uses the pipeline format.
 *
 * @remarks
 * Pipeline outputs are identified by having both `status` and `summary` fields.
 * This guard is used by the runtime to distinguish between pipeline handlers
 * (which return structured outputs) and raw handlers (which return arbitrary data).
 *
 * @param output - The output to check
 * @returns `true` if the output is a pipeline output with `status` and `summary`
 *
 * @example
 * ```typescript
 * const result = await handler(context);
 * if (isPipelineOutput(result)) {
 *   // result is typed as AnyPipelineOutput
 *   console.log(result.status, result.summary);
 * }
 * ```
 *
 * @public
 */
export function isPipelineOutput(output: unknown): output is AnyPipelineOutput {
	return typeof output === "object" && output !== null && "status" in output && "summary" in output;
}

// =============================================================================
// TOKEN BUDGET TYPES
// =============================================================================

/**
 * Session-level token tracking state.
 * @public
 */
export interface SessionTokenState {
	/** Total tokens added to context by all hooks */
	totalContextAdded: number;
	/** Tokens added by each hook (hook name to tokens) */
	byHook: Record<string, number>;
	/** Tokens added by each hook type */
	byType: Record<string, number>;
	/** Largest single context injection */
	largestSingleContext: {
		hook: string;
		tokens: number;
	};
}

/**
 * Token budget configuration.
 * @public
 */
export interface TokenBudget {
	/** Total context window size */
	contextWindow: number;
	/** Warning threshold (0-1) */
	warningThreshold: number;
	/** Critical threshold (0-1) */
	criticalThreshold: number;
}

/**
 * Budget check result.
 * @public
 */
export interface BudgetCheckResult {
	/** Budget level: ok, warning, or critical */
	level: "ok" | "warning" | "critical";
	/** Usage percentage (0-100+) */
	usagePercent: number;
}

// =============================================================================
// TOKEN METRICS CLASS
// =============================================================================

/**
 * Token estimation and metrics extraction utilities.
 *
 * Provides static methods for:
 * - Estimating token counts from text with content-type awareness
 * - Detecting content types from file paths or content
 * - Extracting token metrics from pipeline outputs and tool events
 * - Managing session-level token tracking
 * - Checking token budgets
 *
 * @example
 * ```typescript
 * import { TokenMetrics } from "claude-binary-plugin";
 *
 * // Estimate tokens
 * const tokens = TokenMetrics.estimate(sourceCode, "code");
 *
 * // Extract metrics from output
 * const metrics = TokenMetrics.extractFromOutput(pipelineOutput);
 *
 * // Track session tokens
 * const state = TokenMetrics.createSessionState();
 * TokenMetrics.updateSession(state, "my-hook", "PreToolUse", metrics);
 *
 * // Check budget
 * const budget = TokenMetrics.checkBudget(state.totalContextAdded);
 * if (budget.level === "warning") {
 *   console.warn(`Token usage at ${budget.usagePercent.toFixed(1)}%`);
 * }
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Static class used as public API namespace
export class TokenMetrics {
	/**
	 * Default token budget (200k context window).
	 * @public
	 */
	static readonly DEFAULT_BUDGET: TokenBudget = {
		contextWindow: 200_000,
		warningThreshold: 0.8,
		criticalThreshold: 0.95,
	};

	// =========================================================================
	// TOKEN ESTIMATION
	// =========================================================================

	/**
	 * Estimate token count for a string with content-type awareness.
	 *
	 * @remarks
	 * Uses heuristics based on average characters per token for different content types.
	 * These approximations are based on typical tokenizer behavior:
	 *
	 * | Content Type | Chars/Token | Reason |
	 * |--------------|-------------|--------|
	 * | Prose | ~4 | Standard English text |
	 * | Markdown | ~4 | Similar to prose |
	 * | Code | ~3.5 | More symbols, shorter identifiers |
	 * | JSON | ~3 | Heavy punctuation and structure |
	 *
	 * Note: Actual token counts vary by model and tokenizer. These are estimates
	 * for planning and monitoring purposes.
	 *
	 * @param text - Text to estimate tokens for (null/undefined returns 0)
	 * @param contentType - Optional content type for better accuracy
	 * @returns Estimated token count
	 *
	 * @example
	 * ```typescript
	 * const codeTokens = TokenMetrics.estimate(sourceCode, "code");
	 * const jsonTokens = TokenMetrics.estimate(configJson, "json");
	 * const textTokens = TokenMetrics.estimate(documentation); // defaults to prose
	 * ```
	 */
	static estimate(text: string | undefined | null, contentType?: ContentType): number {
		if (!text) return 0;

		switch (contentType) {
			case "code":
				return Math.ceil(text.length / 3.5);
			case "json":
				return Math.ceil(text.length / 3);
			case "markdown":
			case "prose":
				return Math.ceil(text.length / 4);
			default:
				return Math.ceil(text.length / 4);
		}
	}

	/**
	 * Detect content type from file path or content.
	 *
	 * @param input - Object containing file_path and/or content
	 * @returns Detected content type
	 *
	 * @example
	 * ```typescript
	 * TokenMetrics.detectContentType({ file_path: "src/index.ts" }); // "code"
	 * TokenMetrics.detectContentType({ file_path: "README.md" }); // "markdown"
	 * TokenMetrics.detectContentType({ content: '{"key": "value"}' }); // "json"
	 * ```
	 */
	static detectContentType(input: { file_path?: string; content?: string }): ContentType {
		// Check file extension first
		if (input.file_path) {
			const ext = extname(input.file_path).toLowerCase();

			// Code files
			if (
				[
					".ts",
					".tsx",
					".js",
					".jsx",
					".py",
					".go",
					".rs",
					".java",
					".c",
					".cpp",
					".h",
					".rb",
					".php",
					".swift",
				].includes(ext)
			) {
				return "code";
			}

			// JSON files
			if ([".json", ".jsonc", ".json5"].includes(ext)) {
				return "json";
			}

			// Markdown files
			if ([".md", ".mdx", ".markdown"].includes(ext)) {
				return "markdown";
			}

			// Shell scripts
			if ([".sh", ".bash", ".zsh", ".fish"].includes(ext)) {
				return "code";
			}

			// Config files (often JSON-like or code-like)
			if ([".yaml", ".yml", ".toml", ".ini", ".conf"].includes(ext)) {
				return "code";
			}
		}

		// Heuristic: if content starts with { or [, likely JSON
		if (input.content?.trimStart().match(/^[[{]/)) {
			return "json";
		}

		// Default to prose
		return "prose";
	}

	// =========================================================================
	// METRICS EXTRACTION
	// =========================================================================

	/**
	 * Extract token metrics from pipeline output.
	 *
	 * @param output - Pipeline output object
	 * @returns Token metrics with claudeContext, userMessage, reason, and hookTotal
	 *
	 * @example
	 * ```typescript
	 * const metrics = TokenMetrics.extractFromOutput(output);
	 * console.log(`Hook added ${metrics.hookTotal} tokens`);
	 * ```
	 */
	static extractFromOutput(output: AnyPipelineOutput): TokenMetricsData {
		const claudeContext = TokenMetrics.estimate("claudeContext" in output ? output.claudeContext : undefined);
		const userMessage = TokenMetrics.estimate("userMessage" in output ? output.userMessage : undefined);
		const reason = TokenMetrics.estimate("reason" in output ? output.reason : undefined);

		return {
			claudeContext,
			userMessage,
			reason,
			hookTotal: claudeContext + userMessage + reason,
		};
	}

	/**
	 * Extract token metrics from tool event.
	 *
	 * @param event - Hook event with tool_input and/or tool_response
	 * @returns Partial token metrics for tool-related fields
	 *
	 * @example
	 * ```typescript
	 * const toolMetrics = TokenMetrics.extractFromTool({
	 *   tool_input: { command: "ls -la" },
	 *   tool_response: "file1.txt\nfile2.txt"
	 * });
	 * ```
	 */
	static extractFromTool(event: {
		tool_input?: Record<string, unknown>;
		tool_response?: unknown;
	}): Pick<TokenMetricsData, "toolInput" | "toolResponse" | "fileContent"> {
		const result: Pick<TokenMetricsData, "toolInput" | "toolResponse" | "fileContent"> = {};

		if (event.tool_input) {
			const contentType = TokenMetrics.detectContentType(event.tool_input as { file_path?: string; content?: string });

			// File content (Write tool)
			const content = event.tool_input.content;
			if (typeof content === "string") {
				result.fileContent = TokenMetrics.estimate(content, contentType);
			}

			// Full tool input
			const inputJson = JSON.stringify(event.tool_input);
			result.toolInput = TokenMetrics.estimate(inputJson, "json");
		}

		if (event.tool_response !== undefined) {
			const responseStr =
				typeof event.tool_response === "string" ? event.tool_response : JSON.stringify(event.tool_response);
			result.toolResponse = TokenMetrics.estimate(responseStr);
		}

		return result;
	}

	/**
	 * Extract auto-instrumented OTEL attributes from a pipeline execution.
	 *
	 * @remarks
	 * This function extracts comprehensive telemetry attributes from hook execution
	 * for OTEL export. Attributes are organized into categories:
	 *
	 * - **Core**: hook.name, hook.type, hook.status, hook.action, hook.duration_ms
	 * - **Tool**: tool.name, tool.use_id, tool.input_size_bytes, file.path
	 * - **Tokens**: tokens.claude_context, tokens.user_message, tokens.hook_total
	 * - **Response**: response.has_claude_context, response.input_modified
	 * - **Validation**: validation.result, validation.issues_found
	 * - **Quality**: quality.degraded, quality.partial, quality.fallback
	 *
	 * Called automatically by the pipeline runtime after each hook execution.
	 *
	 * @param hookType - Type of hook (PreToolUse, PostToolUse, etc.)
	 * @param hookName - Name of the hook (from hook definition)
	 * @param pluginName - Name of the plugin (from plugin config)
	 * @param event - Hook event object containing session_id, tool_input, etc.
	 * @param output - Pipeline output returned by the handler
	 * @param durationMs - Execution duration in milliseconds
	 * @returns OTEL attributes record for telemetry export
	 *
	 * @internal
	 */
	static extractAuto(
		hookType: string,
		hookName: string,
		pluginName: string,
		event: Record<string, unknown>,
		output: AnyPipelineOutput,
		durationMs: number,
	): Record<string, string | number | boolean | undefined> {
		const attrs: Record<string, string | number | boolean | undefined> = {
			// ─────────────────────────────────────────────────────────────────────
			// Always available
			// ─────────────────────────────────────────────────────────────────────
			"hook.duration_ms": durationMs,
			"hook.name": hookName,
			"hook.type": hookType,
			"hook.status": output.status,
			"hook.summary": output.summary,
			"plugin.name": pluginName,
		};

		// Action (only for executed status)
		if ("action" in output && output.action) {
			attrs["hook.action"] = output.action;
		}

		// Session ID
		if ("session_id" in event && typeof event.session_id === "string") {
			attrs["session.id"] = event.session_id;
		}

		// ─────────────────────────────────────────────────────────────────────────
		// Tool-specific metrics
		// ─────────────────────────────────────────────────────────────────────────
		if ("tool_name" in event && typeof event.tool_name === "string") {
			attrs["tool.name"] = event.tool_name;

			if ("tool_use_id" in event && typeof event.tool_use_id === "string") {
				attrs["tool.use_id"] = event.tool_use_id;
			}

			const toolInput = event.tool_input as Record<string, unknown> | undefined;
			if (toolInput) {
				const inputJson = JSON.stringify(toolInput);
				attrs["tool.input_size_bytes"] = inputJson.length;
				attrs["tool.input_key_count"] = Object.keys(toolInput).length;

				// File operations
				if (typeof toolInput.file_path === "string") {
					attrs["file.path"] = toolInput.file_path;
					attrs["file.extension"] = extname(toolInput.file_path);
				}
				if (typeof toolInput.content === "string") {
					attrs["file.content_size_bytes"] = toolInput.content.length;
				}

				// Bash commands
				if (event.tool_name === "Bash") {
					if (typeof toolInput.command === "string") {
						const firstWord = toolInput.command.split(/\s+/)[0];
						if (firstWord) {
							attrs["bash.command_prefix"] = firstWord;
						}
					}
					if (typeof toolInput.run_in_background === "boolean") {
						attrs["bash.is_background"] = toolInput.run_in_background;
					}
					if (typeof toolInput.timeout === "number") {
						attrs["bash.timeout_ms"] = toolInput.timeout;
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────────────────────────
		// Token metrics
		// ─────────────────────────────────────────────────────────────────────────
		const tokenMetrics = TokenMetrics.extractFromOutput(output);
		if (tokenMetrics.claudeContext > 0) {
			attrs["tokens.claude_context"] = tokenMetrics.claudeContext;
		}
		if (tokenMetrics.userMessage > 0) {
			attrs["tokens.user_message"] = tokenMetrics.userMessage;
		}
		if (tokenMetrics.reason > 0) {
			attrs["tokens.reason"] = tokenMetrics.reason;
		}
		if (tokenMetrics.hookTotal > 0) {
			attrs["tokens.hook_total"] = tokenMetrics.hookTotal;
		}

		// Tool token metrics
		const toolTokens = TokenMetrics.extractFromTool(
			event as { tool_input?: Record<string, unknown>; tool_response?: unknown },
		);
		if (toolTokens.toolInput !== undefined) {
			attrs["tokens.tool_input"] = toolTokens.toolInput;
		}
		if (toolTokens.toolResponse !== undefined) {
			attrs["tokens.tool_response"] = toolTokens.toolResponse;
		}
		if (toolTokens.fileContent !== undefined) {
			attrs["tokens.file_content"] = toolTokens.fileContent;
		}

		// ─────────────────────────────────────────────────────────────────────────
		// Response metrics
		// ─────────────────────────────────────────────────────────────────────────
		if ("claudeContext" in output && output.claudeContext) {
			attrs["response.has_claude_context"] = true;
		}
		if ("userMessage" in output && output.userMessage) {
			attrs["response.has_user_message"] = true;
		}
		if ("updatedInput" in output && output.updatedInput) {
			attrs["response.input_modified"] = true;
		}

		// ─────────────────────────────────────────────────────────────────────────
		// Validation metrics
		// ─────────────────────────────────────────────────────────────────────────
		if ("validation" in output && output.validation) {
			attrs["validation.result"] = output.validation;
		}

		// User-provided metrics
		if ("metrics" in output && output.metrics) {
			const m = output.metrics as PipelineMetrics;
			if (m.issuesFound !== undefined) attrs["validation.issues_found"] = m.issuesFound;
			if (m.issuesFixed !== undefined) attrs["validation.issues_fixed"] = m.issuesFixed;
			if (m.filesScanned !== undefined) attrs["validation.files_scanned"] = m.filesScanned;
			if (m.filesWithErrors !== undefined) attrs["validation.files_with_errors"] = m.filesWithErrors;
			if (m.cacheHit !== undefined) attrs["quality.cache_hit"] = m.cacheHit;
		}

		// ─────────────────────────────────────────────────────────────────────────
		// Quality metrics
		// ─────────────────────────────────────────────────────────────────────────
		if ("quality" in output && output.quality) {
			const q = output.quality as ExecutionQuality;
			if (q.degraded) {
				attrs["quality.degraded"] = true;
				if (q.degradedReason) {
					attrs["quality.degraded_reason"] = q.degradedReason;
				}
			}
			if (q.partial) attrs["quality.partial"] = true;
			if (q.fallback) attrs["quality.fallback"] = true;
		}

		return attrs;
	}

	// =========================================================================
	// SESSION TOKEN TRACKING
	// =========================================================================

	/**
	 * Create initial session token state.
	 *
	 * @returns Fresh session token state object
	 *
	 * @example
	 * ```typescript
	 * const state = TokenMetrics.createSessionState();
	 * ```
	 */
	static createSessionState(): SessionTokenState {
		return {
			totalContextAdded: 0,
			byHook: {},
			byType: {},
			largestSingleContext: { hook: "", tokens: 0 },
		};
	}

	/**
	 * Update session token state with metrics from a hook execution.
	 *
	 * @param state - Current session token state (mutated in place)
	 * @param hookName - Name of the hook
	 * @param hookType - Type of the hook
	 * @param tokens - Token metrics from the hook
	 *
	 * @example
	 * ```typescript
	 * const state = TokenMetrics.createSessionState();
	 * TokenMetrics.updateSession(state, "my-hook", "PreToolUse", metrics);
	 * ```
	 */
	static updateSession(state: SessionTokenState, hookName: string, hookType: string, tokens: TokenMetricsData): void {
		state.totalContextAdded += tokens.hookTotal;
		state.byHook[hookName] = (state.byHook[hookName] ?? 0) + tokens.hookTotal;
		state.byType[hookType] = (state.byType[hookType] ?? 0) + tokens.hookTotal;

		if (tokens.hookTotal > state.largestSingleContext.tokens) {
			state.largestSingleContext = { hook: hookName, tokens: tokens.hookTotal };
		}
	}

	/**
	 * Get OTEL attributes for session-level token metrics.
	 *
	 * @param state - Session token state
	 * @returns OTEL attributes for session metrics
	 *
	 * @example
	 * ```typescript
	 * const attrs = TokenMetrics.getSessionAttributes(state);
	 * // { "session.tokens.total_context_added": 1500, ... }
	 * ```
	 *
	 * @internal
	 */
	static getSessionAttributes(state: SessionTokenState): Record<string, string | number | boolean | undefined> {
		const attrs: Record<string, string | number | boolean | undefined> = {
			"session.tokens.total_context_added": state.totalContextAdded,
		};

		if (state.largestSingleContext.tokens > 0) {
			attrs["session.tokens.largest_single_context"] = state.largestSingleContext.tokens;
			attrs["session.tokens.largest_context_hook"] = state.largestSingleContext.hook;
		}

		// Add per-type breakdowns
		for (const [type, tokens] of Object.entries(state.byType)) {
			attrs[`session.tokens.by_type.${type}`] = tokens;
		}

		return attrs;
	}

	// =========================================================================
	// TOKEN BUDGET
	// =========================================================================

	/**
	 * Check token budget status.
	 *
	 * @param contextAdded - Total tokens added to context
	 * @param budget - Token budget configuration (defaults to 200k context window)
	 * @returns Budget status with level and usage percentage
	 *
	 * @example
	 * ```typescript
	 * const result = TokenMetrics.checkBudget(150_000);
	 * if (result.level === "warning") {
	 *   console.warn(`Token usage at ${result.usagePercent.toFixed(1)}%`);
	 * }
	 * ```
	 */
	static checkBudget(contextAdded: number, budget: TokenBudget = TokenMetrics.DEFAULT_BUDGET): BudgetCheckResult {
		const usagePercent = (contextAdded / budget.contextWindow) * 100;

		if (contextAdded / budget.contextWindow >= budget.criticalThreshold) {
			return { level: "critical", usagePercent };
		}
		if (contextAdded / budget.contextWindow >= budget.warningThreshold) {
			return { level: "warning", usagePercent };
		}
		return { level: "ok", usagePercent };
	}
}

// =============================================================================
// PIPELINE CLASS
// =============================================================================

/**
 * Pipeline utilities for type guards and metrics.
 *
 * @remarks
 * The `Pipeline` class provides a single entry point for pipeline-related
 * utilities including type guards and metrics extraction.
 *
 * **Class Organization:**
 *
 * | Category | Methods |
 * |----------|---------|
 * | Type Guards | `isOutput`, `isPipelineHook`, `isRawHook` |
 * | Metrics | `Metrics.*` (static property) |
 *
 * For execution methods (`run`, `runRaw`, `handleUnknown`), see {@link PipelineRuntime}.
 *
 * @example
 * ```typescript
 * import { Pipeline, PipelineRuntime } from "claude-binary-plugin";
 *
 * // Check if output is valid pipeline format
 * if (Pipeline.isOutput(result)) {
 *   console.log(result.status, result.action);
 * }
 *
 * // Estimate tokens for context
 * const tokens = Pipeline.Metrics.estimateTokens(content, "code");
 *
 * // Execute a pipeline handler (use PipelineRuntime)
 * await PipelineRuntime.run({ ... });
 * ```
 *
 * @see {@link PipelineRuntime} - For hook execution
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export class Pipeline {
	// Private constructor prevents instantiation
	private constructor() {}

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
		return isPipelineOutput(output);
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
