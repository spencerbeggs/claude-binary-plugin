import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { makeEnvBridgeTest } from "../../src/layers/EnvBridgeTest.js";
import { EnvFileParserLive } from "../../src/layers/EnvFileParserLive.js";
import { EnvWriterLive } from "../../src/layers/EnvWriterLive.js";
import { EnvBridge } from "../../src/services/EnvBridge.js";
import { EnvWriter } from "../../src/services/EnvWriter.js";

describe("EnvWriter", () => {
	test("persist writes vars to file and updates EnvBridge", async () => {
		const dir = join(tmpdir(), `env-writer-test-${Date.now()}`);
		await Bun.$`mkdir -p ${dir}`.quiet();
		const envFile = join(dir, "hook-0.sh");
		await Bun.write(envFile, "");

		const { layer: bridgeLayer } = makeEnvBridgeTest({
			CLAUDE_ENV_FILE: envFile,
		});
		const writerDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const writerLayer = Layer.provide(EnvWriterLive, writerDeps);
		const fullLayer = Layer.merge(writerLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const writer = yield* EnvWriter;
				const persistResult = yield* writer.persist({ MY_VAR: "hello", OTHER: "world" });
				const bridge = yield* EnvBridge;
				const vars = yield* bridge.read(["MY_VAR", "OTHER"]);
				return { persistResult, vars };
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.persistResult.persisted).toBe(true);
		expect(result.vars.MY_VAR).toBe("hello");

		const content = await Bun.file(envFile).text();
		expect(content).toContain('export MY_VAR="hello"');
		expect(content).toContain('export OTHER="world"');

		await Bun.$`rm -rf ${dir}`.quiet();
	});

	test("persist returns failure when CLAUDE_ENV_FILE not set", async () => {
		const { layer: bridgeLayer } = makeEnvBridgeTest({});
		const writerDeps = Layer.mergeAll(bridgeLayer, EnvFileParserLive, BunFileSystem.layer);
		const writerLayer = Layer.provide(EnvWriterLive, writerDeps);
		const fullLayer = Layer.merge(writerLayer, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const writer = yield* EnvWriter;
				return yield* writer.persist({ FOO: "bar" });
			}).pipe(Effect.provide(fullLayer)),
		);

		expect(result.persisted).toBe(false);
		expect(result.reason).toBeDefined();
	});
});
