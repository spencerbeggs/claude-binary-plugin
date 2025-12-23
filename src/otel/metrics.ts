/**
 * Metric recording functions for hooks.
 *
 * These functions serialize metric data and send to the sidecar.
 * No OTEL SDK imports in hook code - just data serialization and IPC.
 *
 * @module
 */

import type { HookEventBase } from "../index.js";
import { getSidecarClient } from "./client.js";
import { isOTELEnabled } from "./config.js";
import { CLAUDE_ATTRS, METRIC_NAMES, PLUGIN_ATTRS } from "./constants.js";
import { getPluginInfo } from "./plugin-info.js";

/**
 * Build metric attributes with cardinality controls.
 */
function getMetricAttributes(
	event: HookEventBase,
	hookName: string,
	extra?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
	const pluginInfo = getPluginInfo();
	const attrs: Record<string, string | number | boolean> = {
		[CLAUDE_ATTRS.HOOK_NAME]: hookName,
		[CLAUDE_ATTRS.HOOK_TYPE]: event.hook_event_name,
		[PLUGIN_ATTRS.NAME]: pluginInfo.name,
	};

	// Cardinality controls (aligned with Claude Code)
	if (Bun.env.OTEL_METRICS_INCLUDE_SESSION_ID !== "false") {
		attrs[CLAUDE_ATTRS.SESSION_ID] = event.session_id;
	}

	if (Bun.env.OTEL_METRICS_INCLUDE_PLUGIN_VERSION === "true") {
		attrs[PLUGIN_ATTRS.VERSION] = pluginInfo.version;
	}

	return { ...attrs, ...extra };
}

/**
 * Record a hook execution (counter + histogram).
 * Called automatically by instrumentHook().
 */
export function recordHookExecution(
	event: HookEventBase,
	hookName: string,
	durationMs: number,
	success: boolean,
): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(event.session_id);
	const baseAttrs = getMetricAttributes(event, hookName, { success });

	// Counter: hook.count
	client.emit({
		type: "metric",
		sessionId: event.session_id,
		data: {
			name: METRIC_NAMES.HOOK_COUNT,
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
			name: METRIC_NAMES.HOOK_DURATION_MS,
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
 */
export function recordHookDecision(
	event: HookEventBase,
	hookName: string,
	decision: "allow" | "block" | "modify",
	toolName?: string,
): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(event.session_id);
	const attrs = getMetricAttributes(event, hookName, {
		[CLAUDE_ATTRS.HOOK_DECISION]: decision,
		...(toolName && { [CLAUDE_ATTRS.TOOL_NAME]: toolName }),
	});

	client.emit({
		type: "metric",
		sessionId: event.session_id,
		data: {
			name: METRIC_NAMES.TOOL_DENIED_COUNT,
			type: { kind: "counter", value: 1 },
			timeNs: BigInt(Date.now()) * BigInt(1_000_000),
			attributes: attrs,
		},
	});
}

/**
 * Record a custom counter metric.
 */
export function recordCounter(
	event: HookEventBase,
	name: string,
	value = 1,
	attributes?: Record<string, string | number | boolean>,
): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(event.session_id);

	client.emit({
		type: "metric",
		sessionId: event.session_id,
		data: {
			name,
			type: { kind: "counter", value },
			timeNs: BigInt(Date.now()) * BigInt(1_000_000),
			attributes: {
				[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
				[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
				...attributes,
			},
		},
	});
}

/**
 * Record a custom histogram metric.
 */
export function recordHistogram(
	event: HookEventBase,
	name: string,
	value: number,
	unit?: string,
	attributes?: Record<string, string | number | boolean>,
): void {
	if (!isOTELEnabled()) return;

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
				[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
				[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
				...attributes,
			},
		},
	});
}

/**
 * Record a custom gauge metric.
 */
export function recordGauge(
	event: HookEventBase,
	name: string,
	value: number,
	attributes?: Record<string, string | number | boolean>,
): void {
	if (!isOTELEnabled()) return;

	const client = getSidecarClient(event.session_id);

	client.emit({
		type: "metric",
		sessionId: event.session_id,
		data: {
			name,
			type: { kind: "gauge", value },
			timeNs: BigInt(Date.now()) * BigInt(1_000_000),
			attributes: {
				[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
				[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
				...attributes,
			},
		},
	});
}
