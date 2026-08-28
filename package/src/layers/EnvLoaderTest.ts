import { Effect, Layer } from "effect";
import { EnvLoader } from "../services/EnvLoader.js";

export const EnvLoaderTest = Layer.succeed(EnvLoader, {
	loadUserEnvFiles: () => Effect.succeed([]),
	loadSessionEnvFiles: () => Effect.succeed(0),
	loadFromVarsFile: () => Effect.void,
});
