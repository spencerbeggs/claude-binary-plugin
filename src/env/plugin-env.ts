/**
 * Environment variable management for Claude Code plugins.
 *
 * @remarks
 * This module provides the {@link ClaudeBinaryPluginEnv} base class for managing
 * plugin configuration through environment variables. It implements a three-layer
 * model for plugin configuration:
 *
 * 1. **Input Layer** - Event data from Claude Code (session_id, tool_input)
 * 2. **Options Layer** - User-configurable settings via environment variables
 * 3. **State Layer** - Computed values from `setup()` during SessionStart
 *
 * The class handles context-aware loading through {@link ClaudeBinaryPluginEnv.forContext | `forContext()`}:
 * - `"sessionStart"` - Loads user `.env` files from project root
 * - `"hook"` - Loads persisted state from session-env directory
 * - `"command"` - Parses `--vars` argument for CLI commands
 *
 * State is persisted using Claude Code's `CLAUDE_ENV_FILE` mechanism and looked
 * up via an SQLite {@link SessionRegistry} in subsequent hooks and commands.
 *
 * @example
 * ```typescript
 * import { ClaudeBinaryPluginEnv } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * const schema = z.object({
 *   MY_PLUGIN_DEBUG: z.enum(["true", "false"]).default("false"),
 *   MY_PLUGIN_API_KEY: z.string().min(1),
 * });
 *
 * class MyPluginEnv extends ClaudeBinaryPluginEnv<z.infer<typeof schema>> {
 *   protected readonly prefix = "MY_PLUGIN";
 *   protected readonly schema = schema;
 *
 *   get debug(): boolean {
 *     return this.varsRequired.MY_PLUGIN_DEBUG === "true";
 *   }
 * }
 *
 * // SessionStart: load .env files
 * const env = await MyPluginEnv.forContext("sessionStart", { hookName: "init" });
 *
 * // Other hooks: load persisted state
 * const env = await MyPluginEnv.forContext("hook", { sessionId: event.session_id });
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @see {@link SessionRegistry} - SQLite registry for session lookups
 * @see {@link https://zod.dev | Zod Documentation} - Schema validation library
 * @module
 */

import { OTELConfig } from "../otel/classes/OTELConfig.js";
import type { EnvValidationErrorResult } from "../otel/classes/TelemetryEmitter.js";
import { TelemetryEmitter } from "../otel/classes/TelemetryEmitter.js";
import { DebugLogger } from "../utils/debug-logger.js";

/**
 * Zod issue type for error formatting.
 * Minimal interface matching what we need from ZodError.issues.
 * Uses PropertyKey[] for path to be compatible with Zod v4.
 * @public
 */
export interface ZodIssueMinimal {
	path: PropertyKey[];
	message: string;
	code: string;
	// Optional: values for enum errors (Zod v4 uses "invalid_value")
	values?: unknown[];
	// Optional: expected type for invalid_type errors
	expected?: string;
	// Optional: received value/type for debugging
	received?: unknown;
}

/**
 * Zod error type for validation results.
 * Minimal interface matching what we need from ZodError.
 * @public
 */
export interface ZodErrorMinimal {
	issues: ZodIssueMinimal[];
}

/**
 * Result of validation with context.
 * Either success with validated data, or failure with formatted error message.
 * @public
 */
export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; error: ZodErrorMinimal; message: string };

/**
 * Format a received value for display in error messages.
 * Handles undefined, null, objects, and truncates long strings.
 */
function formatReceivedValue(received: unknown): string {
	if (received === undefined) return "undefined";
	if (received === null) return "null";
	if (typeof received === "string") {
		// Truncate long strings
		const maxLen = 50;
		if (received.length > maxLen) {
			return `"${received.slice(0, maxLen)}..." (${received.length} chars)`;
		}
		return `"${received}"`;
	}
	if (typeof received === "number" || typeof received === "boolean") {
		return String(received);
	}
	if (Array.isArray(received)) {
		return `Array(${received.length})`;
	}
	if (typeof received === "object") {
		return `Object(${Object.keys(received).length} keys)`;
	}
	return String(received);
}

/**
 * Format a Zod validation error for LLM consumption.
 *
 * @param error - The Zod error to format
 * @param maxErrors - Maximum number of errors to show (default 10)
 * @returns Formatted markdown string
 *
 * @example Output:
 * ```markdown
 * ## Validation Errors
 *
 * - **MY_VAR**: Invalid enum value. Expected 'true' | 'false', received: undefined
 * ```
 * @public
 */
export function formatZodError(error: ZodErrorMinimal, maxErrors = 10): string {
	const issues = error.issues.slice(0, maxErrors);
	const lines = ["## Validation Errors", ""];

	for (const issue of issues) {
		// Convert PropertyKey[] to string (symbols are converted via String())
		const path = issue.path.map((p) => String(p)).join(".");
		let message = `**${path || "(root)"}**: ${issue.message}`;

		// Add expected values for enum/option errors (Zod v4 uses "invalid_value" for enums)
		if (issue.code === "invalid_value" && issue.values && Array.isArray(issue.values) && issue.values.length > 0) {
			message += ` (expected: ${issue.values.join(", ")})`;
		}

		// Add expected type for type errors
		if (issue.code === "invalid_type" && issue.expected) {
			message += ` (expected: ${issue.expected})`;
		}

		// Add received value for debugging - this is the key improvement
		if ("received" in issue && issue.received !== undefined) {
			message += `, received: ${formatReceivedValue(issue.received)}`;
		}

		lines.push(`- ${message}`);
	}

	if (error.issues.length > maxErrors) {
		lines.push(`- ... and ${error.issues.length - maxErrors} more errors`);
	}

	return lines.join("\n");
}

/**
 * Escape a string value for safe use in bash double-quoted strings.
 *
 * @remarks
 * In bash double quotes, these characters have special meaning and must be escaped:
 * - `"` (double quote) - terminates the string
 * - backtick - command substitution
 * - `$` (dollar sign) - variable expansion
 * - `\` (backslash) - escape character (only when followed by special chars)
 *
 * @param value - The string to escape
 * @returns The escaped string safe for bash double quotes
 *
 * @example
 * ```typescript
 * escapeForBashDoubleQuotes('Hello "world"') // 'Hello \\"world\\"'
 * escapeForBashDoubleQuotes('Run `cmd`') // 'Run \\`cmd\\`'
 * escapeForBashDoubleQuotes('Cost: $50') // 'Cost: \\$50'
 * ```
 * @public
 */
