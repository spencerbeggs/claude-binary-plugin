import type { Effect, Schema as SchemaType } from "effect";
import { Context } from "effect";
import type { SchemaValidationError } from "../errors/SchemaValidationError.js";

export class SchemaValidator extends Context.Tag("SchemaValidator")<
	SchemaValidator,
	{
		readonly decode: <A, I>(raw: string, schema: SchemaType.Schema<A, I>) => Effect.Effect<A, SchemaValidationError>;
	}
>() {}
