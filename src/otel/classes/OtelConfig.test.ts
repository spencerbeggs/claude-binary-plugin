import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ClaudeAccountInfo } from "./ClaudeAccountInfo.js";
import { OtelConfig } from "./OtelConfig.js";

describe("OtelConfig", () => {
	// Store original env vars
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
		// Clear the account info cache so tests don't affect each other
		ClaudeAccountInfo.clearCache();
	});

	describe("isEnabled", () => {
		test("returns false when CLAUDE_CODE_ENABLE_TELEMETRY is not set", () => {
			delete process.env.CLAUDE_CODE_ENABLE_TELEMETRY;

			expect(OtelConfig.isEnabled()).toBe(false);
		});

		test("returns false when CLAUDE_CODE_ENABLE_TELEMETRY is not '1'", () => {
			process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "true";

			expect(OtelConfig.isEnabled()).toBe(false);
		});

		test("returns true when CLAUDE_CODE_ENABLE_TELEMETRY is '1' on supported platform", () => {
			process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";

			// This test will pass on darwin/linux, fail on windows
			const platform = process.platform;
			if (platform === "darwin" || platform === "linux") {
				expect(OtelConfig.isEnabled()).toBe(true);
			} else {
				expect(OtelConfig.isEnabled()).toBe(false);
			}
		});
	});

	describe("fromEnv", () => {
		test("returns config without env-based settings when no env vars set", () => {
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
			delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
			delete process.env.OTEL_SERVICE_NAME;
			delete process.env.OTEL_EXPORTER_OTLP_HEADERS;

			const config = OtelConfig.fromEnv();

			// Should not have env-based settings
			expect(config.endpoint).toBeUndefined();
			expect(config.protocol).toBeUndefined();
			expect(config.serviceName).toBeUndefined();
			expect(config.headers).toBeUndefined();
			// pluginName is now set via setPluginInfo(), not parsed from env vars
			expect(config.pluginName).toBeUndefined();
			expect(config.marketplaceName).toBeUndefined();

			// May have resourceAttributes from ~/.claude.json (if file exists)
			// This is expected behavior - account info is included automatically
			if (config.resourceAttributes) {
				// Verify the expected attribute names if present
				const attrs = config.resourceAttributes;
				if (attrs["organization.id"]) {
					expect(typeof attrs["organization.id"]).toBe("string");
				}
				if (attrs["user.account_uuid"]) {
					expect(typeof attrs["user.account_uuid"]).toBe("string");
				}
			}
		});

		test("parses endpoint from env var", () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";

			const config = OtelConfig.fromEnv();

			expect(config.endpoint).toBe("http://collector:4318");
		});

		test("parses http protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http";

			const config = OtelConfig.fromEnv();

			expect(config.protocol).toBe("http");
		});

		test("parses grpc protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "grpc";

			const config = OtelConfig.fromEnv();

			expect(config.protocol).toBe("grpc");
		});

		test("ignores invalid protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "invalid";

			const config = OtelConfig.fromEnv();

			expect(config.protocol).toBeUndefined();
		});

		test("parses service name", () => {
			process.env.OTEL_SERVICE_NAME = "my-plugin";

			const config = OtelConfig.fromEnv();

			expect(config.serviceName).toBe("my-plugin");
		});

		test("parses headers from comma-separated string", () => {
			process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer token,X-Custom=value";

			const config = OtelConfig.fromEnv();

			expect(config.headers).toEqual({
				Authorization: "Bearer token",
				"X-Custom": "value",
			});
		});

		test("handles headers with equals in value", () => {
			process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer a=b=c";

			const config = OtelConfig.fromEnv();

			expect(config.headers).toEqual({
				Authorization: "Bearer a=b=c",
			});
		});

		// Note: pluginName/marketplaceName are now set via setPluginInfo() at startup,
		// not parsed from env vars. See otel/index.ts for the module-level state.
	});

	describe("effectiveEndpoint", () => {
		test("returns configured endpoint when set", () => {
			const config = new OtelConfig({ endpoint: "http://collector:4318" });
			expect(config.effectiveEndpoint).toBe("http://collector:4318");
		});

		test("returns default when endpoint is not set", () => {
			const config = new OtelConfig({});
			expect(config.effectiveEndpoint).toBe("http://localhost:4318");
		});
	});

	describe("effectiveProtocol", () => {
		test("returns configured protocol when set to http", () => {
			const config = new OtelConfig({ protocol: "http" });
			expect(config.effectiveProtocol).toBe("http");
		});

		test("returns configured protocol when set to grpc", () => {
			const config = new OtelConfig({ protocol: "grpc" });
			expect(config.effectiveProtocol).toBe("grpc");
		});

		test("returns default 'http' when protocol is not set", () => {
			const config = new OtelConfig({});
			expect(config.effectiveProtocol).toBe("http");
		});
	});

	describe("effectiveServiceName", () => {
		test("returns configured service name when set", () => {
			const config = new OtelConfig({ serviceName: "my-plugin" });
			expect(config.effectiveServiceName).toBe("my-plugin");
		});

		test("returns default 'claude-code' when service name is not set", () => {
			const config = new OtelConfig({});
			expect(config.effectiveServiceName).toBe("claude-code");
		});
	});

	describe("toJSON", () => {
		test("serializes all fields", () => {
			const config = new OtelConfig({
				endpoint: "http://collector:4318",
				protocol: "grpc",
				serviceName: "my-service",
				pluginName: "my-plugin",
				marketplaceName: "my-marketplace",
				resourceAttributes: { "custom.attr": "value" },
				headers: { Authorization: "Bearer token" },
				exportTimeoutMs: 5000,
			});

			const json = config.toJSON();
			expect(json).toEqual({
				endpoint: "http://collector:4318",
				protocol: "grpc",
				serviceName: "my-service",
				pluginName: "my-plugin",
				marketplaceName: "my-marketplace",
				resourceAttributes: { "custom.attr": "value" },
				headers: { Authorization: "Bearer token" },
				exportTimeoutMs: 5000,
			});
		});

		test("serializes empty config with undefined fields", () => {
			const config = new OtelConfig({});
			const json = config.toJSON();

			expect(json.endpoint).toBeUndefined();
			expect(json.protocol).toBeUndefined();
			expect(json.serviceName).toBeUndefined();
			expect(json.pluginName).toBeUndefined();
			expect(json.marketplaceName).toBeUndefined();
			expect(json.resourceAttributes).toBeUndefined();
			expect(json.headers).toBeUndefined();
			expect(json.exportTimeoutMs).toBeUndefined();
		});
	});
});
