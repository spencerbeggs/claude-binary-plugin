import { isPlatformSupported } from "./Platform.js";

/**
 * Default values for OTEL configuration.
 */
export const OTEL_DEFAULTS = {
	ENDPOINT: "http://localhost:4318",
	PROTOCOL: "http" as const,
	SERVICE_NAME: "claude-code",
	SERVICE_NAMESPACE: "claude-code",
	IDLE_TIMEOUT_MS: 5 * 60 * 1000,
	EXPORT_TIMEOUT_MS: 30 * 1000,
} as const;

/**
 * Environment variable names for OTEL configuration.
 */
export const OTEL_ENV_VARS = {
	OTEL_EXPORTER_ENDPOINT: "OTEL_EXPORTER_OTLP_ENDPOINT",
	OTEL_EXPORTER_PROTOCOL: "OTEL_EXPORTER_OTLP_PROTOCOL",
	OTEL_EXPORTER_HEADERS: "OTEL_EXPORTER_OTLP_HEADERS",
	OTEL_SERVICE_NAME: "OTEL_SERVICE_NAME",
	OTEL_INCLUDE_SESSION_ID: "OTEL_INCLUDE_SESSION_ID",
	OTEL_SIDECAR_SOCKET: "OTEL_SIDECAR_SOCKET",
	OTEL_SIDECAR_SESSION_ID: "OTEL_SIDECAR_SESSION_ID",
	OTEL_SIDECAR_IDLE_TIMEOUT_MS: "OTEL_SIDECAR_IDLE_TIMEOUT_MS",
} as const;

/**
 * Check if OTEL telemetry is enabled.
 * Standalone function for imperative code paths (e.g., PluginEnv).
 * Effect code should use the OtelConfig service's `enabled` field.
 */
export function isOtelEnabled(): boolean {
	return Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" && isPlatformSupported();
}
