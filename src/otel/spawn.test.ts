import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setPluginInfo } from "./index.js";
import { getPluginBinaryPath, socketExists } from "./spawn.js";

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
});
