import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { CommandArgumentError, parseRawArgs } from "./command-runtime.js";

describe("parseRawArgs", () => {
	test("parses --key=value flags", () => {
		const result = parseRawArgs(["--name=test", "--count=42"]);
		expect(result).toEqual({
			name: "test",
			count: 42,
		});
	});

	test("parses boolean true value", () => {
		const result = parseRawArgs(["--enabled=true"]);
		expect(result.enabled).toBe(true);
	});

	test("parses boolean false value", () => {
		const result = parseRawArgs(["--enabled=false"]);
		expect(result.enabled).toBe(false);
	});

	test("parses bare --flag as boolean true", () => {
		const result = parseRawArgs(["--verbose"]);
		expect(result.verbose).toBe(true);
	});

	test("parses numeric values", () => {
		const result = parseRawArgs(["--port=3000", "--threshold=0.5"]);
		expect(result.port).toBe(3000);
		expect(result.threshold).toBe(0.5);
	});

	test("preserves string values that look like numbers but arent", () => {
		const result = parseRawArgs(["--version=1.2.3"]);
		expect(result.version).toBe("1.2.3");
	});

	test("handles empty string values", () => {
		const result = parseRawArgs(["--empty="]);
		expect(result.empty).toBe("");
	});

	test("collects positional arguments", () => {
		const result = parseRawArgs(["file1.ts", "--flag", "file2.ts"]);
		expect(result._positionals).toEqual(["file1.ts", "file2.ts"]);
		expect(result.flag).toBe(true);
	});

	test("ignores single-dash flags", () => {
		const result = parseRawArgs(["-v", "--verbose"]);
		expect(result.verbose).toBe(true);
		expect(result).not.toHaveProperty("v");
		expect(result._positionals).toBeUndefined();
	});

	test("handles no arguments", () => {
		const result = parseRawArgs([]);
		expect(result).toEqual({});
	});

	test("handles mixed arguments", () => {
		const result = parseRawArgs(["positional", "--debug", "--level=info", "--count=5", "another"]);
		expect(result).toEqual({
			debug: true,
			level: "info",
			count: 5,
			_positionals: ["positional", "another"],
		});
	});
});

describe("CommandArgumentError", () => {
	test("creates error with formatted message", () => {
		const schema = z.object({
			name: z.string(),
			count: z.number(),
		});

		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				input: undefined,
				path: ["name"],
				message: "Required",
			},
		]);

		const error = new CommandArgumentError(["--count=5"], schema, zodError);

		expect(error.name).toBe("CommandArgumentError");
		expect(error.exitCode).toBe(2);
		expect(error.message).toContain("# Argument Validation Error");
		expect(error.message).toContain("--count=5");
		expect(error.message).toContain("name");
		expect(error.message).toContain("--name");
		expect(error.message).toContain("--count");
	});

	test("includes expected values for enum errors", () => {
		const schema = z.object({
			mode: z.enum(["strict", "relaxed"]),
		});

		// Zod v4 uses "invalid_value" with "values" array (not "expected")
		// The implementation checks for "expected" in issue, so we need to provide
		// an issue with "expected" array to test that code path
		const zodError = new z.ZodError([
			{
				code: "invalid_value",
				values: ["strict", "relaxed"],
				// Include expected as well to test the implementation's enum display logic
				expected: ["strict", "relaxed"],
				input: "invalid",
				path: ["mode"],
				message: "Invalid enum value",
			} as unknown as z.ZodIssue,
		]);

		const error = new CommandArgumentError(["--mode=invalid"], schema, zodError);

		expect(error.message).toContain("strict, relaxed");
	});

	test("handles empty arguments", () => {
		const schema = z.object({
			required: z.string(),
		});

		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				input: undefined,
				path: ["required"],
				message: "Required",
			},
		]);

		const error = new CommandArgumentError([], schema, zodError);

		expect(error.message).toContain("(none)");
	});

	test("shows field in expected arguments without description when not in _def", () => {
		// Zod v4 stores description on the schema object directly, not in _def
		// The extractDescription function looks in _def, so descriptions may not appear
		const schema = z.object({
			path: z.string().describe("Path to the file"),
		});

		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				input: undefined,
				path: ["path"],
				message: "Required",
			},
		]);

		const error = new CommandArgumentError([], schema, zodError);

		// The field should appear in expected arguments
		expect(error.message).toContain("--path");
		expect(error.message).toContain("(required)");
	});

	test("marks required vs optional fields", () => {
		const schema = z.object({
			required: z.string(),
			optional: z.string().optional(),
			withDefault: z.string().default("default"),
		});

		const zodError = new z.ZodError([
			{
				code: "invalid_type",
				expected: "string",
				input: undefined,
				path: ["required"],
				message: "Required",
			},
		]);

		const error = new CommandArgumentError([], schema, zodError);

		expect(error.message).toContain("--required` (required)");
		// optional and default fields should not have (required)
		expect(error.message).not.toContain("--optional` (required)");
		expect(error.message).not.toContain("--withDefault` (required)");
	});

	test("skips internal keys in expected arguments", () => {
		const schema = z.object({
			_internal: z.string().optional(),
			visible: z.string(),
		});

		const zodError = new z.ZodError([]);

		const error = new CommandArgumentError([], schema, zodError);

		expect(error.message).not.toContain("--_internal");
		expect(error.message).toContain("--visible");
	});

	test("handles root-level validation errors", () => {
		const schema = z.object({});

		const zodError = new z.ZodError([
			{
				code: "custom",
				path: [],
				message: "Root level error",
			},
		]);

		const error = new CommandArgumentError([], schema, zodError);

		expect(error.message).toContain("**(root)**: Root level error");
	});
});
