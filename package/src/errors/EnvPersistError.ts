import { Data } from "effect";

export class EnvPersistError extends Data.TaggedError("EnvPersistError")<{
	readonly path: string;
	readonly cause: unknown;
}> {}
