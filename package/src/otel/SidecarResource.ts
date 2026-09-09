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
 * Options for additional resource attributes and deployment environment.
 */
export interface ResourceOptions {
	resourceAttributes?: Record<string, string>;
	deploymentEnv?: string;
}

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
 * @param options - Optional additional resource attributes and deployment environment
 * @returns OTEL Resource with attributes
 * @public
 */
export function createOtelResource(config: ResourceConfig, options?: ResourceOptions): Resource {
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

	// Merge with any resource attributes from options (after config, so options can override)
	if (options?.resourceAttributes) {
		for (const [key, value] of Object.entries(options.resourceAttributes)) {
			attributes[key] = value;
		}
	}

	// Add deployment environment if set
	if (options?.deploymentEnv) {
		attributes[ATTRS.DEPLOYMENT_ENV] = options.deploymentEnv;
	}

	return resourceFromAttributes(attributes);
}
