/**
 * Tests for Zod v4 environment variable codecs.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	boolEnvCodec,
	enumEnvCodec,
	floatEnvCodec,
	intEnvCodec,
	jsonArrayEnvCodec,
	nullableEnvCodec,
	optionalBoolEnvCodec,
	optionalIntEnvCodec,
	optionalNullableEnvCodec,
} from "./env-codecs.js";

describe("boolEnvCodec", () => {
	test("decodes 'true' to true", () => {
		expect(boolEnvCodec.decode("true")).toBe(true);
	});

	test("decodes 'false' to false", () => {
		expect(boolEnvCodec.decode("false")).toBe(false);
	});

	test("encodes true to 'true'", () => {
		expect(boolEnvCodec.encode(true)).toBe("true");
	});

	test("encodes false to 'false'", () => {
		expect(boolEnvCodec.encode(false)).toBe("false");
	});

	test("parse validates input", () => {
		expect(boolEnvCodec.parse("true")).toBe(true);
		expect(boolEnvCodec.parse("false")).toBe(false);
	});

	test("parse rejects invalid input", () => {
		expect(() => boolEnvCodec.parse("yes")).toThrow();
		expect(() => boolEnvCodec.parse("1")).toThrow();
	});

	test("roundtrip preserves value", () => {
		expect(boolEnvCodec.decode(boolEnvCodec.encode(true))).toBe(true);
		expect(boolEnvCodec.decode(boolEnvCodec.encode(false))).toBe(false);
	});
});

describe("optionalBoolEnvCodec", () => {
	test("decodes empty string to false", () => {
		expect(optionalBoolEnvCodec.decode("")).toBe(false);
	});

	test("decodes 'true' to true", () => {
		expect(optionalBoolEnvCodec.decode("true")).toBe(true);
	});

	test("decodes 'false' to false", () => {
		expect(optionalBoolEnvCodec.decode("false")).toBe(false);
	});

	test("encodes true to 'true'", () => {
		expect(optionalBoolEnvCodec.encode(true)).toBe("true");
	});

	test("encodes false to 'false'", () => {
		expect(optionalBoolEnvCodec.encode(false)).toBe("false");
	});
});

describe("nullableEnvCodec", () => {
	test("decodes empty string to null", () => {
		expect(nullableEnvCodec.decode("")).toBe(null);
	});

	test("decodes non-empty string to string", () => {
		expect(nullableEnvCodec.decode("/path/to/file")).toBe("/path/to/file");
	});

	test("encodes null to empty string", () => {
		expect(nullableEnvCodec.encode(null)).toBe("");
	});

	test("encodes string to string", () => {
		expect(nullableEnvCodec.encode("/path/to/file")).toBe("/path/to/file");
	});

	test("roundtrip preserves null", () => {
		expect(nullableEnvCodec.decode(nullableEnvCodec.encode(null))).toBe(null);
	});

	test("roundtrip preserves string", () => {
		const value = "/some/path";
		expect(nullableEnvCodec.decode(nullableEnvCodec.encode(value))).toBe(value);
	});
});

describe("optionalNullableEnvCodec", () => {
	test("decodes empty string to null", () => {
		expect(optionalNullableEnvCodec.decode("")).toBe(null);
	});

	test("decodes non-empty string to string", () => {
		expect(optionalNullableEnvCodec.decode("/path/to/file")).toBe("/path/to/file");
	});

	test("encodes null to empty string", () => {
		expect(optionalNullableEnvCodec.encode(null)).toBe("");
	});
});

describe("intEnvCodec", () => {
	test("decodes numeric string to integer", () => {
		expect(intEnvCodec.decode("42")).toBe(42);
		expect(intEnvCodec.decode("0")).toBe(0);
		expect(intEnvCodec.decode("-10")).toBe(-10);
	});

	test("decodes invalid string to 0", () => {
		expect(intEnvCodec.decode("")).toBe(0);
		expect(intEnvCodec.decode("abc")).toBe(0);
	});

	test("encodes integer to string", () => {
		expect(intEnvCodec.encode(42)).toBe("42");
		expect(intEnvCodec.encode(0)).toBe("0");
		expect(intEnvCodec.encode(-10)).toBe("-10");
	});

	test("roundtrip preserves integer", () => {
		expect(intEnvCodec.decode(intEnvCodec.encode(42))).toBe(42);
		expect(intEnvCodec.decode(intEnvCodec.encode(0))).toBe(0);
	});
});

describe("optionalIntEnvCodec", () => {
	test("decodes empty string to 0", () => {
		expect(optionalIntEnvCodec.decode("")).toBe(0);
	});

	test("decodes numeric string to integer", () => {
		expect(optionalIntEnvCodec.decode("42")).toBe(42);
	});

	test("encodes integer to string", () => {
		expect(optionalIntEnvCodec.encode(0)).toBe("0");
		expect(optionalIntEnvCodec.encode(42)).toBe("42");
	});
});

describe("floatEnvCodec", () => {
	test("decodes numeric string to float", () => {
		expect(floatEnvCodec.decode("3.14")).toBeCloseTo(3.14);
		expect(floatEnvCodec.decode("0.5")).toBeCloseTo(0.5);
		expect(floatEnvCodec.decode("42")).toBe(42);
	});

	test("decodes invalid string to 0", () => {
		expect(floatEnvCodec.decode("")).toBe(0);
		expect(floatEnvCodec.decode("abc")).toBe(0);
	});

	test("encodes float to string", () => {
		expect(floatEnvCodec.encode(3.14)).toBe("3.14");
		expect(floatEnvCodec.encode(0.5)).toBe("0.5");
	});

	test("roundtrip preserves float", () => {
		expect(floatEnvCodec.decode(floatEnvCodec.encode(3.14))).toBeCloseTo(3.14);
	});
});

describe("enumEnvCodec", () => {
	const testRunnerCodec = enumEnvCodec(["vitest", "bun", "jest", "none"], "none");

	test("decodes empty string to default", () => {
		expect(testRunnerCodec.decode("")).toBe("none");
	});

	test("decodes valid enum value", () => {
		expect(testRunnerCodec.decode("vitest")).toBe("vitest");
		expect(testRunnerCodec.decode("bun")).toBe("bun");
	});

	test("decodes invalid value to default", () => {
		expect(testRunnerCodec.decode("invalid")).toBe("none");
	});

	test("encodes enum value to string", () => {
		expect(testRunnerCodec.encode("bun")).toBe("bun");
		expect(testRunnerCodec.encode("none")).toBe("none");
	});

	test("roundtrip preserves value", () => {
		expect(testRunnerCodec.decode(testRunnerCodec.encode("vitest"))).toBe("vitest");
	});
});

describe("jsonArrayEnvCodec", () => {
	const itemSchema = z.object({
		name: z.string(),
		version: z.string(),
	});
	const packagesCodec = jsonArrayEnvCodec(itemSchema);

	test("decodes empty string to empty array", () => {
		expect(packagesCodec.decode("")).toEqual([]);
	});

	test("decodes empty JSON array", () => {
		expect(packagesCodec.decode("[]")).toEqual([]);
	});

	test("decodes valid JSON array", () => {
		const json = '[{"name":"foo","version":"1.0.0"}]';
		expect(packagesCodec.decode(json)).toEqual([{ name: "foo", version: "1.0.0" }]);
	});

	test("decodes invalid JSON to empty array", () => {
		expect(packagesCodec.decode("not json")).toEqual([]);
	});

	test("decodes invalid schema to empty array", () => {
		const json = '[{"invalid":"data"}]';
		expect(packagesCodec.decode(json)).toEqual([]);
	});

	test("encodes array to JSON string", () => {
		const arr = [{ name: "foo", version: "1.0.0" }];
		expect(packagesCodec.encode(arr)).toBe('[{"name":"foo","version":"1.0.0"}]');
	});

	test("roundtrip preserves array", () => {
		const arr = [
			{ name: "foo", version: "1.0.0" },
			{ name: "bar", version: "2.0.0" },
		];
		expect(packagesCodec.decode(packagesCodec.encode(arr))).toEqual(arr);
	});
});
