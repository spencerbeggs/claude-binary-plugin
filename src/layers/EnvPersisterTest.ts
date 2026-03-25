import { Effect, Layer } from "effect";
import { EnvPersister } from "../services/EnvPersister.js";

export const makeEnvPersisterTest = () => {
	const writes: Array<{ vars: Record<string, string>; path: string }> = [];
	return {
		writes,
		layer: Layer.succeed(EnvPersister, {
			persist: (vars, path) =>
				Effect.sync(() => {
					writes.push({ vars, path });
				}),
		}),
	};
};
