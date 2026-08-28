import { Data } from "effect";

export class ShellError extends Data.TaggedError("ShellError")<{
	readonly command: string;
	readonly exitCode: number;
	readonly stderr: string;
}> {}
