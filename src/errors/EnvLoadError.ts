import { Data } from "effect";

export class EnvLoadError extends Data.TaggedError("EnvLoadError")<{
	readonly file: string;
	readonly cause: unknown;
}> {}
