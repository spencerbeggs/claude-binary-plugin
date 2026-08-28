import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makePluginLoggerLive } from "../../src/layers/PluginLoggerLive.js";
import { makePluginLoggerTest } from "../../src/layers/PluginLoggerTest.js";

// =============================================================================
// makePluginLoggerLive — file logging
// =============================================================================

describe("makePluginLoggerLive", () => {
	let tmpDir: string;
	const originalEnv = { ...Bun.env };

	beforeEach(() => {
		tmpDir = `/tmp/plugin-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		Bun.spawnSync(["mkdir", "-p", tmpDir]);
		// Set CLAUDE_DEBUG so logging is enabled
		Bun.env.CLAUDE_DEBUG = "1";
		// Point CLAUDE_ENV_FILE into our tmp dir so the logger resolves the log path there
		Bun.env.CLAUDE_ENV_FILE = `${tmpDir}/hook.sh`;
	});

	afterEach(() => {
		Bun.spawnSync(["rm", "-rf", tmpDir]);
		// Restore env
		for (const key of ["CLAUDE_DEBUG", "CLAUDE_ENV_FILE", "CLAUDE_LOG_STDERR"]) {
			if (originalEnv[key] !== undefined) {
				Bun.env[key] = originalEnv[key];
			} else {
				delete Bun.env[key];
			}
		}
	});

	test("writes NDJSON lines to a file", async () => {
		const loggerLayer = makePluginLoggerLive("test-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("hello from plugin logger");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));

		// Give the batched logger a moment to flush
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/test-plugin.log`).text();
		expect(content.length).toBeGreaterThan(0);

		const lines = content.trim().split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(1);

		const entry = JSON.parse(lines[0]);
		expect(entry.message).toContain("hello from plugin logger");
	});

	test("log entries contain required fields: timestamp, level, message, fiber, channel", async () => {
		const loggerLayer = makePluginLoggerLive("test-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("field check");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/test-plugin.log`).text();
		const entry = JSON.parse(content.trim().split("\n")[0]);

		expect(entry).toHaveProperty("timestamp");
		expect(entry).toHaveProperty("level");
		expect(entry).toHaveProperty("message");
		expect(entry).toHaveProperty("fiber");
		expect(entry).toHaveProperty("channel");
	});

	test("channel defaults to 'general' when no annotation", async () => {
		const loggerLayer = makePluginLoggerLive("test-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("no channel annotation");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/test-plugin.log`).text();
		const entry = JSON.parse(content.trim().split("\n")[0]);

		expect(entry.channel).toBe("general");
	});

	test("Effect.annotateLogs('channel', 'event') produces channel field", async () => {
		const loggerLayer = makePluginLoggerLive("test-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("annotated message");
		}).pipe(Effect.annotateLogs("channel", "event"));

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/test-plugin.log`).text();
		const entry = JSON.parse(content.trim().split("\n")[0]);

		expect(entry.channel).toBe("event");
	});

	test("custom annotations appear as top-level JSON fields", async () => {
		const loggerLayer = makePluginLoggerLive("test-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("with custom annotations");
		}).pipe(Effect.annotateLogs({ hookType: "PreToolUse", pluginName: "my-plugin" }));

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/test-plugin.log`).text();
		const entry = JSON.parse(content.trim().split("\n")[0]);

		expect(entry.hookType).toBe("PreToolUse");
		expect(entry.pluginName).toBe("my-plugin");
	});

	test("pluginName from factory appears in log entries", async () => {
		const loggerLayer = makePluginLoggerLive("my-special-plugin");

		const program = Effect.gen(function* () {
			yield* Effect.log("plugin name check");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const content = await Bun.file(`${tmpDir}/my-special-plugin.log`).text();
		const entry = JSON.parse(content.trim().split("\n")[0]);

		expect(entry.pluginName).toBe("my-special-plugin");
	});
});

// =============================================================================
// makePluginLoggerLive — disabled logging
// =============================================================================

describe("makePluginLoggerLive — disabled", () => {
	const originalEnv = { ...Bun.env };

	afterEach(() => {
		for (const key of ["CLAUDE_DEBUG", "CLAUDE_ENV_FILE"]) {
			if (originalEnv[key] !== undefined) {
				Bun.env[key] = originalEnv[key];
			} else {
				delete Bun.env[key];
			}
		}
	});

	test("returns Logger.none when CLAUDE_DEBUG is unset", async () => {
		delete Bun.env.CLAUDE_DEBUG;

		const loggerLayer = makePluginLoggerLive("test-plugin");

		// Should not throw — Logger.none silently discards
		const program = Effect.gen(function* () {
			yield* Effect.log("this should be discarded");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
		// No file should be written — nothing to assert beyond no error
	});
});

// =============================================================================
// makePluginLoggerLive — file fallback
// =============================================================================

describe("makePluginLoggerLive — file fallback", () => {
	const originalEnv = { ...Bun.env };

	afterEach(() => {
		for (const key of ["CLAUDE_DEBUG", "CLAUDE_ENV_FILE"]) {
			if (originalEnv[key] !== undefined) {
				Bun.env[key] = originalEnv[key];
			} else {
				delete Bun.env[key];
			}
		}
	});

	test("falls back to Logger.none on file open failure", async () => {
		Bun.env.CLAUDE_DEBUG = "1";
		// Point to a directory that doesn't exist and can't be created
		Bun.env.CLAUDE_ENV_FILE = "/nonexistent/deeply/nested/path/hook.sh";

		const loggerLayer = makePluginLoggerLive("test-plugin");

		// Should not throw — falls back to Logger.none
		const program = Effect.gen(function* () {
			yield* Effect.log("should not crash");
		});

		await Effect.runPromise(program.pipe(Effect.provide(loggerLayer)));
	});
});

// =============================================================================
// makePluginLoggerTest
// =============================================================================

describe("makePluginLoggerTest", () => {
	test("captures logs in-memory", async () => {
		const { layer, getLogs } = makePluginLoggerTest();

		const program = Effect.gen(function* () {
			yield* Effect.log("captured message");
		});

		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		const logs = getLogs();
		expect(logs.length).toBe(1);
		expect(logs[0].message).toContain("captured message");
		expect(logs[0]).toHaveProperty("timestamp");
		expect(logs[0]).toHaveProperty("level");
	});

	test("captures annotations", async () => {
		const { layer, getLogs } = makePluginLoggerTest();

		const program = Effect.gen(function* () {
			yield* Effect.log("with annotations");
		}).pipe(Effect.annotateLogs({ channel: "pipeline", hookType: "PreToolUse" }));

		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		const logs = getLogs();
		expect(logs[0].channel).toBe("pipeline");
		expect(logs[0].hookType).toBe("PreToolUse");
	});

	test("clear() resets captured logs", async () => {
		const { layer, getLogs, clear } = makePluginLoggerTest();

		const program = Effect.gen(function* () {
			yield* Effect.log("first");
			yield* Effect.log("second");
		});

		await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(getLogs().length).toBe(2);

		clear();
		expect(getLogs().length).toBe(0);
	});

	test("getLogs returns a copy (not a reference)", async () => {
		const { layer, getLogs } = makePluginLoggerTest();

		const program = Effect.gen(function* () {
			yield* Effect.log("test");
		});

		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		const copy = getLogs();
		expect(copy.length).toBe(1);

		// Modifying the copy should not affect internal state
		copy.length = 0;
		expect(getLogs().length).toBe(1);
	});
});
