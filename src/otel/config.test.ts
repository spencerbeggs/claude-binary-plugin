import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	clearAccountInfoCache,
	getSessionEnvDir,
	getSidecarIdleTimeout,
	isOTELEnabled,
	parseOTELConfig,
	shouldIncludeSessionId,
} from "./config.js";
import { DEFAULTS } from "./constants.js";

describe("config", () => {
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
		clearAccountInfoCache();
	});

	describe("isOTELEnabled", () => {
		test("returns false when CLAUDE_CODE_ENABLE_TELEMETRY is not set", () => {
			delete process.env.CLAUDE_CODE_ENABLE_TELEMETRY;

			expect(isOTELEnabled()).toBe(false);
		});

		test("returns false when CLAUDE_CODE_ENABLE_TELEMETRY is not '1'", () => {
			process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "true";

			expect(isOTELEnabled()).toBe(false);
		});

		test("returns true when CLAUDE_CODE_ENABLE_TELEMETRY is '1' on supported platform", () => {
			process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";

			// This test will pass on darwin/linux, fail on windows
			const platform = process.platform;
			if (platform === "darwin" || platform === "linux") {
				expect(isOTELEnabled()).toBe(true);
			} else {
				expect(isOTELEnabled()).toBe(false);
			}
		});
	});

	describe("parseOTELConfig", () => {
		test("returns config without env-based settings when no env vars set", () => {
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
			delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
			delete process.env.OTEL_SERVICE_NAME;
			delete process.env.OTEL_EXPORTER_OTLP_HEADERS;

			const config = parseOTELConfig();

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

			const config = parseOTELConfig();

			expect(config.endpoint).toBe("http://collector:4318");
		});

		test("parses http protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http";

			const config = parseOTELConfig();

			expect(config.protocol).toBe("http");
		});

		test("parses grpc protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "grpc";

			const config = parseOTELConfig();

			expect(config.protocol).toBe("grpc");
		});

		test("ignores invalid protocol", () => {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "invalid";

			const config = parseOTELConfig();

			expect(config.protocol).toBeUndefined();
		});

		test("parses service name", () => {
			process.env.OTEL_SERVICE_NAME = "my-plugin";

			const config = parseOTELConfig();

			expect(config.serviceName).toBe("my-plugin");
		});

		test("parses headers from comma-separated string", () => {
			process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer token,X-Custom=value";

			const config = parseOTELConfig();

			expect(config.headers).toEqual({
				Authorization: "Bearer token",
				"X-Custom": "value",
			});
		});

		test("handles headers with equals in value", () => {
			process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer a=b=c";

			const config = parseOTELConfig();

			expect(config.headers).toEqual({
				Authorization: "Bearer a=b=c",
			});
		});

		// Note: pluginName/marketplaceName are now set via setPluginInfo() at startup,
		// not parsed from env vars. See otel/index.ts for the module-level state.
	});

	describe("getSessionEnvDir", () => {
		// Helper to clear any *_SESSION_ENV_FILE env vars that might be set
		function clearSessionEnvFileVars() {
			for (const key of Object.keys(process.env)) {
				if (key.endsWith("_SESSION_ENV_FILE")) {
					delete process.env[key];
				}
			}
		}

		test("returns dirname of *_SESSION_ENV_FILE env var when set", () => {
			clearSessionEnvFileVars();
			process.env.TEST_PLUGIN_SESSION_ENV_FILE = "/tmp/session-123/hook-0.sh";

			expect(getSessionEnvDir()).toBe("/tmp/session-123");
		});

		test("returns null when no *_SESSION_ENV_FILE env var is set", () => {
			clearSessionEnvFileVars();

			expect(getSessionEnvDir()).toBeNull();
		});

		test("discovers session env dir from any plugin-namespaced env var", () => {
			clearSessionEnvFileVars();
			process.env.SAVVY_WORKFLOW_SESSION_ENV_FILE = "/Users/x/.claude/session-env/abc-123/hook-0.sh";

			expect(getSessionEnvDir()).toBe("/Users/x/.claude/session-env/abc-123");
		});
	});

	describe("shouldIncludeSessionId", () => {
		test("returns true when OTEL_INCLUDE_SESSION_ID is 'true'", () => {
			process.env.OTEL_INCLUDE_SESSION_ID = "true";

			expect(shouldIncludeSessionId()).toBe(true);
		});

		test("returns false when OTEL_INCLUDE_SESSION_ID is not set", () => {
			delete process.env.OTEL_INCLUDE_SESSION_ID;

			expect(shouldIncludeSessionId()).toBe(false);
		});

		test("returns false when OTEL_INCLUDE_SESSION_ID is '1'", () => {
			process.env.OTEL_INCLUDE_SESSION_ID = "1";

			expect(shouldIncludeSessionId()).toBe(false);
		});
	});

	describe("getSidecarIdleTimeout", () => {
		test("returns default when env var not set", () => {
			delete process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS;

			expect(getSidecarIdleTimeout()).toBe(DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("parses valid timeout value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "60000";

			expect(getSidecarIdleTimeout()).toBe(60000);
		});

		test("returns default for invalid value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "invalid";

			expect(getSidecarIdleTimeout()).toBe(DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("returns default for zero", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "0";

			expect(getSidecarIdleTimeout()).toBe(DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("returns default for negative value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "-1000";

			expect(getSidecarIdleTimeout()).toBe(DEFAULTS.IDLE_TIMEOUT_MS);
		});
	});

	describe("getClaudeAccountInfo", () => {
		test("returns account info from ~/.claude.json when file exists", async () => {
			// Import the function fresh after clearing cache
			const { getClaudeAccountInfo } = await import("./config.js");
			clearAccountInfoCache();

			const info = getClaudeAccountInfo();

			// The structure should always be present, even if values are null
			expect(info).toHaveProperty("accountUuid");
			expect(info).toHaveProperty("organizationUuid");
			expect(info).toHaveProperty("emailAddress");
			expect(info).toHaveProperty("displayName");
			expect(info).toHaveProperty("organizationName");

			// If the file exists and has valid data, values should be strings
			// If not, they should be null
			if (info.accountUuid !== null) {
				expect(typeof info.accountUuid).toBe("string");
			}
			if (info.organizationUuid !== null) {
				expect(typeof info.organizationUuid).toBe("string");
			}
		});

		test("caches account info across calls", async () => {
			const { getClaudeAccountInfo } = await import("./config.js");
			clearAccountInfoCache();

			const info1 = getClaudeAccountInfo();
			const info2 = getClaudeAccountInfo();

			// Should return the same cached object
			expect(info1).toBe(info2);
		});

		test("clearAccountInfoCache resets the cache", async () => {
			const { getClaudeAccountInfo } = await import("./config.js");

			// Get cached info, clear cache, get fresh info
			const info1 = getClaudeAccountInfo();
			expect(info1).toHaveProperty("accountUuid");

			clearAccountInfoCache();
			const info2 = getClaudeAccountInfo();

			// After clearing, should still have same structure
			expect(info2).toHaveProperty("accountUuid");
		});
	});
});
