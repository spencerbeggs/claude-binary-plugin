import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { Outcome } from "../../src/outcomes/Outcome.js";
import { Retry } from "../../src/outcomes/Retry.js";

describe("Retry", () => {
	it("is an Outcome subclass", () => {
		const retry = new Retry({});
		expect(Outcome.isOutcome(retry)).toBe(true);
	});

	it("has _tag 'Retry'", () => {
		expect(Retry._tag).toBe("Retry");
	});

	it("toResponse returns hookSpecificOutput with retry: true", () => {
		const retry = new Retry({});
		expect(retry.toResponse()).toEqual({
			hookSpecificOutput: { retry: true },
		});
	});

	it("toTelemetry returns outcome: retry", () => {
		const retry = new Retry({});
		expect(retry.toTelemetry()).toEqual({ outcome: "retry" });
	});

	it("validates through Schema", () => {
		const decoded = Schema.decodeUnknownSync(Retry)({});
		expect(decoded).toBeInstanceOf(Retry);
	});

	it("is extensible via .extend()", () => {
		class CustomRetry extends Retry.extend<CustomRetry>("CustomRetry")({
			toolName: Schema.String,
		}) {}
		const custom = new CustomRetry({ toolName: "Bash" });
		expect(custom.toolName).toBe("Bash");
		expect(Outcome.isOutcome(custom)).toBe(true);
		expect(custom.toResponse()).toEqual({
			hookSpecificOutput: { retry: true },
		});
	});
});
