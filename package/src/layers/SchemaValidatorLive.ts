import type { Schema as SchemaType } from "effect";
import { Effect, Layer, ParseResult, Schema } from "effect";
import { SchemaValidationError } from "../errors/SchemaValidationError.js";
import { SchemaValidator } from "../services/SchemaValidator.js";

export const SchemaValidatorLive = Layer.succeed(SchemaValidator, {
	decode: <A, I>(raw: string, schema: SchemaType.Schema<A, I>) =>
		Effect.try({
			try: () => {
				const data: unknown = JSON.parse(raw);
				return Schema.decodeUnknownSync(schema)(data);
			},
			catch: (error) => {
				if (ParseResult.isParseError(error)) {
					const message = ParseResult.TreeFormatter.formatErrorSync(error);
					return new SchemaValidationError({ message, issues: [], path: "root" });
				}
				return new SchemaValidationError({
					message: error instanceof Error ? error.message : String(error),
					issues: [],
					path: "root",
				});
			},
		}),
});
