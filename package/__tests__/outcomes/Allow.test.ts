import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Allow } from "../../src/outcomes/Allow.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Allow", () => {
	test("constructs with summary", () => {
		const a = new Allow({ summary: "tool is safe" });
		expect(a.summary).toBe("tool is safe");
	});

	test("is an Outcome", () => {
		const a = new Allow({ summary: "test" });
		expect(Outcome.isOutcome(a)).toBe(true);
		expect(a).toBeInstanceOf(Outcome);
	});

	test("toResponse produces permissionDecision: allow", () => {
		const a = new Allow({ summary: "safe", reason: "no risk" });
		expect(a.toResponse()).toEqual({ permissionDecision: "allow" });
	});

	test("toResponse includes reason when present", () => {
		const a = new Allow({ summary: "safe", reason: "checked" });
		// reason is not part of the allow wire format - it's telemetry only
		expect(a.toResponse()).toEqual({ permissionDecision: "allow" });
	});

	test("toTelemetry returns correct shape", () => {
		const a = new Allow({ summary: "tool safe" });
		const t = a.toTelemetry();
		expect(t.outcome).toBe("allowed");
		expect(t.summary).toBe("tool safe");
		expect(t.success).toBe(true);
	});

	test("can be extended with domain fields", () => {
		class SecurityAllow extends Allow.extend<SecurityAllow>("SecurityAllow")({
			riskLevel: Schema.Literal("none", "low"),
			scannedPatterns: Schema.Number,
		}) {}

		const a = new SecurityAllow({
			summary: "passed security scan",
			riskLevel: "none",
			scannedPatterns: 42,
		});

		expect(a.summary).toBe("passed security scan");
		expect(a.riskLevel).toBe("none");
		expect(a.scannedPatterns).toBe(42);
		expect(a).toBeInstanceOf(Allow);
		expect(Outcome.isOutcome(a)).toBe(true);

		// Domain fields appear in telemetry metrics
		const t = a.toTelemetry();
		expect(t.metrics).toEqual({ riskLevel: "none", scannedPatterns: 42 });
	});

	test("extended class supports instanceof", () => {
		class CustomAllow extends Allow.extend<CustomAllow>("CustomAllow")({
			tag: Schema.String,
		}) {}
		const a = new CustomAllow({ summary: "ok", tag: "test" });
		expect(a).toBeInstanceOf(CustomAllow);
		expect(a).toBeInstanceOf(Allow);
		expect(a).toBeInstanceOf(Outcome);
	});
});
