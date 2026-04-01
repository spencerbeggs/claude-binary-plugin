import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { PlatformInfoLive } from "../../src/layers/PlatformInfoLive.js";
import { makePlatformInfoTest } from "../../src/layers/PlatformInfoTest.js";
import { MAX_SOCKET_PATH_LENGTH, PlatformInfo } from "../../src/services/PlatformInfo.js";

// =============================================================================
// PlatformInfo Live Layer
// =============================================================================

describe("PlatformInfo (Live)", () => {
	test("platform matches os.platform()", async () => {
		const program = Effect.map(PlatformInfo, (p) => p.platform);
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(result).toBe(platform());
	});

	test("isSupported is true on darwin/linux", async () => {
		const program = Effect.map(PlatformInfo, (p) => p.isSupported);
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		const currentPlatform = platform();
		const expectedSupported = currentPlatform === "darwin" || currentPlatform === "linux";
		expect(result).toBe(expectedSupported);
	});

	test("getSocketPath returns {dir}/otel.sock", async () => {
		const program = Effect.map(PlatformInfo, (p) => p.getSocketPath("/tmp/sessions/abc"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(result).toBe("/tmp/sessions/abc/otel.sock");
	});

	test("getSocketPathWithFallback returns preferred path when short enough", async () => {
		const program = Effect.map(PlatformInfo, (p) => p.getSocketPathWithFallback("/tmp/sessions/abc", "session-123"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(result).toBe("/tmp/sessions/abc/otel.sock");
	});

	test("getSocketPathWithFallback falls back for long paths", async () => {
		const longDir = "/tmp/" + "a".repeat(200);
		const sessionId = "550e8400-e29b-41d4-a716-446655440000";

		const program = Effect.map(PlatformInfo, (p) => p.getSocketPathWithFallback(longDir, sessionId));
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));

		expect(result.length).toBeLessThanOrEqual(MAX_SOCKET_PATH_LENGTH);
		expect(result).toMatch(/^\/tmp\/claude-otel-.+\.sock$/);
	});

	test("socketExists returns false for nonexistent path", async () => {
		const program = Effect.flatMap(PlatformInfo, (p) => p.socketExists("/tmp/nonexistent-otel-test-file-12345.sock"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(result).toBe(false);
	});

	test("socketExists returns true for existing file", async () => {
		const tmpFile = join(tmpdir(), `test-socket-${Date.now()}.sock`);
		writeFileSync(tmpFile, "");
		try {
			const program = Effect.flatMap(PlatformInfo, (p) => p.socketExists(tmpFile));
			const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
			expect(result).toBe(true);
		} finally {
			unlinkSync(tmpFile);
		}
	});

	test("claudeVersion returns a string", async () => {
		const program = Effect.flatMap(PlatformInfo, (p) => p.claudeVersion);
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	test("claudeVersion caches result on repeated calls", async () => {
		const program = Effect.gen(function* () {
			const p = yield* PlatformInfo;
			const v1 = yield* p.claudeVersion;
			const v2 = yield* p.claudeVersion;
			return { v1, v2 };
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(result.v1).toBe(result.v2);
	});

	test("terminalType returns a string", async () => {
		const program = Effect.map(PlatformInfo, (p) => p.terminalType);
		const result = await Effect.runPromise(program.pipe(Effect.provide(PlatformInfoLive)));
		expect(typeof result).toBe("string");
	});
});

// =============================================================================
// PlatformInfo Test Layer
// =============================================================================

describe("PlatformInfo (Test)", () => {
	test("returns defaults: platform=darwin, isSupported=true, terminalType=iTerm, claudeVersion=1.0.0", async () => {
		const layer = makePlatformInfoTest();
		const program = Effect.gen(function* () {
			const p = yield* PlatformInfo;
			const claudeVersion = yield* p.claudeVersion;
			return {
				platform: p.platform,
				isSupported: p.isSupported,
				terminalType: p.terminalType,
				claudeVersion,
			};
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.platform).toBe("darwin");
		expect(result.isSupported).toBe(true);
		expect(result.terminalType).toBe("iTerm");
		expect(result.claudeVersion).toBe("1.0.0");
	});

	test("accepts overrides for platform", async () => {
		const layer = makePlatformInfoTest({ platform: "linux", isSupported: true });
		const program = Effect.map(PlatformInfo, (p) => p.platform);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe("linux");
	});

	test("accepts overrides for claudeVersion", async () => {
		const layer = makePlatformInfoTest({ claudeVersion: "2.5.0" });
		const program = Effect.flatMap(PlatformInfo, (p) => p.claudeVersion);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe("2.5.0");
	});

	test("socketExists always returns false", async () => {
		const layer = makePlatformInfoTest();
		const program = Effect.flatMap(PlatformInfo, (p) => p.socketExists(import.meta.path));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe(false);
	});

	test("getSocketPath returns {dir}/otel.sock", async () => {
		const layer = makePlatformInfoTest();
		const program = Effect.map(PlatformInfo, (p) => p.getSocketPath("/home/user/sessions/xyz"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe("/home/user/sessions/xyz/otel.sock");
	});

	test("getSocketPathWithFallback falls back for long paths", async () => {
		const layer = makePlatformInfoTest();
		const longDir = "/home/user/" + "b".repeat(200);
		const sessionId = "00000000-0000-0000-0000-000000000000";

		const program = Effect.map(PlatformInfo, (p) => p.getSocketPathWithFallback(longDir, sessionId));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(result.length).toBeLessThanOrEqual(MAX_SOCKET_PATH_LENGTH);
		expect(result).toMatch(/^\/tmp\/claude-otel-.+\.sock$/);
	});
});
