/**
 * Runtime support for command-based plugins.
 *
 * @remarks
 * This module provides the execution environment for CLI commands exposed
 * by plugins. Commands are invoked via `--cmd=name` and return markdown
 * output for Claude to process.
 *
 * **Key Functions:**
 * - {@link runCommand} - Main entry point for executing commands
 * - {@link parseRawArgs} - Parse CLI arguments into an object
 * - {@link parseCommandArgs} - Parse and validate args against Zod schema
 *
 * **Execution Flow:**
 * 1. Parse CLI arguments from `--cmd=name` invocation
 * 2. Validate arguments against command's Zod schema
 * 3. Load environment via `PluginEnv.forContext("command")`
 * 4. Call command handler with `{ args, options, state }`
 * 5. Write markdown output to stdout
 * 6. Exit with appropriate code (0=success, 1=issues found, 2=error)
 *
 * **State Access:**
 * Commands can access computed state from SessionStart by using the
 * session registry to locate persisted hook-*.sh files.
 *
 * @example
 * ```typescript
 * import { runCommand, emptyArgsSchema } from "claude-binary-plugin";
 *
 * await runCommand({
 *   name: "lint",
 *   argsSchema: emptyArgsSchema,
 *   handler: async ({ args, options, state }) => ({
 *     exitCode: 0,
 *     output: "# Lint Results\n\nAll checks passed!",
 *   }),
 *   stateClass: MyPluginState,
 * });
 * ```
 *
 * @see {@link CommandOutput} - Output format for command handlers
 * @see {@link CommandHandler} - Handler function signature
 */

import { dirname } from "node:path";
import { z } from "zod";
import type { BaseState, CommandHandler, CommandOutput, PluginState } from "../pipeline/config.js";
import { PluginEnv } from "../state/classes/PluginEnv.js";

// =============================================================================
// INTERNAL SCHEMA UTILITIES
// =============================================================================

/**
 * Extract the shape from a Zod schema for documentation.
 * @internal
 */
function extractSchemaShape(schema: z.ZodType): Record<string, z.ZodType> {
	if (schema instanceof z.ZodObject) {
		return schema.shape as Record<string, z.ZodType>;
	}
	// Handle wrapped schemas (default, optional, etc.)
	if ("_def" in schema) {
		const def = schema._def as { innerType?: z.ZodType };
		if (def.innerType) {
			return extractSchemaShape(def.innerType);
		}
	}
	return {};
}

/**
 * Extract description from a Zod schema field.
 * @internal
 */
function extractDescription(schema: z.ZodType): string | undefined {
	if ("_def" in schema) {
		const def = schema._def as { description?: string; innerType?: z.ZodType };
		if (def.description) return def.description;
		if (def.innerType) return extractDescription(def.innerType);
	}
	return undefined;
}

/**
 * Check if a Zod schema field is optional.
 * @internal
 */
function isSchemaOptional(schema: z.ZodType): boolean {
	if (schema instanceof z.ZodOptional) return true;
	if (schema instanceof z.ZodDefault) return true;
	if ("_def" in schema) {
		const def = schema._def as { innerType?: z.ZodType };
		if (def.innerType) return isSchemaOptional(def.innerType);
	}
	return false;
}

/**
 * Format a Zod validation error as LLM-friendly markdown.
 * @internal
 */
