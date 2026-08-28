import { describe, expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { SchemaValidationError } from "../../src/errors/SchemaValidationError.js";
import { makeEnvBridgeTest } from "../../src/layers/EnvBridgeTest.js";
import { EnvValidatorLive } from "../../src/layers/EnvValidatorLive.js";
import { EnvValidator } from "../../src/services/EnvValidator.js";

const TestSchema = Schema.Struct({
	MY_TIMEOUT: Schema.NumberFromString,
	MY_ENABLED: Schema.Literal("true", "false"),
});

describe("EnvValidator", () => {
	test("validates matching env vars against schema", async () => {
		const { layer: bridgeLayer } = makeEnvBridgeTest({
			MY_TIMEOUT: "5000",
			MY_ENABLED: "true",
			UNRELATED: "ignored",
		});
		const layer = Layer.provide(EnvValidatorLive, bridgeLayer);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const validator = yield* EnvValidator;
				return yield* validator.validate(TestSchema);
			}).pipe(Effect.provide(layer)),
		);

		expect(result).toEqual({ MY_TIMEOUT: 5000, MY_ENABLED: "true" });
	});

	test("fails with SchemaValidationError for invalid env vars", async () => {
		const { layer: bridgeLayer } = makeEnvBridgeTest({
			MY_TIMEOUT: "not_a_number",
			MY_ENABLED: "true",
		});
		const layer = Layer.provide(EnvValidatorLive, bridgeLayer);

		const result = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const validator = yield* EnvValidator;
				return yield* validator.validate(TestSchema);
			}).pipe(Effect.provide(layer)),
		);

		expect(result._tag).toBe("Failure");
	});
});
