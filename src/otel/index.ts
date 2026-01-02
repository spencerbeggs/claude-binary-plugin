/**
 * OTEL telemetry module for Claude Code plugin hooks.
 *
 * This module provides class-based APIs for:
 * - Configuration: OTELConfig, ClaudeAccountInfo, GitInfo
 * - Platform utilities: Platform, SessionEnv
 * - Plugin metadata: PluginInfo
 * - Sidecar management: SidecarClient, SidecarClientPool, SidecarLauncher
 * - Telemetry emission: TelemetryEmitter, TelemetryMetrics, TelemetrySpan
 * - Message protocol: SidecarMessage
 *
 * The sidecar entry point is exported as `sidecarMain` from the main entry point.
 *
 * @module
 */

// ============================================================================
// Class-based API (primary exports)
// ============================================================================

// Re-export types from classes
export type {
	// Configuration types
	ClaudeAccountInfoData,
	// Telemetry types
	DecisionSource,
	EnvValidationErrorResult,
	FatalErrorResult,
	GitInfoData,
	GitProvider,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	OTELConfigData,
	PlatformType,
	PluginInfoData,
	SchemaValidationErrorResult,
	SpawnResult,
	SupportedPlatform,
} from "./classes/index.js";
// Re-export all classes from the classes directory
export {
	// Configuration
	ClaudeAccountInfo,
	GitInfo,
	OTELConfig,
	// Platform utilities
	Platform,
	PluginInfo,
	SessionEnv,
	// Sidecar management
	SidecarClientPool,
	SidecarLauncher,
	SidecarMessage,
	// Telemetry
	TelemetryEmitter,
	TelemetryMetrics,
	TelemetrySpan,
} from "./classes/index.js";

// ============================================================================
// SidecarClient (kept as direct export - it's the core client class)
// ============================================================================

export type { ClientState } from "./client.js";
export { SidecarClient } from "./client.js";

// ============================================================================
// Constants (kept as exported objects per plan)
// ============================================================================

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

// ============================================================================
// Protocol types (for advanced usage)
// ============================================================================

export type {
	EventData,
	EventMessage,
	MetricData,
	MetricMessage,
	MetricType,
	OTELConfig as OTELConfigProtocol,
	PingMessage,
	ScopeData,
	ShutdownMessage,
	SidecarMessage as SidecarMessageProtocol,
	SidecarResponse,
	SpanData,
	SpanEvent,
	SpanMessage,
} from "./protocol.js";
