import { Effect, Layer } from "effect";
import { EnvLoader } from "../services/EnvLoader.js";

export const EnvLoaderTest = Layer.succeed(EnvLoader, {
	loadUserEnv: () => Effect.void,
	loadHookFiles: () => Effect.void,
	loadSessionEnv: () => Effect.void,
});
