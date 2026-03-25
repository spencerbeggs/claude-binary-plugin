import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "../../src/schemas/branded.js";

describe("Branded Types", () => {
	test("SessionIdSchema decodes valid UUID", () => {
		const id = Schema.decodeUnknownSync(SessionIdSchema)("550e8400-e29b-41d4-a716-446655440000");
		expect(typeof id).toBe("string");
	});

	test("SessionIdSchema rejects non-UUID", () => {
		expect(() => Schema.decodeUnknownSync(SessionIdSchema)("not-a-uuid")).toThrow();
	});

	test("ToolUseIdSchema decodes string", () => {
		const id = Schema.decodeUnknownSync(ToolUseIdSchema)("toolu_abc123");
		expect(typeof id).toBe("string");
	});

	test("TranscriptPathSchema decodes string", () => {
		const path = Schema.decodeUnknownSync(TranscriptPathSchema)("/tmp/transcript.json");
		expect(typeof path).toBe("string");
	});
});
