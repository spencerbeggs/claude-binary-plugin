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
