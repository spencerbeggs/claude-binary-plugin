/**
 * Telemetry metric recording for OTEL sidecar.
 *
 * @remarks
 * Provides a class-based API for recording telemetry metrics from hooks.
 * Metrics are serialized and sent to the sidecar process via IPC.
 *
 * @example
 * ```typescript
 * import { TelemetryMetrics, OTELConfig } from "claude-binary-plugin";
 *
 * if (OTELConfig.isEnabled()) {
 *   // Record custom metrics
 *   TelemetryMetrics.recordCounter(event, "files.processed", 5);
 *   TelemetryMetrics.recordHistogram(event, "lint.duration", 123, "ms");
 *   TelemetryMetrics.recordGauge(event, "cache.size", cacheEntries);
 * }
 * ```
 *
 * @public
 */

import type { HookEventBase } from "../../events/types.js";
import { getSidecarClient } from "../client.js";
import { OTELConfig } from "./OTELConfig.js";
import { PluginInfo } from "./PluginInfo.js";
import { TelemetryEmitter } from "./TelemetryEmitter.js";

/**
 * Build metric attributes with cardinality controls.
 * @internal
 */
function getMetricAttributes(
	event: HookEventBase,
	hookName: string,
	extra?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
	const pluginInfo = PluginInfo.get();
	const attrs: Record<string, string | number | boolean> = {
		[TelemetryEmitter.ATTRS.HOOK_NAME]: hookName,
		[TelemetryEmitter.ATTRS.HOOK_TYPE]: event.hook_event_name,
		[PluginInfo.ATTRS.NAME]: pluginInfo.name,
	};

	// Cardinality controls (aligned with Claude Code)
	if (Bun.env.OTEL_METRICS_INCLUDE_SESSION_ID !== "false") {
		attrs[TelemetryEmitter.ATTRS.SESSION_ID] = event.session_id;
	}

	if (Bun.env.OTEL_METRICS_INCLUDE_PLUGIN_VERSION === "true") {
		attrs[PluginInfo.ATTRS.VERSION] = pluginInfo.version;
	}

	return { ...attrs, ...extra };
}

/**
 * Telemetry metrics recorder.
 *
 * @remarks
 * Provides static methods for recording metrics. All methods
 * are fire-and-forget to avoid blocking hook execution.
 *
 * **Metric Types:**
 * - Counter: Cumulative values that only increase
 * - Histogram: Distributions of values (latencies, sizes)
 * - Gauge: Point-in-time values that can go up or down
 *
 * @example
 * ```typescript
 * // Record hook execution (counter + histogram)
 * TelemetryMetrics.recordHookExecution(event, "pre-bash", 42, true);
 *
 * // Record custom metrics
 * TelemetryMetrics.recordCounter(event, "files.linted", files.length);
 * TelemetryMetrics.recordHistogram(event, "parse.duration", durationMs, "ms");
 * TelemetryMetrics.recordGauge(event, "queue.depth", queueSize);
 * ```
 *
 * @public
 */
