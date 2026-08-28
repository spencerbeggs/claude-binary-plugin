import { Schema } from "effect";

// =============================================================================
// EFFECT SCHEMAS FOR JSON TYPES (INTERNAL)
// =============================================================================

/**
 * Effect Schema for JSON primitive values.
 *
 * @remarks
 * Matches: `string`, `number`, `boolean`, `null`.
 * Does not match: `undefined`, `bigint`, `symbol`, `function`.
 *
 * @internal
 */
export const JsonPrimitiveSchema = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

/**
 * Effect Schema for any valid JSON value (recursive).
 *
 * @remarks
 * This schema validates that a value is JSON-serializable. It uses
 * `Schema.suspend` for lazy evaluation to handle recursive structures
 * (arrays and objects containing other JSON values).
 *
 * @internal
 */
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
	Schema.Union(
		JsonPrimitiveSchema,
		Schema.Array(JsonValueSchema),
		Schema.Record({ key: Schema.String, value: JsonValueSchema }),
	),
);

/**
 * Effect Schema for JSON objects.
 *
 * @remarks
 * A JSON object has string keys and JsonValue values. Used internally for
 * `tool_input` and `tool_response` fields which are always JSON objects.
 *
 * @internal
 */
export const JsonObjectSchema = Schema.Record({ key: Schema.String, value: JsonValueSchema });
