import { describe, expect, test } from "bun:test";
import { EventHandler } from "./EventHandler.js";

describe("EventHandler", () => {
	test("EventHandler is exported", () => {
		expect(EventHandler).toBeDefined();
	});

	test("handle is a static method", () => {
		expect(typeof EventHandler.handle).toBe("function");
	});
});
