import { Effect, Layer, ParseResult, Schema } from "effect";
import { CommandParseError } from "../errors/CommandParseError.js";
import { CommandRunner } from "../services/CommandRunner.js";

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
 * Live implementation of the CommandRunner service.
 *
 * Provides CLI argument parsing using Effect Schema validation.
 */
export const CommandRunnerLive = Layer.succeed(
	CommandRunner,
	CommandRunner.of({
		run: (options) =>
			Effect.fail(
				new CommandParseError({
					commandName: options.commandName,
					message:
						"CommandRunnerLive.run() is a placeholder. " +
						"Full command execution requires handler registration. " +
						"Use Commands.run() for full lifecycle execution.",
				}),
			),

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
