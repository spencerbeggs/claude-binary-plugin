/**
 * Unified telemetry API for Claude Code plugin hooks.
 *
 * @remarks
 * The `Telemetry` namespace consolidates all OTEL telemetry functions into a
 * single, discoverable API. This includes event emission, metric recording,
 * span instrumentation, and configuration utilities.
 *
 * **Design Principle:**
 * No OTEL SDK imports in hook code - only data serialization and IPC.
 * This keeps hooks lightweight and avoids bundling heavy OTEL dependencies.
 *
 * **Namespace Organization:**
 *
 * | Category | Methods |
 * |----------|---------|
 * | Config | `isEnabled`, `preconnect` |
 * | Plugin Info | `getPluginInfo`, `setPluginInfo` |
 * | Events | `emitHookExecution`, `emitSchemaValidationError`, `emitEnvValidationError`, `emitFatalError` |
 * | Metrics | `recordHookExecution`, `recordHookDecision`, `recordCounter`, `recordHistogram`, `recordGauge` |
 * | Instrumentation | `withHookSpan`, `instrumentHook`, `instrumentToolHook`, `withChildSpan` |
 *
 * @example
 * ```typescript
 * import { Telemetry } from "claude-binary-plugin";
 *
 * // Check if telemetry is enabled
 * if (Telemetry.isEnabled()) {
 *   // Pre-connect to sidecar for faster emission
 *   await Telemetry.preconnect(sessionId);
 *
 *   // Emit hook execution event
 *   Telemetry.emitHookExecution(event, "my-hook", {
 *     hookType: "PreToolUse",
 *     pluginName: "workflow",
 *     pluginVersion: "1.0.0",
 *     durationMs: 42,
 *     success: true,
 *     outcome: "allowed",
 *   });
 *
 *   // Record custom metrics
 *   Telemetry.recordCounter(event, "custom.files.processed", 5);
 *   Telemetry.recordHistogram(event, "custom.parse.duration", 123, "ms");
 * }
 * ```
 *
 * @example Using span instrumentation
 * ```typescript
 * // Wrap a handler with automatic tracing
 * const handler = Telemetry.instrumentHook("pre-bash", async (event) => {
 *   // Create child spans for sub-operations
 *   const result = await Telemetry.withChildSpan(event, "validate", async () => {
 *     return validateCommand(event.tool_input);
 *   });
 *
 *   return event.response().allow();
 * });
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/monitoring | Claude Code Monitoring}
 * @see {@link https://opentelemetry.io/docs/concepts/semantic-conventions/ | OpenTelemetry Semantic Conventions}
 * @module
 */

import { getSidecarClient } from "./client.js";
import { isOTELEnabled } from "./config.js";
import type {
	DecisionSource,
	EnvValidationErrorResult,
	FatalErrorResult,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	SchemaValidationErrorResult,
} from "./events.js";
import {
	emitEnvValidationError,
	emitFatalError,
	emitHookExecution,
	emitHookExecutionDirect,
	emitSchemaValidationError,
} from "./events.js";
import { instrumentHook, instrumentToolHook, withChildSpan, withHookSpan } from "./instrumentation.js";
import { recordCounter, recordGauge, recordHistogram, recordHookDecision, recordHookExecution } from "./metrics.js";
import type { PluginInfo } from "./plugin-info.js";
import { getPluginInfo, setPluginInfo } from "./plugin-info.js";

/**
 * Unified telemetry API for Claude Code plugin hooks.
 *
 * @remarks
 * The `Telemetry` namespace provides a single entry point for all OTEL telemetry
 * operations in hook code. It consolidates event emission, metric recording,
 * span instrumentation, and configuration utilities.
 *
 * **Key Principle:** Fire-and-forget telemetry that never blocks hook execution.
 * The sidecar process handles batching and export to the OTLP endpoint.
 *
 * @example
 * ```typescript
 * import { Telemetry } from "claude-binary-plugin";
 *
 * // Check if telemetry is enabled before expensive operations
 * if (Telemetry.isEnabled()) {
 *   Telemetry.recordCounter(event, "files.processed", count);
 * }
 * ```
 *
 * @public
 */
