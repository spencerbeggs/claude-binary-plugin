import { Data } from "effect";

export class SessionLookupError extends Data.TaggedError("SessionLookupError")<{
	readonly sessionId: string;
	readonly reason: string;
}> {}
