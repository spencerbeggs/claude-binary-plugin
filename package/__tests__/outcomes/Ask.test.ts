import { describe, expect, test } from "bun:test";
import { Ask } from "../../src/outcomes/Ask.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Ask", () => {
	test("constructs with summary", () => {
		const a = new Ask({ summary: "needs user confirmation" });
		expect(a.summary).toBe("needs user confirmation");
	});

	test("toResponse produces permissionDecision: ask", () => {
		const a = new Ask({ summary: "check", reason: "unfamiliar tool" });
		expect(a.toResponse()).toEqual({ permissionDecision: "ask", reason: "unfamiliar tool" });
	});

	test("toResponse omits reason when not provided", () => {
		const a = new Ask({ summary: "check" });
		expect(a.toResponse()).toEqual({ permissionDecision: "ask" });
	});

	test("toTelemetry returns asked outcome", () => {
		const a = new Ask({ summary: "check" });
		expect(a.toTelemetry().outcome).toBe("asked");
		expect(a.toTelemetry().success).toBe(true);
	});

	test("is an Outcome", () => {
		expect(Outcome.isOutcome(new Ask({ summary: "test" }))).toBe(true);
	});
});
