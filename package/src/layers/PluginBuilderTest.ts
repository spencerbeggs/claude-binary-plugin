import { Effect, Layer } from "effect";
import type { PluginBuildResult } from "../build/builder.js";
import { PluginBuilderService } from "../services/PluginBuilder.js";

/**
 * Test factory for the PluginBuilder service.
 *
 * Returns a layer that records build calls and returns a configurable result.
 */
export function makePluginBuilderTest(result?: Partial<PluginBuildResult>): {
	builds: Array<{ type: "build" | "fromConfig"; options: unknown }>;
	layer: Layer.Layer<PluginBuilderService>;
} {
	const builds: Array<{ type: "build" | "fromConfig"; options: unknown }> = [];

	const defaultResult: PluginBuildResult = {
		entrypoint: "plugin.ts",
		output: "plugin.plugin",
		success: true,
		duration: 100,
		...result,
	};

	const layer = Layer.succeed(
		PluginBuilderService,
		PluginBuilderService.of({
			build: (options) => {
				builds.push({ type: "build", options });
				return Effect.succeed(defaultResult);
			},
			fromConfig: (_plugin, options) => {
				builds.push({ type: "fromConfig", options });
				return Effect.succeed(defaultResult);
			},
		}),
	);

	return { builds, layer };
}
