import { Data } from "effect";

export class SidecarError extends Data.TaggedError("SidecarError")<{
	readonly stage: "spawn" | "connect" | "send" | "flush" | "shutdown";
	readonly message: string;
	readonly cause?: unknown;
}> {}
