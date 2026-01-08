import { describe, expect, test } from "bun:test";
import { SidecarServer } from "./SidecarServer.js";

describe("SidecarServer", () => {
	test("SidecarServer is exported", () => {
		expect(SidecarServer).toBeDefined();
	});

	test("SidecarServer is a class constructor", () => {
		expect(typeof SidecarServer).toBe("function");
		expect(SidecarServer.prototype).toBeDefined();
	});

	test("prototype has stop method", () => {
		expect(typeof SidecarServer.prototype.stop).toBe("function");
	});

	test("prototype has clientCount method", () => {
		expect(typeof SidecarServer.prototype.clientCount).toBe("function");
	});
});
