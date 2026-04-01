import { describe, expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { makeEnvBridgeTest } from "../../src/layers/EnvBridgeTest.js";
import { EnvCoordinatorLive } from "../../src/layers/EnvCoordinatorLive.js";
import { makeEnvCoordinatorTest } from "../../src/layers/EnvCoordinatorTest.js";
import { EnvFileParserLive } from "../../src/layers/EnvFileParserLive.js";
import { EnvLoaderTest } from "../../src/layers/EnvLoaderTest.js";
import { makeEnvResolverTest } from "../../src/layers/EnvResolverTest.js";
import { EnvValidatorLive } from "../../src/layers/EnvValidatorLive.js";
import { makeEnvWriterTest } from "../../src/layers/EnvWriterTest.js";
import { EnvCoordinator } from "../../src/services/EnvCoordinator.js";

const TestOptions = Schema.Struct({
	MY_TIMEOUT: Schema.NumberFromString,
});

function buildCoordinatorLayer(env: Record<string, string>) {
	const { layer: bridgeLayer } = makeEnvBridgeTest(env);
	const { layer: writerLayer, writes } = makeEnvWriterTest();
	const { layer: resolverLayer } = makeEnvResolverTest();

	const validatorLayer = Layer.provide(EnvValidatorLive, bridgeLayer);

	const deps = Layer.mergeAll(
		bridgeLayer,
		EnvFileParserLive,
		validatorLayer,
		EnvLoaderTest,
		writerLayer,
		resolverLayer,
	);
	const coordLayer = Layer.provide(EnvCoordinatorLive, deps);
	const fullLayer = Layer.merge(coordLayer, bridgeLayer);

	return { fullLayer, writes };
}

describe("EnvCoordinator", () => {
	describe("forSessionStart", () => {
		test("loads env and validates options", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "5000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forSessionStart(TestOptions, {
						projectRoot: "/fake/project",
					});
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result).toEqual({ MY_TIMEOUT: 5000 });
		});

		test("uses CLAUDE_PROJECT_DIR when projectRoot is not provided", async () => {
			const { fullLayer } = buildCoordinatorLayer({
				MY_TIMEOUT: "2000",
				CLAUDE_PROJECT_DIR: "/from/env",
			});

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forSessionStart(TestOptions, {});
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result).toEqual({ MY_TIMEOUT: 2000 });
		});

		test("fails on schema validation error", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "not-a-number" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forSessionStart(TestOptions, {}).pipe(Effect.either);
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result._tag).toBe("Left");
		});
	});

	describe("forHook", () => {
		test("resolves session dir and validates options", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "3000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forHook(TestOptions, { sessionId: "sess-1" });
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result).toEqual({ MY_TIMEOUT: 3000 });
		});

		test("uses provided sessionEnvDir", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "4000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forHook(TestOptions, {
						sessionId: "sess-1",
						sessionEnvDir: "/explicit/dir",
					});
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result).toEqual({ MY_TIMEOUT: 4000 });
		});
	});

	describe("forCommand", () => {
		test("validates options from env", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "7000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forCommand(TestOptions, { args: [] });
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result.options).toEqual({ MY_TIMEOUT: 7000 });
			expect(result.remainingArgs).toEqual([]);
		});

		test("extracts --vars= from args", async () => {
			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "8000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forCommand(TestOptions, {
						args: ["--vars=/tmp/vars.sh", "--other", "positional"],
					});
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result.options).toEqual({ MY_TIMEOUT: 8000 });
			expect(result.remainingArgs).toEqual(["--other", "positional"]);
		});

		test("parses args with argsSchema", async () => {
			const ArgsSchema = Schema.Struct({
				verbose: Schema.Boolean,
			});

			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "1000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forCommand(TestOptions, { args: ["--verbose"] }, ArgsSchema);
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result.options).toEqual({ MY_TIMEOUT: 1000 });
			expect(result.args).toEqual({ verbose: true });
		});

		test("parses args with key=value syntax", async () => {
			const ArgsSchema = Schema.Struct({
				name: Schema.String,
			});

			const { fullLayer } = buildCoordinatorLayer({ MY_TIMEOUT: "1000" });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forCommand(TestOptions, { args: ["--name=hello"] }, ArgsSchema);
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result.args).toEqual({ name: "hello" });
		});
	});

	describe("persistSessionEnv", () => {
		test("persists vars and registers session", async () => {
			const { fullLayer, writes } = buildCoordinatorLayer({});

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.persistSessionEnv({
						sessionId: "sess-42",
						prefix: "MY_PLUGIN",
						vars: { FOO: "bar" },
						projectDir: "/my/project",
						claudeEnvFile: "/tmp/session/env.sh",
					});
				}).pipe(Effect.provide(fullLayer)),
			);

			expect(result.persisted).toBe(true);
			expect(writes).toHaveLength(1);
			expect(writes[0]?.vars).toEqual({ FOO: "bar" });
		});
	});

	describe("EnvCoordinatorTest", () => {
		test("returns default options", async () => {
			const { layer } = makeEnvCoordinatorTest({ options: { MY_TIMEOUT: 9999 } });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forSessionStart(TestOptions, {});
				}).pipe(Effect.provide(layer)),
			);

			expect(result).toEqual({ MY_TIMEOUT: 9999 });
		});

		test("forCommand returns defaults", async () => {
			const { layer } = makeEnvCoordinatorTest({ options: { MY_TIMEOUT: 1234 } });

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.forCommand(TestOptions, { args: [] });
				}).pipe(Effect.provide(layer)),
			);

			expect(result.options).toEqual({ MY_TIMEOUT: 1234 });
			expect(result.remainingArgs).toEqual([]);
		});

		test("persistSessionEnv returns success", async () => {
			const { layer } = makeEnvCoordinatorTest();

			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const coordinator = yield* EnvCoordinator;
					return yield* coordinator.persistSessionEnv({
						sessionId: "s",
						prefix: "P",
						vars: {},
						projectDir: "/p",
						claudeEnvFile: "/e",
					});
				}).pipe(Effect.provide(layer)),
			);

			expect(result.persisted).toBe(true);
		});
	});
});
