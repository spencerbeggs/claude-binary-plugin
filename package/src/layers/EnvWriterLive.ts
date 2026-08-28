import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { EnvPersistError } from "../errors/EnvPersistError.js";
import { EnvBridge } from "../services/EnvBridge.js";
import { EnvFileParser } from "../services/EnvFileParser.js";
import type { PersistResult } from "../services/EnvWriter.js";
import { EnvWriter } from "../services/EnvWriter.js";

export const EnvWriterLive = Layer.effect(
	EnvWriter,
	Effect.gen(function* () {
		const bridge = yield* EnvBridge;
		const parser = yield* EnvFileParser;
		const fs = yield* FileSystem.FileSystem;

		return {
			persist: (vars: Record<string, string>): Effect.Effect<PersistResult, EnvPersistError> =>
				Effect.gen(function* () {
					const env = yield* bridge.readAll();
					const claudeEnvFile = env.CLAUDE_ENV_FILE as string | undefined;

					if (!claudeEnvFile) {
						return {
							persisted: false,
							reason: "CLAUDE_ENV_FILE not available (only set in SessionStart hooks)",
						} satisfies PersistResult;
					}

					// Write vars to EnvBridge so current process sees them
					yield* bridge.write(vars);

					// Read existing file content and merge
					let existingVars: Record<string, string> = {};
					const exists = yield* fs.exists(claudeEnvFile);
					if (exists) {
						const content = yield* fs.readFileString(claudeEnvFile);
						if (content.trim().length > 0) {
							existingVars = yield* parser.parse(content);
						}
					}

					const merged = { ...existingVars, ...vars };
					const formatted = yield* parser.format(merged);
					yield* fs.writeFileString(claudeEnvFile, formatted);

					// Make executable for bash sourcing
					yield* fs.chmod(claudeEnvFile, 0o755);

					return { persisted: true, path: claudeEnvFile } satisfies PersistResult;
				}).pipe(
					Effect.mapError((cause) =>
						cause instanceof EnvPersistError ? cause : new EnvPersistError({ path: "CLAUDE_ENV_FILE", cause }),
					),
				),
		};
	}),
);
