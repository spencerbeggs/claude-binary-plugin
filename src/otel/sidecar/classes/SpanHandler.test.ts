import { describe, expect, test } from "bun:test";
import { SpanHandler } from "./SpanHandler.js";

describe("SpanHandler", () => {
	test("SpanHandler is exported", () => {
		expect(SpanHandler).toBeDefined();
	});

	test("handle is a static method", () => {
		expect(typeof SpanHandler.handle).toBe("function");
	});
});
