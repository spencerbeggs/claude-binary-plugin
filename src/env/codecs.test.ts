/**
 * Tests for Zod v4 environment variable codecs.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { EnvCodecs, envCodecRegistry } from "./codecs.js";

// =============================================================================
// ENV CODECS NAMESPACE TESTS
// =============================================================================

describe("EnvCodecs namespace", () => {
	test("exposes registry with metadata", () => {
		expect(EnvCodecs.registry).toBeDefined();
		expect(EnvCodecs.registry).toBe(envCodecRegistry);
	});

	test("bool codec has registry metadata", () => {
		const meta = EnvCodecs.registry.get(EnvCodecs.bool);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("boolean");
		expect(meta?.example).toEqual({ input: "true", output: true });
	});

	test("int codec has registry metadata", () => {
		const meta = EnvCodecs.registry.get(EnvCodecs.int);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("Integer");
		expect(meta?.example).toEqual({ input: "42", output: 42 });
	});

	test("float codec has registry metadata", () => {
		const meta = EnvCodecs.registry.get(EnvCodecs.float);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("Float");
		expect(meta?.example).toEqual({ input: "3.14", output: 3.14 });
	});

	test("nullable codec has registry metadata", () => {
		const meta = EnvCodecs.registry.get(EnvCodecs.nullable);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("Nullable");
	});

	test("can use EnvCodecs in z.object schema", () => {
		const schema = z.object({
			DEBUG: EnvCodecs.bool,
			PORT: EnvCodecs.optionalInt,
			LOG_LEVEL: EnvCodecs.enum(["debug", "info", "warn"], "info"),
		});

		const result = schema.parse({
			DEBUG: "true",
			PORT: "3000",
			LOG_LEVEL: "debug",
		});

		expect(result.DEBUG).toBe(true);
		expect(result.PORT).toBe(3000);
		expect(result.LOG_LEVEL).toBe("debug");
	});
});

// =============================================================================
// BOOL CODEC TESTS
// =============================================================================

describe("EnvCodecs.bool", () => {
	test("decodes 'true' to true", () => {
		expect(EnvCodecs.bool.decode("true")).toBe(true);
	});

	test("decodes 'false' to false", () => {
		expect(EnvCodecs.bool.decode("false")).toBe(false);
	});

	test("encodes true to 'true'", () => {
		expect(EnvCodecs.bool.encode(true)).toBe("true");
	});

	test("encodes false to 'false'", () => {
		expect(EnvCodecs.bool.encode(false)).toBe("false");
	});

	test("parse validates input", () => {
		expect(EnvCodecs.bool.parse("true")).toBe(true);
		expect(EnvCodecs.bool.parse("false")).toBe(false);
	});

	test("parse rejects invalid input", () => {
		expect(() => EnvCodecs.bool.parse("yes")).toThrow();
		expect(() => EnvCodecs.bool.parse("1")).toThrow();
	});

	test("roundtrip preserves value", () => {
		expect(EnvCodecs.bool.decode(EnvCodecs.bool.encode(true))).toBe(true);
		expect(EnvCodecs.bool.decode(EnvCodecs.bool.encode(false))).toBe(false);
	});
});

describe("EnvCodecs.optionalBool", () => {
	test("decodes empty string to false", () => {
		expect(EnvCodecs.optionalBool.decode("")).toBe(false);
	});

	test("decodes 'true' to true", () => {
		expect(EnvCodecs.optionalBool.decode("true")).toBe(true);
	});

	test("decodes 'false' to false", () => {
		expect(EnvCodecs.optionalBool.decode("false")).toBe(false);
	});

	test("encodes true to 'true'", () => {
		expect(EnvCodecs.optionalBool.encode(true)).toBe("true");
	});

	test("encodes false to 'false'", () => {
		expect(EnvCodecs.optionalBool.encode(false)).toBe("false");
	});
});

// =============================================================================
// NULLABLE CODEC TESTS
// =============================================================================

describe("EnvCodecs.nullable", () => {
	test("decodes empty string to null", () => {
		expect(EnvCodecs.nullable.decode("")).toBe(null);
	});

	test("decodes non-empty string to string", () => {
		expect(EnvCodecs.nullable.decode("/path/to/file")).toBe("/path/to/file");
	});

	test("encodes null to empty string", () => {
		expect(EnvCodecs.nullable.encode(null)).toBe("");
	});

	test("encodes string to string", () => {
		expect(EnvCodecs.nullable.encode("/path/to/file")).toBe("/path/to/file");
	});

	test("roundtrip preserves null", () => {
		expect(EnvCodecs.nullable.decode(EnvCodecs.nullable.encode(null))).toBe(null);
	});

	test("roundtrip preserves string", () => {
		const value = "/some/path";
		expect(EnvCodecs.nullable.decode(EnvCodecs.nullable.encode(value))).toBe(value);
	});
});

describe("EnvCodecs.optionalNullable", () => {
	test("decodes empty string to null", () => {
		expect(EnvCodecs.optionalNullable.decode("")).toBe(null);
	});

	test("decodes non-empty string to string", () => {
		expect(EnvCodecs.optionalNullable.decode("/path/to/file")).toBe("/path/to/file");
	});

	test("encodes null to empty string", () => {
		expect(EnvCodecs.optionalNullable.encode(null)).toBe("");
	});
});

// =============================================================================
// INT CODEC TESTS
// =============================================================================

describe("EnvCodecs.int", () => {
	test("decodes numeric string to integer", () => {
		expect(EnvCodecs.int.decode("42")).toBe(42);
		expect(EnvCodecs.int.decode("0")).toBe(0);
		expect(EnvCodecs.int.decode("-10")).toBe(-10);
	});

	test("decodes invalid string to 0", () => {
		expect(EnvCodecs.int.decode("")).toBe(0);
		expect(EnvCodecs.int.decode("abc")).toBe(0);
	});

	test("encodes integer to string", () => {
		expect(EnvCodecs.int.encode(42)).toBe("42");
		expect(EnvCodecs.int.encode(0)).toBe("0");
		expect(EnvCodecs.int.encode(-10)).toBe("-10");
	});

	test("roundtrip preserves integer", () => {
		expect(EnvCodecs.int.decode(EnvCodecs.int.encode(42))).toBe(42);
		expect(EnvCodecs.int.decode(EnvCodecs.int.encode(0))).toBe(0);
	});
});

describe("EnvCodecs.optionalInt", () => {
	test("decodes empty string to 0", () => {
		expect(EnvCodecs.optionalInt.decode("")).toBe(0);
	});

	test("decodes numeric string to integer", () => {
		expect(EnvCodecs.optionalInt.decode("42")).toBe(42);
	});

	test("encodes integer to string", () => {
		expect(EnvCodecs.optionalInt.encode(0)).toBe("0");
		expect(EnvCodecs.optionalInt.encode(42)).toBe("42");
	});
});

// =============================================================================
// FLOAT CODEC TESTS
// =============================================================================

describe("EnvCodecs.float", () => {
	test("decodes numeric string to float", () => {
		expect(EnvCodecs.float.decode("3.14")).toBeCloseTo(3.14);
		expect(EnvCodecs.float.decode("0.5")).toBeCloseTo(0.5);
		expect(EnvCodecs.float.decode("42")).toBe(42);
	});

	test("decodes invalid string to 0", () => {
		expect(EnvCodecs.float.decode("")).toBe(0);
		expect(EnvCodecs.float.decode("abc")).toBe(0);
	});

	test("encodes float to string", () => {
		expect(EnvCodecs.float.encode(3.14)).toBe("3.14");
		expect(EnvCodecs.float.encode(0.5)).toBe("0.5");
	});

	test("roundtrip preserves float", () => {
		expect(EnvCodecs.float.decode(EnvCodecs.float.encode(3.14))).toBeCloseTo(3.14);
	});
});

// =============================================================================
// ENUM CODEC TESTS
// =============================================================================

describe("EnvCodecs.enum", () => {
	const testRunnerCodec = EnvCodecs.enum(["vitest", "bun", "jest", "none"], "none");

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

// =============================================================================
// JSON ARRAY CODEC TESTS
// =============================================================================

describe("EnvCodecs.jsonArray", () => {
	const itemSchema = z.object({
		name: z.string(),
		version: z.string(),
	});
	const packagesCodec = EnvCodecs.jsonArray(itemSchema);

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
