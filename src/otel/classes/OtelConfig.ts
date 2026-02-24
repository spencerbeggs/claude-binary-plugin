import { ClaudeAccountInfo } from "./ClaudeAccountInfo.js";
import { Platform } from "./Platform.js";

/**
 * OTEL configuration data.
 * @public
 */
export interface OtelConfigData {
	/** OTLP endpoint URL */
	endpoint?: string | undefined;
	/** Protocol to use (http or grpc) */
	protocol?: "http" | "grpc" | undefined;
	/** Service name for OTEL resource */
	serviceName?: string | undefined;
	/** Plugin name for resource attributes */
	pluginName?: string | undefined;
	/** Marketplace name */
	marketplaceName?: string | undefined;
	/** Additional resource attributes */
	resourceAttributes?: Record<string, string | number | boolean> | undefined;
	/** Headers for OTLP requests */
	headers?: Record<string, string> | undefined;
	/** Export timeout in milliseconds */
	exportTimeoutMs?: number | undefined;
}

/**
 * OTEL configuration for telemetry export.
 *
 * @remarks
 * Represents the configuration used to export telemetry to an OTLP endpoint.
 * Configuration is read from environment variables.
 *
 * **Environment Variables:**
 * - `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP endpoint URL
 * - `OTEL_EXPORTER_OTLP_PROTOCOL` - Protocol (http or grpc)
 * - `OTEL_EXPORTER_OTLP_HEADERS` - Headers as comma-separated key=value
 * - `OTEL_SERVICE_NAME` - Service name override
 * - `CLAUDE_CODE_ENABLE_TELEMETRY` - Must be "1" to enable telemetry
 *
 * @example
 * ```typescript
 * // Check if telemetry is enabled
 * if (OtelConfig.isEnabled()) {
 *   const config = OtelConfig.fromEnv();
 *
 *   // Access configuration
 *   console.log(`Endpoint: ${config.endpoint}`);
 *   console.log(`Headers: ${Object.keys(config.headers || {}).length}`);
 * }
 * ```
 *
 * @public
 */
export class OtelConfig {
	/**
	 * Environment variables for OTEL configuration.
	 * @public
	 */
	static readonly ENV_VARS = {
		/** OTLP endpoint URL. Standard OTEL env var. */
		OTEL_EXPORTER_ENDPOINT: "OTEL_EXPORTER_OTLP_ENDPOINT",
		/** OTLP protocol (http or grpc). */
		OTEL_EXPORTER_PROTOCOL: "OTEL_EXPORTER_OTLP_PROTOCOL",
		/** OTLP headers as comma-separated key=value pairs. */
		OTEL_EXPORTER_HEADERS: "OTEL_EXPORTER_OTLP_HEADERS",
		/** Service name override. */
		OTEL_SERVICE_NAME: "OTEL_SERVICE_NAME",
		/** Whether to include high-cardinality session ID in attributes. */
		OTEL_INCLUDE_SESSION_ID: "OTEL_INCLUDE_SESSION_ID",
		/** Socket path for sidecar IPC. */
		OTEL_SIDECAR_SOCKET: "OTEL_SIDECAR_SOCKET",
		/** Session ID for sidecar correlation. */
		OTEL_SIDECAR_SESSION_ID: "OTEL_SIDECAR_SESSION_ID",
		/** Idle timeout in milliseconds before sidecar shuts down. */
		OTEL_SIDECAR_IDLE_TIMEOUT_MS: "OTEL_SIDECAR_IDLE_TIMEOUT_MS",
	} as const;

	/**
	 * Default values for OTEL configuration.
	 * @public
	 */
	static readonly DEFAULTS = {
		/** Default OTLP endpoint. */
		ENDPOINT: "http://localhost:4318",
		/** Default OTLP protocol. */
		PROTOCOL: "http" as const,
		/** Default service name. */
		SERVICE_NAME: "claude-code",
		/** Default service namespace. */
		SERVICE_NAMESPACE: "claude-code",
		/** Default idle timeout in milliseconds (5 minutes). */
		IDLE_TIMEOUT_MS: 5 * 60 * 1000,
		/** Default export timeout in milliseconds (30 seconds). */
		EXPORT_TIMEOUT_MS: 30 * 1000,
	} as const;

	/**
	 * OTLP endpoint URL.
	 * @public
	 */
	readonly endpoint?: string | undefined;

	/**
	 * Protocol to use for export (http or grpc).
	 * @public
	 */
	readonly protocol?: "http" | "grpc" | undefined;

	/**
	 * Service name for OTEL resource.
	 * @public
	 */
	readonly serviceName?: string | undefined;

	/**
	 * Plugin name for resource attributes.
	 * @public
	 */
	readonly pluginName?: string | undefined;

	/**
	 * Marketplace name.
	 * @public
	 */
	readonly marketplaceName?: string | undefined;

	/**
	 * Additional resource attributes.
	 * @public
	 */
	readonly resourceAttributes?: Record<string, string | number | boolean> | undefined;

	/**
	 * Headers for OTLP requests.
	 * @public
	 */
	readonly headers?: Record<string, string> | undefined;

	/**
	 * Export timeout in milliseconds.
	 * @public
	 */
	readonly exportTimeoutMs?: number | undefined;

