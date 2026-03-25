import { afterEach, describe, expect, test } from "bun:test";
import { PluginInfo } from "../../src/otel/PluginInfo.js";

describe("PluginInfo", () => {
	afterEach(() => {
		PluginInfo.reset();
	});

	test("PluginInfo is exported", () => {
		expect(PluginInfo).toBeDefined();
	});

	test("set and get work correctly", () => {
		PluginInfo.set({ name: "test-plugin", version: "1.0.0" });
		const info = PluginInfo.get();
		expect(info.name).toBe("test-plugin");
		expect(info.version).toBe("1.0.0");
	});

	test("get returns default values before set", () => {
		const info = PluginInfo.get();
		expect(info.name).toBe("unknown");
		expect(info.version).toBe("0.0.0");
	});

	test("reset restores default values", () => {
		PluginInfo.set({ name: "test", version: "0.0.1" });
		PluginInfo.reset();
		const info = PluginInfo.get();
		expect(info.name).toBe("unknown");
	});

	test("ATTRS constants are defined", () => {
		expect(PluginInfo.ATTRS.NAME).toBe("plugin.name");
		expect(PluginInfo.ATTRS.VERSION).toBe("plugin.version");
	});
});
