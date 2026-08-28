/**
 * Matches any valid JSON primitive value.
 * @public
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Matches any valid JSON value.
 * @public
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

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
 *
 * @public
 */
// biome-ignore lint/style/useConsistentTypeDefinitions: must be a type alias to support intersection in JsonObjectWith<K>
export type JsonObject = { [key: string]: JsonValue };

/**
 * Matches a JSON array.
 *
 * @remarks
 * A JSON array contains only `JsonValue` elements.
 *
 * @public
 */
export type JsonArray = readonly JsonValue[];

/**
 * Check if a type is JSON-serializable.
 *
 * @remarks
 * `Jsonifiable` matches values that can be safely passed to `JSON.stringify`.
 * Unlike `JsonValue`, this includes types that serialize to JSON but aren't
 * themselves JSON (like `Date` objects).
 *
 * @public
 */
export type Jsonifiable = JsonPrimitive | JsonifiableObject | JsonifiableArray | { toJSON(): Jsonifiable };

interface JsonifiableObject {
	[key: string]: Jsonifiable;
}

interface JsonifiableArray extends ReadonlyArray<Jsonifiable> {}

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
 *
 * @public
 */
export type Jsonify<T> = T extends JsonPrimitive
	? T
	: T extends { toJSON(): infer R }
		? Jsonify<R>
		: T extends readonly (infer U)[]
			? Jsonify<U>[]
			: T extends Record<string, unknown>
				? { [K in keyof T as T[K] extends (...args: never) => unknown ? never : K]: Jsonify<T[K]> }
				: never;

/**
 * Type-safe JSON parsing with schema validation.
 *
 * @remarks
 * This is a type-only utility. Use Effect Schema for runtime validation.
 * This type helps document the expected shape after parsing.
 *
 * @example
 * ```typescript
 * import type { ParsedJson } from "claude-binary-plugin";
 * import { Schema } from "effect";
 *
 * const schema = Schema.Struct({ name: Schema.String });
 * type Config = ParsedJson<typeof schema.Type>;
 *
 * function loadConfig(json: string): Config {
 *   return Schema.decodeUnknownSync(schema)(JSON.parse(json));
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
	[P in K]: JsonValue;
} & JsonObject;

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
