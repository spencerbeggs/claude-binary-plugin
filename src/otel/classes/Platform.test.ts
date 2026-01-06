import { describe, expect, test } from "bun:test";
import { platform } from "node:os";
import { Platform } from "./Platform.js";

describe("Platform", () => {
	describe("isSupported", () => {
		test("returns true on darwin or linux", () => {
			const currentPlatform = platform();

			if (currentPlatform === "darwin" || currentPlatform === "linux") {
				expect(Platform.isSupported()).toBe(true);
			} else {
				expect(Platform.isSupported()).toBe(false);
			}
		});
	});

	describe("get", () => {
		test("returns current platform", () => {
			expect(Platform.get()).toBe(platform());
		});
	});

	describe("getError", () => {
		test("returns error message mentioning platform", () => {
			const error = Platform.getError();

			expect(error).toContain("not supported");
			expect(error).toContain(platform());
		});

		test("mentions supported platforms in error", () => {
			const error = Platform.getError();

			// The error should mention supported platforms
			expect(error.toLowerCase()).toContain("macos");
			expect(error.toLowerCase()).toContain("linux");
		});
	});

	describe("assertSupported", () => {
		test("does not throw on supported platforms", () => {
			const currentPlatform = platform();

			if (currentPlatform === "darwin" || currentPlatform === "linux") {
				expect(() => Platform.assertSupported()).not.toThrow();
			}
		});

		test("throws on unsupported platforms", () => {
			const currentPlatform = platform();

			if (currentPlatform !== "darwin" && currentPlatform !== "linux") {
				expect(() => Platform.assertSupported()).toThrow();
			}
		});
	});

	describe("getSocketPath", () => {
		test("returns socket path in session env directory", () => {
			const sessionEnvDir = "/tmp/claude-session-abc123";

			const socketPath = Platform.getSocketPath(sessionEnvDir);

			expect(socketPath).toBe("/tmp/claude-session-abc123/otel.sock");
		});

		test("handles trailing slash in session env dir", () => {
			const sessionEnvDir = "/tmp/claude-session-abc123/";

			const socketPath = Platform.getSocketPath(sessionEnvDir);

			// Should still work, though with double slash
			expect(socketPath).toContain("otel.sock");
		});
	});

	describe("getSocketPathWithFallback", () => {
		test("returns preferred path when short enough", () => {
			const sessionEnvDir = "/tmp/short";
			const sessionId = "abc123";

			const socketPath = Platform.getSocketPathWithFallback(sessionEnvDir, sessionId);

			expect(socketPath).toBe("/tmp/short/otel.sock");
		});

		test("falls back to /tmp when path is too long", () => {
			// Create a very long session env dir path
			const longPath = `/Users/username/.config/claude/sessions/${"a".repeat(100)}`;
			const sessionId = "test-session-123";

			const socketPath = Platform.getSocketPathWithFallback(longPath, sessionId);

			expect(socketPath).toStartWith("/tmp/claude-otel-");
			expect(socketPath).toEndWith(".sock");
			expect(socketPath.length).toBeLessThanOrEqual(Platform.MAX_SOCKET_PATH_LENGTH);
		});

		test("truncates session ID if needed for fallback", () => {
			const longPath = `/very/long/path/${"x".repeat(100)}`;
			const longSessionId = `very-long-session-id-that-exceeds-limits-${"z".repeat(100)}`;

			const socketPath = Platform.getSocketPathWithFallback(longPath, longSessionId);

			expect(socketPath.length).toBeLessThanOrEqual(Platform.MAX_SOCKET_PATH_LENGTH);
			expect(socketPath).toStartWith("/tmp/claude-otel-");
		});
	});

	describe("MAX_SOCKET_PATH_LENGTH", () => {
		test("is a reasonable limit for Unix sockets", () => {
			// Unix socket paths are typically limited to 104-108 bytes
			expect(Platform.MAX_SOCKET_PATH_LENGTH).toBeGreaterThanOrEqual(90);
			expect(Platform.MAX_SOCKET_PATH_LENGTH).toBeLessThanOrEqual(108);
		});
	});

	describe("socketExists", () => {
		test("returns false for non-existent path", async () => {
			const exists = await Platform.socketExists("/nonexistent/path/to/socket.sock");

			expect(exists).toBe(false);
		});

		test("returns true for existing file", async () => {
			// Use a file we know exists
			const exists = await Platform.socketExists(import.meta.path);

			expect(exists).toBe(true);
		});
	});
});
