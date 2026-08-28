import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { JsonObjectSchema, JsonPrimitiveSchema, JsonValueSchema } from "../../src/schemas/json.js";

describe("JSON Schemas", () => {
	test("JsonPrimitiveSchema decodes primitives", () => {
		expect(Schema.decodeUnknownSync(JsonPrimitiveSchema)("hello")).toBe("hello");
		expect(Schema.decodeUnknownSync(JsonPrimitiveSchema)(42)).toBe(42);
		expect(Schema.decodeUnknownSync(JsonPrimitiveSchema)(true)).toBe(true);
		expect(Schema.decodeUnknownSync(JsonPrimitiveSchema)(null)).toBe(null);
	});

	test("JsonValueSchema decodes nested objects", () => {
		const nested = { a: { b: [1, "two", { c: true }] } };
		expect(Schema.decodeUnknownSync(JsonValueSchema)(nested)).toEqual(nested);
	});

	test("JsonObjectSchema decodes record", () => {
		expect(Schema.decodeUnknownSync(JsonObjectSchema)({ key: "value" })).toEqual({ key: "value" });
	});

	test("JsonValueSchema rejects undefined", () => {
		expect(() => Schema.decodeUnknownSync(JsonValueSchema)(undefined)).toThrow();
	});
});
