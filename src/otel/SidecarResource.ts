import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { ResourceConfig } from "../services/OtelProviders.js";
import { OTEL_DEFAULTS } from "./constants.js";

export type { ResourceConfig };

/**
 * Standard OTEL resource attributes.
 * Following semantic conventions for service identification.
 * @internal
 */
export const ATTRS = {
	/** Service name (required for all telemetry). */
	SERVICE_NAME: "service.name",
	/** Service version. */
	SERVICE_VERSION: "service.version",
	/** Service namespace for grouping related services. */
	SERVICE_NAMESPACE: "service.namespace",
	/** Deployment environment (e.g., "production", "development"). */
	DEPLOYMENT_ENV: "deployment.environment",
	/** Host name. */
	HOST_NAME: "host.name",
	/** Operating system type. */
	OS_TYPE: "os.type",
} as const;

/**
 * Parse OTEL_RESOURCE_ATTRIBUTES environment variable.
 *
 * Format: key1=value1,key2=value2
 *
 * @param attrs - The environment variable value
 * @returns Parsed attributes object
 */
const parseResourceAttributes = (attrs?: string): Record<string, string> => {
	if (!attrs) return {};

	const result: Record<string, string> = {};
	for (const pair of attrs.split(",")) {
		const eqIndex = pair.indexOf("=");
		if (eqIndex > 0) {
			const key = pair.slice(0, eqIndex).trim();
			const value = pair.slice(eqIndex + 1).trim();
			if (key && value) {
				result[key] = value;
			}
		}
	}
	return result;
};

/**
 * Create an OTEL Resource from configuration.
 *
 * Resources are immutable collections of attributes that describe the entity
 * producing telemetry. This function creates properly configured resources for
 * the sidecar process.
 *
 * @example
 * ```typescript
 * const resource = createOtelResource({
 *   serviceName: "claude-code",
 *   endpoint: "http://localhost:4318",
 * });
 * ```
 *
 * @param config - Resource configuration
 * @returns OTEL Resource with attributes
 * @public
 */
export function createOtelResource(config: ResourceConfig): Resource {
	const attributes: Record<string, string> = {
		[ATTR_SERVICE_NAME]: config.serviceName ?? OTEL_DEFAULTS.SERVICE_NAME,
		"service.namespace": OTEL_DEFAULTS.SERVICE_NAMESPACE,
		"os.type": process.platform,
		"host.arch": process.arch,
	};

	// NOTE: We intentionally do NOT include plugin.name, plugin.version,
	// marketplace.name, or marketplace.version in the resource because:
	// 1. The resource is created once by the first plugin to ping the sidecar
	// 2. Multiple plugins share the same sidecar in a session
	// 3. Plugin-specific info must be in event attributes, not resource
	//
	// These values are included in each event's attributes instead.

	// Merge with any resource attributes from config
	if (config.resourceAttributes) {
		for (const [key, value] of Object.entries(config.resourceAttributes)) {
			attributes[key] = String(value);
		}
	}

	// Parse OTEL_RESOURCE_ATTRIBUTES if present
	const extraAttrs = parseResourceAttributes(Bun.env.OTEL_RESOURCE_ATTRIBUTES);
	Object.assign(attributes, extraAttrs);

	// Add deployment environment if set
	if (Bun.env.DEPLOYMENT_ENV || Bun.env.NODE_ENV) {
		attributes[ATTRS.DEPLOYMENT_ENV] = Bun.env.DEPLOYMENT_ENV ?? Bun.env.NODE_ENV ?? "development";
	}

	return resourceFromAttributes(attributes);
}
