import { Effect, Layer, Schema } from "effect";
import { CommandParseError } from "../errors/CommandParseError.js";
import type { CommandOutput, RunCommandOptions } from "../services/CommandRunner.js";
import { CommandRunner } from "../services/CommandRunner.js";

/**
 * Test factory for the CommandRunner service.
 *
 * Returns a layer that records command runs and parse calls,
 * with configurable responses.
 */
export function makeCommandRunnerTest(defaultOutput?: Partial<CommandOutput>): {
	runs: Array<RunCommandOptions>;
	parses: Array<{ args: string[] }>;
	layer: Layer.Layer<CommandRunner>;
} {
	const runs: Array<RunCommandOptions> = [];
	const parses: Array<{ args: string[] }> = [];

	const output: CommandOutput = {
		exitCode: 0,
		output: "OK",
		...defaultOutput,
	};

	const layer = Layer.succeed(
		CommandRunner,
		CommandRunner.of({
			run: (options) => {
				runs.push(options);
				return Effect.succeed(output);
			},
			parse: (schema, args) => {
				parses.push({ args });
				return Effect.try({
					try: () => Schema.decodeUnknownSync(schema)({}),
					catch: (error) =>
						new CommandParseError({
							commandName: "parse",
							message: String(error),
						}),
				});
			},
		}),
	);

	return { runs, parses, layer };
}
