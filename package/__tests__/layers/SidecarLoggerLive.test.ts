import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { makeSidecarLoggerLive, resolveSidecarLogPath } from "../../src/layers/SidecarLoggerLive.js";

// =============================================================================
// makeSidecarLoggerLive
// =============================================================================

describe("makeSidecarLoggerLive", () => {
	let tmpDir: string;
	let logPath: string;

	beforeEach(() => {
		tmpDir = `/tmp/sidecar-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		Bun.spawnSync(["mkdir", "-p", tmpDir]);
		logPath = `${tmpDir}/sidecar.log`;
	});

	afterEach(() => {
		Bun.spawnSync(["rm", "-rf", tmpDir]);
	});

	test("makeSidecarLoggerLive creates a layer without throwing", () => {
		expect(() => makeSidecarLoggerLive(logPath)).not.toThrow();
	});

	test("Effect.log writes to file when using the layer", async () => {
		const loggerLayer = makeSidecarLoggerLive(logPath);

		const program = Effect.gen(function* () {
			yield* Effect.log("test message from sidecar logger");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));

		// Give the batched logger a moment to flush
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(logPath).text();
		expect(content.length).toBeGreaterThan(0);
		expect(content).toContain("test message from sidecar logger");
	});

	test("multiple log messages all appear in file", async () => {
		const loggerLayer = makeSidecarLoggerLive(logPath);

		const program = Effect.gen(function* () {
			yield* Effect.log("first message");
			yield* Effect.log("second message");
			yield* Effect.log("third message");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));

		// Give the batched logger a moment to flush
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(logPath).text();
		expect(content).toContain("first message");
		expect(content).toContain("second message");
		expect(content).toContain("third message");
	});
});

// =============================================================================
// resolveSidecarLogPath
// =============================================================================

describe("resolveSidecarLogPath", () => {
	const originalEnv = { ...Bun.env };

	afterEach(() => {
		// Restore env
		delete Bun.env.CLAUDE_ENV_FILE;
		if (originalEnv.CLAUDE_ENV_FILE) {
			Bun.env.CLAUDE_ENV_FILE = originalEnv.CLAUDE_ENV_FILE;
		}
	});

	test("returns path in /tmp when CLAUDE_ENV_FILE is not set", () => {
		delete Bun.env.CLAUDE_ENV_FILE;
		const logPath = resolveSidecarLogPath();
		expect(logPath).toBe("/tmp/claude-otel-sidecar.log");
	});

	test("returns path in session dir when CLAUDE_ENV_FILE is set", () => {
		Bun.env.CLAUDE_ENV_FILE = "/some/session/dir/session-env.sh";
		const logPath = resolveSidecarLogPath();
		expect(logPath).toBe("/some/session/dir/claude-otel-sidecar.log");
	});

	test("log file is always named claude-otel-sidecar.log", () => {
		Bun.env.CLAUDE_ENV_FILE = "/var/sessions/abc123/hook.sh";
		const logPath = resolveSidecarLogPath();
		expect(logPath.endsWith("claude-otel-sidecar.log")).toBe(true);
	});
});

// =============================================================================
// Layer composition
// =============================================================================

describe("SidecarLoggerLive layer composition", () => {
	test("layer can be composed with other layers via Layer.provide", async () => {
		const tmpDir = `/tmp/sidecar-compose-test-${Date.now()}`;
		Bun.spawnSync(["mkdir", "-p", tmpDir]);
		const logPath = `${tmpDir}/compose.log`;

		try {
			const loggerLayer = makeSidecarLoggerLive(logPath);

			// Compose with an additional layer to verify no type errors
			const composed = Layer.mergeAll(loggerLayer);

			const program = Effect.gen(function* () {
				yield* Effect.log("composition test");
			});

			await Effect.runPromise(program.pipe(Effect.provide(composed)));

			// Wait for batch flush
			await new Promise((resolve) => setTimeout(resolve, 1200));

			const content = await Bun.file(logPath).text();
			expect(content).toContain("composition test");
		} finally {
			Bun.spawnSync(["rm", "-rf", tmpDir]);
		}
	});
});
