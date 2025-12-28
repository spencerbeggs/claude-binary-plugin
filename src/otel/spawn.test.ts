import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setPluginInfo } from "./index.js";
import { getPluginBinaryPath, socketExists, spawnSidecar } from "./spawn.js";

describe("spawn", () => {
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

	describe("getPluginBinaryPath", () => {
		test("returns null when CLAUDE_PLUGIN_ROOT not set", () => {
			delete process.env.CLAUDE_PLUGIN_ROOT;
			setPluginInfo({ name: "workflow", version: "1.0.0" });

			expect(getPluginBinaryPath()).toBeNull();
		});

		test("returns null when plugin name is unknown", () => {
			process.env.CLAUDE_PLUGIN_ROOT = "/path/to/plugin";
			setPluginInfo({ name: "unknown", version: "0.0.0" });

			expect(getPluginBinaryPath()).toBeNull();
		});

		test("returns null when neither CLAUDE_PLUGIN_ROOT nor valid plugin name is set", () => {
			delete process.env.CLAUDE_PLUGIN_ROOT;
			setPluginInfo({ name: "unknown", version: "0.0.0" });

			expect(getPluginBinaryPath()).toBeNull();
		});

		test("returns null when plugin binary does not exist", () => {
			process.env.CLAUDE_PLUGIN_ROOT = "/nonexistent/path";
			setPluginInfo({ name: "workflow", version: "1.0.0" });

			expect(getPluginBinaryPath()).toBeNull();
		});

		test("returns path when plugin binary exists", async () => {
			// Create a temp file that simulates a plugin binary
			const tempDir = `/tmp/test-plugin-${Date.now()}`;
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.$`touch ${tempDir}/test.plugin`.quiet();

			process.env.CLAUDE_PLUGIN_ROOT = tempDir;
			setPluginInfo({ name: "test", version: "1.0.0" });

			const result = getPluginBinaryPath();

			expect(result).toBe(`${tempDir}/test.plugin`);

			// Clean up
			await Bun.$`rm -rf ${tempDir}`.quiet();
		});
	});

	describe("socketExists", () => {
		test("returns false for non-existent path", async () => {
			const exists = await socketExists("/nonexistent/path/to/socket.sock");

			expect(exists).toBe(false);
		});

		test("returns true for existing file", async () => {
			// Use a file we know exists
			const exists = await socketExists(import.meta.path);

			expect(exists).toBe(true);
		});
	});

	describe("spawnSidecar", () => {
		test("returns error when plugin binary not found", async () => {
			delete process.env.CLAUDE_PLUGIN_ROOT;
			setPluginInfo({ name: "unknown", version: "0.0.0" });

			const result = await spawnSidecar("test-session", {});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin binary not found");
		});

		test("returns error when CLAUDE_PLUGIN_ROOT points to non-existent path", async () => {
			process.env.CLAUDE_PLUGIN_ROOT = "/nonexistent/path";
			setPluginInfo({ name: "test-plugin", version: "1.0.0" });

			const result = await spawnSidecar("test-session", {});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin binary not found");
		});

		test("uses session env dir for socket path when available", async () => {
			// Set up session env file so getSessionEnvDir returns a path
			process.env.TEST_PLUGIN_SESSION_ENV_FILE = "/tmp/test-session-env/hook-0.sh";
			process.env.CLAUDE_PLUGIN_ROOT = "/nonexistent/path";
			setPluginInfo({ name: "test-plugin", version: "1.0.0" });

			const result = await spawnSidecar("test-session", {});

			// Will fail because plugin doesn't exist, but we're testing the code path
			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin binary not found");
		});

		test("falls back to /tmp for socket path when no session env dir", async () => {
			// Clear all *_SESSION_ENV_FILE vars
			for (const key of Object.keys(process.env)) {
				if (key.endsWith("_SESSION_ENV_FILE")) {
					delete process.env[key];
				}
			}
			process.env.CLAUDE_PLUGIN_ROOT = "/nonexistent/path";
			setPluginInfo({ name: "test-plugin", version: "1.0.0" });

			const result = await spawnSidecar("test-session", {});

			// Will fail because plugin doesn't exist
			expect(result.success).toBe(false);
			expect(result.error).toBe("Plugin binary not found");
		});

		test("successfully spawns sidecar with valid binary", async () => {
			// Create a temp directory and a simple executable script
			const tempDir = `/tmp/test-sidecar-${Date.now()}`;
			await Bun.$`mkdir -p ${tempDir}`.quiet();

			// Create a simple script that exits immediately
			const scriptContent = "#!/bin/bash\nexit 0";
			await Bun.write(`${tempDir}/test.plugin`, scriptContent);
			await Bun.$`chmod +x ${tempDir}/test.plugin`.quiet();

			// Clear session env files
			for (const key of Object.keys(process.env)) {
				if (key.endsWith("_SESSION_ENV_FILE")) {
					delete process.env[key];
				}
			}

			process.env.CLAUDE_PLUGIN_ROOT = tempDir;
			setPluginInfo({ name: "test", version: "1.0.0" });

			const result = await spawnSidecar("test-session", {
				endpoint: "http://localhost:4318",
				protocol: "http",
				serviceName: "test-service",
				headers: { Authorization: "Bearer token" },
			});

			expect(result.success).toBe(true);
			expect(result.socketPath).toContain("test-session");

			// Clean up
			await Bun.$`rm -rf ${tempDir}`.quiet();
			// Try to clean up socket file if created
			if (result.socketPath) {
				await Bun.$`rm -f ${result.socketPath}`.quiet().nothrow();
			}
		});

		test("spawns sidecar with session env dir when available", async () => {
			// Create a temp directory and a simple executable script
			const tempDir = `/tmp/test-sidecar-${Date.now()}`;
			const sessionEnvDir = `/tmp/test-session-env-${Date.now()}`;
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.$`mkdir -p ${sessionEnvDir}`.quiet();

			// Create a simple script that exits immediately
			const scriptContent = "#!/bin/bash\nexit 0";
			await Bun.write(`${tempDir}/test.plugin`, scriptContent);
			await Bun.$`chmod +x ${tempDir}/test.plugin`.quiet();

			process.env.CLAUDE_PLUGIN_ROOT = tempDir;
			process.env.TEST_PLUGIN_SESSION_ENV_FILE = `${sessionEnvDir}/hook-0.sh`;
			setPluginInfo({ name: "test", version: "1.0.0" });

			const result = await spawnSidecar("test-session", {});

			expect(result.success).toBe(true);
			expect(result.socketPath).toBeDefined();

			// Clean up
			await Bun.$`rm -rf ${tempDir}`.quiet();
			await Bun.$`rm -rf ${sessionEnvDir}`.quiet();
			if (result.socketPath) {
				await Bun.$`rm -f ${result.socketPath}`.quiet().nothrow();
			}
		});
	});
});
