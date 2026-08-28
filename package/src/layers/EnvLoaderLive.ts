import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { EnvLoadError } from "../errors/EnvLoadError.js";
import { EnvBridge } from "../services/EnvBridge.js";
import { EnvFileParser } from "../services/EnvFileParser.js";
import { EnvLoader } from "../services/EnvLoader.js";

export const EnvLoaderLive = Layer.effect(
	EnvLoader,
	Effect.gen(function* () {
		const bridge = yield* EnvBridge;
		const parser = yield* EnvFileParser;
		const fs = yield* FileSystem.FileSystem;

		return {
			loadUserEnvFiles: (projectRoot: string) =>
				Effect.gen(function* () {
					const currentEnv = yield* bridge.readAll();
					const nodeEnv = (currentEnv.NODE_ENV as string | undefined) ?? "development";
					const filesToLoad = [".env", `.env.${nodeEnv}`, ".env.local"];
					const loaded: string[] = [];

					for (const fileName of filesToLoad) {
						const filePath = `${projectRoot}/${fileName}`;
						const exists = yield* fs.exists(filePath);
						if (exists) {
							const content = yield* fs.readFileString(filePath);
							const vars = yield* parser.parse(content);
							// Only set vars not already in environment (dotenv convention)
							const existing = yield* bridge.readAll();
							const newVars: Record<string, string> = {};
							for (const [k, v] of Object.entries(vars)) {
								if (existing[k] === undefined) {
									newVars[k] = v;
								}
							}
							if (Object.keys(newVars).length > 0) {
								yield* bridge.write(newVars);
							}
							loaded.push(fileName);
						}
					}
					return loaded;
				}).pipe(Effect.mapError((cause) => new EnvLoadError({ file: projectRoot, cause }))),

			loadSessionEnvFiles: (sessionEnvDir: string) =>
				Effect.gen(function* () {
					const entries = yield* fs.readDirectory(sessionEnvDir);
					const hookFiles = entries.filter((f) => f.includes("hook") && f.endsWith(".sh"));
					let count = 0;

					for (const fileName of hookFiles) {
						const filePath = `${sessionEnvDir}/${fileName}`;
						const content = yield* fs.readFileString(filePath);
						if (content.trim().length > 0) {
							const vars = yield* parser.parse(content);
							yield* bridge.write(vars);
							count++;
						}
					}
					return count;
				}).pipe(Effect.mapError((cause) => new EnvLoadError({ file: sessionEnvDir, cause }))),

			loadFromVarsFile: (filePath: string) =>
				Effect.gen(function* () {
					const exists = yield* fs.exists(filePath);
					if (!exists) {
						return yield* Effect.fail(new EnvLoadError({ file: filePath, cause: "file not found" }));
					}
					const content = yield* fs.readFileString(filePath);
					const vars = yield* parser.parse(content);
					yield* bridge.write(vars);
				}).pipe(
					Effect.mapError((cause) =>
						cause instanceof EnvLoadError ? cause : new EnvLoadError({ file: filePath, cause }),
					),
				),
		};
	}),
);