export function escapeForBashDoubleQuotes(value: string): string {
	return value
		.replace(/\\/g, "\\\\") // Escape backslashes first
		.replace(/"/g, '\\"') // Escape double quotes
		.replace(/`/g, "\\`") // Escape backticks (command substitution)
		.replace(/\$/g, "\\$"); // Escape dollar signs (variable expansion)
}

/**
 * Context types for environment loading strategies.
 * Each context defines how environment variables are loaded.
 * @public
 */
export type EnvContext = "sessionStart" | "hook" | "command";

/**
 * Configuration for a command context.
 * Defines the command name and optional argument schema.
 * @public
 */
export interface CommandConfig<TArgs = Record<string, unknown>> {
	/** Command name (e.g., "lint", "test") */
	name: string;
	/** Optional Zod schema for validating command arguments */
	argsSchema?: ZodSchema<TArgs>;
}

/**
 * Base class for plugin environment variable management.
 *
 * @remarks
 * This class provides universal infrastructure for loading, validating, and accessing
 * environment variables in Claude Code plugins. Plugins should extend this class and:
 *
 * 1. Define a schema using Zod for type-safe validation (optional - requires zod as peer dependency)
 * 2. Add typed getters for specific environment variables
 * 3. Define context configurations using static properties
 *
 * The new context-based system eliminates the need for custom forCommand/forSessionStart methods.
 * Instead, plugins define their contexts declaratively and use the universal static factory methods.
 *
 * @example Basic usage with SessionStart hook
 * ```typescript
 * import { z } from "zod";
 * import { ClaudeBinaryPluginEnv } from "claude-binary-plugin";
 *
 * const myPluginEnvSchema = z.object({
 *   MY_PLUGIN_ENABLED: z.enum(["true", "false"]),
 *   MY_PLUGIN_API_KEY: z.string().min(1),
 * });
 *
 * type MyPluginEnvVars = z.infer<typeof myPluginEnvSchema>;
 *
 * class MyPluginEnv extends ClaudeBinaryPluginEnv<MyPluginEnvVars> {
 *   protected readonly prefix = "MY_PLUGIN";
 *   protected schema = myPluginEnvSchema;
 *
 *   // Typed getters
 *   get enabled(): boolean {
 *     return this.get("MY_PLUGIN_ENABLED") === "true";
 *   }
 *
 *   get apiKey(): string {
 *     return this.require("MY_PLUGIN_API_KEY");
 *   }
 * }
 *
 * // In SessionStart hook - loads user .env files
 * const env = await MyPluginEnv.forContext("sessionStart", { hookName: "my-hook" });
 *
 * // In other hooks - loads from session env file
 * const env = await MyPluginEnv.forContext("hook", { sessionId: event.session_id });
 *
 * // In commands - parses --vars argument
 * const { env, args } = await MyPluginEnv.forContext("command", {
 *   args: process.argv.slice(2),
 *   commandName: "lint"
 * });
 * ```
 *
 * @example Advanced usage with command argument validation
 * ```typescript
 * import { z } from "zod";
 *
 * const lintArgsSchema = z.object({
 *   path: z.string().default("."),
 *   fix: z.boolean().default(true),
 * });
 *
 * class MyPluginEnv extends ClaudeBinaryPluginEnv<MyPluginEnvVars> {
 *   protected readonly prefix = "MY_PLUGIN";
 *   protected schema = myPluginEnvSchema;
 *
 *   // Define command configurations (optional)
 *   static readonly commands = {
 *     lint: { name: "lint", argsSchema: lintArgsSchema },
 *     test: { name: "test" }, // no arg validation
 *   } as const;
 * }
 *
 * // Command automatically validates args against schema
 * const { env, args } = await MyPluginEnv.forContext("command", {
 *   args: ["--path=src", "--fix"],
 *   commandName: "lint"
 * });
 * // args.path === "src", args.fix === true (validated & typed)
 * ```
 */

/**
 * Zod schema type - imported as type-only to avoid requiring zod as a dependency.
 * Plugins that want validation should install zod as a peer dependency.
 *
 * Supports both Zod v3 (shape as function) and Zod v4 (shape as object).
 * @public
 */
export interface ZodSchema<T = unknown> {
	parse(data: unknown): T;
	safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodErrorMinimal };
	_def?: {
		// Zod v3: shape is a function, Zod v4: shape is an object
		shape?: (() => Record<string, unknown>) | Record<string, unknown>;
	};
}

/**
 * File system operations interface for dependency injection.
 * @public
 */
export interface PluginEnvFileSystem {
	/** Read file contents as text */
	readFile: (path: string) => Promise<string | null>;
	/** Write content to a file */
	writeFile: (path: string, content: string) => Promise<void>;
	/** Check if a file exists */
	exists: (path: string) => Promise<boolean>;
	/** Create directory (and parents if needed) */
	mkdir: (path: string) => Promise<void>;
	/** Make file executable */
	chmod: (path: string, mode: string) => Promise<void>;
}

/**
 * Default file system implementation using Bun APIs.
 */
export const defaultPluginEnvFileSystem: PluginEnvFileSystem = {
	readFile: async (path) => {
		try {
			const file = Bun.file(path);
			return (await file.exists()) ? file.text() : null;
		} catch {
			return null;
		}
	},
	writeFile: async (path, content) => {
		await Bun.write(path, content);
	},
	exists: async (path) => {
		try {
			return await Bun.file(path).exists();
		} catch {
			return false;
		}
	},
	mkdir: async (path) => {
		await Bun.$`mkdir -p ${path}`.quiet().nothrow();
	},
	chmod: async (path, mode) => {
		await Bun.$`chmod ${mode} ${path}`.quiet().nothrow();
	},
};

/**
 * Parameters for SessionStart context
 * @public
 */
export interface SessionStartContextParams {
	/** Hook name for logging (e.g., "workflow-context") */
	hookName?: string;
	/** Session ID from the hook event */
	sessionId?: string;
	/** Project root directory (defaults to CLAUDE_PROJECT_DIR) */
	projectRoot?: string;
	/** File system implementation (defaults to real file system) */
	fs?: PluginEnvFileSystem;
	/** Starter env vars provided by base class (pluginRoot, projectDir, envFilePath) */
	starter?: Record<string, string>;
}

/**
 * Parameters for Hook context
 * @public
 */
export interface HookContextParams {
	/** Session ID from the hook event */
	sessionId: string;
	/** Session env directory path derived from transcript_path */
	sessionEnvDir?: string;
	/** Hook name for logging (optional) */
	hookName?: string;
	/** File system implementation (defaults to real file system) */
	fs?: PluginEnvFileSystem;
}

/**
 * Parameters for Command context
 * @public
 */
export interface CommandContextParams {
	/** Raw command line arguments (typically process.argv.slice(2)) */
	args: string[];
	/** Command name for logging (e.g., "lint", "test") */
	commandName?: string;
	/** File system implementation (defaults to real file system) */
	fs?: PluginEnvFileSystem;
}

/**
 * Result from forContext when context is "command"
 * @public
 */
export interface CommandContextResult<TEnv, TArgs = Record<string, unknown>> {
	/** Loaded environment instance */
	env: TEnv;
	/** Remaining arguments after removing --vars */
	remainingArgs: string[];
	/** Parsed and validated arguments (if command has argsSchema) */
	args?: TArgs;
}

/**
 * Result object returned from persisting environment variables.
 *
 * @remarks
 * Contains information about whether persistence succeeded and diagnostic
 * details useful for debugging configuration issues.
 * @public
 */
export interface PersistResult {
	/** Whether the variables were successfully persisted to CLAUDE_ENV_FILE */
	persisted: boolean;
	/** Path to the env file if persistence succeeded */
	path?: string;
	/** Human-readable reason if persistence failed */
	reason?: string;
}

/**
 * Error thrown when the env vars file specified by --vars cannot be loaded.
 * @error
 * @public
 */
export class EnvFileLoadError extends Error {
	readonly exitCode = 2;
	readonly filePath: string;

	constructor(filePath: string, reason: string) {
		super(`Failed to load env vars from "${filePath}": ${reason}`);
		this.name = "EnvFileLoadError";
		this.filePath = filePath;
	}
}

/**
 * Base class for plugin environment variable management.
 *
 * @remarks
 * This abstract class provides the infrastructure for loading, validating, and
 * persisting environment variables in Claude Code plugins. Plugins extend this
 * class and provide:
 *
 * - A `prefix` property for namespacing variables (e.g., `"MY_PLUGIN"`)
 * - A `schema` property for Zod validation (optional)
 * - Typed getter properties for accessing validated values
 * - A `setupForSession()` method for SessionStart detection logic
 *
 * The class handles three contexts via the static `forContext()` method:
 *
 * | Context | When | Loading Strategy |
 * |---------|------|------------------|
 * | `sessionStart` | SessionStart hook | Loads `.env` files from project root |
 * | `hook` | Other hooks | Loads from session-env directory |
 * | `command` | CLI commands | Parses `--vars=path` argument |
 *
 * State persistence uses Claude Code's `CLAUDE_ENV_FILE` mechanism with
 * {@link SessionRegistry} providing SQLite-based session lookups.
 *
 * @typeParam TSchema - TypeScript interface defining the environment variable schema
 *
 * @see `forContext()` - Context-aware factory method (has overloads)
 * @see {@link ClaudeBinaryPluginEnv.initializeSession | initializeSession()} - Session initialization
 * @see {@link SessionRegistry} - SQLite session lookup
 * @public
 */
export abstract class ClaudeBinaryPluginEnv<TSchema = Record<string, string>> {
	/**
	 * Environment variable prefix for this plugin (e.g., "MY_PLUGIN").
	 * Subclasses must override this to define their namespace.
	 * Used for generating prefixed env vars like `PREFIX_PROJECT_DIR`.
	 */
	protected abstract readonly prefix: string;

	/**
	 * Gets the environment variable prefix for this plugin.
	 *
	 * @returns The prefix string (e.g., "MY_PLUGIN")
	 */
	getPrefix(): string {
		return this.prefix;
	}

	/**
	 * Optional Zod schema for validating environment variables.
	 * Subclasses should override this to provide type-safe validation.
	 */
	protected schema?: ZodSchema<TSchema>;

	/**
	 * Internal storage for validated environment variables.
	 * Populated by factory methods after loading and validating.
	 */
	private _vars: TSchema | null = null;

	/**
	 * Debug logger instance for this env.
	 * Initialized by initLogger() which is called from forContext().
	 */
	private _logger: DebugLogger | null = null;

	/**
	 * Plugin name for logging (e.g., "workflow", "bun-plugin-builder").
	 * Subclasses should override this to provide their plugin name.
	 * Used for log filenames: `{pluginName}-debug.log`
	 */
	protected readonly pluginName: string = "";

	/**
	 * Initialize the debug logger with context.
	 * Called by forContext() after instance creation.
	 *
	 * @param hookName - Name of the current hook (for log prefix)
	 * @param sessionId - Session ID for log file path
	 */
	protected initLogger(hookName: string, sessionId?: string): void {
		this._logger = DebugLogger.create(hookName, {
			pluginName: this.pluginName || undefined,
			sessionId,
		});
	}

	/**
	 * Log a message at INFO level.
	 * No-op if logger not initialized.
	 */
	log(message: string, ...args: unknown[]): void {
		this._logger?.info(message, ...args);
	}

	/**
	 * Log a message at INFO level (alias for log).
	 * No-op if logger not initialized.
	 */
	info(message: string, ...args: unknown[]): void {
		this._logger?.info(message, ...args);
	}

	/**
	 * Log a message at DEBUG level.
	 * No-op if logger not initialized.
	 */
	debug(message: string, ...args: unknown[]): void {
		this._logger?.debug(message, ...args);
	}

	/**
	 * Gets the validated environment variables.
	 * Returns null if variables haven't been loaded yet.
	 *
	 * @returns The validated schema object or null
	 */
	get vars(): TSchema | null {
		return this._vars;
	}

	/**
	 * Gets the validated environment variables, throwing if not loaded.
	 *
	 * @returns The validated schema object
	 * @throws Error if variables haven't been loaded
	 */
	get varsRequired(): TSchema {
		if (this._vars === null) {
			throw new Error(
				"Environment variables not loaded. Use forContext() or initializeSession() to load variables first.",
			);
		}
		return this._vars;
	}

	/**
	 * Loads and validates environment variables from Bun.env.
	 * Called internally by factory methods after loading env file content.
	 *
	 * @returns The validated schema object, or null if no schema defined
	 */
	protected loadVarsFromEnv(): TSchema | null {
		if (!this.schema) {
			return null;
		}

		// Collect all env vars that match the schema keys
		const envVars: Record<string, unknown> = {};
		if (this.schema._def && "shape" in this.schema._def && this.schema._def.shape) {
			// Zod v3: shape is a function, Zod v4: shape is an object
			const shapeOrFn = this.schema._def.shape;
			const shape =
				typeof shapeOrFn === "function"
					? (shapeOrFn() as Record<string, unknown>)
					: (shapeOrFn as Record<string, unknown>);
			for (const key of Object.keys(shape)) {
				envVars[key] = Bun.env[key];
			}
		}

		this._vars = this.schema.parse(envVars);
		return this._vars;
	}

	/**
	 * Sets the internal vars directly from a pre-validated object.
	 * Used by initializeSession after setupForSession returns typed values.
	 *
	 * @param vars - The validated environment variables
	 */
	protected setVars(vars: TSchema): void {
		this._vars = vars;
	}

	/**
	 * Optional command configurations.
	 * Subclasses can define command names and their argument schemas.
	 *
	 * @example
	 * ```typescript
	 * static readonly commands = {
	 *   lint: { name: "lint", argsSchema: lintArgsSchema },
	 *   test: { name: "test" },
	 * } as const;
	 * ```
	 */
	static readonly commands?: Record<string, CommandConfig>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Static factory for dynamic subclass creation
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Creates a concrete `ClaudeBinaryPluginEnv` subclass from configuration.
	 *
	 * @remarks
	 * This factory method creates a runtime subclass of `ClaudeBinaryPluginEnv`
	 * with the specified prefix, schema, and plugin name. It's primarily used
	 * by the build system to generate plugin entrypoints that don't require
	 * manually defining an env class.
	 *
	 * The returned class has a `validated` getter that provides typed access
	 * to the validated environment variables.
	 *
	 * @typeParam T - The type of validated environment variables (inferred from schema)
	 *
	 * @param prefix - Environment variable prefix (e.g., `"MY_PLUGIN"`)
	 * @param schema - Zod schema for validating environment variables
	 * @param pluginName - Optional plugin name for logging (e.g., `"my-plugin"`)
	 * @returns A constructor for the configured env class
	 *
	 * @example
	 * ```typescript
	 * import { ClaudeBinaryPluginEnv } from "claude-binary-plugin";
	 * import { z } from "zod";
	 *
	 * const schema = z.object({
	 *   MY_PLUGIN_DEBUG: z.enum(["true", "false"]).default("false"),
	 * });
	 *
	 * const MyEnvClass = ClaudeBinaryPluginEnv.create("MY_PLUGIN", schema, "my-plugin");
	 *
	 * // Use in hook context
	 * const env = await MyEnvClass.forContext("sessionStart", { hookName: "init" });
	 * console.log(env.validated.MY_PLUGIN_DEBUG); // "false" (typed!)
	 * ```
	 *
	 * @see `forContext()` - Loading environment by context
	 * @public
	 */
	static create<T>(
		prefix: string,
		schema: ZodSchema<T>,
		pluginName?: string,
	): new () => ClaudeBinaryPluginEnv<T> & { validated: T } {
		return class extends ClaudeBinaryPluginEnv<T> {
			protected readonly prefix = prefix;
			protected override readonly pluginName = pluginName ?? "";
			protected override schema = schema;

			get validated(): T {
				return this.vars as T;
			}
		} as new () => ClaudeBinaryPluginEnv<T> & { validated: T };
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Universal context-based factory method
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Universal factory method for creating environment instances based on context.
	 *
	 * @remarks
	 * This method handles environment loading for different contexts:
	 * - "sessionStart": Loads user .env files (for SessionStart hook)
	 * - "hook": Loads from session env file (for other hooks)
	 * - "command": Parses --vars argument and loads from file (for CLI commands)
	 *
	 * TypeScript overloads ensure type-safe return values based on context:
	 * - sessionStart/hook contexts return the env instance directly
	 * - command context returns `{ env, remainingArgs, args? }`
	 *
	 * @example SessionStart hook
	 * ```typescript
	 * const env = await MyPluginEnv.forContext("sessionStart", { hookName: "my-hook" });
	 * ```
	 *
	 * @example Other hooks
	 * ```typescript
	 * const env = await MyPluginEnv.forContext("hook", { sessionId: event.session_id });
	 * ```
	 *
	 * @example Commands
	 * ```typescript
	 * const { env, remainingArgs } = await MyPluginEnv.forContext("command", {
	 *   args: process.argv.slice(2),
	 *   commandName: "lint"
	 * });
	 * ```
	 */
	static async forContext<T extends ClaudeBinaryPluginEnv>(
		this: new () => T,
		context: "sessionStart",
		params: SessionStartContextParams,
	): Promise<T>;
	static async forContext<T extends ClaudeBinaryPluginEnv>(
		this: new () => T,
		context: "hook",
		params: HookContextParams,
	): Promise<T>;
	static async forContext<T extends ClaudeBinaryPluginEnv, TArgs = Record<string, unknown>>(
		this: new () => T,
		context: "command",
		params: CommandContextParams,
	): Promise<CommandContextResult<T, TArgs>>;
	static async forContext<T extends ClaudeBinaryPluginEnv, TArgs = Record<string, unknown>>(
		this: new () => T,
		context: EnvContext,
		params: SessionStartContextParams | HookContextParams | CommandContextParams,
	): Promise<T | CommandContextResult<T, TArgs>> {
		switch (context) {
			case "sessionStart": {
				const p = params as SessionStartContextParams;
				const projectRoot = p.projectRoot || Bun.env.CLAUDE_PROJECT_DIR;
				if (projectRoot) {
					await ClaudeBinaryPluginEnv.loadUserEnvFiles(projectRoot, p.fs);
				}
				// biome-ignore lint/complexity/noThisInStatic: this is a static method on a class
				const instance = new this();
				instance.loadVarsFromEnv();
				// Initialize logger for SessionStart context
				if (p.hookName) {
					instance.initLogger(p.hookName, p.sessionId);
				}
				return instance;
			}

			case "hook": {
				const p = params as HookContextParams;
				// biome-ignore lint/complexity/noThisInStatic: this is a static method on a class
				const instance = new this();

				// Load env vars from session-env directory
				// Claude Code does NOT source hook files, so we must load them manually
				if (p.sessionEnvDir) {
					await ClaudeBinaryPluginEnv.loadAllHookFiles(p.sessionEnvDir, p.fs);
				} else {
					// Fallback to prefixed env file check (won't work in practice, but keep for API compat)
					await ClaudeBinaryPluginEnv.loadFromSessionEnvFile(instance.prefix, p.fs);
				}

				instance.loadVarsFromEnv();

				// Validate environment and throw if invalid (with OTEL emission)
				// This ensures all hooks have valid env before business logic runs
				if (instance.schema && p.hookName) {
					instance.validateOrThrow(p.sessionId, p.hookName);
				}

				// Initialize logger for hook context
				if (p.hookName) {
					instance.initLogger(p.hookName, p.sessionId);
				}

				return instance;
			}

			case "command": {
				const p = params as CommandContextParams;
				const remainingArgs: string[] = [];
				let varsPath: string | undefined;

				// Parse --vars argument
				for (const arg of p.args) {
					if (arg.startsWith("--vars=")) {
						varsPath = arg.slice("--vars=".length);
					} else {
						remainingArgs.push(arg);
					}
				}

				// Load from --vars file if provided
				if (varsPath) {
					const fs = p.fs || defaultPluginEnvFileSystem;
					if (!(await fs.exists(varsPath))) {
						throw new EnvFileLoadError(varsPath, "file not found");
					}
					// Read and parse the file content
					const content = await fs.readFile(varsPath);
					if (content === null) {
						throw new EnvFileLoadError(varsPath, "failed to read file");
					}
					ClaudeBinaryPluginEnv.parseEnvFileContent(content);
				}

				// biome-ignore lint/complexity/noThisInStatic: this is a static method on a class
				const env = new this();
				env.loadVarsFromEnv();

				// Parse and validate command args if command config exists
				let parsedArgs: TArgs | undefined;
				if (p.commandName && (ClaudeBinaryPluginEnv as typeof ClaudeBinaryPluginEnv).commands) {
					const commandConfig = (ClaudeBinaryPluginEnv as typeof ClaudeBinaryPluginEnv).commands?.[p.commandName];
					if (commandConfig?.argsSchema) {
						// Convert args array to object for validation
						const argsObj: Record<string, unknown> = {};
						for (const arg of remainingArgs) {
							if (arg.startsWith("--")) {
								const eqIndex = arg.indexOf("=");
								if (eqIndex > 0) {
									const key = arg.slice(2, eqIndex);
									const value = arg.slice(eqIndex + 1);
									argsObj[key] = value;
								} else {
									const key = arg.slice(2);
									argsObj[key] = true;
								}
							}
						}
						parsedArgs = commandConfig.argsSchema.parse(argsObj) as TArgs;
					}
				}

				// Initialize logger for command context
				if (p.commandName) {
					env.initLogger(p.commandName);
				}

				return { env, remainingArgs, args: parsedArgs } as CommandContextResult<T, TArgs>;
			}

			default:
				throw new Error(`Unknown context: ${context}`);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Static methods for loading environment variables
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Parses env file content and sets variables in Bun.env.
	 * Supports VAR=value, export VAR=value, and quoted values including
	 * double-quoted values with escaped quotes (e.g., JSON strings).
	 *
	 * @param content - Content of the env file
	 */
	static parseEnvFileContent(content: string): void {
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			// Match: [export] NAME=
			const nameMatch = trimmed.match(/^(?:export\s+)?(\w+)=/);
			if (!nameMatch) continue;

			const name = nameMatch[1];
			const rest = trimmed.slice(nameMatch[0].length);

			let value: string;
			if (rest.startsWith('"')) {
				// Double-quoted: handle escaped quotes (\")
				// Find the closing unescaped quote
				let end = 1;
				while (end < rest.length) {
					if (rest[end] === '"' && rest[end - 1] !== "\\") {
						break;
					}
					end++;
				}
				// Extract value and unescape \" to "
				value = rest.slice(1, end).replace(/\\"/g, '"');
			} else if (rest.startsWith("'")) {
				// Single-quoted: no escapes, find closing quote
				const endQuote = rest.indexOf("'", 1);
				value = endQuote > 0 ? rest.slice(1, endQuote) : rest.slice(1);
			} else {
				// Unquoted: take everything
				value = rest;
			}

			if (name !== undefined && Bun.env[name] === undefined) {
				Bun.env[name] = value;
				process.env[name] = value;
			}
		}
	}

	/**
	 * Loads environment variables from the session env file.
	 *
	 * @remarks
	 * This method loads env vars from the file specified by `{PREFIX}_SESSION_ENV_FILE`.
	 * This variable is set during SessionStart and sourced by Claude Code before running hooks,
	 * so it's already available in Bun.env.
	 *
	 * This approach is deterministic - we don't need to derive paths from transcript_path.
	 * The file path is persisted and available via the prefixed env var.
	 *
	 * @param prefix - The plugin's env var prefix (e.g., "SAVVY_WORKFLOW")
	 * @param fs - File system implementation (defaults to real file system)
	 * @returns Promise that resolves when loading is complete
	 */
	static async loadFromSessionEnvFile(
		prefix: string,
		fs: PluginEnvFileSystem = defaultPluginEnvFileSystem,
	): Promise<void> {
		const envFileVar = `${prefix}_SESSION_ENV_FILE`;
		const envFilePath = Bun.env[envFileVar];

		if (!envFilePath) {
			// No session env file set - this is a fresh session or SessionStart hasn't run yet
			return;
		}

		const content = await fs.readFile(envFilePath);
		if (content !== null && content.trim().length > 0) {
			ClaudeBinaryPluginEnv.parseEnvFileContent(content);
		}
	}

	/**
	 * Loads environment variables from ALL hook-*.sh files in a session-env directory.
	 *
	 * @remarks
	 * Claude Code does NOT source hook files before running subsequent hooks, so env vars
	 * persisted during SessionStart are not available in Bun.env. This method reads all
	 * hook files directly from the session-env directory and parses them.
	 *
	 * The session-env directory path must be derived from transcript_path using
	 * `deriveSessionEnvDir()`.
	 *
	 * @param sessionEnvDir - Path to session-env directory (e.g., `~/.claude/session-env/transcript_id/`)
	 * @param fs - File system implementation (defaults to real file system)
	 * @returns Promise with count of files loaded
	 */
	static async loadAllHookFiles(
		sessionEnvDir: string,
		fs: PluginEnvFileSystem = defaultPluginEnvFileSystem,
	): Promise<number> {
		// List all hook-*.sh files in the directory
		// The ls command will fail if directory doesn't exist, so we don't need to check separately
		// (Bun.file().exists() doesn't work for directories)
		const result = await Bun.$`ls -1 ${sessionEnvDir}/hook-*.sh 2>/dev/null`.quiet().nothrow();
		if (result.exitCode !== 0) {
			return 0;
		}

		const files = result.stdout
			.toString()
			.trim()
			.split("\n")
			.filter((f) => f.length > 0);

		let loadedCount = 0;
		for (const filePath of files) {
			const content = await fs.readFile(filePath);
			if (content !== null && content.trim().length > 0) {
				ClaudeBinaryPluginEnv.parseEnvFileContent(content);
				loadedCount++;
			}
		}

		return loadedCount;
	}

	/**
	 * Gets the session-env directory for a session ID.
	 *
	 * @remarks
	 * Looks up the session in the SQLite registry (created during SessionStart).
	 * The session-env directory contains hook output files like `hook-0.sh`.
	 *
	 * @param sessionId - Session ID from the hook event
	 * @returns Path to session-env directory, or undefined if not found
	 *
	 * @example
	 * ```typescript
	 * const sessionEnvDir = ClaudeBinaryPluginEnv.getSessionEnvDir(event.session_id);
	 * // "/Users/user/.claude/session-env/abc-123-def"
	 * ```
	 */
	static getSessionEnvDir(sessionId: string | undefined): string | undefined {
		// Import inline to avoid circular dependency at module load time
		const { SessionRegistry } = require("./session-registry.js") as typeof import("./session-registry.js");
		return SessionRegistry.getBySessionId(sessionId);
	}

	/**
	 * Registers a session in the SQLite registry.
	 *
	 * @remarks
	 * Called during SessionStart to record all session mappings in one call.
	 * This is a single-call replacement for the legacy save methods.
	 *
	 * @param sessionId - Session ID from the hook event
	 * @param projectDir - Absolute path to the project directory
	 * @param sessionEnvDir - Absolute path to the session-env directory
	 */
	static registerSession(sessionId: string, projectDir: string, sessionEnvDir: string): void {
		// Import inline to avoid circular dependency at module load time
		const { SessionRegistry } = require("./session-registry.js") as typeof import("./session-registry.js");
		SessionRegistry.register({ sessionId, projectDir, sessionEnvDir });
	}

	/**
	 * Gets the session-env directory for a project directory.
	 *
	 * @remarks
	 * Looks up the most recent session for the project in the SQLite registry.
	 * This is the primary lookup method for commands that don't have CLAUDE_SESSION_ID.
	 *
	 * @param projectDir - Absolute path to the project directory
	 * @returns Path to session-env directory, or undefined if not found
	 */
	static getProjectSessionEnvDir(projectDir: string): string | undefined {
		// Import inline to avoid circular dependency at module load time
		const { SessionRegistry } = require("./session-registry.js") as typeof import("./session-registry.js");
		return SessionRegistry.getByProjectDir(projectDir);
	}

	/**
	 * Loads environment variables from a file path using bash to source the file.
	 *
	 * @param filePath - Path to the env file
	 * @returns Promise that resolves when loading is complete
	 * @throws EnvFileLoadError if file exists but cannot be sourced
	 */
	static async loadFromFile(filePath: string): Promise<void> {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			return;
		}

		// Execute the env file using bash and capture the variables
		const result = await Bun.$`bash -c 'source "${filePath}" && env'`.quiet().nothrow();

		if (result.exitCode !== 0) {
			throw new EnvFileLoadError(filePath, `bash source failed with exit code ${result.exitCode}`);
		}

		const output = result.stdout.toString();
		for (const line of output.split("\n")) {
			const eqIndex = line.indexOf("=");
			if (eqIndex > 0) {
				const name = line.substring(0, eqIndex);
				const value = line.substring(eqIndex + 1);
				if (name && process.env[name] === undefined) {
					process.env[name] = value;
					Bun.env[name] = value;
				}
			}
		}
	}

	/**
	 * Loads user .env files in dotenv-compatible order.
	 *
	 * @param projectRoot - Project root directory (defaults to CLAUDE_PROJECT_DIR)
	 * @param fs - File system implementation
	 * @returns Array of loaded file names
	 * @throws EnvFileLoadError if a file exists but cannot be read
	 */
	static async loadUserEnvFiles(
		projectRoot?: string,
		fs: PluginEnvFileSystem = defaultPluginEnvFileSystem,
	): Promise<string[]> {
		// Get project directory
		const root = projectRoot || Bun.env.CLAUDE_PROJECT_DIR;
		if (!root) {
			return [];
		}

		const nodeEnv = Bun.env.NODE_ENV || "development";
		const loadedFiles: string[] = [];
		const filesToLoad = [".env", `.env.${nodeEnv}`, ".env.local"];

		for (const fileName of filesToLoad) {
			const filePath = `${root}/${fileName}`;
			if (await fs.exists(filePath)) {
				const content = await fs.readFile(filePath);
				if (content === null) {
					throw new EnvFileLoadError(filePath, "file exists but could not be read");
				}
				ClaudeBinaryPluginEnv.parseEnvFileContent(content);
				loadedFiles.push(fileName);
			}
		}

		return loadedFiles;
	}

	/**
	 * Persists environment variables to the shared session env file (hook-0.sh).
	 *
	 * @remarks
	 * This method writes environment variables to CLAUDE_ENV_FILE, which Claude Code
	 * provides in SessionStart hooks. Claude Code:
	 * 1. Creates the session-env directory structure
	 * 2. Sources the file before Bash commands
	 * 3. Makes variables available to subsequent hooks via Bun.env
	 *
	 * The file is written in shell-compatible format (export VAR="value") and made
	 * executable for bash to source.
	 *
	 * @param _sessionId - Unused (kept for API compatibility). CLAUDE_ENV_FILE is used directly.
	 * @param vars - Environment variables to persist (name to value mapping)
	 * @param fs - File system implementation (defaults to real file system)
	 * @returns Object indicating success/failure with path or reason
	 *
	 * @example
	 * ```typescript
	 * const vars = {
	 *   MY_PLUGIN_ENABLED: "true",
	 *   MY_PLUGIN_API_KEY: apiKey,
	 * };
	 * const result = await ClaudeBinaryPluginEnv.persistVars(sessionId, vars);
	 * if (result.persisted) {
	 *   console.log(`Persisted to: ${result.path}`);
	 * }
	 * ```
	 */
	static async persistVars(
		_sessionId: string,
		vars: Record<string, string>,
		fs: PluginEnvFileSystem = defaultPluginEnvFileSystem,
	): Promise<PersistResult> {
		// Use CLAUDE_ENV_FILE directly - Claude Code creates the directory and sources the file
		const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE;

		if (!claudeEnvFile) {
			return { persisted: false, reason: "CLAUDE_ENV_FILE not available (only set in SessionStart hooks)" };
		}

		// Write variables to the env file (Claude Code already created the directory)
		await ClaudeBinaryPluginEnv.writeToEnvFile(claudeEnvFile, vars, fs);

		// Make the file executable (required for bash to source it)
		await fs.chmod(claudeEnvFile, "+x");

		return { persisted: true, path: claudeEnvFile };
	}

	/**
	 * Writes variables to an env file in shell-compatible format.
	 *
	 * @remarks
	 * Format: Each line is `export VAR="value"` with double quotes around value.
	 * Double quotes within values are escaped with backslash.
	 *
	 * Variables are updated in-place if they already exist in the file.
	 * New variables are appended at the end.
	 *
	 * @param filePath - Absolute path to the env file
	 * @param vars - Record of variable names to values
	 * @param fs - File system implementation
	 */
	private static async writeToEnvFile(
		filePath: string,
		vars: Record<string, string>,
		fs: PluginEnvFileSystem = defaultPluginEnvFileSystem,
	): Promise<void> {
		// Set vars in current process
		for (const [name, value] of Object.entries(vars)) {
			Bun.env[name] = value;
			process.env[name] = value;
		}

		// Read existing content
		const existingContent = (await fs.readFile(filePath)) ?? "";

		// Parse existing lines and track which vars we've seen
		const existingLines = existingContent ? existingContent.split("\n") : [];
		const updatedLines: string[] = [];
		const varsToWrite = new Map(Object.entries(vars));

		// Update existing lines in-place
		for (const line of existingLines) {
			const trimmed = line.trim();
			// Match export VAR="value" or export VAR='value' or export VAR=value
			const match = trimmed.match(/^export\s+(\w+)=/);
			if (match) {
				const varName = match[1];
				const newValue = varName !== undefined ? varsToWrite.get(varName) : undefined;
				if (varName !== undefined && newValue !== undefined) {
					// Replace this line with new value
					updatedLines.push(`export ${varName}="${escapeForBashDoubleQuotes(newValue)}"`);
					varsToWrite.delete(varName);
					continue;
				}
			}
			// Keep the line as-is (including empty lines and comments)
			updatedLines.push(line);
		}

		// Append any new vars that weren't in the file
		for (const [name, value] of varsToWrite) {
			updatedLines.push(`export ${name}="${escapeForBashDoubleQuotes(value)}"`);
		}

		// Remove trailing empty lines and add single newline at end
		while (updatedLines.length > 0 && updatedLines[updatedLines.length - 1]?.trim() === "") {
			updatedLines.pop();
		}

		const newContent = `${updatedLines.join("\n")}\n`;
		await fs.writeFile(filePath, newContent);
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Static helper methods for plugins
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Initialize session environment by detecting and persisting variables.
	 *
	 * @remarks
	 * This is a universal template method for session initialization. It:
	 * 1. Creates a plugin env instance
	 * 2. Calls the subclass's setupForSession() method to get variables
	 * 3. Persists those variables using ClaudeBinaryPluginEnv.persistVars()
	 * 4. Returns the initialized environment and persistence result
	 *
	 * Subclasses implement `setupForSession()` to define their detection logic.
	 * The base class handles all persistence infrastructure.
	 *
	 * @param params - Session start context parameters
	 * @returns Object with initialized env instance and persistence result
	 *
	 * @example
	 * ```typescript
	 * // In SessionStart hook
	 * const { env, persisted } = await MyPluginEnv.initializeSession({
	 *   hookName: event.name
	 * });
	 *
	 * if (persisted.persisted) {
	 *   console.log(`Persisted ${Object.keys(vars).length} vars to ${persisted.path}`);
	 * }
	 * ```
	 */
	static async initializeSession<T extends ClaudeBinaryPluginEnv>(
		this: new () => T,
		params: SessionStartContextParams,
	): Promise<{ env: T; persisted: PersistResult }> {
		// biome-ignore lint/complexity/noThisInStatic: this is a static method on a class
		const instance = new this();

		// Pass sessionId to logger so log files go to the correct session directory
		const log = DebugLogger.create(params.hookName || "ClaudeBinaryPluginEnv", {
			sessionId: params.sessionId,
		});
		const fs = params.fs || defaultPluginEnvFileSystem;

		// Load user .env files first (same as forContext("sessionStart"))
		const projectRoot = params.projectRoot || Bun.env.CLAUDE_PROJECT_DIR;
		if (projectRoot) {
			await ClaudeBinaryPluginEnv.loadUserEnvFiles(projectRoot, fs);
		}

		// Get session ID from params (passed from event data) or fallback to environment
		const sessionId = params.sessionId || Bun.env.CLAUDE_SESSION_ID;
		if (!sessionId) {
			return {
				env: instance,
				persisted: {
					persisted: false,
					reason: "session_id not available (not in event data or CLAUDE_SESSION_ID env var)",
				},
			};
		}

		// Construct starter object with common env vars
		const pluginRoot = instance.getPluginRoot();
		const projectDir = projectRoot || instance.getProjectDir();

		// Use CLAUDE_ENV_FILE directly - Claude Code creates this and we persist to it
		// This path is stored with the plugin prefix (e.g., SAVVY_WORKFLOW_SESSION_ENV_FILE)
		const envFilePath = Bun.env.CLAUDE_ENV_FILE ?? "";

		const starter: Record<string, string> = {
			[`${instance.prefix}_PLUGIN_ROOT`]: pluginRoot,
			[`${instance.prefix}_PROJECT_DIR`]: projectDir,
			[`${instance.prefix}_SESSION_ENV_FILE`]: envFilePath,
		};

		// Call subclass's setup method with starter object
		const vars = (await instance.setupForSession?.({ ...params, starter })) ?? {};

		// Store vars internally if schema validation passes
		if (instance.schema) {
			try {
				const validated = instance.schema.parse(vars);
				instance.setVars(validated);
			} catch (e) {
				log.debug(`Schema validation failed: ${e}`);
				throw e;
			}
		}

		const persistResult = await ClaudeBinaryPluginEnv.persistVars(sessionId, vars, fs);
		log.debug(
			`persisted=${persistResult.persisted}, path=${persistResult.path ?? "(none)"}, reason=${persistResult.reason ?? "(none)"}`,
		);

		// Register session in SQLite registry so subsequent hooks/commands can find the correct directory
		// Extract session-env dir from CLAUDE_ENV_FILE (e.g., .../session-env/{uuid}/hook-0.sh -> .../session-env/{uuid})
		if (envFilePath && sessionId && projectDir) {
			const sessionEnvDir = envFilePath.replace(/\/hook-\d+\.sh$/, "");
			if (sessionEnvDir !== envFilePath) {
				ClaudeBinaryPluginEnv.registerSession(sessionId, projectDir, sessionEnvDir);
			}
		}

		return { env: instance, persisted: persistResult };
	}

	/**
	 * Template method for subclasses to implement session setup logic.
	 *
	 * @remarks
	 * Override this method in your plugin to define what environment variables
	 * should be detected and persisted during SessionStart. The base class will
	 * handle persistence automatically via `initializeSession()`.
	 *
	 * @param params - Session start context parameters
	 * @returns Record of environment variable names to values
	 *
	 * @example
	 * ```typescript
	 * class MyPluginEnv extends ClaudeBinaryPluginEnv<MyEnvVars> {
	 *   protected async setupForSession(params: SessionStartContextParams): Promise<Record<string, string>> {
	 *     // Detect environment
	 *     const apiKey = await detectApiKey();
	 *     const enabled = await checkIfEnabled();
	 *
	 *     // Return variables to persist
	 *     return {
	 *       MY_PLUGIN_API_KEY: apiKey,
	 *       MY_PLUGIN_ENABLED: enabled ? "true" : "false",
	 *     };
	 *   }
	 * }
	 * ```
	 */
	protected async setupForSession?(params: SessionStartContextParams): Promise<Record<string, string>>;

	// ─────────────────────────────────────────────────────────────────────────────
	// Prefix-based helper methods
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Gets the project directory from environment variables.
	 * Checks CLAUDE_PROJECT_DIR first, then falls back to `PREFIX_PROJECT_DIR`.
	 *
	 * @returns Project directory path
	 * @throws Error if neither env var is set
	 */
	getProjectDir(): string {
		const prefixedVar = `${this.prefix}_PROJECT_DIR`;
		const projectDir = Bun.env.CLAUDE_PROJECT_DIR || Bun.env[prefixedVar];
		if (!projectDir) {
			throw new Error(
				`Project directory not found. Neither CLAUDE_PROJECT_DIR nor ${prefixedVar} is set. ` +
					"Ensure you are running within a Claude Code session.",
			);
		}
		return projectDir;
	}

	/**
	 * Gets the plugin root directory from environment variables.
	 * Checks CLAUDE_PLUGIN_ROOT first, then falls back to `PREFIX_PLUGIN_ROOT`.
	 *
	 * @returns Plugin root directory path
	 * @throws Error if neither env var is set
	 */
	getPluginRoot(): string {
		const prefixedVar = `${this.prefix}_PLUGIN_ROOT`;
		const pluginRoot = Bun.env.CLAUDE_PLUGIN_ROOT || Bun.env[prefixedVar];
		if (!pluginRoot) {
			throw new Error(
				`Plugin root not found. Neither CLAUDE_PLUGIN_ROOT nor ${prefixedVar} is set. ` +
					"Ensure the plugin is properly installed.",
			);
		}
		return pluginRoot;
	}

	/**
	 * Lists all environment variable names with this plugin's prefix.
	 *
	 * @returns Array of environment variable names
	 */
	listPrefixedVarNames(): string[] {
		const prefix = `${this.prefix}_`;
		return Object.keys(Bun.env).filter((key) => key.startsWith(prefix));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Instance methods for accessing environment variables
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Gets an environment variable by name.
	 *
	 * @param name - The environment variable name
	 * @returns The value if found, undefined otherwise
	 */
	get(name: string): string | undefined {
		return Bun.env[name];
	}

	/**
	 * Gets a required environment variable, throwing if not found.
	 *
	 * @param name - The environment variable name
	 * @returns The environment variable value
	 * @throws Error if the variable is not found
	 */
	require(name: string): string {
		const value = Bun.env[name];
		if (value === undefined) {
			throw new Error(
				`Required environment variable "${name}" not found. Ensure the environment is properly initialized.`,
			);
		}
		return value;
	}

	/**
	 * Validates the current environment against the schema (if defined).
	 *
	 * @returns The validated schema object
	 * @throws ZodError if validation fails
	 */
	validate(): TSchema {
		if (!this.schema) {
			throw new Error("No schema defined for validation");
		}

		// Collect all env vars that match the schema keys
		const envVars: Record<string, unknown> = {};
		if (this.schema._def && "shape" in this.schema._def && this.schema._def.shape) {
			// Zod v3: shape is a function, Zod v4: shape is an object
			const shapeOrFn = this.schema._def.shape;
			const shape =
				typeof shapeOrFn === "function"
					? (shapeOrFn() as Record<string, unknown>)
					: (shapeOrFn as Record<string, unknown>);
			for (const key of Object.keys(shape)) {
				envVars[key] = Bun.env[key];
			}
		}

		return this.schema.parse(envVars);
	}

	/**
	 * Checks if the environment variables are valid according to the schema.
	 *
	 * @returns true if valid, false otherwise
	 */
	isValid(): boolean {
		if (!this.schema) {
			return true; // No schema means always valid
		}

		try {
			this.validate();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Validate environment with formatted error messages for LLM consumption.
	 *
	 * @remarks
	 * This method provides a safe validation that returns a result object
	 * instead of throwing. The error message is formatted as markdown
	 * suitable for display to users or LLMs.
	 *
	 * @returns Validation result with human-readable error messages
	 *
	 * @example
	 * ```typescript
	 * const result = env.validateWithContext();
	 * if (!result.success) {
	 *   console.log(result.message); // Formatted error for LLM
	 * }
	 * ```
	 */
	validateWithContext(): ValidationResult<TSchema> {
		if (!this.schema) {
			throw new Error("No schema defined for validation");
		}

		// Collect all env vars that match the schema keys
		const envVars: Record<string, unknown> = {};
		if (this.schema._def && "shape" in this.schema._def && this.schema._def.shape) {
			// Zod v3: shape is a function, Zod v4: shape is an object
			const shapeOrFn = this.schema._def.shape;
			const shape =
				typeof shapeOrFn === "function"
					? (shapeOrFn() as Record<string, unknown>)
					: (shapeOrFn as Record<string, unknown>);
			for (const key of Object.keys(shape)) {
				envVars[key] = Bun.env[key];
			}
		}

		// Use safeParse to avoid throwing
		const result = this.schema.safeParse(envVars);

		if (result.success) {
			return { success: true, data: result.data };
		}

		return {
			success: false,
			error: result.error,
			message: formatZodError(result.error),
		};
	}

	/**
	 * Validate environment and throw if invalid, emitting to OTEL.
	 *
	 * @remarks
	 * This is the strict validation method that should be called at the start of hooks
	 * that depend on environment variables being correctly configured. It:
	 * 1. Validates the environment against the schema
	 * 2. If invalid, emits an error event to OTEL (if enabled)
	 * 3. Throws an error with a formatted message
	 *
	 * @param sessionId - The session ID for OTEL attribution
	 * @param hookName - The hook name for OTEL attribution
	 * @throws Error if validation fails (after emitting to OTEL)
	 *
	 * @example
	 * ```typescript
	 * // At the start of a hook
	 * env.validateOrThrow(event.session_id, "my-hook");
	 * // If we get here, env is valid
	 * ```
	 */
	validateOrThrow(sessionId: string, hookName: string): void {
		const validation = this.validateWithContext();

		if (!validation.success) {
			// Emit to OTEL if enabled
			if (OTELConfig.isEnabled()) {
				const issues = validation.error.issues ?? [];
				const firstIssue = issues[0];
				// Convert PropertyKey[] to string for OTEL attribution
				const path = firstIssue?.path.map((p) => String(p)).join(".") ?? "unknown";
				const issueCount = issues.length;

				const result: EnvValidationErrorResult = {
					hookName,
					issueCount,
					validationPath: path,
					errorMessage: validation.message,
					envClassName: this.constructor.name,
				};

				TelemetryEmitter.emitEnvValidationError(sessionId, hookName, result);
			}

			// Throw with the formatted message
			throw new Error(`[${hookName}] Environment validation failed:\n${validation.message}`);
		}
	}

	/**
	 * Lists all environment variable names with a given prefix.
	 *
	 * @param prefix - The prefix to filter by
	 * @returns Array of environment variable names
	 */
	listVarNames(prefix: string): string[] {
		return Object.keys(Bun.env).filter((key) => key.startsWith(prefix));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Static utility methods
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Escape a string value for safe use in bash double-quoted strings.
	 *
	 * @remarks
	 * In bash double quotes, these characters have special meaning and must be escaped:
	 * - `"` (double quote) - terminates the string
	 * - backtick - command substitution
	 * - `$` (dollar sign) - variable expansion
	 * - `\` (backslash) - escape character (only when followed by special chars)
	 *
	 * @param value - The string to escape
	 * @returns The escaped string safe for bash double quotes
	 *
	 * @example
	 * ```typescript
	 * ClaudeBinaryPluginEnv.escapeForBash('Hello "world"') // 'Hello \\"world\\"'
	 * ClaudeBinaryPluginEnv.escapeForBash('Run `cmd`') // 'Run \\`cmd\\`'
	 * ClaudeBinaryPluginEnv.escapeForBash('Cost: $50') // 'Cost: \\$50'
	 * ```
	 * @public
	 */
	static escapeForBash(value: string): string {
		return escapeForBashDoubleQuotes(value);
	}

	/**
	 * Format a Zod validation error for LLM consumption.
	 *
	 * @param error - The Zod error to format
	 * @param maxErrors - Maximum number of errors to show (default 10)
	 * @returns Formatted markdown string
	 *
	 * @example
	 * ```typescript
	 * const result = schema.safeParse(data);
	 * if (!result.success) {
	 *   console.log(ClaudeBinaryPluginEnv.formatZodError(result.error));
	 * }
	 * ```
	 * @public
	 */
	static formatZodError(error: ZodErrorMinimal, maxErrors = 10): string {
		return formatZodError(error, maxErrors);
	}
}