export class TelemetryMetrics {
	/**
	 * Metric names for hook telemetry.
	 * Uses `claude_code.hook.*` prefix to align with Anthropic's naming.
	 * @public
	 */
	static readonly NAMES = {
		/** Counter: Number of hook invocations. */
		HOOK_COUNT: "claude_code.hook.count",
		/** Histogram: Hook execution duration in milliseconds. */
		HOOK_DURATION_MS: "claude_code.hook.duration_ms",
		/** Counter: Number of tool uses processed by hooks. */
		TOOL_USE_COUNT: "claude_code.hook.tool_use.count",
		/** Counter: Number of denied tool uses. */
		TOOL_DENIED_COUNT: "claude_code.hook.tool_denied.count",
		/** Gauge: Number of active sessions. */
		ACTIVE_SESSIONS: "claude_code.hook.session.active",
		/** Counter: Total sessions started. */
		SESSION_START_COUNT: "claude_code.hook.session.start.count",
		/** Counter: Total sessions ended. */
		SESSION_END_COUNT: "claude_code.hook.session.end.count",
		/** Counter: IPC messages sent to sidecar. */
		IPC_MESSAGES_SENT: "claude_code.hook.sidecar.ipc.messages.sent",
		/** Counter: IPC errors. */
		IPC_ERRORS: "claude_code.hook.sidecar.ipc.errors",
		/** Histogram: IPC message latency in milliseconds. */
		IPC_LATENCY_MS: "claude_code.hook.sidecar.ipc.latency_ms",
	} as const;

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
	 *   TelemetryMetrics.recordHookExecution(event, "pre-bash", Date.now() - start, true);
	 * } catch (e) {
	 *   TelemetryMetrics.recordHookExecution(event, "pre-bash", Date.now() - start, false);
	 *   throw e;
	 * }
	 * ```
	 *
	 * @public
	 */
	static recordHookExecution(event: HookEventBase, hookName: string, durationMs: number, success: boolean): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);
		const baseAttrs = getMetricAttributes(event, hookName, { success });

		// Counter: hook.count
		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name: TelemetryMetrics.NAMES.HOOK_COUNT,
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				attributes: baseAttrs,
			},
		});

		// Histogram: hook.duration
		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name: TelemetryMetrics.NAMES.HOOK_DURATION_MS,
				type: { kind: "histogram", value: durationMs },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				unit: "ms",
				attributes: baseAttrs,
			},
		});

		// Counter: hook.errors (only on failure)
		if (!success) {
			client.emit({
				type: "metric",
				sessionId: event.session_id,
				data: {
					name: "claude.hook.errors",
					type: { kind: "counter", value: 1 },
					timeNs: BigInt(Date.now()) * BigInt(1_000_000),
					attributes: baseAttrs,
				},
			});
		}
	}

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
	 * TelemetryMetrics.recordHookDecision(event, "pre-bash", "allow", "Bash");
	 * TelemetryMetrics.recordHookDecision(event, "security", "block", "Write");
	 * ```
	 *
	 * @public
	 */
	static recordHookDecision(
		event: HookEventBase,
		hookName: string,
		decision: "allow" | "block" | "modify",
		toolName?: string,
	): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);
		const attrs = getMetricAttributes(event, hookName, {
			[TelemetryEmitter.ATTRS.HOOK_DECISION]: decision,
			...(toolName && { [TelemetryEmitter.ATTRS.TOOL_NAME]: toolName }),
		});

		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name: TelemetryMetrics.NAMES.TOOL_DENIED_COUNT,
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				attributes: attrs,
			},
		});
	}

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
	 * TelemetryMetrics.recordCounter(event, "files.linted", files.length);
	 * TelemetryMetrics.recordCounter(event, "errors.found", errorCount, {
	 *   severity: "warning",
	 * });
	 * ```
	 *
	 * @public
	 */
	static recordCounter(
		event: HookEventBase,
		name: string,
		value = 1,
		attributes?: Record<string, string | number | boolean>,
	): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);

		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name,
				type: { kind: "counter", value },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				attributes: {
					[TelemetryEmitter.ATTRS.SESSION_ID]: event.session_id,
					[PluginInfo.ATTRS.NAME]: PluginInfo.get().name,
					...attributes,
				},
			},
		});
	}

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
	 * TelemetryMetrics.recordHistogram(event, "lint.duration", durationMs, "ms");
	 * TelemetryMetrics.recordHistogram(event, "file.size", bytes, "bytes", {
	 *   fileType: "typescript",
	 * });
	 * ```
	 *
	 * @public
	 */
	static recordHistogram(
		event: HookEventBase,
		name: string,
		value: number,
		unit?: string,
		attributes?: Record<string, string | number | boolean>,
	): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);

		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name,
				type: { kind: "histogram", value },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				unit,
				attributes: {
					[TelemetryEmitter.ATTRS.SESSION_ID]: event.session_id,
					[PluginInfo.ATTRS.NAME]: PluginInfo.get().name,
					...attributes,
				},
			},
		});
	}

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
	 * TelemetryMetrics.recordGauge(event, "cache.size", cacheEntries);
	 * TelemetryMetrics.recordGauge(event, "pending.tasks", taskCount, {
	 *   queue: "high-priority",
	 * });
	 * ```
	 *
	 * @public
	 */
	static recordGauge(
		event: HookEventBase,
		name: string,
		value: number,
		attributes?: Record<string, string | number | boolean>,
	): void {
		if (!OTELConfig.isEnabled()) return;

		const client = getSidecarClient(event.session_id);

		client.emit({
			type: "metric",
			sessionId: event.session_id,
			data: {
				name,
				type: { kind: "gauge", value },
				timeNs: BigInt(Date.now()) * BigInt(1_000_000),
				attributes: {
					[TelemetryEmitter.ATTRS.SESSION_ID]: event.session_id,
					[PluginInfo.ATTRS.NAME]: PluginInfo.get().name,
					...attributes,
				},
			},
		});
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
