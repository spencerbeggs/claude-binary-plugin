import { describe, expect, test } from "bun:test";
import { HookEvent } from "./HookEvent.js";

describe("HookEvent", () => {
	test("module exports HookEvent class", () => {
		expect(HookEvent).toBeDefined();
		expect(typeof HookEvent).toBe("function");
	});
});
