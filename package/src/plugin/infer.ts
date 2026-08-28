import type { Schema } from "effect";
import type { CommandDefinition, CommandDefinitionBase, CommandHandler, CommandsMap } from "./commands.js";
import type { ExtractSetupReturn, SetupContext } from "./state.js";

// =============================================================================
// TYPE INFERENCE UTILITIES
// =============================================================================

/**
 * Extract the options Schema from a PluginConfig subclass with static `options` property.
 * @public
 */
export type ExtractOptionsSchema<T> = T extends { options: infer S }
	? S extends Schema.Schema.Any
		? S
		: never
	: never;

/**
 * Extract the state Schema from either:
 * - A PluginConfig subclass with static `state` property (new API)
 * - Falls back to never if no state schema is defined
 * @public
 */
export type ExtractStateSchema<T> = T extends { state: infer S } ? (S extends Schema.Schema.Any ? S : never) : never;

/**
 * Extract the setup function type from a PluginConfig subclass with static `setup` property.
 * @public
 */
export type ExtractSetup<T> = T extends { setup: infer F } ? F : undefined;

/**
 * Helper type to extract commands map from a ClaudePlugin or config class.
 * @public
 */
export type ExtractCommands<T> = T extends { commands: infer C }
	? C extends Record<string, CommandDefinitionBase>
		? C
		: Record<string, CommandDefinitionBase>
	: Record<string, CommandDefinitionBase>;

/**
 * Extract the inferred Options type from a plugin configuration.
 *
 * @remarks
 * Extracts the TypeScript type from the PluginConfig subclass's static `options` schema.
 *
 * @example
 * ```ts
 * type Options = InferPluginOptions<typeof MyConfig>;
 * ```
 * @public
 */
export type InferPluginOptions<T> =
	ExtractOptionsSchema<T> extends Schema.Schema.Any
		? Schema.Schema.Type<ExtractOptionsSchema<T>>
		: Record<string, unknown>;

/**
 * Extract the inferred State type from a plugin configuration.
 *
 * @remarks
 * Reads from the PluginConfig subclass's static `state` property.
 * If no state schema is defined, returns `Record<string, unknown>`.
 *
 * @example
 * ```ts
 * type State = InferPluginState<typeof MyConfig>;
 * ```
 * @public
 */
export type InferPluginState<T> =
	ExtractStateSchema<T> extends Schema.Schema.Any ? Schema.Schema.Type<ExtractStateSchema<T>> : Record<string, unknown>;

/**
 * Infer command handler types from a plugin configuration.
 *
 * @remarks
 * Returns an interface with typed handlers for each command defined in the plugin.
 * Use this to define command handlers with full type safety for args, options, and state.
 *
 * @example
 * ```ts
 * import { Plugin } from "claude-binary-plugin";
 * import type { InferPluginCommands } from "claude-binary-plugin";
 *
 * class MyPlugin extends Plugin("MY_PLUGIN", { ... }) {}
 * export type Commands = InferPluginCommands<MyPlugin>;
 *
 * // In commands/lint.cmd.ts
 * import type { Commands } from "../plugin.config.js";
 *
 * const handler: Commands["lint"] = async ({ args, options, state }) => {
 *   // args, options, and state are fully typed!
 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
 * };
 * export default handler;
 * ```
 * @public
 */
export type InferPluginCommands<T> = {
	[K in keyof ExtractCommands<T>]: ExtractCommands<T>[K] extends CommandDefinition<infer TArgs>
		? CommandHandler<Schema.Schema.Type<TArgs>, InferPluginOptions<T>, InferPluginState<T>>
		: never;
};

// Re-export ExtractSetupReturn so infer.ts is the single place for setup-related inference
// Re-export SetupContext so consumers that use ExtractSetup can also access the context type
export type { ExtractSetupReturn, SetupContext };
