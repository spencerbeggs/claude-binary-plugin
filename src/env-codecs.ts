/**
 * Environment Variable Codecs (Zod v4)
 *
 * Bidirectional transforms for environment variables using z.codec():
 * - decode: env string → native type (for reading from Bun.env)
 * - encode: native type → env string (for persistence to env file)
 *
 * @packageDocumentation
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Boolean Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec for boolean environment variables.
 *
 * @example
 * ```typescript
 * boolEnvCodec.decode("true")  // → true
 * boolEnvCodec.encode(false)   // → "false"
 * ```
 */
export const boolEnvCodec = z.codec(z.enum(["true", "false"]), z.boolean(), {
	decode: (str) => str === "true",
	encode: (bool) => (bool ? "true" : "false"),
});

/**
 * Codec for optional boolean environment variables with default false.
 * Empty strings, undefined, or missing values decode to false.
 *
 * @example
 * ```typescript
 * optionalBoolEnvCodec.decode("")         // → false
 * optionalBoolEnvCodec.decode(undefined)  // → false
 * optionalBoolEnvCodec.decode("true")     // → true
 * optionalBoolEnvCodec.encode(false)      // → "false"
 * ```
 */
export const optionalBoolEnvCodec = z.codec(z.string().optional().default(""), z.boolean(), {
	decode: (str) => str === "true",
	encode: (bool) => (bool ? "true" : "false"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Nullable String Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec for nullable string environment variables.
 * Empty strings decode to null, null encodes to empty string.
 *
 * @example
 * ```typescript
 * nullableEnvCodec.decode("")           // → null
 * nullableEnvCodec.decode("/path/file") // → "/path/file"
 * nullableEnvCodec.encode(null)         // → ""
 * ```
 */
export const nullableEnvCodec = z.codec(z.string(), z.string().nullable(), {
	decode: (str) => (str === "" ? null : str),
	encode: (val) => val ?? "",
});

/**
 * Codec for optional nullable string environment variables.
 * Missing, undefined, or empty strings decode to null.
 *
 * @example
 * ```typescript
 * optionalNullableEnvCodec.decode("")           // → null
 * optionalNullableEnvCodec.decode(undefined)    // → null (via empty string default)
 * optionalNullableEnvCodec.decode("/path/file") // → "/path/file"
 * optionalNullableEnvCodec.encode(null)         // → ""
 * ```
 */
export const optionalNullableEnvCodec = z.codec(z.string().optional().default(""), z.string().nullable(), {
	decode: (str) => (str === "" || str === undefined ? null : str),
	encode: (val) => val ?? "",
});

// ─────────────────────────────────────────────────────────────────────────────
// Integer Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec for integer environment variables.
 *
 * @example
 * ```typescript
 * intEnvCodec.decode("42")    // → 42
 * intEnvCodec.decode("abc")   // → 0 (fallback)
 * intEnvCodec.encode(42)      // → "42"
 * ```
 */
export const intEnvCodec = z.codec(z.string(), z.number().int(), {
	decode: (str) => Number.parseInt(str, 10) || 0,
	encode: (num) => num.toString(),
});

/**
 * Codec for optional integer environment variables with default 0.
 * Missing, undefined, or empty strings decode to 0.
 *
 * @example
 * ```typescript
 * optionalIntEnvCodec.decode("")         // → 0
 * optionalIntEnvCodec.decode(undefined)  // → 0 (via empty string default)
 * optionalIntEnvCodec.decode("42")       // → 42
 * optionalIntEnvCodec.encode(0)          // → "0"
 * ```
 */
export const optionalIntEnvCodec = z.codec(z.string().optional().default(""), z.number().int(), {
	decode: (str) => (str === "" || str === undefined ? 0 : Number.parseInt(str, 10) || 0),
	encode: (num) => num.toString(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Float Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec for float environment variables.
 *
 * @example
 * ```typescript
 * floatEnvCodec.decode("3.14")  // → 3.14
 * floatEnvCodec.encode(3.14)    // → "3.14"
 * ```
 */
export const floatEnvCodec = z.codec(z.string(), z.number(), {
	decode: (str) => Number.parseFloat(str) || 0,
	encode: (num) => num.toString(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Enum with Default Codec Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a codec for enum environment variables with a default value.
 * Empty strings or undefined decode to the default value.
 *
 * @param values - The enum values tuple
 * @param defaultValue - The default value when env is empty/undefined
 * @returns A codec that decodes/encodes the enum
 *
 * @example
 * ```typescript
 * const testRunnerCodec = enumEnvCodec(["vitest", "bun", "jest", "none"], "none");
 * testRunnerCodec.decode("")       // → "none"
 * testRunnerCodec.decode("vitest") // → "vitest"
 * testRunnerCodec.encode("bun")    // → "bun"
 * ```
 */
export function enumEnvCodec<T extends readonly [string, ...string[]]>(values: T, defaultValue: T[number]) {
	const enumSchema = z.enum(values);
	type EnumType = z.infer<typeof enumSchema>;

	return z.codec(z.string(), enumSchema, {
		decode: (str): EnumType => {
			if (str === "" || str === undefined) return defaultValue as EnumType;
			// Validate it's a valid enum value, fallback to default if not
			const result = enumSchema.safeParse(str);
			return result.success ? result.data : (defaultValue as EnumType);
		},
		encode: (val) => val,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Array Codec Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a codec for JSON-serialized arrays in environment variables.
 * Empty strings or undefined decode to an empty array.
 *
 * @param itemSchema - The Zod schema for array items
 * @returns A codec that decodes JSON strings to arrays and encodes arrays to JSON
 *
 * @example
 * ```typescript
 * const workspacePackageSchema = z.object({
 *   name: z.string(),
 *   version: z.string(),
 * });
 * const packagesCodec = jsonArrayEnvCodec(workspacePackageSchema);
 * packagesCodec.decode('[]')                           // → []
 * packagesCodec.decode(undefined)                      // → []
 * packagesCodec.decode('[{"name":"foo","version":"1.0"}]') // → [{name: "foo", version: "1.0"}]
 * packagesCodec.encode([{name: "foo", version: "1.0"}])    // → '[{"name":"foo","version":"1.0"}]'
 * ```
 */
export function jsonArrayEnvCodec<T extends z.ZodType>(itemSchema: T) {
	const arraySchema = z.array(itemSchema);
	type ArrayType = z.input<typeof arraySchema>;

	return z.codec(z.string().optional().default(""), arraySchema, {
		decode: (str): ArrayType => {
			if (str === "" || str === undefined) return [] as ArrayType;
			try {
				const parsed = JSON.parse(str);
				const result = arraySchema.safeParse(parsed);
				return result.success ? (result.data as ArrayType) : ([] as ArrayType);
			} catch {
				return [] as ArrayType;
			}
		},
		encode: (arr) => JSON.stringify(arr),
	});
}
