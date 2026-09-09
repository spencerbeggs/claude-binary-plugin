import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Deny } from "../../src/outcomes/Deny.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Deny", () => {
	test("constructs with summary and reason", () => {
		const d = new Deny({ summary: "blocked", reason: "dangerous" });
		expect(d.summary).toBe("blocked");
		expect(d.reason).toBe("dangerous");
	});

	test("reason is required", () => {
		expect(() => new Deny({ summary: "blocked" } as any)).toThrow();
	});

	test("toResponse produces permissionDecision: deny with reason", () => {
		const d = new Deny({ summary: "blocked", reason: "rm -rf detected" });
		expect(d.toResponse()).toEqual({
			permissionDecision: "deny",
			reason: "rm -rf detected",
		});
	});

	test("toTelemetry returns denied outcome", () => {
		const d = new Deny({ summary: "blocked", reason: "bad" });
		const t = d.toTelemetry();
		expect(t.outcome).toBe("denied");
		expect(t.success).toBe(true);
	});

	test("can be extended with domain fields", () => {
		class LintDeny extends Deny.extend<LintDeny>("LintDeny")({
			filesScanned: Schema.Number,
			issuesFound: Schema.Number,
		}) {}

		const d = new LintDeny({
			summary: "lint failed",
			reason: "3 issues in 5 files",
			filesScanned: 5,
			issuesFound: 3,
		});

		expect(d).toBeInstanceOf(Deny);
		expect(d).toBeInstanceOf(Outcome);
		expect(d.toTelemetry().metrics).toEqual({ filesScanned: 5, issuesFound: 3 });
	});
});
