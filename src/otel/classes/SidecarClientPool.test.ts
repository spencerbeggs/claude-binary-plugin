import { describe, expect, test } from "bun:test";
import { SidecarClientPool } from "./SidecarClientPool.js";

describe("SidecarClientPool", () => {
	test("SidecarClientPool is exported", () => {
		expect(SidecarClientPool).toBeDefined();
	});

	test("get is a static method", () => {
		expect(typeof SidecarClientPool.get).toBe("function");
	});

	test("remove is a static method", () => {
		expect(typeof SidecarClientPool.remove).toBe("function");
	});

	test("clearAll is a static method", () => {
		expect(typeof SidecarClientPool.clearAll).toBe("function");
	});
});
