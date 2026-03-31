import { describe, expect, test } from "bun:test";
import { Skip } from "../../src/outcomes/Skip.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Skip", () => {
	test("constructs with summary", () => {
		const s = new Skip({ summary: "tool not in filter" });
		expect(s.summary).toBe("tool not in filter");
	});

	test("toResponse produces empty object (passthrough)", () => {
		expect(new Skip({ summary: "skip" }).toResponse()).toEqual({});
	});

	test("toTelemetry returns skipped outcome with success true", () => {
		const t = new Skip({ summary: "skip" }).toTelemetry();
		expect(t.outcome).toBe("skipped");
		expect(t.success).toBe(true);
	});

	test("optional reason", () => {
		const s = new Skip({ summary: "skip", reason: "not applicable" });
		expect(s.reason).toBe("not applicable");
	});

	test("is an Outcome", () => {
		expect(new Skip({ summary: "s" })).toBeInstanceOf(Outcome);
	});
});
