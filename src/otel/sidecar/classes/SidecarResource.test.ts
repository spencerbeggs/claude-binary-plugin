import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OtelConfig } from "../../classes/OtelConfig.js";
import { PluginInfo } from "../../classes/PluginInfo.js";
import type { ResourceConfig } from "./SidecarResource.js";
import { SidecarResource } from "./SidecarResource.js";

describe("SidecarResource", () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		// Restore original env vars
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnv)) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value !== undefined) {
				process.env[key] = value;
			}
		}
	});

	describe("create", () => {
		test("creates resource with default service name", () => {
			const resource = SidecarResource.create({});

			const attrs = resource.attributes;
			expect(attrs[ATTR_SERVICE_NAME]).toBe(OtelConfig.DEFAULTS.SERVICE_NAME);
		});

		test("uses custom service name from config", () => {
			const config: ResourceConfig = {
				serviceName: "my-plugin",
			};

			const resource = SidecarResource.create(config);

			expect(resource.attributes[ATTR_SERVICE_NAME]).toBe("my-plugin");
		});

		test("includes OS and host attributes", () => {
			const resource = SidecarResource.create({});
			const attrs = resource.attributes;

			expect(attrs["os.type"]).toBe(process.platform);
			expect(attrs["host.arch"]).toBe(process.arch);
		});

		test("includes service namespace", () => {
			const resource = SidecarResource.create({});

			expect(resource.attributes["service.namespace"]).toBe(OtelConfig.DEFAULTS.SERVICE_NAMESPACE);
		});

		// NOTE: Plugin-specific attributes (plugin.name, plugin.version, marketplace.*)
		// are intentionally NOT included in the resource because:
		// 1. The resource is created once by the first plugin to ping the sidecar
		// 2. Multiple plugins share the same sidecar in a session
		// 3. Plugin-specific info must be in event attributes, not resource
		// See resource.ts comment for details.

		test("does not include plugin-specific attributes in resource", () => {
			const config: ResourceConfig = {
				pluginName: "workflow",
				pluginVersion: "1.2.3",
				marketplaceName: "savvy-web-claude-tools",
				marketplaceVersion: "0.5.0",
			};

			const resource = SidecarResource.create(config);
			const attrs = resource.attributes;

			// These should NOT be in the resource - they go in event attributes
			expect(attrs[ATTR_SERVICE_VERSION]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.NAME]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.VERSION]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.MARKETPLACE]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.MARKETPLACE_VERSION]).toBeUndefined();
		});

		test("merges custom resource attributes", () => {
			const config: ResourceConfig = {
				resourceAttributes: {
					"custom.attr": "value",
					"custom.number": 42,
					"custom.bool": true,
				},
			};

			const resource = SidecarResource.create(config);
			const attrs = resource.attributes;

			expect(attrs["custom.attr"]).toBe("value");
			expect(attrs["custom.number"]).toBe("42");
			expect(attrs["custom.bool"]).toBe("true");
		});

		test("parses OTEL_RESOURCE_ATTRIBUTES env var", () => {
			process.env.OTEL_RESOURCE_ATTRIBUTES = "env.attr=envvalue,another.attr=another";

			const resource = SidecarResource.create({});
			const attrs = resource.attributes;

			expect(attrs["env.attr"]).toBe("envvalue");
			expect(attrs["another.attr"]).toBe("another");
		});

		test("handles OTEL_RESOURCE_ATTRIBUTES with equals in value", () => {
			process.env.OTEL_RESOURCE_ATTRIBUTES = "key=value=with=equals";

			const resource = SidecarResource.create({});

			expect(resource.attributes.key).toBe("value=with=equals");
		});

		test("includes deployment environment from DEPLOYMENT_ENV", () => {
			process.env.DEPLOYMENT_ENV = "production";

			const resource = SidecarResource.create({});

			expect(resource.attributes[SidecarResource.ATTRS.DEPLOYMENT_ENV]).toBe("production");
		});

		test("falls back to NODE_ENV for deployment environment", () => {
			delete process.env.DEPLOYMENT_ENV;
			process.env.NODE_ENV = "development";

			const resource = SidecarResource.create({});

			expect(resource.attributes[SidecarResource.ATTRS.DEPLOYMENT_ENV]).toBe("development");
		});

		test("prefers DEPLOYMENT_ENV over NODE_ENV", () => {
			process.env.DEPLOYMENT_ENV = "staging";
			process.env.NODE_ENV = "production";

			const resource = SidecarResource.create({});

			expect(resource.attributes[SidecarResource.ATTRS.DEPLOYMENT_ENV]).toBe("staging");
		});
	});
});
