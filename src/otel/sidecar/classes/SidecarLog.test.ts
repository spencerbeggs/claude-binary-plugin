import { describe, expect, test } from "bun:test";
import { SidecarLog } from "./SidecarLog.js";

describe("SidecarLog", () => {
	test("SidecarLog is exported", () => {
		expect(SidecarLog).toBeDefined();
	});

	test("enable is a static method", () => {
		expect(typeof SidecarLog.enable).toBe("function");
	});

	test("write is a static method", () => {
		expect(typeof SidecarLog.write).toBe("function");
	});
});
