import { dirname } from "node:path";
import { ParseResult, Schema } from "effect";
import type { BaseState, CommandHandler, CommandOutput, PluginState } from "../plugin/config.js";
import { PluginEnv } from "../services/PluginEnv.js";

// =============================================================================
// INTERNAL SCHEMA UTILITIES
// =============================================================================

const DescriptionAnnotationId = Symbol.for("effect/annotation/Description");

/**
 * Extract the fields from an Effect Schema.Struct for documentation.
 * @internal
 */
function extractSchemaFields(schema: Schema.Schema<unknown>): Record<string, Schema.Schema<unknown>> {
	const ast = schema.ast;
	if (ast && ast.constructor?.name === "TypeLiteral") {
		const typeLiteral = ast as {
			propertySignatures?: Array<{ name: PropertyKey; type: unknown; isOptional?: boolean }>;
		};
		if (typeLiteral.propertySignatures) {
			// Access the fields via the schema itself if it is a Struct
			if ("fields" in schema) {
				const fields = (schema as unknown as { fields: Record<string, Schema.Schema<unknown>> }).fields;
				return fields;
			}
		}
	}
	// Try direct fields access for Schema.Struct instances
	if ("fields" in schema) {
		const fields = (schema as unknown as { fields: Record<string, Schema.Schema<unknown>> }).fields;
		return fields;
	}
	return {};
}

/**
 * Extract description from an Effect Schema field.
 * @internal
 */
function extractDescription(fieldSchema: Schema.Schema<unknown>): string | undefined {
	const ast = fieldSchema.ast;
	if (!ast) return undefined;
	// Check direct annotations
	const desc = (ast.annotations as Record<symbol, unknown>)?.[DescriptionAnnotationId];
	if (typeof desc === "string") return desc;
	// Check nested for PropertySignatureDeclaration
	if (ast.constructor?.name === "PropertySignatureDeclaration") {
		const psd = ast as unknown as { type?: { annotations?: Record<symbol, unknown> } };
		const nestedDesc = psd.type?.annotations?.[DescriptionAnnotationId];
		if (typeof nestedDesc === "string") return nestedDesc;
	}
	return undefined;
}

/**
 * Check if an Effect Schema field is optional (optional or has a default).
 * @internal
 */
function isSchemaOptional(fieldSchema: Schema.Schema<unknown>): boolean {
	const ast = fieldSchema.ast;
	if (!ast) return false;
	const name = ast.constructor?.name;
	// PropertySignatureDeclaration with isOptional flag
	if (name === "PropertySignatureDeclaration") {
		return (ast as unknown as { isOptional?: boolean }).isOptional === true;
	}
	// PropertySignatureTransformation means it has a default (optionalWith)
	if (name === "PropertySignatureTransformation") {
		return true;
	}
	return false;
}

/**
 * Format an Effect ParseError as LLM-friendly markdown.
 * @internal
 */
function formatArgumentError(
	rawArgs: string[],
	// biome-ignore lint/suspicious/noExplicitAny: Accepts any Schema variant (Struct, Class, etc.)
	schema: Schema.Schema<any, any, never>,
	error: ParseResult.ParseError,
): string {
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

	const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
	lines.push(formatted);

	// Generate usage from schema
	lines.push("", "## Expected Arguments", "");
	const fields = extractSchemaFields(schema);
	for (const [key, fieldSchema] of Object.entries(fields)) {
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

	// biome-ignore lint/suspicious/noExplicitAny: Accepts any Schema variant (Struct, Class, etc.)
	constructor(rawArgs: string[], schema: Schema.Schema<any, any, never>, error: ParseResult.ParseError) {
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
	/** Effect Schema for validating arguments */
	// biome-ignore lint/suspicious/noExplicitAny: Encoded type varies by Schema.Struct shape
	argsSchema: Schema.Schema<TArgs, any, never>;
	/** State class for loading env vars */
	stateClass: new () => PluginEnv<TOptions>;
}

// =============================================================================
// EMPTY ARGS SCHEMA
// =============================================================================

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
 *   argsSchema: Schema.Struct({ fix: Schema.Boolean }),
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
// biome-ignore lint/complexity/noStaticOnlyClass: Static class used as public API namespace
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
			// Parse and validate arguments
			const args = Commands.parse(rawArgs, argsSchema);

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
	 * Parse and validate CLI arguments against an Effect Schema.
	 *
	 * @remarks
	 * Parses raw CLI arguments and validates them against the provided schema.
	 *
	 * @param rawArgs - Raw CLI arguments array
	 * @param schema - Effect Schema for validation
	 * @returns Validated and typed arguments
	 * @throws {@link CommandArgumentError} if validation fails
	 *
	 * @example
	 * ```typescript
	 * const schema = Schema.Struct({
	 *   fix: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	 *   path: Schema.optionalWith(Schema.String, { default: () => "." }),
	 * });
	 *
	 * const args = Commands.parse(["--fix", "--path=src/"], schema);
	 * // args: { fix: true, path: "src/" }
	 * ```
	 *
	 * @public
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Encoded type varies by Schema.Struct shape
	static parse<T>(rawArgs: string[], schema: Schema.Schema<T, any, never>): T {
		const parsed = Commands.parseRaw(rawArgs);

		try {
			return Schema.decodeUnknownSync(schema)(parsed);
		} catch (err) {
			if (ParseResult.isParseError(err)) {
				// biome-ignore lint/suspicious/noExplicitAny: narrowing to any for CommandArgumentError constructor
				throw new CommandArgumentError(rawArgs, schema as Schema.Schema<any, any, never>, err);
			}
			throw err;
		}
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
	 * Thrown when CLI arguments fail Effect Schema validation. The error message is
	 * formatted as LLM-friendly markdown with validation errors and usage hints.
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   Commands.parse(args, schema);
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
	static emptySchema = Schema.Struct({});

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
	// biome-ignore lint/suspicious/noExplicitAny: Schema invariance requires `any` for generic PluginEnv instances
	private static createBaseState(stateInstance: PluginEnv<any>): BaseState {
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
	 *
	 * @param stateInstance - The plugin state instance
	 * @returns State object parsed from `PREFIX_PLUGIN_STATE`
	 * @internal
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Schema invariance requires `any` for generic PluginEnv instances
	private static extractPersistedState(stateInstance: PluginEnv<any>): Record<string, unknown> {
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
