import { Effect, Layer } from "effect";
import { StdinError } from "../errors/StdinError.js";
import { StdinReader } from "../services/StdinReader.js";

export const StdinReaderLive = Layer.succeed(StdinReader, {
	read: () =>
		Effect.tryPromise({
			try: () => Bun.stdin.text(),
			catch: (cause) => new StdinError({ cause }),
		}),
});
