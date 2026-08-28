import type { Effect, Schema } from "effect";
import { Context } from "effect";
import type { CommandParseError } from "../errors/CommandParseError.js";

/**
 * Output from a command execution.
 * @public
 */
export interface CommandOutput {
	readonly exitCode: number;
	readonly output: string;
	readonly data?: Record<string, unknown>;
}

/**
 * Options for running a command.
 * @public
 */
export interface RunCommandOptions {
	readonly commandName: string;
	readonly pluginName: string;
	readonly pluginVersion: string;
	readonly rawArgs: string[];
	/** Command handler function */
	// biome-ignore lint/suspicious/noExplicitAny: Handler signature varies by command
	readonly handler: (ctx: { args: any; options: any; state: any }) => any;
	/** Effect Schema for validating arguments */
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies by command
	readonly argsSchema?: Schema.Schema<any, any, never>;
	/** Plugin prefix for env var namespacing */
	readonly prefix?: string;
	/** Options schema for validating env vars */
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies by plugin
	readonly optionsSchema?: Schema.Schema<any, any, never>;
}

/**
 * CommandRunner Effect service tag.
 *
 * Provides command execution and argument parsing capabilities.
 *
 * @public
 */
export class CommandRunner extends Context.Tag("CommandRunner")<
	CommandRunner,
	{
		/**
		 * Run a command and return its output.
		 */
		readonly run: (options: RunCommandOptions) => Effect.Effect<CommandOutput, CommandParseError>;

		/**
		 * Parse raw CLI arguments against an Effect Schema.
		 */
		readonly parse: <TArgs>(
			// biome-ignore lint/suspicious/noExplicitAny: Encoded type varies by Schema.Struct shape
			schema: Schema.Schema<TArgs, any, never>,
			args: string[],
		) => Effect.Effect<TArgs, CommandParseError>;
	}
>() {}
