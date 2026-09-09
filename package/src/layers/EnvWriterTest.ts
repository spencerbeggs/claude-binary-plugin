import { Effect, Layer } from "effect";
import { EnvWriter } from "../services/EnvWriter.js";

export const makeEnvWriterTest = () => {
	const writes: Array<{ vars: Record<string, string> }> = [];

	const layer = Layer.succeed(EnvWriter, {
		persist: (vars) =>
			Effect.sync(() => {
				writes.push({ vars });
				return { persisted: true, path: "/tmp/test-env-file.sh" };
			}),
	});

	return { layer, writes };
};
