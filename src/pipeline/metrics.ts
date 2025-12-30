/**
 * Auto-instrumentation utilities for pipeline telemetry.
 *
 * @remarks
 * This module provides automatic metric extraction and token estimation for
 * pipeline outputs. It enables observability without requiring hooks to
 * manually calculate metrics.
 *
 * **Token Estimation:**
 * Uses content-type-aware heuristics for more accurate estimates:
 * - Prose/Markdown: ~4 chars/token
 * - Code: ~3.5 chars/token (more symbols)
 * - JSON: ~3 chars/token (heavy punctuation)
 *
 * **Auto-Extracted Metrics:**
 * - Token counts for claudeContext, userMessage, reason
 * - Tool input/response sizes
 * - File operation details (path, extension, content size)
 * - Bash command prefixes and flags
 *
 * **Session Tracking:**
 * Aggregate token tracking across all hooks in a session to monitor
 * context consumption and warn when approaching budget limits.
 *
 * @example
 * ```typescript
 * import { estimateTokenCount, extractTokenMetrics } from "claude-binary-plugin";
 *
 * const tokens = estimateTokenCount(largeCodeBlock, "code");
 * const metrics = extractTokenMetrics(pipelineOutput);
 * console.log(`Hook added ${metrics.hookTotal} tokens to context`);
 * ```
 *
 * @see {@link extractAutoMetrics} - Main metric extraction function
 * @see {@link TokenMetrics} - Token metric interface
 * @see {@link checkTokenBudget} - Budget threshold checking
 * @module
 */

import { extname } from "node:path";
import type { AnyPipelineOutput, ContentType, ExecutionQuality, PipelineMetrics, TokenMetrics } from "./types.js";

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

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
 * const codeTokens = estimateTokenCount(sourceCode, "code");
 * const jsonTokens = estimateTokenCount(configJson, "json");
 * const textTokens = estimateTokenCount(documentation); // defaults to prose
 * ```
 *
 * @public
 */
export function estimateTokenCount(text: string | undefined | null, contentType?: ContentType): number {
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
 * @public
 */
export function detectContentType(input: { file_path?: string; content?: string }): ContentType {
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

// =============================================================================
// TOKEN METRICS EXTRACTION
// =============================================================================

/**
 * Extract token metrics from pipeline output.
 *
 * @param output - Pipeline output object
 * @returns Token metrics
 * @public
 */
export function extractTokenMetrics(output: AnyPipelineOutput): TokenMetrics {
	const claudeContext = estimateTokenCount("claudeContext" in output ? output.claudeContext : undefined);
	const userMessage = estimateTokenCount("userMessage" in output ? output.userMessage : undefined);
	const reason = estimateTokenCount("reason" in output ? output.reason : undefined);

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
 * @public
 */
export function extractToolTokenMetrics(event: {
	tool_input?: Record<string, unknown>;
	tool_response?: unknown;
}): Pick<TokenMetrics, "toolInput" | "toolResponse" | "fileContent"> {
	const result: Pick<TokenMetrics, "toolInput" | "toolResponse" | "fileContent"> = {};

	if (event.tool_input) {
		const contentType = detectContentType(event.tool_input as { file_path?: string; content?: string });

		// File content (Write tool)
		const content = event.tool_input.content;
		if (typeof content === "string") {
			result.fileContent = estimateTokenCount(content, contentType);
		}

		// Full tool input
		const inputJson = JSON.stringify(event.tool_input);
		result.toolInput = estimateTokenCount(inputJson, "json");
	}

	if (event.tool_response !== undefined) {
		const responseStr =
			typeof event.tool_response === "string" ? event.tool_response : JSON.stringify(event.tool_response);
		result.toolResponse = estimateTokenCount(responseStr);
	}

	return result;
}

// =============================================================================
// OTEL ATTRIBUTES
// =============================================================================

/**
 * OTEL attribute record type.
 * @public
 */
export type OtelAttributes = Record<string, string | number | boolean | undefined>;

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
 * @public
 */
export function extractAutoMetrics(
	hookType: string,
	hookName: string,
	pluginName: string,
	event: Record<string, unknown>,
	output: AnyPipelineOutput,
	durationMs: number,
): OtelAttributes {
	const attrs: OtelAttributes = {
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
	const tokenMetrics = extractTokenMetrics(output);
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
	const toolTokens = extractToolTokenMetrics(
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

// =============================================================================
// SESSION TOKEN TRACKING
// =============================================================================

/**
 * Session-level token tracking state.
 * @public
 */
export interface SessionTokenState {
	/** Total tokens added to context by all hooks */
	totalContextAdded: number;
	/** Tokens added by each hook (hook name -> tokens) */
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
 * Create initial session token state.
 * @public
 */
export function createSessionTokenState(): SessionTokenState {
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
 * @param state - Current session token state
 * @param hookName - Name of the hook
 * @param hookType - Type of the hook
 * @param tokens - Token metrics from the hook
 * @public
 */
export function updateSessionTokens(
	state: SessionTokenState,
	hookName: string,
	hookType: string,
	tokens: TokenMetrics,
): void {
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
 * @public
 */
export function getSessionTokenAttributes(state: SessionTokenState): OtelAttributes {
	const attrs: OtelAttributes = {
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

// =============================================================================
// TOKEN BUDGET
// =============================================================================

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
 * Default token budget (200k context window).
 * @public
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
	contextWindow: 200_000,
	warningThreshold: 0.8,
	criticalThreshold: 0.95,
};

/**
 * Check token budget status.
 *
 * @param contextAdded - Total tokens added to context
 * @param budget - Token budget configuration
 * @returns Budget status with level and usage percentage
 * @public
 */
export function checkTokenBudget(
	contextAdded: number,
	budget: TokenBudget = DEFAULT_TOKEN_BUDGET,
): { level: "ok" | "warning" | "critical"; usagePercent: number } {
	const usagePercent = (contextAdded / budget.contextWindow) * 100;

	if (contextAdded / budget.contextWindow >= budget.criticalThreshold) {
		return { level: "critical", usagePercent };
	}
	if (contextAdded / budget.contextWindow >= budget.warningThreshold) {
		return { level: "warning", usagePercent };
	}
	return { level: "ok", usagePercent };
}
