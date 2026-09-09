import { Effect, Layer } from "effect";
import { StdinReader } from "../services/StdinReader.js";

export const makeStdinReaderTest = (input: string) =>
	Layer.succeed(StdinReader, {
		read: () => Effect.succeed(input),
	});
