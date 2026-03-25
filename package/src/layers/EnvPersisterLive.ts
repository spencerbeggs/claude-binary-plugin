import { chmod } from "node:fs/promises";
import { Effect, Layer } from "effect";
import { EnvPersistError } from "../errors/EnvPersistError.js";
import { EnvPersister } from "../services/EnvPersister.js";

export const EnvPersisterLive = Layer.succeed(EnvPersister, {
	persist: (vars: Record<string, string>, path: string) =>
		Effect.tryPromise({
			try: async () => {
				const lines = Object.entries(vars).map(([k, v]) => `export ${k}="${v}"`);
				await Bun.write(path, `${lines.join("\n")}\n`);
				await chmod(path, 0o600);
			},
			catch: (cause) => new EnvPersistError({ path, cause }),
		}),
});
