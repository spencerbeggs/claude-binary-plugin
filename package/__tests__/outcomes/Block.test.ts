import { describe, expect, test } from "bun:test";
import { Block } from "../../src/outcomes/Block.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Block", () => {
	test("constructs with summary and reason", () => {
		const b = new Block({ summary: "tests failing", reason: "3 tests failed" });
		expect(b.reason).toBe("3 tests failed");
	});

	test("reason is required", () => {
		expect(() => new Block({ summary: "blocked" } as any)).toThrow();
	});

	test("toResponse produces decision: block with reason", () => {
		const b = new Block({ summary: "tests failing", reason: "3 tests failed" });
		expect(b.toResponse()).toEqual({ decision: "block", reason: "3 tests failed" });
	});

	test("toTelemetry returns blocked outcome", () => {
		const b = new Block({ summary: "blocked", reason: "tests" });
		expect(b.toTelemetry().outcome).toBe("blocked");
		expect(b.toTelemetry().success).toBe(true);
	});

	test("is an Outcome", () => {
		expect(new Block({ summary: "b", reason: "r" })).toBeInstanceOf(Outcome);
	});
});
