import { Effect, Layer } from "effect";
import { PluginBuilder } from "../build/builder.js";
import { ShellError } from "../errors/ShellError.js";
import { PluginBuilderService } from "../services/PluginBuilder.js";

/**
 * Live implementation of the PluginBuilder service.
 *
 * Wraps the existing PluginBuilder static class methods as an Effect service,
 * catching errors and wrapping them in ShellError.
 */
export const PluginBuilderLive = Layer.succeed(
	PluginBuilderService,
	PluginBuilderService.of({
		build: (options) =>
			Effect.tryPromise({
				try: () => PluginBuilder.build(options),
				catch: (error) => new ShellError({ command: "bun build", exitCode: 1, stderr: String(error) }),
			}),
		fromConfig: (plugin, options) =>
			Effect.tryPromise({
				// biome-ignore lint/suspicious/noExplicitAny: Plugin config type is loosely typed at this boundary
				try: () => PluginBuilder.fromConfig(plugin as any, options),
				catch: (error) => new ShellError({ command: "bun build (fromConfig)", exitCode: 1, stderr: String(error) }),
			}),
	}),
);
