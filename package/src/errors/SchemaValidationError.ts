import { Data } from "effect";

export interface SchemaIssue {
	readonly message: string;
	readonly path: ReadonlyArray<string | number>;
}

export class SchemaValidationError extends Data.TaggedError("SchemaValidationError")<{
	readonly message: string;
	readonly issues: ReadonlyArray<SchemaIssue>;
	readonly path: string;
}> {}
