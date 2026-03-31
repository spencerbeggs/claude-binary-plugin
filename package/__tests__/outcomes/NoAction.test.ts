import { describe, expect, test } from "bun:test";
import { NoAction } from "../../src/outcomes/NoAction.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("NoAction", () => {
	test("constructs with summary", () => {
		const n = new NoAction({ summary: "analyzed, no action needed" });
		expect(n.summary).toBe("analyzed, no action needed");
	});

	test("toResponse produces empty object", () => {
		expect(new NoAction({ summary: "noop" }).toResponse()).toEqual({});
	});

	test("toTelemetry returns no_action outcome", () => {
		expect(new NoAction({ summary: "noop" }).toTelemetry().outcome).toBe("no_action");
	});

	test("is an Outcome", () => {
		expect(new NoAction({ summary: "t" })).toBeInstanceOf(Outcome);
	});
});
