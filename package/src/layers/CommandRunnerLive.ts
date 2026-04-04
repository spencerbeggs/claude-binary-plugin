import { dirname } from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Layer, ParseResult, Schema } from "effect";
import { CommandParseError } from "../errors/CommandParseError.js";
import type { BaseState } from "../plugin/state.js";
import type { CommandOutput } from "../services/CommandRunner.js";
import { CommandRunner } from "../services/CommandRunner.js";
import { EnvBridge } from "../services/EnvBridge.js";
import { EnvResolver } from "../services/EnvResolver.js";

/**
 * Parse a string value from CLI args, handling booleans and numbers.
 * @internal
 */
function parseArgValue(value: string): unknown {
	if (value === "true") return true;
	if (value === "false") return false;
	const num = Number(value);
	if (!Number.isNaN(num) && value.trim() !== "") return num;
	return value;
}

/**
 * Parse raw CLI arguments into an object without validation.
 * @internal
 */
function parseRaw(rawArgs: string[]): Record<string, unknown> {
	const parsed: Record<string, unknown> = {};
	const positionals: string[] = [];

	for (const arg of rawArgs) {
		if (arg.startsWith("--")) {
			const eqIndex = arg.indexOf("=");
			if (eqIndex > 0) {
				const key = arg.slice(2, eqIndex);
				const value = arg.slice(eqIndex + 1);
				parsed[key] = parseArgValue(value);
			} else {
				// --flag without = means boolean true
				parsed[arg.slice(2)] = true;
			}
		} else if (!arg.startsWith("-")) {
			positionals.push(arg);
		}
	}

	// Store positionals for schema to handle
	if (positionals.length > 0) {
		parsed._positionals = positionals;
	}

	return parsed;
}

/**
 * Validate command output structure.
 * @internal
 */
function validateOutput(output: CommandOutput, commandName: string): void {
	if (typeof output.exitCode !== "number") {
		throw new Error(`Command "${commandName}" returned invalid exitCode: ${output.exitCode}`);
	}
	if (typeof output.output !== "string") {
		throw new Error(`Command "${commandName}" returned invalid output: expected string`);
	}
	if (output.exitCode < 0 || output.exitCode > 255) {
		throw new Error(`Command "${commandName}" returned invalid exitCode: must be 0-255`);
	}
}

/**
 * Format a fatal error as LLM-friendly markdown.
 * @internal
 */
function formatError(commandName: string, error: unknown): string {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	const lines = [
		"# Command Error",
		"",
		`The \`${commandName}\` command encountered a fatal error.`,
		"",
		"## Error Message",
		"",
		"```",
		errorMessage,
		"```",
	];

	if (errorStack) {
		lines.push("", "## Stack Trace", "", "```", errorStack, "```");
	}

	return lines.join("\n");
}

/**
 * Find the session environment directory using EnvBridge and EnvResolver.
 *
 * Uses multiple strategies:
 * 1. CLAUDE_SESSION_ID via registry
 * 2. CLAUDE_ENV_FILE parent directory
 * 3. Any *_PLUGIN_ENV_FILE env var
 * 4. Project directory via registry
 *
 * @returns Session env directory path, or undefined if not found
 * @internal
 */
const findSessionEnvDir = Effect.gen(function* () {
	const envBridge = yield* EnvBridge;
	const resolver = yield* EnvResolver;
	const env = yield* envBridge.readAll();

	// Strategy 1: CLAUDE_SESSION_ID via registry
	const sessionId = env.CLAUDE_SESSION_ID;
	if (sessionId) {
		const dir = yield* resolver.getSessionEnvDir(sessionId);
		if (dir) return dir;
	}

	// Strategy 2: CLAUDE_ENV_FILE parent directory
	const envFile = env.CLAUDE_ENV_FILE;
	if (envFile) return dirname(envFile);

	// Strategy 3: Any *_PLUGIN_ENV_FILE env var
	for (const [key, value] of Object.entries(env)) {
		if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
			return dirname(value);
		}
	}

	// Strategy 4: Project directory via registry
	const projectDir = process.cwd();
	const dir = yield* resolver.getProjectSessionEnvDir(projectDir);
	if (dir) return dir;

	return undefined as string | undefined;
});

/**
 * Load session hook files from the session env directory into the env bridge.
 * @internal
 */
const loadSessionFiles = (sessionEnvDir: string, commandName: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const envBridge = yield* EnvBridge;
		const files = yield* fs.readDirectory(sessionEnvDir);
		const hookFiles = files.filter((f) => f.includes("hook") && f.endsWith(".sh"));

		for (const fileName of hookFiles) {
			const filePath = `${sessionEnvDir}/${fileName}`;
			const content = yield* fs.readFileString(filePath).pipe(Effect.catchAll(() => Effect.succeed("")));
			const vars: Record<string, string> = {};
			for (const line of content.split("\n")) {
				const match = line.match(/^export\s+(\w+)=(.*)$/);
				if (match?.[1] && match[2] !== undefined) {
					const raw = match[2].trim();
					const value =
						(raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
							? raw.slice(1, -1)
							: raw;
					vars[match[1]] = value;
				}
			}
			if (Object.keys(vars).length > 0) {
				yield* envBridge.write(vars);
			}
		}
	}).pipe(
		Effect.catchAll((error) =>
			Effect.fail(new CommandParseError({ commandName, message: `Failed to load session files: ${error}` })),
		),
	);

