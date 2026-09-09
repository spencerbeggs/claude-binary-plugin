import { describe, expect, test } from "bun:test";
import { Continue } from "../../src/outcomes/Continue.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Continue", () => {
	test("constructs with summary", () => {
		const c = new Continue({ summary: "all checks passed" });
		expect(c.summary).toBe("all checks passed");
	});

	test("toResponse produces empty object (allow continuation)", () => {
		const c = new Continue({ summary: "ok" });
		expect(c.toResponse()).toEqual({});
	});

	test("toTelemetry returns continued outcome", () => {
		const c = new Continue({ summary: "ok" });
		expect(c.toTelemetry().outcome).toBe("continued");
	});

	test("is an Outcome", () => {
		expect(new Continue({ summary: "ok" })).toBeInstanceOf(Outcome);
	});
});
