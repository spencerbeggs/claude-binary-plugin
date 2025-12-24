import { describe, expect, test } from "bun:test";
import { platform } from "node:os";
import {
	MAX_SOCKET_PATH_LENGTH,
	assertPlatformSupported,
	getPlatform,
	getPlatformError,
	getSocketPath,
	getSocketPathWithFallback,
	isPlatformSupported,
} from "./platform.js";

describe("platform", () => {
	describe("isPlatformSupported", () => {
		test("returns true on darwin or linux", () => {
			const currentPlatform = platform();

			if (currentPlatform === "darwin" || currentPlatform === "linux") {
				expect(isPlatformSupported()).toBe(true);
			} else {
				expect(isPlatformSupported()).toBe(false);
			}
		});
	});

	describe("getPlatform", () => {
		test("returns current platform", () => {
			expect(getPlatform()).toBe(platform());
		});
	});

	describe("getPlatformError", () => {
		test("returns error message mentioning platform", () => {
			const error = getPlatformError();

			expect(error).toContain("not supported");
			expect(error).toContain(platform());
		});

		test("mentions supported platforms in error", () => {
			const error = getPlatformError();

			// The error should mention supported platforms
			expect(error.toLowerCase()).toContain("macos");
			expect(error.toLowerCase()).toContain("linux");
		});
	});

	describe("assertPlatformSupported", () => {
		test("does not throw on supported platforms", () => {
			const currentPlatform = platform();

			if (currentPlatform === "darwin" || currentPlatform === "linux") {
				expect(() => assertPlatformSupported()).not.toThrow();
			}
		});

		test("throws on unsupported platforms", () => {
			const currentPlatform = platform();

			if (currentPlatform !== "darwin" && currentPlatform !== "linux") {
				expect(() => assertPlatformSupported()).toThrow();
			}
		});
	});

	describe("getSocketPath", () => {
		test("returns socket path in session env directory", () => {
			const sessionEnvDir = "/tmp/claude-session-abc123";

			const socketPath = getSocketPath(sessionEnvDir);

			expect(socketPath).toBe("/tmp/claude-session-abc123/otel.sock");
		});

		test("handles trailing slash in session env dir", () => {
			const sessionEnvDir = "/tmp/claude-session-abc123/";

			const socketPath = getSocketPath(sessionEnvDir);

			// Should still work, though with double slash
			expect(socketPath).toContain("otel.sock");
		});
	});

	describe("getSocketPathWithFallback", () => {
		test("returns preferred path when short enough", () => {
			const sessionEnvDir = "/tmp/short";
			const sessionId = "abc123";

			const socketPath = getSocketPathWithFallback(sessionEnvDir, sessionId);

			expect(socketPath).toBe("/tmp/short/otel.sock");
		});

		test("falls back to /tmp when path is too long", () => {
			// Create a very long session env dir path
			const longPath = `/Users/username/.config/claude/sessions/${"a".repeat(100)}`;
			const sessionId = "test-session-123";

			const socketPath = getSocketPathWithFallback(longPath, sessionId);

			expect(socketPath).toStartWith("/tmp/claude-otel-");
			expect(socketPath).toEndWith(".sock");
			expect(socketPath.length).toBeLessThanOrEqual(MAX_SOCKET_PATH_LENGTH);
		});

		test("truncates session ID if needed for fallback", () => {
			const longPath = `/very/long/path/${"x".repeat(100)}`;
			const longSessionId = `very-long-session-id-that-exceeds-limits-${"z".repeat(100)}`;

			const socketPath = getSocketPathWithFallback(longPath, longSessionId);

			expect(socketPath.length).toBeLessThanOrEqual(MAX_SOCKET_PATH_LENGTH);
			expect(socketPath).toStartWith("/tmp/claude-otel-");
		});
	});

	describe("MAX_SOCKET_PATH_LENGTH", () => {
		test("is a reasonable limit for Unix sockets", () => {
			// Unix socket paths are typically limited to 104-108 bytes
			expect(MAX_SOCKET_PATH_LENGTH).toBeGreaterThanOrEqual(90);
			expect(MAX_SOCKET_PATH_LENGTH).toBeLessThanOrEqual(108);
		});
	});
});