	/**
	 * Create an OtelConfig instance.
	 *
	 * @param data - Configuration data
	 *
	 * @remarks
	 * Typically you should use `OtelConfig.fromEnv()` rather than
	 * constructing instances directly.
	 *
	 * @public
	 */
	constructor(data: OtelConfigData = {}) {
		this.endpoint = data.endpoint;
		this.protocol = data.protocol;
		this.serviceName = data.serviceName;
		this.pluginName = data.pluginName;
		this.marketplaceName = data.marketplaceName;
		this.resourceAttributes = data.resourceAttributes;
		this.headers = data.headers;
		this.exportTimeoutMs = data.exportTimeoutMs;
	}

	/**
	 * Check if OTEL telemetry is enabled.
	 *
	 * @remarks
	 * Telemetry is enabled when:
	 * 1. `CLAUDE_CODE_ENABLE_TELEMETRY=1`
	 * 2. Platform supports Unix sockets (darwin/linux)
	 *
	 * @returns `true` if telemetry should be collected
	 *
	 * @example
	 * ```typescript
	 * if (OtelConfig.isEnabled()) {
	 *   // Safe to emit telemetry
	 * }
	 * ```
	 *
	 * @public
	 */
	static isEnabled(): boolean {
		return Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" && Platform.isSupported();
	}

	/**
	 * Parse OTEL configuration from environment variables.
	 *
	 * @remarks
	 * Reads configuration from standard OTEL environment variables and
	 * adds Claude account info as resource attributes.
	 *
	 * @returns Parsed OTEL configuration
	 *
	 * @example
	 * ```typescript
	 * const config = OtelConfig.fromEnv();
	 * console.log(`Endpoint: ${config.endpoint || "default"}`);
	 * ```
	 *
	 * @public
	 */
	static fromEnv(): OtelConfig {
		const data: OtelConfigData = {};

		// Endpoint
		const endpoint = Bun.env[OtelConfig.ENV_VARS.OTEL_EXPORTER_ENDPOINT];
		if (endpoint) {
			data.endpoint = endpoint;
		}

		// Protocol
		const protocol = Bun.env[OtelConfig.ENV_VARS.OTEL_EXPORTER_PROTOCOL];
		if (protocol === "http" || protocol === "grpc") {
			data.protocol = protocol;
		}

		// Service name
		const serviceName = Bun.env[OtelConfig.ENV_VARS.OTEL_SERVICE_NAME];
		if (serviceName) {
			data.serviceName = serviceName;
		}

		// Headers (comma-separated key=value pairs)
		const headersStr = Bun.env[OtelConfig.ENV_VARS.OTEL_EXPORTER_HEADERS];
		if (headersStr) {
			data.headers = OtelConfig.parseHeaders(headersStr);
		}

		// Add Claude account info as resource attributes
		const accountInfo = ClaudeAccountInfo.detect();
		const resourceAttrs: Record<string, string> = {};

		if (accountInfo.organizationUuid) {
			resourceAttrs["organization.id"] = accountInfo.organizationUuid;
		}
		if (accountInfo.accountUuid) {
			resourceAttrs["user.account_uuid"] = accountInfo.accountUuid;
		}

		// Only add resourceAttributes if we have any
		if (Object.keys(resourceAttrs).length > 0) {
			data.resourceAttributes = {
				...data.resourceAttributes,
				...resourceAttrs,
			};
		}

		return new OtelConfig(data);
	}

	/**
	 * Get the effective endpoint URL.
	 *
	 * @returns The configured endpoint or default
	 *
	 * @public
	 */
	get effectiveEndpoint(): string {
		return this.endpoint ?? OtelConfig.DEFAULTS.ENDPOINT;
	}

	/**
	 * Get the effective protocol.
	 *
	 * @returns The configured protocol or default
	 *
	 * @public
	 */
	get effectiveProtocol(): "http" | "grpc" {
		return this.protocol ?? OtelConfig.DEFAULTS.PROTOCOL;
	}

	/**
	 * Get the effective service name.
	 *
	 * @returns The configured service name or default
	 *
	 * @public
	 */
	get effectiveServiceName(): string {
		return this.serviceName ?? OtelConfig.DEFAULTS.SERVICE_NAME;
	}

	/**
	 * Convert to plain object (for serialization).
	 *
	 * @returns Plain object representation
	 *
	 * @public
	 */
	toJSON(): OtelConfigData {
		return {
			endpoint: this.endpoint,
			protocol: this.protocol,
			serviceName: this.serviceName,
			pluginName: this.pluginName,
			marketplaceName: this.marketplaceName,
			resourceAttributes: this.resourceAttributes,
			headers: this.headers,
			exportTimeoutMs: this.exportTimeoutMs,
		};
	}

	/**
	 * Parse headers from comma-separated key=value string.
	 *
	 * @param headersStr - Comma-separated key=value pairs
	 * @returns Parsed headers object
	 *
	 * @internal
	 */
	private static parseHeaders(headersStr: string): Record<string, string> {
		const headers: Record<string, string> = {};

		for (const pair of headersStr.split(",")) {
			const [key, ...valueParts] = pair.split("=");
			if (key && valueParts.length > 0) {
				// Rejoin value parts in case value contains '='
				headers[key.trim()] = valueParts.join("=").trim();
			}
		}

		return headers;
	}
}
