import { Data } from "effect";

export class StdinError extends Data.TaggedError("StdinError")<{
	readonly cause: unknown;
}> {}
