import type { Effect } from "effect";
import { Context } from "effect";
import type { BuildPluginOptions, PluginBuildResult } from "../build/builder.js";
import type { ShellError } from "../errors/ShellError.js";

export class PluginBuilderService extends Context.Tag("PluginBuilder")<
	PluginBuilderService,
	{
		readonly build: (options?: BuildPluginOptions) => Effect.Effect<PluginBuildResult, ShellError>;
		readonly fromConfig: (
			plugin: {
				config: {
					hooks: Partial<Record<string, unknown[]>>;
					commands?: Record<string, unknown>;
					hooksOutputPath?: string;
				};
			},
			options?: {
				rootDir?: string;
				plugin?: string;
				marketplace?: string;
				outputName?: string;
				compile?: boolean;
				minify?: boolean;
				sourcemap?: boolean;
				bytecode?: boolean;
				target?: string;
				clean?: boolean;
				persistLocal?: boolean;
				external?: string[];
			},
		) => Effect.Effect<PluginBuildResult, ShellError>;
	}
>() {}
