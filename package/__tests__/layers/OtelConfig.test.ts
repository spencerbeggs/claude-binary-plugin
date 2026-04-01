import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { OtelConfigLive } from "../../src/layers/OtelConfigLive.js";
import { makeOtelConfigTest } from "../../src/layers/OtelConfigTest.js";
import { makePlatformInfoTest } from "../../src/layers/PlatformInfoTest.js";
import { OtelConfig, OtelConfigData } from "../../src/services/OtelConfig.js";

describe("OtelConfigData", () => {
	test("is a Schema.Class", () => {
		const data = new OtelConfigData({
			enabled: true,
			endpoint: "http://localhost:4318",
		});
		expect(data.enabled).toBe(true);
		expect(data.endpoint).toBe("http://localhost:4318");
	});

	test("defaults optional fields to undefined", () => {
		const data = new OtelConfigData({ enabled: false });
		expect(data.protocol).toBeUndefined();
		expect(data.headers).toBeUndefined();
		expect(data.socketPath).toBeUndefined();
		expect(data.tracesExporter).toBeUndefined();
		expect(data.metricsExporter).toBeUndefined();
		expect(data.logsExporter).toBeUndefined();
		expect(data.resourceAttributes).toBeUndefined();
		expect(data.deploymentEnv).toBeUndefined();
	});
});

describe("OtelConfigLive", () => {
	test("reads enabled from env", async () => {
		const layer = OtelConfigLive.pipe(Layer.provide(makePlatformInfoTest()));
		const program = Effect.flatMap(OtelConfig, (config) => Effect.succeed(config.enabled));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(typeof result).toBe("boolean");
	});
});

describe("makeOtelConfigTest", () => {
	test("defaults to disabled", async () => {
		const { layer } = makeOtelConfigTest();
		const program = Effect.flatMap(OtelConfig, (config) => Effect.succeed(config.enabled));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe(false);
	});

	test("accepts overrides", async () => {
		const { layer } = makeOtelConfigTest({
			enabled: true,
			endpoint: "http://custom:4318",
		});
		const program = Effect.flatMap(OtelConfig, (config) =>
			Effect.succeed({ enabled: config.enabled, endpoint: config.endpoint }),
		);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.enabled).toBe(true);
		expect(result.endpoint).toBe("http://custom:4318");
	});
});
