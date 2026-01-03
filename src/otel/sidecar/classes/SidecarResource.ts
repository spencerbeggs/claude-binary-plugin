/**
 * OTEL Resource creation for the sidecar.
 *
 * Resources are immutable collections of attributes that describe the entity
 * producing telemetry (in this case, Claude Code plugin hooks).
 *
 * @module
 */

import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { DEFAULTS, RESOURCE_ATTRS } from "../../constants.js";
import type { OTELProtocolConfig } from "../../protocol.js";

/**
 * Extended configuration for resource creation.
 *
 * Extends OTELProtocolConfig (which includes pluginName and marketplaceName)
 * with version fields for more detailed telemetry.
 * @public
 */
export interface ResourceConfig extends OTELProtocolConfig {
	/** Plugin version for resource attributes */
	pluginVersion?: string;
	/** Marketplace version */
	marketplaceVersion?: string;
}

/**
 * Static class for creating OTEL Resources.
 *
 * Resources are immutable collections of attributes that describe the entity
 * producing telemetry. This class creates properly configured resources for
 * the sidecar process.
 *
 * @example
 * ```typescript
 * const resource = SidecarResource.create({
 *   serviceName: "claude-code",
 *   endpoint: "http://localhost:4318",
 * });
 * ```
 *
 * @public
 */
export class SidecarResource {
	/**
	 * Create an OTEL Resource from configuration.
	 *
	 * @param config - Resource configuration
	 * @returns OTEL Resource with attributes
	 */
	static create(config: ResourceConfig): Resource {
		const attributes: Record<string, string> = {
			[ATTR_SERVICE_NAME]: config.serviceName ?? DEFAULTS.SERVICE_NAME,
			"service.namespace": DEFAULTS.SERVICE_NAMESPACE,
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
		const extraAttrs = SidecarResource.parseResourceAttributes(Bun.env.OTEL_RESOURCE_ATTRIBUTES);
		Object.assign(attributes, extraAttrs);

		// Add deployment environment if set
		if (Bun.env.DEPLOYMENT_ENV || Bun.env.NODE_ENV) {
			attributes[RESOURCE_ATTRS.DEPLOYMENT_ENV] = Bun.env.DEPLOYMENT_ENV ?? Bun.env.NODE_ENV ?? "development";
		}

		return resourceFromAttributes(attributes);
	}

	/**
	 * Parse OTEL_RESOURCE_ATTRIBUTES environment variable.
	 *
	 * Format: key1=value1,key2=value2
	 *
	 * @param attrs - The environment variable value
	 * @returns Parsed attributes object
	 */
	private static parseResourceAttributes(attrs?: string): Record<string, string> {
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
	}
}
