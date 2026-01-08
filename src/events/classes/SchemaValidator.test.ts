import { describe, expect, test } from "bun:test";
import type { FormattedValidationError } from "./SchemaValidator.js";
import { SchemaValidator } from "./SchemaValidator.js";

describe("SchemaValidator", () => {
	test("SchemaValidator is exported", () => {
		expect(SchemaValidator).toBeDefined();
		expect(typeof SchemaValidator.parse).toBe("function");
	});
});

describe("FormattedValidationError", () => {
	test("type structure is correct", () => {
		const error: FormattedValidationError = {
			message: "Validation failed",
			path: "tool_input.command",
			issueCount: 1,
		};
		expect(error.message).toBe("Validation failed");
		expect(error.path).toBe("tool_input.command");
		expect(error.issueCount).toBe(1);
	});
});
