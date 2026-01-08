/**
 * JSON type utilities for type-safe serialization.
 *
 * @remarks
 * This module re-exports JSON types from type-fest and provides additional
 * utilities for working with JSON data in the plugin system. These types
 * are more precise than `Record<string, unknown>` for data that must be
 * JSON-serializable.
 *
 * **Why these types matter:**
 *
 * Claude Code communicates with plugins via JSON over stdin/stdout. Using
 * proper JSON types ensures:
 *
 * 1. **Type safety** - Prevents passing non-JSON values (functions, symbols, etc.)
 * 2. **Serialization safety** - Values are guaranteed to survive JSON.stringify/parse
 * 3. **Documentation** - Makes the JSON contract explicit in the type system
 *
 * @example
 * ```typescript
 * import type { JsonObject, JsonValue } from "claude-binary-plugin";
 *
 * // Tool inputs are always JSON objects
 * function processToolInput(input: JsonObject): void {
 *   // input["command"] is JsonValue, not unknown
 * }
 *
 * // For arbitrary JSON values
 * function processAny(value: JsonValue): void {
 *   if (typeof value === "string") {
 *     // Narrowed to string
 *   }
 * }
 * ```
 *
 * @see {@link https://github.com/sindresorhus/type-fest | type-fest}
 */

// Re-export core JSON types from type-fest
export type {
	/**
	 * Matches a JSON array.
	 *
	 * @remarks
	 * A JSON array contains only `JsonValue` elements.
	 */
	JsonArray,
	/**
	 * Matches a JSON object.
	 *
	 * @remarks
	 * A JSON object is a plain object with string keys and `JsonValue` values.
	 * This is more precise than `Record<string, unknown>` because it guarantees
	 * all values are JSON-serializable.
	 *
	 * Use this for:
	 * - `tool_input` in PreToolUse events
	 * - `tool_response` in PostToolUse events
	 * - Plugin state that gets serialized
	 */
	JsonObject,
	/**
	 * Matches any valid JSON primitive value.
	 *
	 * @remarks
	 * JSON primitives are: `string`, `number`, `boolean`, `null`.
	 * Note that `undefined` is NOT a valid JSON primitive.
	 */
	JsonPrimitive,
	/**
	 * Matches any valid JSON value.
	 *
	 * @remarks
	 * This is the union of all possible JSON types:
	 * - Primitives: `string`, `number`, `boolean`, `null`
	 * - Objects: `{ [key: string]: JsonValue }`
	 * - Arrays: `JsonValue[]`
	 *
	 * Use this when you need to accept any JSON value.
	 */
	JsonValue,
	/**
	 * Check if a type is JSON-serializable.
	 *
	 * @remarks
	 * `Jsonifiable` matches values that can be safely passed to `JSON.stringify`.
	 * Unlike `JsonValue`, this includes types that serialize to JSON but aren't
	 * themselves JSON (like `Date` objects).
	 */
	Jsonifiable,
	/**
	 * Make a type JSON-serializable.
	 *
	 * @remarks
	 * `Jsonify<T>` transforms a type to represent what it would look like after
	 * `JSON.parse(JSON.stringify(value))`. This handles:
	 *
	 * - `Date` → `string` (ISO format)
	 * - `undefined` → removed from objects, `null` in arrays
	 * - `Map`/`Set` → `{}`
	 * - Functions → removed
	 * - `BigInt` → throws (not JSON-serializable)
	 *
	 * Use this when you need to type the result of JSON round-tripping.
	 */
	Jsonify,
} from "type-fest";

/**
 * Type-safe JSON parsing with schema validation.
 *
 * @remarks
 * This is a type-only utility. The actual parsing should use Zod for runtime
 * validation. This type helps document the expected shape after parsing.
 *
 * @example
 * ```typescript
 * import type { ParsedJson } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * const schema = z.object({ name: z.string() });
 * type Config = ParsedJson<z.infer<typeof schema>>;
 *
 * function loadConfig(json: string): Config {
 *   return schema.parse(JSON.parse(json));
 * }
 * ```
 *
 * @public
 */
export type ParsedJson<T> = T extends object ? { [K in keyof T]: ParsedJson<T[K]> } : T;

/**
 * A JSON object with known keys but unknown value types.
 *
 * @remarks
 * Use this when you know the structure has certain keys but the values
 * could be any JSON value. More precise than `Record<string, unknown>`.
 *
 * @example
 * ```typescript
 * type ToolInput = JsonObjectWith<"command" | "timeout">;
 * // Equivalent to: { command: JsonValue; timeout: JsonValue; [key: string]: JsonValue }
 * ```
 *
 * @public
 */
export type JsonObjectWith<K extends string> = {
	[P in K]: import("type-fest").JsonValue;
} & import("type-fest").JsonObject;

/**
 * Attributes for OTEL telemetry (subset of JSON).
 *
 * @remarks
 * OTEL attributes have a more restricted type than general JSON:
 * only primitives (string, number, boolean) are allowed as values.
 * Arrays and nested objects are not permitted.
 *
 * This type ensures telemetry attributes are valid before sending.
 *
 * @public
 */
export type OtelAttributeValue = string | number | boolean;

/**
 * OTEL attribute map.
 *
 * @remarks
 * A record of attribute key-value pairs for telemetry. Keys must be strings,
 * values must be primitives. This is stricter than `JsonObject`.
 *
 * @public
 */
export type OtelAttributes = Record<string, OtelAttributeValue>;

/**
 * OTEL headers map (string values only).
 *
 * @remarks
 * HTTP headers for OTEL export endpoints. All values must be strings.
 *
 * @public
 */
export type OtelHeaders = Record<string, string>;

// =============================================================================
// ZOD SCHEMAS FOR JSON TYPES
// =============================================================================

import { z } from "zod";

/**
 * Zod schema for JSON primitive values.
 *
 * @remarks
 * Matches: `string`, `number`, `boolean`, `null`.
 * Does not match: `undefined`, `bigint`, `symbol`, `function`.
 *
 * @schema
 * @public
 */
export const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Zod schema for any valid JSON value (recursive).
 *
 * @remarks
 * This schema validates that a value is JSON-serializable. It uses Zod's
 * lazy evaluation to handle recursive structures (arrays and objects
 * containing other JSON values).
 *
 * @schema
 * @public
 */
export const JsonValueSchema: z.ZodType<import("type-fest").JsonValue> = z.lazy(() =>
	z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

/**
 * Zod schema for JSON objects.
 *
 * @remarks
 * A JSON object has string keys and JsonValue values. Use this for
 * `tool_input` and `tool_response` fields which are always JSON objects.
 *
 * @schema
 * @public
 */
export const JsonObjectSchema: z.ZodType<import("type-fest").JsonObject> = z.record(z.string(), JsonValueSchema);

/**
 * Zod schema for JSON arrays.
 *
 * @remarks
 * A JSON array contains only JsonValue elements.
 *
 * @schema
 * @public
 */
export const JsonArraySchema: z.ZodType<import("type-fest").JsonArray> = z.array(JsonValueSchema);
