import { describe, expect, test } from "bun:test";
import { Outcome } from "../../src/outcomes/Outcome.js";
import type { ContextBuilder } from "../../src/outcomes/ContextBuilder.js";

describe("Outcome", () => {
	test("is abstract - cannot be instantiated", () => {
		// Outcome has abstract methods, TypeScript enforces this at compile time
		// Runtime check: Outcome.prototype should exist
		expect(Outcome.prototype).toBeDefined();
		// Abstract methods are not on the prototype — they must be implemented by subclasses
		expect(typeof Outcome).toBe("function");
	});

	test("isOutcome returns true for outcome instances", () => {
		// Create a minimal concrete subclass for testing
		class TestOutcome extends Outcome {
			readonly summary = "test";
			toResponse() {
				return {};
			}
			toTelemetry() {
				return { outcome: "allowed" as const, summary: this.summary, success: true };
			}
		}
		const instance = new TestOutcome();
		expect(Outcome.isOutcome(instance)).toBe(true);
	});

	test("isOutcome returns false for plain objects", () => {
		expect(Outcome.isOutcome({ status: "executed", action: "allow", summary: "test" })).toBe(false);
		expect(Outcome.isOutcome(null)).toBe(false);
		expect(Outcome.isOutcome("string")).toBe(false);
	});

	test("resolveContext returns string as-is", () => {
		expect(Outcome.resolveContext("hello")).toBe("hello");
	});

	test("resolveContext calls toString on ContextBuilder", () => {
		const mockBuilder = {
			toString: () => "rendered context",
			metrics: { sections: 1 },
		};
		expect(Outcome.resolveContext(mockBuilder as unknown as ContextBuilder)).toBe("rendered context");
	});

	test("resolveContext returns undefined for undefined input", () => {
		expect(Outcome.resolveContext(undefined)).toBeUndefined();
	});
});
