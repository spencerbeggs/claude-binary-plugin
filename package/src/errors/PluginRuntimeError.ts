import { Data } from "effect";

export class PluginRuntimeError extends Data.TaggedError("PluginRuntimeError")<{
	readonly hookName: string;
	readonly stage: "parse" | "validate" | "handler" | "output";
	readonly cause: unknown;
}> {}
