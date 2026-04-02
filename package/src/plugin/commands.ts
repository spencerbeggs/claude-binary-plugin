import type { Schema } from "effect";
import type { PluginState } from "./handler.js";

// =============================================================================
// COMMAND PIPELINE TYPES
// =============================================================================

/**
 * Command output structure returned by command handlers.
 * Commands output markdown for LLM consumption.
 * @public
 */
export interface CommandOutput {
	/** Exit code (0 = success, 1 = issues found, 2 = fatal error) */
	exitCode: number;
	/** Markdown output for LLM consumption */
	output: string;
	/** Optional structured data for programmatic access */
	data?: Record<string, unknown>;
}

/**
 * Context provided to command handlers.
 *
 * @typeParam TArgs - Validated argument type from Effect Schema
 * @typeParam TOptions - Validated options from plugin schema (Layer 2)
 * @typeParam TState - Computed variables from setup function (Layer 3)
 *
 * @example
 * ```ts
 * import type { Commands } from "./plugin.config.js";
 *
 * const handler: Commands["lint"] = async ({ args, options, state }) => {
 *   // args: { path: string, fix: boolean } - validated from CLI
 *   // options: { AUTO_ALLOW_ENABLED: boolean, ... } - from schema
 *   // state: { projectDir, pluginDir, packageManager, ... } - base + computed
 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
 * };
 * ```
 * @public
 */
export interface CmdContext<TArgs, TOptions, TState = Record<string, unknown>> {
	/** Validated command arguments from CLI */
	args: TArgs;
	/** Validated options from plugin schema */
	options: TOptions;
	/** State: base paths + computed state from setup() */
	state: PluginState<TState>;
}

/**
 * Command handler function signature.
 *
 * @typeParam TArgs - Validated argument type from Effect Schema
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - State from setup function
 * @public
 */
export type CommandHandler<TArgs, TOptions, TState = Record<string, unknown>> = (
	ctx: CmdContext<TArgs, TOptions, TState>,
) => CommandOutput | Promise<CommandOutput>;

/**
 * Generic command handler function type for base constraints.
 * Uses `never` in parameters to allow any specific handler signature via contravariance.
 * @public
 */
export type CommandHandlerFn = (ctx: never) => CommandOutput | Promise<CommandOutput>;

/**
 * Base command definition structure (for type constraints).
 * @public
 */
export interface CommandDefinitionBase {
	description: string;
	args?: Schema.Schema.Any;
	/** Inline handler function */
	handler: CommandHandlerFn;
}

/**
 * Command definition with inline handler function.
 *
 * @typeParam TArgs - Effect Schema type for command arguments
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @example
 * ```ts
 * commands: {
 *   status: {
 *     description: "Show project status",
 *     args: Schema.Struct({}),
 *     handler: async ({ state }) => ({
 *       exitCode: 0,
 *       output: `# Status\n\nProject: ${state.projectDir}`,
 *     }),
 *   },
 * }
 * ```
 * @public
 */
export interface CommandInlineDefinition<
	TArgs extends Schema.Schema.Any = Schema.Schema.Any,
	TOptions = unknown,
	TState = Record<string, unknown>,
> {
	/** Description shown in help text and to LLM */
	description: string;
	/** Effect Schema for validating CLI arguments */
	args?: TArgs;
	/** Inline handler function */
	handler: CommandHandler<Schema.Schema.Type<TArgs>, TOptions, TState>;
}

/**
 * Command definition with an inline handler function.
 *
 * @typeParam TArgs - Effect Schema type for command arguments
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @example
 * ```ts
 * {
 *   description: "Show status",
 *   args: Schema.Struct({}),
 *   handler: async ({ state }) => ({
 *     exitCode: 0,
 *     output: `Project: ${state.projectDir}`,
 *   }),
 * }
 * ```
 * @public
 */
export type CommandDefinition<
	TArgs extends Schema.Schema.Any = Schema.Schema.Any,
	TOptions = unknown,
	TState = Record<string, unknown>,
> = CommandInlineDefinition<TArgs, TOptions, TState>;

/**
 * Map of command names to their definitions.
 * @public
 */
export type CommandsMap = Record<string, CommandDefinitionBase>;
