/**
 * Bidirectional codecs for environment variable serialization using Zod v4.
 *
 * @remarks
 * This module provides type-safe codecs for converting between environment
 * variable strings and native TypeScript types. Codecs support:
 *
 * - **decode**: Environment string → native type (for reading from `Bun.env`)
 * - **encode**: Native type → environment string (for persistence to env files)
 *
 * Codecs are built using Zod v4's `z.codec()` function, which provides
 * bidirectional validation and transformation.
 *
 * **Available Codecs:**
 *
 * | Codec | Input | Output | Notes |
 * |-------|-------|--------|-------|
 * | {@link boolEnvCodec} | `"true"\|"false"` | `boolean` | Strict boolean |
 * | {@link optionalBoolEnvCodec} | `string?` | `boolean` | Default `false` |
 * | {@link nullableEnvCodec} | `string` | `string\|null` | Empty → null |
 * | {@link optionalNullableEnvCodec} | `string?` | `string\|null` | Missing → null |
 * | {@link intEnvCodec} | `string` | `number` | Integer parsing |
 * | {@link optionalIntEnvCodec} | `string?` | `number` | Default `0` |
 * | {@link floatEnvCodec} | `string` | `number` | Float parsing |
 *
 * **Codec Factories:**
 *
 * - {@link enumEnvCodec} - Create enum codecs with default values
 * - {@link jsonArrayEnvCodec} - Create JSON array codecs for complex data
 *
 * @example
 * ```typescript
 * import { boolEnvCodec, enumEnvCodec } from "claude-binary-plugin/env";
 * import { z } from "zod";
 *
 * const schema = z.object({
 *   DEBUG: boolEnvCodec,
 *   LOG_LEVEL: enumEnvCodec(["debug", "info", "warn", "error"], "info"),
 * });
 *
 * const config = schema.parse({ DEBUG: "true", LOG_LEVEL: "debug" });
 * // config.DEBUG === true
 * // config.LOG_LEVEL === "debug"
 * ```
 *
 * @see {@link https://zod.dev | Zod Documentation}
 * @see {@link ClaudeBinaryPluginEnv} - Uses codecs for environment validation
 * @module
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Boolean Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec for boolean environment variables.
 *
 * @remarks
 * Strictly parses `"true"` or `"false"` strings. For optional booleans
 * with a default, use {@link optionalBoolEnvCodec}.
 *
 * @example
 * ```typescript
 * boolEnvCodec.decode("true")  // → true
 * boolEnvCodec.encode(false)   // → "false"
 * ```
 *
 * @see {@link optionalBoolEnvCodec} - For optional booleans with default false
 * @public
 */
export const boolEnvCodec = z.codec(z.enum(["true", "false"]), z.boolean(), {
	decode: (str) => str === "true",
	encode: (bool) => (bool ? "true" : "false"),
});

/**
 * Codec for optional boolean environment variables with default false.
 *
 * @remarks
 * Empty strings, undefined, or missing values decode to `false`.
 * Useful for optional feature flags that default to disabled.
 *
 * @example
 * ```typescript
 * optionalBoolEnvCodec.decode("")         // → false
 * optionalBoolEnvCodec.decode(undefined)  // → false
 * optionalBoolEnvCodec.decode("true")     // → true
 * optionalBoolEnvCodec.encode(false)      // → "false"
 * ```
 *
 * @see {@link boolEnvCodec} - For required booleans
 * @public
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
 *
 * @remarks
 * Empty strings decode to `null`, and `null` encodes to empty string.
 * Useful for optional paths or identifiers that may not be set.
 *
 * @example
 * ```typescript
 * nullableEnvCodec.decode("")           // → null
 * nullableEnvCodec.decode("/path/file") // → "/path/file"
 * nullableEnvCodec.encode(null)         // → ""
 * ```
 *
 * @see {@link optionalNullableEnvCodec} - For missing/undefined handling
 * @public
 */
export const nullableEnvCodec = z.codec(z.string(), z.string().nullable(), {
	decode: (str) => (str === "" ? null : str),
	encode: (val) => val ?? "",
});

/**
 * Codec for optional nullable string environment variables.
 *
 * @remarks
 * Missing, undefined, or empty strings decode to `null`.
 * Useful for optional configuration that may be completely absent.
 *
 * @example
 * ```typescript
 * optionalNullableEnvCodec.decode("")           // → null
 * optionalNullableEnvCodec.decode(undefined)    // → null (via empty string default)
 * optionalNullableEnvCodec.decode("/path/file") // → "/path/file"
 * optionalNullableEnvCodec.encode(null)         // → ""
 * ```
 *
 * @see {@link nullableEnvCodec} - For required but nullable strings
 * @public
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
 * @remarks
 * Parses strings as base-10 integers. Invalid values fallback to `0`.
 *
 * @example
 * ```typescript
 * intEnvCodec.decode("42")    // → 42
 * intEnvCodec.decode("abc")   // → 0 (fallback)
 * intEnvCodec.encode(42)      // → "42"
 * ```
 *
 * @see {@link optionalIntEnvCodec} - For optional integers with default 0
 * @see {@link floatEnvCodec} - For floating-point numbers
 * @public
 */
export const intEnvCodec = z.codec(z.string(), z.number().int(), {
	decode: (str) => Number.parseInt(str, 10) || 0,
	encode: (num) => num.toString(),
});

/**
 * Codec for optional integer environment variables with default 0.
 *
 * @remarks
 * Missing, undefined, or empty strings decode to `0`.
 * Useful for optional numeric configuration with sensible defaults.
 *
 * @example
 * ```typescript
 * optionalIntEnvCodec.decode("")         // → 0
 * optionalIntEnvCodec.decode(undefined)  // → 0 (via empty string default)
 * optionalIntEnvCodec.decode("42")       // → 42
 * optionalIntEnvCodec.encode(0)          // → "0"
 * ```
 *
 * @see {@link intEnvCodec} - For required integers
 * @public
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
 * @remarks
 * Parses strings as floating-point numbers. Invalid values fallback to `0`.
 *
 * @example
 * ```typescript
 * floatEnvCodec.decode("3.14")  // → 3.14
 * floatEnvCodec.encode(3.14)    // → "3.14"
 * ```
 *
 * @see {@link intEnvCodec} - For integer numbers
 * @public
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
 *
 * @remarks
 * Empty strings, undefined, or invalid enum values decode to the default.
 * Useful for configuration options with a known set of valid values.
 *
 * @typeParam T - The enum values tuple type
 * @param values - The enum values tuple (e.g., `["debug", "info", "warn"]`)
 * @param defaultValue - The default value when env is empty/undefined/invalid
 * @returns A Zod codec that decodes/encodes the enum
 *
 * @example
 * ```typescript
 * const testRunnerCodec = enumEnvCodec(["vitest", "bun", "jest", "none"], "none");
 * testRunnerCodec.decode("")       // → "none"
 * testRunnerCodec.decode("vitest") // → "vitest"
 * testRunnerCodec.encode("bun")    // → "bun"
 * ```
 *
 * @public
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
 *
 * @remarks
 * Empty strings, undefined, or invalid JSON decode to an empty array.
 * Useful for persisting complex configuration like workspace packages
 * or feature flags as JSON strings in environment variables.
 *
 * @typeParam T - The Zod schema type for array items
 * @param itemSchema - The Zod schema for validating each array item
 * @returns A Zod codec that decodes JSON strings to typed arrays and encodes back to JSON
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
 *
 * @public
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
