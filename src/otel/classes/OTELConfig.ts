/**
 * OTEL configuration for telemetry export.
 *
 * @remarks
 * Parses OTEL configuration from environment variables and provides
 * utilities for checking if telemetry is enabled.
 *
 * @example
 * ```typescript
 * import { OTELConfig } from "claude-binary-plugin";
 *
 * if (OTELConfig.isEnabled()) {
 *   const config = OTELConfig.fromEnv();
 *   console.log(`Exporting to: ${config.endpoint}`);
 * }
 * ```
 *
 * @public
 */

import { DEFAULTS, ENV_VARS } from "../constants.js";
import { ClaudeAccountInfo } from "./ClaudeAccountInfo.js";
import { Platform } from "./Platform.js";

/**
 * OTEL configuration data.
 * @public
 */
export interface OTELConfigData {
	/** OTLP endpoint URL */
	endpoint?: string;
	/** Protocol to use (http or grpc) */
	protocol?: "http" | "grpc";
	/** Service name for OTEL resource */
	serviceName?: string;
	/** Plugin name for resource attributes */
	pluginName?: string;
	/** Marketplace name */
	marketplaceName?: string;
	/** Additional resource attributes */
	resourceAttributes?: Record<string, string | number | boolean>;
	/** Headers for OTLP requests */
	headers?: Record<string, string>;
	/** Export timeout in milliseconds */
	exportTimeoutMs?: number;
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
 * if (OTELConfig.isEnabled()) {
 *   const config = OTELConfig.fromEnv();
 *
 *   // Access configuration
 *   console.log(`Endpoint: ${config.endpoint}`);
 *   console.log(`Headers: ${Object.keys(config.headers || {}).length}`);
 * }
 * ```
 *
 * @public
 */
export class OTELConfig {
	/**
	 * OTLP endpoint URL.
	 * @public
	 */
	readonly endpoint?: string;

	/**
	 * Protocol to use for export (http or grpc).
	 * @public
	 */
	readonly protocol?: "http" | "grpc";

	/**
	 * Service name for OTEL resource.
	 * @public
	 */
	readonly serviceName?: string;

	/**
	 * Plugin name for resource attributes.
	 * @public
	 */
	readonly pluginName?: string;

	/**
	 * Marketplace name.
	 * @public
	 */
	readonly marketplaceName?: string;

	/**
	 * Additional resource attributes.
	 * @public
	 */
	readonly resourceAttributes?: Record<string, string | number | boolean>;

	/**
	 * Headers for OTLP requests.
	 * @public
	 */
	readonly headers?: Record<string, string>;

	/**
	 * Export timeout in milliseconds.
	 * @public
	 */
	readonly exportTimeoutMs?: number;

	/**
	 * Create an OTELConfig instance.
	 *
	 * @param data - Configuration data
	 *
	 * @remarks
	 * Typically you should use `OTELConfig.fromEnv()` rather than
	 * constructing instances directly.
	 *
	 * @public
	 */
	constructor(data: OTELConfigData = {}) {
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
	 * if (OTELConfig.isEnabled()) {
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
	 * const config = OTELConfig.fromEnv();
	 * console.log(`Endpoint: ${config.endpoint || "default"}`);
	 * ```
	 *
	 * @public
	 */
	static fromEnv(): OTELConfig {
		const data: OTELConfigData = {};

		// Endpoint
		const endpoint = Bun.env[ENV_VARS.OTEL_EXPORTER_ENDPOINT];
		if (endpoint) {
			data.endpoint = endpoint;
		}

		// Protocol
		const protocol = Bun.env[ENV_VARS.OTEL_EXPORTER_PROTOCOL];
		if (protocol === "http" || protocol === "grpc") {
			data.protocol = protocol;
		}

		// Service name
		const serviceName = Bun.env[ENV_VARS.OTEL_SERVICE_NAME];
		if (serviceName) {
			data.serviceName = serviceName;
		}

		// Headers (comma-separated key=value pairs)
		const headersStr = Bun.env[ENV_VARS.OTEL_EXPORTER_HEADERS];
		if (headersStr) {
			data.headers = OTELConfig.parseHeaders(headersStr);
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

		return new OTELConfig(data);
	}

	/**
	 * Get the effective endpoint URL.
	 *
	 * @returns The configured endpoint or default
	 *
	 * @public
	 */
	get effectiveEndpoint(): string {
		return this.endpoint ?? DEFAULTS.ENDPOINT;
	}

	/**
	 * Get the effective protocol.
	 *
	 * @returns The configured protocol or default
	 *
	 * @public
	 */
	get effectiveProtocol(): "http" | "grpc" {
		return this.protocol ?? DEFAULTS.PROTOCOL;
	}

	/**
	 * Get the effective service name.
	 *
	 * @returns The configured service name or default
	 *
	 * @public
	 */
	get effectiveServiceName(): string {
		return this.serviceName ?? DEFAULTS.SERVICE_NAME;
	}

	/**
	 * Convert to plain object (for serialization).
	 *
	 * @returns Plain object representation
	 *
	 * @public
	 */
	toJSON(): OTELConfigData {
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
