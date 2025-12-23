/**
 * OTEL telemetry module for Claude Code plugin hooks.
 *
 * This module provides:
 * - IPC protocol types for hook-to-sidecar communication
 * - Platform detection utilities
 * - Attribute and metric name constants
 * - Sidecar client for sending telemetry
 * - Config parsing utilities
 * - Span instrumentation utilities
 * - Event/log emitters
 * - Metric recording functions
 *
 * The sidecar binary entry point is at `@savvy-web/bun-hooks/otel/sidecar`.
 *
 * @module
 */

// Client
export {
	SidecarClient,
	clearSidecarClients,
	getSidecarClient,
	removeSidecarClient,
} from "./client.js";

import { getSidecarClient } from "./client.js";
import { isOTELEnabled } from "./config.js";

// Plugin info (extracted to break import cycles)
export type { PluginInfo } from "./plugin-info.js";
export { getPluginInfo, setPluginInfo } from "./plugin-info.js";

/**
 * Pre-connect to OTEL sidecar if telemetry is enabled.
 *
 * Should be called during hook initialization to ensure the socket
 * is ready when telemetry is emitted. This prevents the race condition
 * where hooks exit before async connection completes.
 *
 * This is the low-level function. For use in HookEvent subclasses,
 * use `HookEvent.initTelemetry()` instead.
 *
 * @param sessionId - The Claude Code session ID
 */
export async function preconnectTelemetry(sessionId: string): Promise<void> {
	if (!isOTELEnabled()) return;
	const client = getSidecarClient(sessionId);
	await client.preconnect();
}

// Config
export type { ClaudeAccountInfo } from "./config.js";
export {
	clearAccountInfoCache,
	extractSessionIdFromPath,
	getClaudeAccountInfo,
	getSessionEnvDir,
	getSidecarIdleTimeout,
	isOTELEnabled,
	parseOTELConfig,
	shouldIncludeSessionId,
} from "./config.js";

// Constants
export {
	CLAUDE_ATTRS,
	DEFAULTS,
	ENV_VARS,
	EVENT_NAMES,
	GIT_ATTRS,
	METRIC_NAMES,
	PLUGIN_ATTRS,
	RESOURCE_ATTRS,
	SCOPE,
	SIDECAR_ATTRS,
	SPAN_NAMES,
} from "./constants.js";
export type {
	EnvValidationErrorResult,
	FatalErrorResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	SchemaValidationErrorResult,
} from "./events.js";
// Events (hook-side event emitters)
export { emitEnvValidationError, emitFatalError, emitHookExecution, emitSchemaValidationError } from "./events.js";
// Git info detection
export type { GitInfo, GitProvider } from "./git-info.js";
export { detectGitInfo, gitInfoToAttributes, parseGitRemoteUrl } from "./git-info.js";
// Instrumentation (span wrappers)
export { instrumentHook, instrumentToolHook, withChildSpan, withHookSpan } from "./instrumentation.js";
// Metrics (hook-side metric recording)
export {
	recordCounter,
	recordGauge,
	recordHistogram,
	recordHookDecision,
	recordHookExecution,
} from "./metrics.js";
// Platform detection
export type { Platform, SupportedPlatform } from "./platform.js";
export {
	MAX_SOCKET_PATH_LENGTH,
	assertPlatformSupported,
	getPlatform,
	getPlatformError,
	getSocketPath,
	getSocketPathWithFallback,
	isPlatformSupported,
} from "./platform.js";
// Protocol types and utilities
export type {
	EventData,
	EventMessage,
	MetricData,
	MetricMessage,
	MetricType,
	OTELConfig,
	PingMessage,
	ShutdownMessage,
	SidecarMessage,
	SidecarResponse,
	SpanData,
	SpanEvent,
	SpanMessage,
} from "./protocol.js";
export { parseMessage, serializeMessage } from "./protocol.js";
// Spawn utilities
export type { SpawnResult } from "./spawn.js";
export { getPluginBinaryPath, socketExists, spawnSidecar } from "./spawn.js";
