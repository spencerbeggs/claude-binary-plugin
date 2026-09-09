import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { makeEnvBridgeTest } from "../../src/layers/EnvBridgeTest.js";
import { EnvBridge } from "../../src/services/EnvBridge.js";

describe("EnvBridge (test layer)", () => {
	test("write then read returns written values", async () => {
		const { layer } = makeEnvBridgeTest();
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const bridge = yield* EnvBridge;
				yield* bridge.write({ FOO: "bar", BAZ: "qux" });
				return yield* bridge.read(["FOO", "BAZ", "MISSING"]);
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toEqual({ FOO: "bar", BAZ: "qux", MISSING: undefined });
	});

	test("readAll returns all written values", async () => {
		const { layer } = makeEnvBridgeTest({ INITIAL: "value" });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const bridge = yield* EnvBridge;
				yield* bridge.write({ NEW: "added" });
				return yield* bridge.readAll();
			}).pipe(Effect.provide(layer)),
		);
		expect(result.INITIAL).toBe("value");
		expect(result.NEW).toBe("added");
	});

	test("seeded vars are available immediately", async () => {
		const { layer } = makeEnvBridgeTest({ PRE: "seeded" });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const bridge = yield* EnvBridge;
				return yield* bridge.read(["PRE"]);
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toEqual({ PRE: "seeded" });
	});
});
