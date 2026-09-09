import { describe, expect, test } from "bun:test";
import { ParseResult, Schema } from "effect";
import { CommandArgumentError } from "../../src/commands/runtime.js";

describe("CommandArgumentError", () => {
	test("creates error with formatted message", () => {
		const schema = Schema.Struct({
			name: Schema.String,
			count: Schema.Number,
		});

		// Trigger a real parse error by attempting to decode invalid data
		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(schema)({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError(["--count=5"], schema, parseError);

		expect(error.name).toBe("CommandArgumentError");
		expect(error.exitCode).toBe(2);
		expect(error.message).toContain("# Argument Validation Error");
		expect(error.message).toContain("--count=5");
		expect(error.message).toContain("--name");
		expect(error.message).toContain("--count");
	});

	test("handles empty arguments", () => {
		const schema = Schema.Struct({
			required: Schema.String,
		});

		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(schema)({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError([], schema, parseError);

		expect(error.message).toContain("(none)");
	});

	test("shows field in expected arguments with description when annotated", () => {
		const schema = Schema.Struct({
			path: Schema.String.annotations({ description: "Path to the file" }),
		});

		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(schema)({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError([], schema, parseError);

		expect(error.message).toContain("--path");
		expect(error.message).toContain("(required)");
		expect(error.message).toContain("Path to the file");
	});

	test("marks required vs optional fields", () => {
		const schema = Schema.Struct({
			required: Schema.String,
			optional: Schema.optional(Schema.String),
			withDefault: Schema.optionalWith(Schema.String, { default: () => "default" }),
		});

		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(schema)({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError([], schema, parseError);

		expect(error.message).toContain("--required` (required)");
		// optional and default fields should not have (required)
		expect(error.message).not.toContain("--optional` (required)");
		expect(error.message).not.toContain("--withDefault` (required)");
	});

	test("skips internal keys in expected arguments", () => {
		const schema = Schema.Struct({
			_internal: Schema.optional(Schema.String),
			visible: Schema.String,
		});

		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(schema)({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError([], schema, parseError);

		expect(error.message).not.toContain("--_internal");
		expect(error.message).toContain("--visible");
	});

	test("includes validation error details in formatted message", () => {
		const schema = Schema.Struct({});

		let parseError!: ParseResult.ParseError;
		try {
			Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))({});
		} catch (err) {
			if (ParseResult.isParseError(err)) parseError = err;
		}

		const error = new CommandArgumentError([], schema, parseError);

		expect(error.message).toContain("## Validation Errors");
	});
});