/**
 * Create the base state object from environment variables via EnvBridge.
 * @internal
 */
const createBaseState = (prefix: string) =>
	Effect.gen(function* () {
		const envBridge = yield* EnvBridge;
		const env = yield* envBridge.readAll();
		return {
			projectDir: env[`${prefix}_PROJECT_DIR`] ?? env.CLAUDE_PROJECT_DIR ?? process.cwd(),
			pluginDir: env[`${prefix}_PLUGIN_DIR`] ?? env.CLAUDE_PLUGIN_ROOT ?? "",
			pluginEnvFile: env[`${prefix}_PLUGIN_ENV_FILE`] ?? env.CLAUDE_ENV_FILE ?? "",
		} satisfies BaseState;
	});

/**
 * Extract persisted state from environment variables via EnvBridge.
 * Reads `PREFIX_PLUGIN_STATE` and parses it as base64-encoded JSON.
 * @internal
 */
const extractPersistedState = (prefix: string) =>
	Effect.gen(function* () {
		if (!prefix) return {};
		const envBridge = yield* EnvBridge;
		const env = yield* envBridge.read([`${prefix}_PLUGIN_STATE`]);
		const stateJson = env[`${prefix}_PLUGIN_STATE`];
		if (!stateJson) return {};
		return yield* Effect.try({
			try: () => {
				const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
				const state = JSON.parse(jsonStr);
				return typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
			},
			catch: (e) => e,
		}).pipe(Effect.catchAll(() => Effect.succeed({} as Record<string, unknown>)));
	});

/**
 * Live implementation of the CommandRunner service.
 *
 * Provides CLI argument parsing using Effect Schema validation
 * and full command lifecycle execution.
 */
export const CommandRunnerLive: Layer.Layer<CommandRunner, never, EnvResolver | EnvBridge | FileSystem.FileSystem> =
	Layer.effect(
		CommandRunner,
		Effect.gen(function* () {
			const envBridge = yield* EnvBridge;
			const envResolver = yield* EnvResolver;
			const fs = yield* FileSystem.FileSystem;

			return CommandRunner.of({
				run: (options) =>
					Effect.gen(function* () {
						const { commandName, handler, rawArgs, argsSchema } = options;

						// Parse args
						const parsed = parseRaw(rawArgs);
						let args: unknown;
						if (argsSchema) {
							args = yield* Effect.try({
								try: () => Schema.decodeUnknownSync(argsSchema)(parsed),
								catch: (error): CommandParseError => {
									if (ParseResult.isParseError(error)) {
										const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
										return new CommandParseError({ commandName, message: formatted });
									}
									return new CommandParseError({ commandName, message: String(error) });
								},
							});
						} else {
							args = parsed;
						}

						// Find session env using captured services
						const sessionEnvDir = yield* findSessionEnvDir.pipe(
							Effect.provideService(EnvBridge, envBridge),
							Effect.provideService(EnvResolver, envResolver),
						);

						if (!sessionEnvDir) {
							return yield* Effect.fail(
								new CommandParseError({
									commandName,
									message:
										"Could not find session environment directory. " +
										"Commands must be run within a Claude Code session that has been initialized by SessionStart hook.",
								}),
							);
						}

						// Load session hook files into env bridge
						yield* loadSessionFiles(sessionEnvDir, commandName).pipe(
							Effect.provideService(FileSystem.FileSystem, fs),
							Effect.provideService(EnvBridge, envBridge),
						);

						// Build state from environment (session files already loaded above)
						const prefix = options.prefix ?? "";
						const allEnv = yield* envBridge.readAll();
						const validatedOptions = options.optionsSchema
							? Schema.decodeUnknownSync(options.optionsSchema)(
									Object.fromEntries(
										Object.keys((options.optionsSchema as { fields?: Record<string, unknown> }).fields ?? {}).map(
											(k) => [k, allEnv[k]],
										),
									),
								)
							: {};
						const baseState = yield* createBaseState(prefix).pipe(Effect.provideService(EnvBridge, envBridge));
						const persistedState = yield* extractPersistedState(prefix).pipe(
							Effect.provideService(EnvBridge, envBridge),
						);
						const pluginState = { ...baseState, ...persistedState };

						// Call handler
						const handlerResult = yield* Effect.tryPromise({
							try: () =>
								Promise.resolve(
									handler({ args, options: validatedOptions, state: pluginState }),
								) as Promise<CommandOutput>,
							catch: (error): CommandParseError =>
								new CommandParseError({ commandName, message: formatError(commandName, error) }),
						});
						const result: CommandOutput = handlerResult;

						// Validate
						yield* Effect.try({
							try: () => validateOutput(result, commandName),
							catch: (error): CommandParseError =>
								new CommandParseError({
									commandName,
									message: error instanceof Error ? error.message : String(error),
								}),
						});

						return result;
					}),

				parse: (schema, args) =>
					Effect.try({
						try: () => {
							const parsed = parseRaw(args);
							return Schema.decodeUnknownSync(schema)(parsed);
						},
						catch: (error) => {
							if (ParseResult.isParseError(error)) {
								const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
								return new CommandParseError({
									commandName: "parse",
									message: formatted,
								});
							}
							return new CommandParseError({
								commandName: "parse",
								message: String(error),
							});
						},
					}),
			});
		}),
	);
