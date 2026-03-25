import { Data } from "effect";

export class PipelineError extends Data.TaggedError("PipelineError")<{
	readonly hookName: string;
	readonly stage: "parse" | "validate" | "handler" | "output";
	readonly cause: unknown;
}> {}
