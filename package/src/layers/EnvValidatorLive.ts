import { Effect, Layer, ParseResult, Schema } from "effect";
import { SchemaValidationError } from "../errors/SchemaValidationError.js";
import { EnvBridge } from "../services/EnvBridge.js";
import { EnvValidator } from "../services/EnvValidator.js";

interface SchemaWithFields {
	fields?: Record<string, unknown>;
}

export const EnvValidatorLive = Layer.effect(
	EnvValidator,
	Effect.gen(function* () {
		const bridge = yield* EnvBridge;

		return {
			validate: <T>(schema: Schema.Schema<T, any, never>) =>
				Effect.gen(function* () {
					const allVars = yield* bridge.readAll();

					// Extract only keys matching schema fields
					const envVars: Record<string, unknown> = {};
					const schemaWithFields = schema as unknown as SchemaWithFields;
					if (schemaWithFields.fields && typeof schemaWithFields.fields === "object") {
						for (const key of Object.keys(schemaWithFields.fields)) {
							envVars[key] = allVars[key];
						}
					}

					return yield* Schema.decodeUnknown(schema)(envVars).pipe(
						Effect.mapError((parseError) => {
							const message = ParseResult.TreeFormatter.formatErrorSync(parseError);
							return new SchemaValidationError({
								message,
								issues: [],
								path: "EnvValidator",
							});
						}),
					);
				}),
		};
	}),
);
