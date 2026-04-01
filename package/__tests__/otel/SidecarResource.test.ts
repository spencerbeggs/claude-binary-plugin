import { describe, expect, test } from "bun:test";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTEL_DEFAULTS } from "../../src/otel/constants.js";
import { PluginInfo } from "../../src/otel/PluginInfo.js";
import type { ResourceConfig } from "../../src/otel/SidecarResource.js";
import { ATTRS, createOtelResource } from "../../src/otel/SidecarResource.js";

describe("SidecarResource", () => {
	describe("createOtelResource", () => {
		test("creates resource with default service name", () => {
			const resource = createOtelResource({});

			const attrs = resource.attributes;
			expect(attrs[ATTR_SERVICE_NAME]).toBe(OTEL_DEFAULTS.SERVICE_NAME);
		});

		test("uses custom service name from config", () => {
			const config: ResourceConfig = {
				serviceName: "my-plugin",
			};

			const resource = createOtelResource(config);

			expect(resource.attributes[ATTR_SERVICE_NAME]).toBe("my-plugin");
		});

		test("includes OS and host attributes", () => {
			const resource = createOtelResource({});
			const attrs = resource.attributes;

			expect(attrs["os.type"]).toBe(process.platform);
			expect(attrs["host.arch"]).toBe(process.arch);
		});

		test("includes service namespace", () => {
			const resource = createOtelResource({});

			expect(resource.attributes["service.namespace"]).toBe(OTEL_DEFAULTS.SERVICE_NAMESPACE);
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

			const resource = createOtelResource(config);
			const attrs = resource.attributes;

			// These should NOT be in the resource - they go in event attributes
			expect(attrs[ATTR_SERVICE_VERSION]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.NAME]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.VERSION]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.MARKETPLACE]).toBeUndefined();
			expect(attrs[PluginInfo.ATTRS.MARKETPLACE_VERSION]).toBeUndefined();
		});

		test("merges custom resource attributes from config", () => {
			const config: ResourceConfig = {
				resourceAttributes: {
					"custom.attr": "value",
					"custom.number": 42,
					"custom.bool": true,
				},
			};

			const resource = createOtelResource(config);
			const attrs = resource.attributes;

			expect(attrs["custom.attr"]).toBe("value");
			expect(attrs["custom.number"]).toBe("42");
			expect(attrs["custom.bool"]).toBe("true");
		});

		test("merges resource attributes from options", () => {
			const resource = createOtelResource(
				{},
				{ resourceAttributes: { "env.attr": "envvalue", "another.attr": "another" } },
			);
			const attrs = resource.attributes;

			expect(attrs["env.attr"]).toBe("envvalue");
			expect(attrs["another.attr"]).toBe("another");
		});

		test("options resourceAttributes override config resourceAttributes", () => {
			const config: ResourceConfig = { resourceAttributes: { "shared.key": "from-config" } };

			const resource = createOtelResource(config, { resourceAttributes: { "shared.key": "from-options" } });

			expect(resource.attributes["shared.key"]).toBe("from-options");
		});

		test("includes deployment environment from options", () => {
			const resource = createOtelResource({}, { deploymentEnv: "production" });

			expect(resource.attributes[ATTRS.DEPLOYMENT_ENV]).toBe("production");
		});

		test("does not set deployment environment when not provided", () => {
			const resource = createOtelResource({});

			expect(resource.attributes[ATTRS.DEPLOYMENT_ENV]).toBeUndefined();
		});
	});
});