function formatArgumentError(rawArgs: string[], schema: z.ZodType, error: z.ZodError): string {
	const lines = [
		"# Argument Validation Error",
		"",
		"The command received invalid arguments.",
		"",
		"## Received Arguments",
		"",
		"```",
		rawArgs.length > 0 ? rawArgs.join(" ") : "(none)",
		"```",
		"",
		"## Validation Errors",
		"",
	];

	for (const issue of error.issues) {
		const path = issue.path.join(".");
		lines.push(`- **${path || "(root)"}**: ${issue.message}`);

		// Add expected values for enum errors (Zod v4 uses "invalid_value" with expected array)
		if ("expected" in issue && Array.isArray(issue.expected)) {
			lines.push(`  - Valid options: ${issue.expected.join(", ")}`);
		}
	}

	// Generate usage from schema
	lines.push("", "## Expected Arguments", "");
	const shape = extractSchemaShape(schema);
	for (const [key, fieldSchema] of Object.entries(shape)) {
		if (key.startsWith("_")) continue; // Skip internal keys
		const desc = extractDescription(fieldSchema);
		const required = !isSchemaOptional(fieldSchema);
		const reqLabel = required ? " (required)" : "";
		const descLabel = desc ? `: ${desc}` : "";
		lines.push(`- \`--${key}\`${reqLabel}${descLabel}`);
	}

	lines.push("", "## Example Usage", "");
	lines.push("```");
	lines.push("workflow.plugin --cmd=<command> --arg1=value --arg2=value");
	lines.push("```");

	return lines.join("\n");
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Error thrown when command arguments fail validation.
 * Provides LLM-friendly markdown error message.
 * @error
 * @public
 */
export class CommandArgumentError extends Error {
	readonly exitCode = 2;

	constructor(rawArgs: string[], schema: z.ZodType, error: z.ZodError) {
		super(formatArgumentError(rawArgs, schema, error));
		this.name = "CommandArgumentError";
	}
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for running a command.
 * @public
 */
export interface RunCommandOptions<TArgs, TOptions, TState> {
	/** Command name for logging/telemetry */
	commandName: string;
	/** Plugin name for telemetry */
	pluginName: string;
	/** Plugin version for telemetry */
	pluginVersion: string;
	/** The command handler function */
	handler: CommandHandler<TArgs, TOptions, TState>;
	/** Raw CLI arguments */
	rawArgs: string[];
	/** Zod schema for validating arguments */
	argsSchema: z.ZodType<TArgs>;
	/** State class for loading env vars */
	stateClass: new () => PluginEnv<TOptions>;
}

// =============================================================================
// EMPTY ARGS SCHEMA
// =============================================================================

/**
 * Empty args schema for commands that don't accept arguments.
 *
 * @remarks
 * Use `Commands.emptySchema` to access this schema. This internal export
 * is used by generated entrypoint code.
 *
 * @internal
 */
export const emptyArgsSchema = z.object({});

/**
 * Type for commands that accept no arguments.
 *
 * @remarks
 * Represents an empty object type. Use with `Commands.emptySchema`
 * when defining commands that don't accept any arguments.
 *
 * @public
 */
// biome-ignore lint/complexity/noBannedTypes: Empty object type is intentional for commands with no args
// biome-ignore lint/style/useConsistentTypeDefinitions: Type alias needed to avoid interface extending object
export type EmptyArgs = {};

// =============================================================================
// COMMANDS CLASS
// =============================================================================

/**
 * Unified class for command execution and argument parsing.
 *
 * @remarks
 * The `Commands` class consolidates all command-related functions into a
 * single, discoverable API. Commands are CLI tools compiled into plugin binaries
 * that output markdown for Claude to process.
 *
 * **API Organization:**
 *
 * | Category | Methods |
 * |----------|---------|
 * | Execution | `run` |
 * | Parsing | `parse`, `parseRaw` |
 * | Validation | `validateOutput` |
 * | Errors | `ArgumentError`, `formatError` |
 * | Utilities | `findSessionEnvDir`, `emptySchema` |
 *
 * @example
 * ```typescript
 * import { Commands } from "claude-binary-plugin";
 *
 * // Run a command handler
 * await Commands.run({
 *   commandName: "lint",
 *   handler: async ({ args, options, state }) => ({
 *     exitCode: 0,
 *     output: "# Results\n\nAll checks passed!",
 *   }),
 *   rawArgs: ["--fix", "src/"],
 *   argsSchema: z.object({ fix: z.boolean().default(false) }),
 *   stateClass: MyState,
 * });
 *
 * // Parse arguments without execution
 * const args = await Commands.parse(rawArgs, schema);
 *
 * // Check for valid session
 * const sessionDir = Commands.findSessionEnvDir();
 * if (!sessionDir) {
 *   console.error("No active session");
 * }
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export class Commands {
	// =========================================================================
	// EXECUTION
	// =========================================================================

	/**
	 * Run a command handler.
	 *
	 * @remarks
	 * Main entry point for executing CLI commands. Handles the full lifecycle:
	 * parsing arguments, loading environment, calling the handler, and outputting
	 * markdown results.
	 *
	 * **Exit Codes:**
	 * - 0: Success
	 * - 1: Issues found (lint errors, test failures)
	 * - 2: Fatal error (invalid args, missing config)
	 *
	 * @param options - Command execution options
	 * @returns Never (exits process after completion)
	 *
	 * @example
	 * ```typescript
	 * await Commands.run({
	 *   commandName: "lint",
	 *   pluginName: "my-plugin",
	 *   pluginVersion: "1.0.0",
	 *   handler: async ({ args, options, state }) => ({
	 *     exitCode: 0,
	 *     output: "# Lint Results\n\nAll checks passed!",
	 *   }),
	 *   rawArgs: process.argv.slice(2),
	 *   argsSchema: Commands.emptySchema,
	 *   stateClass: MyState,
	 * });
	 * ```
	 *
	 * @see {@link RunCommandOptions}
	 * @public
	 */
	static async run<TArgs, TOptions, TState>(options: RunCommandOptions<TArgs, TOptions, TState>): Promise<never> {
		const { commandName, handler, rawArgs, argsSchema, stateClass } = options;

		try {
			// Parse and validate arguments (async for path validation)
			const args = await Commands.parse(rawArgs, argsSchema);

			// Load session env files (must be done before creating state instance)
			// This is required - if we can't find session env, the command won't have state
			const sessionEnvDir = Commands.findSessionEnvDir();
			if (!sessionEnvDir) {
				throw new Error(
					"Could not find session environment directory. " +
						"Commands must be run within a Claude Code session that has been initialized by SessionStart hook.",
				);
			}
			await PluginEnv.loadAllHookFiles(sessionEnvDir);

			// Create state instance after loading session files (constructor reads from Bun.env)
			const stateInstance = new stateClass();

			const validatedOptions = stateInstance.vars as TOptions;
			const baseState = Commands.createBaseState(stateInstance);
			const persistedState = Commands.extractPersistedState(stateInstance);
			const pluginState = { ...baseState, ...persistedState } as PluginState<TState>;

			// Call the handler
			const result = await handler({ args, options: validatedOptions, state: pluginState });

			// Validate output
			Commands.validateOutput(result, commandName);

			// Output markdown to stdout
			console.log(result.output);

			process.exit(result.exitCode);
		} catch (error) {
			if (error instanceof CommandArgumentError) {
				console.log(error.message);
				process.exit(2);
			}

			// Format other errors as markdown
			const errorOutput = Commands.formatError(commandName, error);
			console.log(errorOutput);
			process.exit(2);
		}
	}

	// =========================================================================
	// ARGUMENT PARSING
	// =========================================================================

	/**
	 * Parse and validate CLI arguments against a Zod schema.
	 *
	 * @remarks
	 * Parses raw CLI arguments and validates them against the provided schema.
	 * Supports async validation (e.g., file existence checks).
	 *
	 * @param rawArgs - Raw CLI arguments array
	 * @param schema - Zod schema for validation
	 * @returns Validated and typed arguments
	 * @throws {@link CommandArgumentError} if validation fails
	 *
	 * @example
	 * ```typescript
	 * const schema = z.object({
	 *   fix: z.boolean().default(false),
	 *   path: z.string().default("."),
	 * });
	 *
	 * const args = await Commands.parse(["--fix", "--path=src/"], schema);
	 * // args: { fix: true, path: "src/" }
	 * ```
	 *
	 * @public
	 */
	static async parse<T extends z.ZodType>(rawArgs: string[], schema: T): Promise<z.infer<T>> {
		const parsed = Commands.parseRaw(rawArgs);

		// Use safeParseAsync for async validation (path existence, etc.)
		const result = await schema.safeParseAsync(parsed);

		if (!result.success) {
			throw new CommandArgumentError(rawArgs, schema, result.error);
		}

		return result.data;
	}

	/**
	 * Parse CLI arguments into an object without validation.
	 *
	 * @remarks
	 * Low-level parser that converts CLI args to an object. Use {@link Commands.parse}
	 * for validated parsing.
	 *
	 * **Supported formats:**
	 * - `--key=value` - Named argument
	 * - `--flag` - Boolean flag (true)
	 * - `positional` - Stored in `_positionals` array
	 *
	 * @param rawArgs - Raw CLI arguments array
	 * @returns Parsed arguments object
	 *
	 * @example
	 * ```typescript
	 * const parsed = Commands.parseRaw(["--fix", "--path=src/", "file.ts"]);
	 * // { fix: true, path: "src/", _positionals: ["file.ts"] }
	 * ```
	 *
	 * @public
	 */
	static parseRaw(rawArgs: string[]): Record<string, unknown> {
		const parsed: Record<string, unknown> = {};
		const positionals: string[] = [];

		for (const arg of rawArgs) {
			if (arg.startsWith("--")) {
				const eqIndex = arg.indexOf("=");
				if (eqIndex > 0) {
					const key = arg.slice(2, eqIndex);
					const value = arg.slice(eqIndex + 1);
					parsed[key] = Commands.parseArgValue(value);
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

	// =========================================================================
	// VALIDATION
	// =========================================================================

	/**
	 * Validate command output structure.
	 *
	 * @remarks
	 * Ensures the command handler returned a valid output object with
	 * `exitCode` (0-255) and `output` (string).
	 *
	 * @param output - Output to validate
	 * @param commandName - Command name for error messages
	 * @throws Error if output is invalid
	 *
	 * @public
	 */
	static validateOutput(output: CommandOutput, commandName: string): void {
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

	// =========================================================================
	// ERROR FORMATTING
	// =========================================================================

	/**
	 * Error class for argument validation failures.
	 *
	 * @remarks
	 * Thrown when CLI arguments fail Zod validation. The error message is
	 * formatted as LLM-friendly markdown with validation errors and usage hints.
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await Commands.parse(args, schema);
	 * } catch (error) {
	 *   if (error instanceof Commands.ArgumentError) {
	 *     console.log(error.message); // Markdown error
	 *     process.exit(error.exitCode); // Always 2
	 *   }
	 * }
	 * ```
	 *
	 * @public
	 */
	static ArgumentError = CommandArgumentError;

	/**
	 * Format a fatal error as LLM-friendly markdown.
	 *
	 * @param commandName - Command that failed
	 * @param error - Error to format
	 * @returns Markdown error message
	 *
	 * @public
	 */
	static formatError(commandName: string, error: unknown): string {
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

	// =========================================================================
	// SESSION UTILITIES
	// =========================================================================

	/**
	 * Find the session environment directory.
	 *
	 * @remarks
	 * Commands need access to state computed during SessionStart. This function
	 * locates the session-env directory using multiple strategies:
	 *
	 * 1. `CLAUDE_SESSION_ID` via SQLite registry
	 * 2. `CLAUDE_ENV_FILE` parent directory
	 * 3. Any `*_PLUGIN_ENV_FILE` env var
	 * 4. Project directory via SQLite registry
	 *
	 * @returns Session env directory path, or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const sessionDir = Commands.findSessionEnvDir();
	 * if (!sessionDir) {
	 *   throw new Error("Run this within a Claude Code session");
	 * }
	 * ```
	 *
	 * @public
	 */
	static findSessionEnvDir(): string | undefined {
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
	 * Empty schema for commands that don't accept arguments.
	 *
	 * @remarks
	 * Use this for commands that have no configurable arguments.
	 *
	 * @example
	 * ```typescript
	 * await Commands.run({
	 *   commandName: "status",
	 *   argsSchema: Commands.emptySchema,
	 *   handler: async () => ({ exitCode: 0, output: "OK" }),
	 *   // ...
	 * });
	 * ```
	 *
	 * @public
	 */
	static emptySchema = emptyArgsSchema;

	// =========================================================================
	// INTERNAL UTILITIES
	// =========================================================================

	/**
	 * Parse a string value from CLI args, handling booleans and numbers.
	 * @internal
	 */
	private static parseArgValue(value: string): unknown {
		if (value === "true") return true;
		if (value === "false") return false;
		const num = Number(value);
		if (!Number.isNaN(num) && value.trim() !== "") return num;
		return value;
	}

	/**
	 * Create the base state object.
	 * @internal
	 */
	private static createBaseState(stateInstance: PluginEnv<unknown>): BaseState {
		const prefix = stateInstance.getPrefix() ?? "";
		return {
			projectDir: Bun.env[`${prefix}_PROJECT_DIR`] ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
			pluginDir: Bun.env[`${prefix}_PLUGIN_DIR`] ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
			pluginEnvFile: Bun.env[`${prefix}_PLUGIN_ENV_FILE`] ?? Bun.env.CLAUDE_ENV_FILE ?? "",
			// Bind logger methods from state instance
			log: stateInstance.log.bind(stateInstance),
			info: stateInstance.info.bind(stateInstance),
			debug: stateInstance.debug.bind(stateInstance),
		};
	}

	/**
	 * Extract persisted state from the environment.
	 * Reads `PREFIX_PLUGIN_STATE` and parses it as JSON.
	 *
	 * @param stateInstance - The plugin state instance
	 * @returns State object parsed from `PREFIX_PLUGIN_STATE`
	 * @internal
	 */
	private static extractPersistedState(stateInstance: PluginEnv<unknown>): Record<string, unknown> {
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
}
