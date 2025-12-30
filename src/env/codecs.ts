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
 * **Using EnvCodecs (Recommended):**
 *
 * The `EnvCodecs` namespace provides all codecs with registry metadata:
 *
 * ```typescript
 * import { EnvCodecs } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * const schema = z.object({
 *   DEBUG: EnvCodecs.bool,
 *   PORT: EnvCodecs.optionalInt,
 *   LOG_LEVEL: EnvCodecs.enum(["debug", "info", "warn"], "info"),
 * });
 * ```
 *
 * **Available Codecs:**
 *
 * | Codec | Input | Output | Notes |
 * |-------|-------|--------|-------|
 * | `EnvCodecs.bool` | `"true"\|"false"` | `boolean` | Strict boolean |
 * | `EnvCodecs.optionalBool` | `string?` | `boolean` | Default `false` |
 * | `EnvCodecs.nullable` | `string` | `string\|null` | Empty → null |
 * | `EnvCodecs.optionalNullable` | `string?` | `string\|null` | Missing → null |
 * | `EnvCodecs.int` | `string` | `number` | Integer parsing |
 * | `EnvCodecs.optionalInt` | `string?` | `number` | Default `0` |
 * | `EnvCodecs.float` | `string` | `number` | Float parsing |
 *
 * **Codec Factories:**
 *
 * - `EnvCodecs.enum()` - Create enum codecs with default values
 * - `EnvCodecs.jsonArray()` - Create JSON array codecs for complex data
 *
 * **Registry Access:**
 *
 * Access the registry for metadata or JSON Schema generation:
 *
 * ```typescript
 * const metadata = EnvCodecs.registry.get(EnvCodecs.bool);
 * // → { description: "Strict boolean codec...", example: { input: "true", output: true } }
 * ```
 *
 * @see {@link https://zod.dev | Zod Documentation}
 * @see {@link https://zod.dev/metadata | Zod Registries}
 * @see {@link ClaudeBinaryPluginEnv} - Uses codecs for environment validation
 * @module
 */

import { z } from "zod";

// =============================================================================
// CODEC REGISTRY
// =============================================================================

/**
 * Metadata structure for environment codecs.
 *
 * @remarks
 * This metadata is attached to codecs via the Zod v4 registry system,
 * enabling documentation generation and introspection.
 *
 * @public
 */
export interface EnvCodecMetadata {
	/** Human-readable description of the codec behavior */
	description: string;
	/** Example showing input/output transformation */
	example?: { input: string; output: unknown };
}

/**
 * Registry for environment codec metadata.
 *
 * @remarks
 * This registry stores metadata for all built-in codecs. Users can access
 * this registry to generate documentation or extend with custom codecs.
 *
 * @example
 * ```typescript
 * // Get metadata for a codec
 * const meta = envCodecRegistry.get(EnvCodecs.bool);
 * console.log(meta.description);
 *
 * // Register a custom codec
 * const myCodec = z.codec(...).register(envCodecRegistry, {
 *   description: "My custom codec",
 * });
 * ```
 *
 * @public
 */
export const envCodecRegistry = z.registry<EnvCodecMetadata>();

// =============================================================================
// CODEC DEFINITIONS
// =============================================================================

/**
 * Strict boolean codec: "true" | "false" → boolean
 * @internal
 */
const _boolCodec = z
	.codec(z.enum(["true", "false"]), z.boolean(), {
		decode: (str) => str === "true",
		encode: (bool) => (bool ? "true" : "false"),
	})
	.register(envCodecRegistry, {
		description: 'Strict boolean codec. Only accepts "true" or "false" strings.',
		example: { input: "true", output: true },
	});

/**
 * Optional boolean codec with false default
 * @internal
 */
const _optionalBoolCodec = z
	.codec(z.string().optional().default(""), z.boolean(), {
		decode: (str) => str === "true",
		encode: (bool) => (bool ? "true" : "false"),
	})
	.register(envCodecRegistry, {
		description: "Optional boolean codec. Empty/missing values decode to false.",
		example: { input: "", output: false },
	});

/**
 * Nullable string codec: "" → null
 * @internal
 */
const _nullableCodec = z
	.codec(z.string(), z.string().nullable(), {
		decode: (str) => (str === "" ? null : str),
		encode: (val) => val ?? "",
	})
	.register(envCodecRegistry, {
		description: "Nullable string codec. Empty strings decode to null.",
		example: { input: "", output: null },
	});

/**
 * Optional nullable string codec
 * @internal
 */
const _optionalNullableCodec = z
	.codec(z.string().optional().default(""), z.string().nullable(), {
		decode: (str) => (str === "" || str === undefined ? null : str),
		encode: (val) => val ?? "",
	})
	.register(envCodecRegistry, {
		description: "Optional nullable string codec. Empty/missing values decode to null.",
		example: { input: "", output: null },
	});

/**
 * Integer codec with 0 fallback
 * @internal
 */
const _intCodec = z
	.codec(z.string(), z.number().int(), {
		decode: (str) => Number.parseInt(str, 10) || 0,
		encode: (num) => num.toString(),
	})
	.register(envCodecRegistry, {
		description: "Integer codec. Parses base-10 integers, invalid values fallback to 0.",
		example: { input: "42", output: 42 },
	});

/**
 * Optional integer codec with 0 default
 * @internal
 */
const _optionalIntCodec = z
	.codec(z.string().optional().default(""), z.number().int(), {
		decode: (str) => (str === "" || str === undefined ? 0 : Number.parseInt(str, 10) || 0),
		encode: (num) => num.toString(),
	})
	.register(envCodecRegistry, {
		description: "Optional integer codec. Empty/missing values decode to 0.",
		example: { input: "", output: 0 },
	});

/**
 * Float codec with 0 fallback
 * @internal
 */
const _floatCodec = z
	.codec(z.string(), z.number(), {
		decode: (str) => Number.parseFloat(str) || 0,
		encode: (num) => num.toString(),
	})
	.register(envCodecRegistry, {
		description: "Float codec. Parses floating-point numbers, invalid values fallback to 0.",
		example: { input: "3.14", output: 3.14 },
	});

// =============================================================================
// CODEC FACTORY FUNCTIONS
// =============================================================================

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
 * const logLevelCodec = EnvCodecs.enum(["debug", "info", "warn", "error"], "info");
 * logLevelCodec.decode("")       // → "info"
 * logLevelCodec.decode("debug")  // → "debug"
 * logLevelCodec.encode("warn")   // → "warn"
 * ```
 *
 * @public
 */
function createEnumCodec<T extends readonly [string, ...string[]]>(values: T, defaultValue: T[number]) {
	const enumSchema = z.enum(values);
	type EnumType = z.infer<typeof enumSchema>;

	return z.codec(z.string(), enumSchema, {
		decode: (str): EnumType => {
			if (str === "" || str === undefined) return defaultValue as EnumType;
			const result = enumSchema.safeParse(str);
			return result.success ? result.data : (defaultValue as EnumType);
		},
		encode: (val) => val,
	});
}

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
 * const packageSchema = z.object({ name: z.string(), version: z.string() });
 * const packagesCodec = EnvCodecs.jsonArray(packageSchema);
 *
 * packagesCodec.decode('[]')                              // → []
 * packagesCodec.decode('[{"name":"foo","version":"1.0"}]') // → [{name: "foo", version: "1.0"}]
 * packagesCodec.encode([{name: "foo", version: "1.0"}])    // → '[{"name":"foo","version":"1.0"}]'
 * ```
 *
 * @public
 */
function createJsonArrayCodec<T extends z.ZodType>(itemSchema: T) {
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

// =============================================================================
// ENV CODECS NAMESPACE
// =============================================================================

/**
 * Unified namespace for all environment variable codecs.
 *
 * @remarks
 * `EnvCodecs` provides a class-first API for environment variable serialization
 * with Zod v4 registry integration. All codecs are registered with metadata
 * enabling documentation generation and introspection.
 *
 * **Available Codecs:**
 *
 * | Property | Description |
 * |----------|-------------|
 * | `bool` | Strict boolean: `"true"` \| `"false"` → `boolean` |
 * | `optionalBool` | Optional boolean with `false` default |
 * | `nullable` | Nullable string: `""` → `null` |
 * | `optionalNullable` | Optional nullable with `null` default |
 * | `int` | Integer parsing with `0` fallback |
 * | `optionalInt` | Optional integer with `0` default |
 * | `float` | Float parsing with `0` fallback |
 *
 * **Factory Methods:**
 *
 * | Method | Description |
 * |--------|-------------|
 * | `enum(values, default)` | Create enum codec with default value |
 * | `jsonArray(schema)` | Create JSON array codec for complex data |
 *
 * @example
 * ```typescript
 * import { EnvCodecs } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * // Define a schema using codecs
 * const schema = z.object({
 *   DEBUG: EnvCodecs.bool,
 *   PORT: EnvCodecs.optionalInt,
 *   LOG_LEVEL: EnvCodecs.enum(["debug", "info", "warn"], "info"),
 *   PACKAGES: EnvCodecs.jsonArray(z.object({ name: z.string() })),
 * });
 *
 * // Access registry for metadata
 * const meta = EnvCodecs.registry.get(EnvCodecs.bool);
 * console.log(meta.description); // "Strict boolean codec..."
 * ```
 *
 * @see {@link envCodecRegistry} - The underlying Zod registry
 * @see {@link ClaudeBinaryPluginEnv} - Uses codecs for environment validation
 * @public
 */
export const EnvCodecs = {
	/**
	 * The Zod registry containing metadata for all codecs.
	 *
	 * @remarks
	 * Use this registry to access codec metadata or register custom codecs.
	 *
	 * @example
	 * ```typescript
	 * const meta = EnvCodecs.registry.get(EnvCodecs.bool);
	 * console.log(meta.description);
	 * ```
	 */
	registry: envCodecRegistry,

	/**
	 * Strict boolean codec.
	 *
	 * @remarks
	 * Only accepts `"true"` or `"false"` strings. Throws on invalid input.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.bool.decode("true")  // → true
	 * EnvCodecs.bool.encode(false)   // → "false"
	 * ```
	 */
	bool: _boolCodec,

	/**
	 * Optional boolean codec with false default.
	 *
	 * @remarks
	 * Empty strings, undefined, or missing values decode to `false`.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.optionalBool.decode("")     // → false
	 * EnvCodecs.optionalBool.decode("true") // → true
	 * ```
	 */
	optionalBool: _optionalBoolCodec,

	/**
	 * Nullable string codec.
	 *
	 * @remarks
	 * Empty strings decode to `null`, and `null` encodes to empty string.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.nullable.decode("")           // → null
	 * EnvCodecs.nullable.decode("/path/file") // → "/path/file"
	 * ```
	 */
	nullable: _nullableCodec,

	/**
	 * Optional nullable string codec.
	 *
	 * @remarks
	 * Missing, undefined, or empty strings decode to `null`.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.optionalNullable.decode("")           // → null
	 * EnvCodecs.optionalNullable.decode("/path/file") // → "/path/file"
	 * ```
	 */
	optionalNullable: _optionalNullableCodec,

	/**
	 * Integer codec with 0 fallback.
	 *
	 * @remarks
	 * Parses strings as base-10 integers. Invalid values fallback to `0`.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.int.decode("42")   // → 42
	 * EnvCodecs.int.decode("abc")  // → 0
	 * ```
	 */
	int: _intCodec,

	/**
	 * Optional integer codec with 0 default.
	 *
	 * @remarks
	 * Missing, undefined, or empty strings decode to `0`.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.optionalInt.decode("")   // → 0
	 * EnvCodecs.optionalInt.decode("42") // → 42
	 * ```
	 */
	optionalInt: _optionalIntCodec,

	/**
	 * Float codec with 0 fallback.
	 *
	 * @remarks
	 * Parses strings as floating-point numbers. Invalid values fallback to `0`.
	 *
	 * @example
	 * ```typescript
	 * EnvCodecs.float.decode("3.14") // → 3.14
	 * EnvCodecs.float.encode(2.5)    // → "2.5"
	 * ```
	 */
	float: _floatCodec,

	/**
	 * Create an enum codec with a default value.
	 *
	 * @param values - The enum values tuple
	 * @param defaultValue - The default value when env is empty/undefined/invalid
	 * @returns A Zod codec for the enum type
	 *
	 * @example
	 * ```typescript
	 * const logLevel = EnvCodecs.enum(["debug", "info", "warn"], "info");
	 * logLevel.decode("")       // → "info"
	 * logLevel.decode("debug")  // → "debug"
	 * ```
	 */
	enum: createEnumCodec,

	/**
	 * Create a JSON array codec for complex data.
	 *
	 * @param itemSchema - The Zod schema for validating each array item
	 * @returns A Zod codec for JSON-serialized arrays
	 *
	 * @example
	 * ```typescript
	 * const packages = EnvCodecs.jsonArray(z.object({ name: z.string() }));
	 * packages.decode('[{"name":"foo"}]') // → [{name: "foo"}]
	 * ```
	 */
	jsonArray: createJsonArrayCodec,
} as const;
