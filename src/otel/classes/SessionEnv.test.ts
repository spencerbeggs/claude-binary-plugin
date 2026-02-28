import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { OtelConfig } from "./OtelConfig.js";
import { SessionEnv } from "./SessionEnv.js";

describe("SessionEnv", () => {
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
	});

	describe("getDir", () => {
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

			expect(SessionEnv.getDir()).toBe("/tmp/session-123");
		});

		test("returns null when no *_SESSION_ENV_FILE env var is set", () => {
			clearSessionEnvFileVars();

			expect(SessionEnv.getDir()).toBeNull();
		});

		test("discovers session env dir from any plugin-namespaced env var", () => {
			clearSessionEnvFileVars();
			process.env.SAVVY_WORKFLOW_SESSION_ENV_FILE = "/Users/x/.claude/session-env/abc-123/hook-0.sh";

			expect(SessionEnv.getDir()).toBe("/Users/x/.claude/session-env/abc-123");
		});
	});

	describe("extractSessionId", () => {
		test("returns valid UUID from session env directory path", () => {
			const result = SessionEnv.extractSessionId("/Users/x/.claude/session-env/a1b2c3d4-e5f6-7890-abcd-ef1234567890");
			expect(result).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
		});

		test("returns null for non-UUID last path segment", () => {
			const result = SessionEnv.extractSessionId("/Users/x/.claude/session-env/not-a-uuid");
			expect(result).toBeNull();
		});

		test("returns null for empty string", () => {
			const result = SessionEnv.extractSessionId("");
			expect(result).toBeNull();
		});

		test("returns null for path without UUID-like segment", () => {
			const result = SessionEnv.extractSessionId("/Users/x/.claude/session-env/12345");
			expect(result).toBeNull();
		});

		test("handles uppercase UUID", () => {
			const result = SessionEnv.extractSessionId("/Users/x/.claude/session-env/A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
			expect(result).toBe("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
		});

		test("handles path with trailing slash", () => {
			// filter(Boolean) removes empty strings from trailing slash
			const result = SessionEnv.extractSessionId("/Users/x/.claude/session-env/a1b2c3d4-e5f6-7890-abcd-ef1234567890/");
			expect(result).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
		});
	});

	describe("shouldIncludeSessionId", () => {
		test("returns true when OTEL_INCLUDE_SESSION_ID is 'true'", () => {
			process.env.OTEL_INCLUDE_SESSION_ID = "true";

			expect(SessionEnv.shouldIncludeSessionId()).toBe(true);
		});

		test("returns false when OTEL_INCLUDE_SESSION_ID is not set", () => {
			delete process.env.OTEL_INCLUDE_SESSION_ID;

			expect(SessionEnv.shouldIncludeSessionId()).toBe(false);
		});

		test("returns false when OTEL_INCLUDE_SESSION_ID is '1'", () => {
			process.env.OTEL_INCLUDE_SESSION_ID = "1";

			expect(SessionEnv.shouldIncludeSessionId()).toBe(false);
		});
	});

	describe("getIdleTimeout", () => {
		test("returns default when env var not set", () => {
			delete process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS;

			expect(SessionEnv.getIdleTimeout()).toBe(OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("parses valid timeout value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "60000";

			expect(SessionEnv.getIdleTimeout()).toBe(60000);
		});

		test("returns default for invalid value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "invalid";

			expect(SessionEnv.getIdleTimeout()).toBe(OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("returns default for zero", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "0";

			expect(SessionEnv.getIdleTimeout()).toBe(OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS);
		});

		test("returns default for negative value", () => {
			process.env.OTEL_SIDECAR_IDLE_TIMEOUT_MS = "-1000";

			expect(SessionEnv.getIdleTimeout()).toBe(OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS);
		});
	});
});
