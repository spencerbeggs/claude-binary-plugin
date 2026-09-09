import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { makeEnvBridgeTest } from "../../src/layers/EnvBridgeTest.js";
import { EnvFileParserLive } from "../../src/layers/EnvFileParserLive.js";
import { EnvLoaderLive } from "../../src/layers/EnvLoaderLive.js";
import { EnvBridge } from "../../src/services/EnvBridge.js";
import { EnvLoader } from "../../src/services/EnvLoader.js";

const setupTestDir = async () => {
	const dir = join(tmpdir(), `env-loader-test-${Date.now()}`);
	await Bun.$`mkdir -p ${dir}`.quiet();
	return dir;
};

describe("EnvLoader", () => {
	test("loadUserEnvFiles reads .env and writes through EnvBridge", async () => {
		const dir = await setupTestDir();
		await Bun.write(join(dir, ".env"), "TEST_KEY=test_value\nANOTHER=42");

		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				const loaded = yield* loader.loadUserEnvFiles(dir);
				const bridge = yield* EnvBridge;
				const vars = yield* bridge.read(["TEST_KEY", "ANOTHER"]);
				return { loaded, vars };
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.loaded).toContain(".env");
		expect(result.vars.TEST_KEY).toBe("test_value");
		expect(result.vars.ANOTHER).toBe("42");

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadUserEnvFiles does not overwrite existing env vars", async () => {
		const dir = await setupTestDir();
		await Bun.write(join(dir, ".env"), "EXISTING_KEY=from_file\nNEW_KEY=new_value");

		const { layer: bridgeLayer } = makeEnvBridgeTest({ EXISTING_KEY: "original" });
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				yield* loader.loadUserEnvFiles(dir);
				const bridge = yield* EnvBridge;
				return yield* bridge.read(["EXISTING_KEY", "NEW_KEY"]);
			}).pipe(Effect.provide(fullLayer)),
		);

		// EXISTING_KEY should not be overwritten
		expect(result.EXISTING_KEY).toBe("original");
		// NEW_KEY should be set from file
		expect(result.NEW_KEY).toBe("new_value");

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadUserEnvFiles returns empty array when no env files exist", async () => {
		const dir = await setupTestDir();

		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const loaded = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				return yield* loader.loadUserEnvFiles(dir);
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(loaded).toEqual([]);

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadSessionEnvFiles reads hook files from directory", async () => {
		const dir = await setupTestDir();
		await Bun.write(join(dir, "sessionstart-hook-0.sh"), 'export SESS_VAR="loaded"');

		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				const count = yield* loader.loadSessionEnvFiles(dir);
				const bridge = yield* EnvBridge;
				const vars = yield* bridge.read(["SESS_VAR"]);
				return { count, vars };
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.count).toBeGreaterThanOrEqual(1);
		expect(result.vars.SESS_VAR).toBe("loaded");

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadSessionEnvFiles ignores non-hook files", async () => {
		const dir = await setupTestDir();
		await Bun.write(join(dir, "config.sh"), 'export CONFIG_VAR="should_not_load"');
		await Bun.write(join(dir, "pretooluse-hook-0.sh"), 'export HOOK_VAR="loaded"');

		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				const count = yield* loader.loadSessionEnvFiles(dir);
				const bridge = yield* EnvBridge;
				const vars = yield* bridge.read(["CONFIG_VAR", "HOOK_VAR"]);
				return { count, vars };
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.count).toBe(1);
		expect(result.vars.CONFIG_VAR).toBeUndefined();
		expect(result.vars.HOOK_VAR).toBe("loaded");

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadFromVarsFile reads a specific file and writes vars through EnvBridge", async () => {
		const dir = await setupTestDir();
		const filePath = join(dir, "vars.env");
		await Bun.write(filePath, 'export VARS_KEY="vars_value"\nexport ANOTHER_VAR=hello');

		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				yield* loader.loadFromVarsFile(filePath);
				const bridge = yield* EnvBridge;
				return yield* bridge.read(["VARS_KEY", "ANOTHER_VAR"]);
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.VARS_KEY).toBe("vars_value");
		expect(result.ANOTHER_VAR).toBe("hello");

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("loadFromVarsFile fails with EnvLoadError when file does not exist", async () => {
		const { layer: bridgeLayer } = makeEnvBridgeTest();
		const loaderDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const loaderLayer = Layer.provide(EnvLoaderLive, loaderDeps);
		const fullLayer = Layer.merge(loaderLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const loader = yield* EnvLoader;
				return yield* loader.loadFromVarsFile("/nonexistent/path/vars.env").pipe(
					Effect.match({
						onFailure: (e) => ({ ok: false, file: e.file }),
						onSuccess: () => ({ ok: true, file: "" }),
					}),
				);
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.ok).toBe(false);
		expect(result.file).toBe("/nonexistent/path/vars.env");
	});
});
