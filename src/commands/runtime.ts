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
 * 3. Load environment via `ClaudeBinaryPluginEnv.forContext("command")`
 * 4. Call command handler with `{ args, options, env }`
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
 *   handler: async ({ args, options, env }) => ({
 *     exitCode: 0,
 *     output: "# Lint Results\n\nAll checks passed!",
 *   }),
 *   envClass: MyPluginEnv,
 * });
 * ```
 *
 * @see {@link CommandOutput} - Output format for command handlers
 * @see {@link CommandHandler} - Handler function signature
 * @module
 */

import { dirname } from "node:path";
import { z } from "zod";
import { ClaudeBinaryPluginEnv } from "../env/plugin-env.js";
import type { BaseEnv, CommandHandler, CommandOutput, PluginEnv } from "../pipeline/config.js";

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

/**
 * Parse a string value from CLI args, handling booleans and numbers.
 */
function parseArgValue(value: string): unknown {
	if (value === "true") return true;
	if (value === "false") return false;
	const num = Number(value);
	if (!Number.isNaN(num) && value.trim() !== "") return num;
	return value;
}

/**
 * Extract the shape from a Zod schema for documentation.
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
 */
function isOptional(schema: z.ZodType): boolean {
	if (schema instanceof z.ZodOptional) return true;
	if (schema instanceof z.ZodDefault) return true;
	if ("_def" in schema) {
		const def = schema._def as { innerType?: z.ZodType };
		if (def.innerType) return isOptional(def.innerType);
	}
	return false;
}

/**
 * Parse CLI arguments into an object for Zod validation.
 *
 * Supports:
 * - `--key=value` flags
 * - `--flag` boolean flags (true)
 * - Positional arguments (mapped to numbered keys)
 *
 * @param rawArgs - Raw CLI arguments array
 * @returns Parsed arguments object
 * @public
 */
export function parseRawArgs(rawArgs: string[]): Record<string, unknown> {
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
 * Parse and validate CLI arguments against a Zod schema.
 *
 * @param rawArgs - Raw CLI arguments array
 * @param schema - Zod schema for validation
 * @returns Validated arguments
 * @throws CommandArgumentError if validation fails
 * @public
 */
export async function parseCommandArgs<T extends z.ZodType>(rawArgs: string[], schema: T): Promise<z.infer<T>> {
	const parsed = parseRawArgs(rawArgs);

	// Use safeParseAsync for async validation (path existence, etc.)
	const result = await schema.safeParseAsync(parsed);

	if (!result.success) {
		throw new CommandArgumentError(rawArgs, schema, result.error);
	}

	return result.data;
}

// =============================================================================
// ERROR FORMATTING
// =============================================================================

/**
 * Error thrown when command arguments fail validation.
 * Provides LLM-friendly markdown error message.
 * @public
 */
export class CommandArgumentError extends Error {
	readonly exitCode = 2;

	constructor(rawArgs: string[], schema: z.ZodType, error: z.ZodError) {
		super(formatArgumentError(rawArgs, schema, error));
		this.name = "CommandArgumentError";
	}
}

/**
 * Format a Zod validation error as LLM-friendly markdown.
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
		const required = !isOptional(fieldSchema);
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
// COMMAND EXECUTION
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
	/** Environment class for loading env vars */
	envClass: new () => ClaudeBinaryPluginEnv<TOptions>;
}

/**
 * Create the base env object.
 * @internal
 */
function createBaseEnv(env: ClaudeBinaryPluginEnv<unknown>): BaseEnv {
	const prefix = env.getPrefix() ?? "";
	return {
		projectDir: Bun.env[`${prefix}_PROJECT_DIR`] ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
		pluginDir: Bun.env[`${prefix}_PLUGIN_DIR`] ?? Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
		pluginEnvFile: Bun.env[`${prefix}_PLUGIN_ENV_FILE`] ?? Bun.env.CLAUDE_ENV_FILE ?? "",
		// Bind logger methods from env instance
		log: env.log.bind(env),
		info: env.info.bind(env),
		debug: env.debug.bind(env),
	};
}

/**
 * Extract state from the environment.
 * Reads {prefix}_PLUGIN_STATE and parses it as JSON.
 *
 * @param env - The plugin environment instance
 * @returns State object parsed from {prefix}_PLUGIN_STATE
 * @internal
 */
function extractStateFromEnv(env: ClaudeBinaryPluginEnv<unknown>): Record<string, unknown> {
	const prefix = env.getPrefix();
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
 * Find the session env directory from available env vars or SQLite registry.
 *
 * Tries multiple sources in order:
 * 1. CLAUDE_SESSION_ID via SQLite registry
 * 2. CLAUDE_ENV_FILE (parent directory)
 * 3. Any *_PLUGIN_ENV_FILE env var (parent directory)
 * 4. Project directory via SQLite registry (saved during SessionStart)
 *
 * @returns Session env directory path, or undefined if not found
 * @public
 */
function findSessionEnvDir(): string | undefined {
	// First try via session ID in SQLite registry
	if (Bun.env.CLAUDE_SESSION_ID) {
		const dir = ClaudeBinaryPluginEnv.getSessionEnvDir(Bun.env.CLAUDE_SESSION_ID);
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
	const dir = ClaudeBinaryPluginEnv.getProjectSessionEnvDir(projectDir);
	if (dir) return dir;

	return undefined;
}

/**
 * Run a command handler.
 *
 * This function:
 * 1. Parses and validates CLI arguments with the Zod schema
 * 2. Loads environment variables from the session
 * 3. Extracts options and state, merges with base env
 * 4. Calls the handler with `{ args, options, env }`
 * 5. Outputs the result markdown to stdout
 * 6. Exits with the appropriate exit code
 *
 * @param options - Command configuration
 * @public
 */
export async function runCommand<TArgs, TOptions, TState>(
	options: RunCommandOptions<TArgs, TOptions, TState>,
): Promise<never> {
	const { commandName, handler, rawArgs, argsSchema, envClass } = options;

	try {
		// Parse and validate arguments (async for path validation)
		const args = await parseCommandArgs(rawArgs, argsSchema);

		// Load session env files (must be done before creating env instance)
		// This is required - if we can't find session env, the command won't have state
		const sessionEnvDir = findSessionEnvDir();
		if (!sessionEnvDir) {
			throw new Error(
				"Could not find session environment directory. " +
					"Commands must be run within a Claude Code session that has been initialized by SessionStart hook.",
			);
		}
		await ClaudeBinaryPluginEnv.loadAllHookFiles(sessionEnvDir);

		// Create env instance after loading session files (constructor reads from Bun.env)
		const envInstance = new envClass();

		const validatedOptions = envInstance.vars as TOptions;
		const baseEnv = createBaseEnv(envInstance);
		const state = extractStateFromEnv(envInstance);
		const pluginEnv = { ...baseEnv, ...state } as PluginEnv<TState>;

		// Call the handler
		const result = await handler({ args, options: validatedOptions, env: pluginEnv });

		// Validate output
		validateCommandOutput(result, commandName);

		// Output markdown to stdout
		console.log(result.output);

		process.exit(result.exitCode);
	} catch (error) {
		if (error instanceof CommandArgumentError) {
			console.log(error.message);
			process.exit(2);
		}

		// Format other errors as markdown
		const errorOutput = formatFatalError(commandName, error);
		console.log(errorOutput);
		process.exit(2);
	}
}

/**
 * Validate command output structure.
 * @public
 */
function validateCommandOutput(output: CommandOutput, commandName: string): void {
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
 * @public
 */
function formatFatalError(commandName: string, error: unknown): string {
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

// =============================================================================
// EMPTY ARGS SCHEMA
// =============================================================================

/**
 * Empty args schema for commands that don't accept arguments.
 * @public
 */
export const emptyArgsSchema = z.object({});

/** @public */
export type EmptyArgs = z.infer<typeof emptyArgsSchema>;

// =============================================================================
// EXPORTED UTILITIES FOR TESTING
// =============================================================================

export { createBaseEnv, extractStateFromEnv, findSessionEnvDir, validateCommandOutput, formatFatalError };
