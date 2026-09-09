import { describe, expect, it } from "bun:test";
import { NoAction } from "../../src/outcomes/NoAction.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("NoAction.implicit()", () => {
	it("returns a NoAction instance", () => {
		const implicit = NoAction.implicit();
		expect(implicit).toBeInstanceOf(NoAction);
		expect(Outcome.isOutcome(implicit)).toBe(true);
	});

	it("has implicit: true", () => {
		const implicit = NoAction.implicit();
		expect(implicit.implicit).toBe(true);
	});

	it("explicit NoAction has implicit: false by default", () => {
		const explicit = new NoAction({});
		expect(explicit.implicit).toBe(false);
	});

	it("toTelemetry includes implicit flag", () => {
		const implicit = NoAction.implicit();
		const telemetry = implicit.toTelemetry();
		expect(telemetry.outcome).toBe("noAction");
		expect(telemetry.implicit).toBe(true);
	});

	it("explicit toTelemetry has implicit: false", () => {
		const explicit = new NoAction({});
		const telemetry = explicit.toTelemetry();
		expect(telemetry.outcome).toBe("noAction");
		expect(telemetry.implicit).toBe(false);
	});

	it("toResponse is the same for both", () => {
		const implicit = NoAction.implicit();
		const explicit = new NoAction({});
		expect(implicit.toResponse()).toEqual(explicit.toResponse());
	});
});
