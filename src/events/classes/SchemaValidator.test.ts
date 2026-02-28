import { afterEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";
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

describe("SchemaValidator.parse()", () => {
	const testSchema = z.object({
		session_id: z.string(),
		tool_name: z.string(),
		tool_input: z.record(z.string(), z.any()),
	});

	test("parses valid JSON with valid schema", async () => {
		const input = JSON.stringify({
			session_id: "abc-123",
			tool_name: "Bash",
			tool_input: { command: "ls" },
		});
		const result = await SchemaValidator.parse(input, testSchema, "test-hook");
		expect(result.session_id).toBe("abc-123");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls" });
	});

	test("throws ZodError for invalid JSON (malformed string)", async () => {
		const malformedJson = "{ not valid json !!!";
		try {
			await SchemaValidator.parse(malformedJson, testSchema, "test-hook");
			expect(true).toBe(false); // Should not reach here
		} catch (e) {
			expect(e).toBeInstanceOf(z.ZodError);
			const zodErr = e as z.ZodError;
			expect(zodErr.issues.length).toBe(1);
			expect(zodErr.issues[0]?.code).toBe("custom");
			expect(zodErr.issues[0]?.message).toContain("Invalid JSON");
		}
	});

	test("throws ZodError for valid JSON but invalid schema", async () => {
		const validJsonBadSchema = JSON.stringify({
			session_id: 123, // should be string
			tool_name: "Bash",
		});
		try {
			await SchemaValidator.parse(validJsonBadSchema, testSchema, "test-hook");
			expect(true).toBe(false); // Should not reach here
		} catch (e) {
			expect(e).toBeInstanceOf(z.ZodError);
		}
	});

	test("parses JSON without session_id", async () => {
		const noSessionSchema = z.object({
			prompt: z.string(),
		});
		const input = JSON.stringify({ prompt: "hello" });
		const result = await SchemaValidator.parse(input, noSessionSchema, "test-hook");
		expect(result.prompt).toBe("hello");
	});

	test("handles empty session_id (non-string)", async () => {
		const schema = z.object({
			session_id: z.union([z.string(), z.number()]),
			value: z.string(),
		});
		const input = JSON.stringify({ session_id: 42, value: "test" });
		const result = await SchemaValidator.parse(input, schema, "test-hook");
		expect(result.value).toBe("test");
	});

	test("handles empty string session_id", async () => {
		const schema = z.object({
			session_id: z.string(),
			value: z.string(),
		});
		const input = JSON.stringify({ session_id: "", value: "test" });
		const result = await SchemaValidator.parse(input, schema, "test-hook");
		expect(result.session_id).toBe("");
	});

	describe("debug logging", () => {
		const originalDebug = Bun.env.CLAUDE_DEBUG;
		const originalError = console.error;

		afterEach(() => {
			Bun.env.CLAUDE_DEBUG = originalDebug;
			console.error = originalError;
		});

		test("logs raw input when CLAUDE_DEBUG=1", async () => {
			Bun.env.CLAUDE_DEBUG = "1";
			const mockLog = mock(() => {});
			console.error = mockLog;

			const input = JSON.stringify({ session_id: "s1", tool_name: "Bash", tool_input: {} });
			await SchemaValidator.parse(input, testSchema, "my-hook");

			expect(mockLog).toHaveBeenCalled();
			const firstCall = mockLog.mock.calls[0] as unknown[];
			expect(firstCall[0]).toContain("[my-hook] DEBUG raw input:");
		});

		test("truncates long raw input in debug log", async () => {
			Bun.env.CLAUDE_DEBUG = "1";
			const mockLog = mock(() => {});
			console.error = mockLog;

			const longInput = JSON.stringify({
				session_id: "s1",
				tool_name: "Bash",
				tool_input: { data: "x".repeat(3000) },
			});
			await SchemaValidator.parse(longInput, testSchema, "my-hook");

			expect(mockLog).toHaveBeenCalled();
			const firstCall = mockLog.mock.calls[0] as unknown[];
			expect(firstCall[0]).toContain("chars)");
		});

		test("does not log when CLAUDE_DEBUG is not 1", async () => {
			delete Bun.env.CLAUDE_DEBUG;
			const mockLog = mock(() => {});
			console.error = mockLog;

			const input = JSON.stringify({ session_id: "s1", tool_name: "Bash", tool_input: {} });
			await SchemaValidator.parse(input, testSchema, "my-hook");

			expect(mockLog).not.toHaveBeenCalled();
		});
	});

	describe("validation error logging", () => {
		const originalError = console.error;

		afterEach(() => {
			console.error = originalError;
		});

		test("logs raw input on schema validation failure", async () => {
			const mockLog = mock(() => {});
			console.error = mockLog;

			const invalidInput = JSON.stringify({ session_id: 123 });
			try {
				await SchemaValidator.parse(invalidInput, testSchema, "fail-hook");
			} catch {
				// expected
			}

			expect(mockLog).toHaveBeenCalled();
			const logCalls = mockLog.mock.calls.map((c) => (c as unknown[])[0] as string);
			const validationLog = logCalls.find((msg) => msg.includes("Validation failed"));
			expect(validationLog).toBeDefined();
			expect(validationLog).toContain("[fail-hook]");
		});

		test("truncates long input in validation error log", async () => {
			const mockLog = mock(() => {});
			console.error = mockLog;

			const longInvalid = JSON.stringify({ session_id: "x".repeat(1000) });
			try {
				await SchemaValidator.parse(longInvalid, testSchema, "fail-hook");
			} catch {
				// expected
			}

			const logCalls = mockLog.mock.calls.map((c) => (c as unknown[])[0] as string);
			const validationLog = logCalls.find((msg) => msg.includes("Validation failed"));
			expect(validationLog).toBeDefined();
			expect(validationLog).toContain("chars)");
		});
	});

	describe("emitValidationError with OTEL enabled", () => {
		const originalTelemetry = Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY;
		const originalError = console.error;

		afterEach(() => {
			if (originalTelemetry === undefined) {
				delete Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY;
			} else {
				Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY = originalTelemetry;
			}
			console.error = originalError;
		});

		test("exercises formatError and emitValidationError when OTEL enabled", async () => {
			Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";
			console.error = mock(() => {});

			// Valid JSON with session_id but failing schema — triggers emitValidationError with sessionId
			const input = JSON.stringify({ session_id: "otel-test-session", wrongField: true });
			try {
				await SchemaValidator.parse(input, testSchema, "otel-hook");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(z.ZodError);
			}
		});

		test("exercises emitValidationError for JSON parse errors with session_id hint", async () => {
			Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";
			console.error = mock(() => {});

			// Invalid JSON — extractSessionId returns null, so emitValidationError does early return
			try {
				await SchemaValidator.parse("not json", testSchema, "otel-hook");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(z.ZodError);
			}
		});
	});

	describe("extractSessionId (tested indirectly)", () => {
		test("extracts session_id from valid JSON", async () => {
			// If session_id is present and valid, parse succeeds and uses it for OTEL preconnect
			const input = JSON.stringify({ session_id: "uuid-test", tool_name: "Bash", tool_input: {} });
			const result = await SchemaValidator.parse(input, testSchema, "test-hook");
			expect(result.session_id).toBe("uuid-test");
		});

		test("handles JSON without session_id field", async () => {
			const schema = z.object({ value: z.number() });
			const input = JSON.stringify({ value: 42 });
			const result = await SchemaValidator.parse(input, schema, "test-hook");
			expect(result.value).toBe(42);
		});

		test("handles non-object JSON (array)", async () => {
			const schema = z.array(z.number());
			const input = JSON.stringify([1, 2, 3]);
			const result = await SchemaValidator.parse(input, schema, "test-hook");
			expect(result).toEqual([1, 2, 3]);
		});

		test("handles malformed JSON for session_id extraction gracefully", async () => {
			// malformed JSON - extractSessionId catches and returns null, then parse throws on schema validation
			try {
				await SchemaValidator.parse("not json at all", testSchema, "test-hook");
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(z.ZodError);
			}
		});
	});

	describe("formatError (tested indirectly)", () => {
		test("formats single issue error", async () => {
			const input = JSON.stringify({ session_id: "s1" }); // missing tool_name and tool_input
			try {
				await SchemaValidator.parse(input, testSchema, "test-hook");
				expect(true).toBe(false);
			} catch (e) {
				const zodErr = e as z.ZodError;
				// Verify the error has structured issues
				expect(zodErr.issues.length).toBeGreaterThan(0);
				const firstIssue = zodErr.issues[0];
				expect(firstIssue?.path).toBeDefined();
				expect(firstIssue?.message).toBeDefined();
			}
		});

		test("formats multiple issue error", async () => {
			const input = JSON.stringify({ wrongField: true }); // missing all required fields
			try {
				await SchemaValidator.parse(input, testSchema, "test-hook");
				expect(true).toBe(false);
			} catch (e) {
				const zodErr = e as z.ZodError;
				expect(zodErr.issues.length).toBeGreaterThanOrEqual(2);
			}
		});
	});
});
