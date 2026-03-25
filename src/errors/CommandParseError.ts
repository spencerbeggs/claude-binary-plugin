import { Data } from "effect";

export class CommandParseError extends Data.TaggedError("CommandParseError")<{
	readonly commandName: string;
	readonly message: string;
}> {}
