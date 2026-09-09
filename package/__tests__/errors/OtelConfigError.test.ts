import { describe, expect, test } from "bun:test";
import { OtelConfigError } from "../../src/errors/OtelConfigError.js";

describe("OtelConfigError", () => {
	test("creates tagged error with message", () => {
		const err = new OtelConfigError({
			message: "invalid protocol",
		});
		expect(err._tag).toBe("OtelConfigError");
		expect(err.message).toBe("invalid protocol");
	});

	test("accepts optional variable name", () => {
		const err = new OtelConfigError({
			message: "malformed",
			variable: "OTEL_EXPORTER_OTLP_HEADERS",
		});
		expect(err.variable).toBe("OTEL_EXPORTER_OTLP_HEADERS");
	});
});
