import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { PluginInfoServiceLive } from "../../src/layers/PluginInfoServiceLive.js";
import { makePluginInfoServiceTest } from "../../src/layers/PluginInfoServiceTest.js";
import { PLUGIN_INFO_ATTRS, PluginInfoService } from "../../src/services/PluginInfoService.js";

// =============================================================================
// PLUGIN_INFO_ATTRS constants
// =============================================================================

describe("PLUGIN_INFO_ATTRS", () => {
	test("NAME is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.NAME).toBe("plugin.name");
	});

	test("VERSION is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.VERSION).toBe("plugin.version");
	});

	test("MARKETPLACE is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.MARKETPLACE).toBe("plugin.marketplace");
	});

	test("MARKETPLACE_VERSION is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.MARKETPLACE_VERSION).toBe("plugin.marketplace.version");
	});

	test("HOOK_HANDLER is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.HOOK_HANDLER).toBe("plugin.hook.handler");
	});

	test("COMMAND is defined correctly", () => {
		expect(PLUGIN_INFO_ATTRS.COMMAND).toBe("plugin.command");
	});
});

// =============================================================================
// PluginInfoServiceLive
// =============================================================================

describe("PluginInfoServiceLive", () => {
	test("get returns default values before set", async () => {
		const program = Effect.flatMap(PluginInfoService, (s) => s.get);
		const result = await Effect.runPromise(program.pipe(Effect.provide(PluginInfoServiceLive)));
		expect(result.name).toBe("unknown");
		expect(result.version).toBe("0.0.0");
		expect(result.marketplace).toBeUndefined();
		expect(result.marketplaceVersion).toBeUndefined();
	});

	test("set and get work correctly", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PluginInfoService;
			yield* service.set({ name: "my-plugin", version: "2.0.0" });
			return yield* service.get;
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(PluginInfoServiceLive)));
		expect(result.name).toBe("my-plugin");
		expect(result.version).toBe("2.0.0");
	});

	test("set overwrites previous value", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PluginInfoService;
			yield* service.set({ name: "first", version: "1.0.0" });
			yield* service.set({ name: "second", version: "2.0.0" });
			return yield* service.get;
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(PluginInfoServiceLive)));
		expect(result.name).toBe("second");
		expect(result.version).toBe("2.0.0");
	});

	test("set preserves optional fields", async () => {
		const program = Effect.gen(function* () {
			const service = yield* PluginInfoService;
			yield* service.set({
				name: "my-plugin",
				version: "1.0.0",
				marketplace: "https://marketplace.example.com",
				marketplaceVersion: "1.0.0-marketplace",
			});
			return yield* service.get;
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(PluginInfoServiceLive)));
		expect(result.marketplace).toBe("https://marketplace.example.com");
		expect(result.marketplaceVersion).toBe("1.0.0-marketplace");
	});
});

// =============================================================================
// makePluginInfoServiceTest
// =============================================================================

describe("makePluginInfoServiceTest", () => {
	test("returns default test values when no data provided", async () => {
		const layer = makePluginInfoServiceTest();
		const program = Effect.flatMap(PluginInfoService, (s) => s.get);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.name).toBe("test-plugin");
		expect(result.version).toBe("1.0.0");
	});

	test("accepts partial override of name", async () => {
		const layer = makePluginInfoServiceTest({ name: "custom-plugin" });
		const program = Effect.flatMap(PluginInfoService, (s) => s.get);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.name).toBe("custom-plugin");
		expect(result.version).toBe("1.0.0");
	});

	test("accepts partial override of version", async () => {
		const layer = makePluginInfoServiceTest({ version: "3.0.0" });
		const program = Effect.flatMap(PluginInfoService, (s) => s.get);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.name).toBe("test-plugin");
		expect(result.version).toBe("3.0.0");
	});

	test("accepts optional marketplace fields", async () => {
		const layer = makePluginInfoServiceTest({ marketplace: "https://example.com" });
		const program = Effect.flatMap(PluginInfoService, (s) => s.get);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.marketplace).toBe("https://example.com");
	});

	test("set is a no-op — get still returns original data", async () => {
		const layer = makePluginInfoServiceTest({ name: "test-plugin" });
		const program = Effect.gen(function* () {
			const service = yield* PluginInfoService;
			yield* service.set({ name: "overwritten", version: "9.9.9" });
			return yield* service.get;
		});
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		// set is a no-op, get should still return the original test data
		expect(result.name).toBe("test-plugin");
		expect(result.version).toBe("1.0.0");
	});
});
