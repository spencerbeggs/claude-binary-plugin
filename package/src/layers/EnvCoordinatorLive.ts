import { dirname } from "node:path";
import { Effect, Layer, ParseResult, Schema } from "effect";
import type { EnvLoadError } from "../errors/EnvLoadError.js";
import type { EnvPersistError } from "../errors/EnvPersistError.js";
import { SchemaValidationError } from "../errors/SchemaValidationError.js";
import { EnvBridge } from "../services/EnvBridge.js";
import type { CommandResult, PersistParams } from "../services/EnvCoordinator.js";
import { EnvCoordinator } from "../services/EnvCoordinator.js";
import { EnvLoader } from "../services/EnvLoader.js";
import { EnvResolver } from "../services/EnvResolver.js";
import { EnvValidator } from "../services/EnvValidator.js";
import type { PersistResult } from "../services/EnvWriter.js";
import { EnvWriter } from "../services/EnvWriter.js";

export const EnvCoordinatorLive = Layer.effect(
	EnvCoordinator,
	Effect.gen(function* () {
		const bridge = yield* EnvBridge;
		const loader = yield* EnvLoader;
		const validator = yield* EnvValidator;
		const writer = yield* EnvWriter;
		const resolver = yield* EnvResolver;

		return {
			forSessionStart: <TOptions>(
				schema: Schema.Schema<TOptions, any, never>,
				params: { projectRoot?: string; sessionId?: string; hookName?: string },
			): Effect.Effect<TOptions, EnvLoadError | SchemaValidationError> =>
				Effect.gen(function* () {
					const env = yield* bridge.readAll();
					const projectRoot = params.projectRoot ?? (env.CLAUDE_PROJECT_DIR as string | undefined);
					if (projectRoot) {
						yield* loader.loadUserEnvFiles(projectRoot);
					}
					return yield* validator.validate(schema);
				}),

			forHook: <TOptions>(
				schema: Schema.Schema<TOptions, any, never>,
				params: { sessionId: string; sessionEnvDir?: string; hookName?: string },
			): Effect.Effect<TOptions, EnvLoadError | SchemaValidationError> =>
				Effect.gen(function* () {
					const sessionEnvDir = params.sessionEnvDir ?? (yield* resolver.getSessionEnvDir(params.sessionId));
					if (sessionEnvDir) {
						yield* loader.loadSessionEnvFiles(sessionEnvDir);
					}
					return yield* validator.validate(schema);
				}),

			forCommand: <TOptions, TArgs = Record<string, unknown>>(
				schema: Schema.Schema<TOptions, any, never>,
				params: { args: string[]; commandName?: string },
				argsSchema?: Schema.Schema<TArgs, any, never>,
			): Effect.Effect<CommandResult<TOptions, TArgs>, EnvLoadError | SchemaValidationError> =>
				Effect.gen(function* () {
					const remainingArgs: string[] = [];
					let varsPath: string | undefined;

					for (const arg of params.args) {
						if (arg.startsWith("--vars=")) {
							varsPath = arg.slice("--vars=".length);
						} else {
							remainingArgs.push(arg);
						}
					}

					if (varsPath) {
						yield* loader.loadFromVarsFile(varsPath);
					}

					const options = yield* validator.validate(schema);

					let parsedArgs: TArgs | undefined;
					if (argsSchema) {
						const argsObj: Record<string, unknown> = {};
						for (const arg of remainingArgs) {
							if (arg.startsWith("--")) {
								const eqIndex = arg.indexOf("=");
								if (eqIndex > 0) {
									argsObj[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
								} else {
									argsObj[arg.slice(2)] = true;
								}
							}
						}
						parsedArgs = yield* Schema.decodeUnknown(argsSchema)(argsObj).pipe(
							Effect.mapError((parseError) => {
								const message = ParseResult.TreeFormatter.formatErrorSync(parseError);
								return new SchemaValidationError({
									message,
									issues: [],
									path: "EnvCoordinator.forCommand.args",
								});
							}),
						);
					}

					return { options, remainingArgs, args: parsedArgs };
				}),

			persistSessionEnv: (params: PersistParams): Effect.Effect<PersistResult, EnvPersistError> =>
				Effect.gen(function* () {
					const result = yield* writer.persist(params.vars);
					if (result.persisted && result.path && params.sessionId && params.projectDir) {
						const sessionEnvDir = dirname(params.claudeEnvFile);
						yield* resolver.registerSession(params.sessionId, params.projectDir, sessionEnvDir);
					}
					return result;
				}),
		};
	}),
);
