/**
 * OTEL class-based API exports.
 *
 * @remarks
 * This module exports all OTEL-related classes providing a clean,
 * discoverable API for telemetry and configuration.
 *
 * @packageDocumentation
 */

export type { ClaudeAccountInfoData } from "./ClaudeAccountInfo.js";
// Configuration classes
export { ClaudeAccountInfo } from "./ClaudeAccountInfo.js";
export type { GitInfoData, GitProvider } from "./GitInfo.js";
export { GitInfo } from "./GitInfo.js";
export type { OTELConfigData } from "./OTELConfig.js";
export { OTELConfig } from "./OTELConfig.js";
export type { PlatformType, SupportedPlatform } from "./Platform.js";
// Platform utilities
export { Platform } from "./Platform.js";
export type { PluginInfoData } from "./PluginInfo.js";
// Plugin metadata
export { PluginInfo } from "./PluginInfo.js";

// Session environment
export { SessionEnv } from "./SessionEnv.js";

// Sidecar management
export { SidecarClientPool } from "./SidecarClientPool.js";
export type { SpawnResult } from "./SidecarLauncher.js";
export { SidecarLauncher } from "./SidecarLauncher.js";
export { SidecarMessage } from "./SidecarMessage.js";
export type {
	DecisionSource,
	EnvValidationErrorResult,
	FatalErrorResult,
	HookExecutionDirectResult,
	HookExecutionResult,
	HookMetrics,
	HookOutcome,
	SchemaValidationErrorResult,
} from "./TelemetryEmitter.js";
// Telemetry emission
export { TelemetryEmitter } from "./TelemetryEmitter.js";

// Telemetry metrics
export { TelemetryMetrics } from "./TelemetryMetrics.js";

// Telemetry spans
export { TelemetrySpan } from "./TelemetrySpan.js";
