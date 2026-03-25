import { Data } from "effect";

export class OtelConfigError extends Data.TaggedError("OtelConfigError")<{
	readonly message: string;
	readonly variable?: string;
}> {}
