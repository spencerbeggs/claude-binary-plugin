import { describe, expect, test } from "bun:test";
import { normalize } from "node:path";
import { Schema } from "effect";
import {
	NormalizedPathSchema,
	SessionIdSchema,
	ToolUseIdSchema,
	TranscriptPathSchema,
	normalizePath,
} from "../../src/schemas/branded.js";

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

describe("NormalizedPath", () => {
	test("NormalizedPathSchema decodes any string", () => {
		const path = Schema.decodeUnknownSync(NormalizedPathSchema)("/home/user/project");
		expect(typeof path).toBe("string");
	});

	test("NormalizedPathSchema rejects non-string values", () => {
		expect(() => Schema.decodeUnknownSync(NormalizedPathSchema)(42)).toThrow();
		expect(() => Schema.decodeUnknownSync(NormalizedPathSchema)(null)).toThrow();
	});

	test("normalizePath resolves double slashes", () => {
		expect(normalizePath("/home//user/project")).toBe(normalize("/home//user/project"));
	});

	test("normalizePath resolves parent directory segments", () => {
		expect(normalizePath("/home/user/../other")).toBe(normalize("/home/user/../other"));
	});

	test("normalizePath resolves current directory segments", () => {
		expect(normalizePath("/home/./user/project")).toBe(normalize("/home/./user/project"));
	});

	test("normalizePath returns a NormalizedPath branded string", () => {
		const result = normalizePath("/some/path");
		expect(typeof result).toBe("string");
	});

	test("normalizePath handles already-normalized paths unchanged", () => {
		const path = "/home/user/project";
		expect(normalizePath(path)).toBe(path);
	});
});