export const Telemetry = {
	// =========================================================================
	// CONFIGURATION
	// =========================================================================

	/**
	 * Check if OTEL telemetry is enabled.
	 *
	 * @remarks
	 * Returns true if `OTEL_EXPORTER_OTLP_ENDPOINT` or `CLAUDE_CODE_OTEL_EXPORTER_ENDPOINT`
	 * is set. Use this to guard expensive telemetry operations.
	 *
	 * @returns `true` if telemetry endpoint is configured
	 *
	 * @example
	 * ```typescript
	 * if (Telemetry.isEnabled()) {
	 *   // Safe to emit telemetry
	 *   Telemetry.recordCounter(event, "custom.metric", 1);
	 * }
	 * ```
	 *
	 * @public
	 */
	isEnabled: isOTELEnabled,

	/**
	 * Pre-connect to the OTEL sidecar for faster emission.
	 *
	 * @remarks
	 * Should be called during hook initialization to ensure the socket
	 * is ready when telemetry is emitted. This prevents the race condition
	 * where hooks exit before async connection completes.
	 *
	 * The sidecar is spawned on-demand if not already running.
	 *
	 * @param sessionId - The Claude Code session ID
	 *
	 * @example
	 * ```typescript
	 * // In hook initialization
	 * if (Telemetry.isEnabled()) {
	 *   await Telemetry.preconnect(event.session_id);
	 * }
	 * ```
	 *
	 * @public
	 */
	async preconnect(sessionId: string): Promise<void> {
		if (!isOTELEnabled()) return;
		const client = getSidecarClient(sessionId);
		await client.preconnect();
	},

	// =========================================================================
	// PLUGIN INFO
	// =========================================================================

	/**
	 * Get the current plugin info used for telemetry attributes.
	 *
	 * @remarks
	 * Returns the plugin name, version, and optional marketplace info
	 * that are included in all telemetry events and metrics.
	 *
	 * @returns Current plugin info
	 *
	 * @example
	 * ```typescript
	 * const info = Telemetry.getPluginInfo();
	 * console.log(`Plugin: ${info.name} v${info.version}`);
	 * ```
	 *
	 * @public
	 */
	getPluginInfo,

	/**
	 * Set the plugin info for telemetry attributes.
	 *
	 * @remarks
	 * Called automatically during plugin initialization. Manual calls
	 * are only needed for testing or special scenarios.
	 *
	 * @param info - Plugin info to set
	 *
	 * @example
	 * ```typescript
	 * Telemetry.setPluginInfo({
	 *   name: "my-plugin",
	 *   version: "1.0.0",
	 * });
	 * ```
	 *
	 * @public
	 */
	setPluginInfo,

	// =========================================================================
	// EVENT EMITTERS
	// =========================================================================

	/**
	 * Emit a hook execution event.
	 *
	 * @remarks
	 * This is the primary event emitter for hook telemetry. It emits a single
	 * `claude_code.hook.execution` event containing all hook execution details.
	 *
	 * Called automatically by `instrumentHook()` and pipeline runtime.
	 * Manual calls are useful for custom telemetry scenarios.
	 *
	 * @param event - The hook event base containing session info
	 * @param hookName - The custom hook name (e.g., "pre-bash", "docs-access")
	 * @param result - The hook execution result data
	 *
	 * @example
	 * ```typescript
	 * Telemetry.emitHookExecution(event, "pre-bash", {
	 *   hookType: "PreToolUse",
	 *   pluginName: "workflow",
	 *   pluginVersion: "1.0.0",
	 *   durationMs: 42,
	 *   success: true,
	 *   outcome: "allowed",
	 *   summary: "auto-allowed: git status",
	 *   permissionDecision: "allow",
	 *   decisionSource: "config",
	 * });
	 * ```
	 *
	 * @see {@link HookExecutionResult} - Result data structure
	 * @public
	 */
	emitHookExecution,

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
	 * Telemetry.emitHookExecutionDirect({
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
	emitHookExecutionDirect,

	/**
	 * Emit a schema validation error event.
	 *
	 * @remarks
	 * Emitted when Claude Code sends malformed event data that doesn't
	 * match the expected Zod schema. Useful for debugging protocol issues.
	 *
	 * @param sessionId - The session ID (may be extracted from partial data)
	 * @param hookName - The custom hook name
	 * @param result - The validation error details
	 *
	 * @example
	 * ```typescript
	 * Telemetry.emitSchemaValidationError(sessionId, "pre-bash", {
	 *   hookName: "pre-bash",
	 *   issueCount: 2,
	 *   validationPath: "tool_input.command",
	 *   errorMessage: "Required field missing",
	 * });
	 * ```
	 *
	 * @public
	 */
	emitSchemaValidationError,

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
	 * Telemetry.emitEnvValidationError(sessionId, "pre-bash", {
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
	emitEnvValidationError,

	/**
	 * Emit a fatal error event.
	 *
	 * @remarks
	 * Emitted from global error handlers when an uncaught exception or
	 * unhandled rejection occurs. Since the hook is crashing, this function
	 * waits for the message to be flushed before returning.
	 *
	 * @param sessionId - The session ID (may be "unknown" if not yet parsed)
	 * @param result - The fatal error details
	 * @param flushTimeoutMs - Maximum time to wait for flush (default: 500ms)
	 * @returns Promise that resolves when message is sent (or timeout)
	 *
	 * @example
	 * ```typescript
	 * process.on("uncaughtException", async (error) => {
	 *   await Telemetry.emitFatalError(sessionId, {
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
	emitFatalError,

	// =========================================================================
	// METRIC RECORDERS
	// =========================================================================

	/**
	 * Record a hook execution (counter + histogram).
	 *
	 * @remarks
	 * Records both a count and duration histogram for the hook execution.
	 * Called automatically by `instrumentHook()`. Manual calls are rarely needed.
	 *
	 * @param event - The hook event base
	 * @param hookName - The custom hook name
	 * @param durationMs - Execution duration in milliseconds
	 * @param success - Whether the hook succeeded
	 *
	 * @example
	 * ```typescript
	 * const start = Date.now();
	 * try {
	 *   await runHookLogic();
	 *   Telemetry.recordHookExecution(event, "pre-bash", Date.now() - start, true);
	 * } catch (e) {
	 *   Telemetry.recordHookExecution(event, "pre-bash", Date.now() - start, false);
	 *   throw e;
	 * }
	 * ```
	 *
	 * @public
	 */
	recordHookExecution,

	/**
	 * Record a hook decision (allow/block/modify).
	 *
	 * @remarks
	 * Records the decision made by a hook for analytics and monitoring.
	 *
	 * @param event - The hook event base
	 * @param hookName - The custom hook name
	 * @param decision - The decision made (allow, block, modify)
	 * @param toolName - Optional tool name for tool hooks
	 *
	 * @example
	 * ```typescript
	 * Telemetry.recordHookDecision(event, "pre-bash", "allow", "Bash");
	 * Telemetry.recordHookDecision(event, "security", "block", "Write");
	 * ```
	 *
	 * @public
	 */
	recordHookDecision,

	/**
	 * Record a custom counter metric.
	 *
	 * @remarks
	 * Counters track cumulative values that only increase (e.g., request counts,
	 * files processed). Use for counting occurrences.
	 *
	 * @param event - The hook event base
	 * @param name - Metric name (e.g., "custom.files.processed")
	 * @param value - Value to add (default: 1)
	 * @param attributes - Optional additional attributes
	 *
	 * @example
	 * ```typescript
	 * Telemetry.recordCounter(event, "files.linted", files.length);
	 * Telemetry.recordCounter(event, "errors.found", errorCount, {
	 *   severity: "warning",
	 * });
	 * ```
	 *
	 * @public
	 */
	recordCounter,

	/**
	 * Record a custom histogram metric.
	 *
	 * @remarks
	 * Histograms track distributions of values (e.g., latencies, sizes).
	 * Use for measuring durations, sizes, or other continuous values.
	 *
	 * @param event - The hook event base
	 * @param name - Metric name (e.g., "custom.parse.duration")
	 * @param value - The measured value
	 * @param unit - Optional unit (e.g., "ms", "bytes")
	 * @param attributes - Optional additional attributes
	 *
	 * @example
	 * ```typescript
	 * Telemetry.recordHistogram(event, "lint.duration", durationMs, "ms");
	 * Telemetry.recordHistogram(event, "file.size", bytes, "bytes", {
	 *   fileType: "typescript",
	 * });
	 * ```
	 *
	 * @public
	 */
	recordHistogram,

	/**
	 * Record a custom gauge metric.
	 *
	 * @remarks
	 * Gauges track point-in-time values that can go up or down
	 * (e.g., active connections, queue depth). Use for current state.
	 *
	 * @param event - The hook event base
	 * @param name - Metric name (e.g., "custom.queue.depth")
	 * @param value - The current value
	 * @param attributes - Optional additional attributes
	 *
	 * @example
	 * ```typescript
	 * Telemetry.recordGauge(event, "cache.size", cacheEntries);
	 * Telemetry.recordGauge(event, "pending.tasks", taskCount, {
	 *   queue: "high-priority",
	 * });
	 * ```
	 *
	 * @public
	 */
	recordGauge,

	// =========================================================================
	// SPAN INSTRUMENTATION
	// =========================================================================

	/**
	 * Execute a function within a traced span.
	 *
	 * @remarks
	 * Creates a span around an async operation, capturing timing and status.
	 * Spans are sent to the sidecar for correlation in trace viewers.
	 *
	 * @param event - The hook event base
	 * @param spanName - Name for the span
	 * @param handler - Async function to execute
	 * @param attributes - Optional span attributes
	 * @returns The handler's return value
	 *
	 * @example
	 * ```typescript
	 * const result = await Telemetry.withHookSpan(
	 *   event,
	 *   "validate-input",
	 *   async () => {
	 *     return validateInput(event.tool_input);
	 *   },
	 *   { validation_type: "security" }
	 * );
	 * ```
	 *
	 * @public
	 */
	withHookSpan,

	/**
	 * Wrap a hook handler with automatic span instrumentation.
	 *
	 * @remarks
	 * Returns a wrapped handler that automatically creates a span around
	 * the hook execution. The span captures duration, success/failure,
	 * and emits a hook execution event.
	 *
	 * @param hookName - The custom hook name
	 * @param handler - The hook handler function
	 * @returns Instrumented handler function
	 *
	 * @example
	 * ```typescript
	 * const handler = Telemetry.instrumentHook(
	 *   "pre-edit-code",
	 *   async (event) => {
	 *     // Hook logic - automatically traced
	 *     return event.response().allow();
	 *   }
	 * );
	 *
	 * // Use the instrumented handler
	 * const response = await handler(event);
	 * ```
	 *
	 * @public
	 */
	instrumentHook,

	/**
	 * Wrap a tool hook handler with tool-specific attributes.
	 *
	 * @remarks
	 * Like `instrumentHook`, but also captures `tool.name` and optionally
	 * `tool.input` in the span attributes. Use for PreToolUse/PostToolUse hooks.
	 *
	 * @param hookName - The custom hook name
	 * @param handler - The hook handler function
	 * @returns Instrumented handler function
	 *
	 * @example
	 * ```typescript
	 * const handler = Telemetry.instrumentToolHook(
	 *   "pre-bash",
	 *   async (event) => {
	 *     // tool.name automatically captured
	 *     if (isDangerous(event.tool_input)) {
	 *       return event.response().deny("Blocked dangerous command");
	 *     }
	 *     return event.response().allow();
	 *   }
	 * );
	 * ```
	 *
	 * @public
	 */
	instrumentToolHook,

	/**
	 * Create a child span for sub-operations within a hook.
	 *
	 * @remarks
	 * Use this to trace individual operations within an already-instrumented
	 * hook. Child spans help identify which sub-operation is slow or failing.
	 *
	 * @param event - The hook event base
	 * @param spanName - Name for the child span
	 * @param handler - Async function to execute
	 * @param attributes - Optional span attributes
	 * @returns The handler's return value
	 *
	 * @example
	 * ```typescript
	 * const handler = Telemetry.instrumentHook("pre-commit", async (event) => {
	 *   // Each sub-operation gets its own span
	 *   await Telemetry.withChildSpan(event, "lint", async () => {
	 *     await runLint();
	 *   });
	 *
	 *   await Telemetry.withChildSpan(event, "typecheck", async () => {
	 *     await runTypeCheck();
	 *   });
	 *
	 *   return event.response();
	 * });
	 * ```
	 *
	 * @public
	 */
	withChildSpan,
} as const;

// Re-export types for convenience
export type {
	DecisionSource,
	EnvValidationErrorResult,
	FatalErrorResult,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	PluginInfo,
	SchemaValidationErrorResult,
};
