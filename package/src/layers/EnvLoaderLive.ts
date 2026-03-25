import { Effect, Layer } from "effect";
import { EnvLoadError } from "../errors/EnvLoadError.js";
import { EnvLoader } from "../services/EnvLoader.js";

function parseEnvValue(raw: string): string {
	const trimmed = raw.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export const EnvLoaderLive = Layer.succeed(EnvLoader, {
	loadUserEnv: (projectRoot: string) =>
		Effect.tryPromise({
			try: async () => {
				const envPath = `${projectRoot}/.env`;
				const file = Bun.file(envPath);
				if (await file.exists()) {
					const content = await file.text();
					for (const line of content.split("\n")) {
						const trimmed = line.trim();
						if (!trimmed || trimmed.startsWith("#")) continue;
						const eqIdx = trimmed.indexOf("=");
						if (eqIdx > 0) {
							const key = trimmed.slice(0, eqIdx).trim();
							const value = parseEnvValue(trimmed.slice(eqIdx + 1));
							Bun.env[key] = value;
						}
					}
				}
			},
			catch: (cause) => new EnvLoadError({ file: `${projectRoot}/.env`, cause }),
		}),

	loadHookFiles: (dir: string) =>
		Effect.tryPromise({
			try: async () => {
				const glob = new Bun.Glob("*hook*.sh");
				for await (const file of glob.scan({ cwd: dir, absolute: true })) {
					const content = await Bun.file(file).text();
					for (const line of content.split("\n")) {
						const match = line.match(/^export\s+(\w+)=(.*)$/);
						if (match) {
							Bun.env[match[1]!] = parseEnvValue(match[2]!);
						}
					}
				}
			},
			catch: (cause) => new EnvLoadError({ file: dir, cause }),
		}),

	loadSessionEnv: (prefix: string) =>
		Effect.tryPromise({
			try: async () => {
				const envFile = Bun.env[`${prefix}_PLUGIN_ENV_FILE`];
				if (!envFile) return;
				const content = await Bun.file(envFile).text();
				for (const line of content.split("\n")) {
					const match = line.match(/^export\s+(\w+)=(.*)$/);
					if (match) {
						Bun.env[match[1]!] = parseEnvValue(match[2]!);
					}
				}
			},
			catch: (cause) => new EnvLoadError({ file: `${prefix}_PLUGIN_ENV_FILE`, cause }),
		}),
});
