import { dirname } from "node:path";
import { Effect, Layer, ParseResult, Schema } from "effect";
import { CommandParseError } from "../errors/CommandParseError.js";
import type { BaseState } from "../plugin/config.js";
import type { CommandOutput } from "../services/CommandRunner.js";
import { CommandRunner } from "../services/CommandRunner.js";
import { PluginEnv } from "../services/PluginEnv.js";

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
 * Find the session environment directory.
 *
 * Uses multiple strategies:
 * 1. CLAUDE_SESSION_ID via SQLite registry
 * 2. CLAUDE_ENV_FILE parent directory
 * 3. Any *_PLUGIN_ENV_FILE env var
 * 4. Project directory via SQLite registry
 *
 * @returns Session env directory path, or undefined if not found
 * @internal
 */
function findSessionEnvDir(): string | undefined {
	// First try via session ID in SQLite registry
	if (Bun.env.CLAUDE_SESSION_ID) {
		const dir = PluginEnv.getSessionEnvDir(Bun.env.CLAUDE_SESSION_ID);
		if (dir) return dir;
	}

	// Try CLAUDE_ENV_FILE (set during SessionStart)
	if (Bun.env.CLAUDE_ENV_FILE) {
		return dirname(Bun.env.CLAUDE_ENV_FILE);
	}

	// Look for any *_PLUGIN_ENV_FILE env var (set after sourcing hook files)
	for (const [key, value] of Object.entries(Bun.env)) {
		if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
			return dirname(value);
		}
	}

	// Try project directory in SQLite registry (saved during SessionStart)
	const projectDir = process.cwd();
	const dir = PluginEnv.getProjectSessionEnvDir(projectDir);
	if (dir) return dir;

	return undefined;
}

/**
 * Create the base state object from a PluginEnv instance.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema invariance requires `any` for generic PluginEnv instances
function createBaseState(stateInstance: PluginEnv<any>): BaseState {
	const prefix = stateInstance.getPrefix() ?? "";
	return {
		projectDir: Bun.env[`${prefix}_PROJECT_DIR`] ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
		pluginDir: Bun.env[`${prefix}_PLUGIN_DIR`] ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
		pluginEnvFile: Bun.env[`${prefix}_PLUGIN_ENV_FILE`] ?? Bun.env.CLAUDE_ENV_FILE ?? "",
	};
}

/**
 * Extract persisted state from the environment.
 * Reads `PREFIX_PLUGIN_STATE` and parses it as JSON.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema invariance requires `any` for generic PluginEnv instances
function extractPersistedState(stateInstance: PluginEnv<any>): Record<string, unknown> {
	const prefix = stateInstance.getPrefix();
	if (!prefix) {
		return {};
	}

	const stateJson = Bun.env[`${prefix}_PLUGIN_STATE`];
	if (!stateJson) {
		return {};
	}

	try {
		// Decode from base64 first, then parse JSON
		const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
		const state = JSON.parse(jsonStr);
		return typeof state === "object" && state !== null ? state : {};
	} catch {
		return {};
	}
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
 * Live implementation of the CommandRunner service.
 *
 * Provides CLI argument parsing using Effect Schema validation
 * and full command lifecycle execution.
 */
export const CommandRunnerLive = Layer.succeed(
	CommandRunner,
	CommandRunner.of({
		run: (options) =>
			Effect.gen(function* () {
				const { commandName, handler, rawArgs, argsSchema, stateClass } = options;

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

				// Find session env
				const sessionEnvDir = findSessionEnvDir();
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

				// Load session files
				yield* Effect.tryPromise({
					try: () => PluginEnv.loadAllHookFiles(sessionEnvDir),
					catch: (error): CommandParseError =>
						new CommandParseError({ commandName, message: `Failed to load session files: ${error}` }),
				});

				// Create state instance after loading session files (constructor reads from Bun.env)
				const stateInstance = new stateClass();
				const validatedOptions = stateInstance.vars;
				const baseState = createBaseState(stateInstance);
				const persistedState = extractPersistedState(stateInstance);
				const pluginState = { ...baseState, ...persistedState };

				// Call handler
				const handlerResult = yield* Effect.tryPromise({
					try: () =>
						Promise.resolve(handler({ args, options: validatedOptions, state: pluginState })) as Promise<CommandOutput>,
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
	}),
);
