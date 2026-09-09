import type { Effect, Schema } from "effect";
import { Context } from "effect";
import type { SchemaValidationError } from "../errors/SchemaValidationError.js";

export class EnvValidator extends Context.Tag("EnvValidator")<
	EnvValidator,
	{
		readonly validate: <T>(schema: Schema.Schema<T, any, never>) => Effect.Effect<T, SchemaValidationError>;
	}
>() {}
