#!/usr/bin/env bun

/**
 * Claude Binary Plugin Builder CLI
 *
 * Builds a Claude Code plugin from a declarative plugin definition file.
 * By default, looks for `plugin.config.ts` in the current directory.
 *
 * Usage:
 *   claude-binary-plugin build
 *   claude-binary-plugin build plugin.config.ts
 *   claude-binary-plugin build ./src/plugin.config.ts --no-persist
 *
 * Options:
 *   --no-persist    Don't persist to local cache (overrides config)
 *   --no-bytecode   Don't compile to bytecode (overrides config)
 *   --bundle        Bundle to JS instead of compiling to binary
 *   --quiet         Suppress all non-error output
 */

import { dirname, resolve } from "node:path";
import { Args, Command, Options } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Console, Effect } from "effect";
import type { z } from "zod";
import { PluginBuilder } from "../build/builder.js";
import type { ClaudeBinaryPlugin } from "../pipeline/config.js";
import { initCommand } from "./init/index.js";
import { getPackageVersion } from "./macros.js";

// Package version - works both at runtime and when bundled
const cliVersion = getPackageVersion();

// Build command arguments and options
const pluginConfigPath = Args.file({ name: "plugin-config-path", exists: "yes" }).pipe(
	Args.withDefault("plugin.config.ts"),
);

const noPersist = Options.boolean("no-persist").pipe(
	Options.withDescription("Don't persist to local cache (overrides config)"),
);

const noBytecode = Options.boolean("no-bytecode").pipe(
	Options.withDescription("Don't compile to bytecode (overrides config)"),
);

const bundle = Options.boolean("bundle").pipe(Options.withDescription("Bundle to JS instead of compiling to binary"));

const quiet = Options.boolean("quiet").pipe(Options.withDescription("Suppress all non-error output"));

// Build command implementation
const buildCommand = Command.make(
	"build",
	{ pluginConfigPath, noPersist, noBytecode, bundle, quiet },
	({ pluginConfigPath, noPersist, noBytecode, bundle, quiet }) =>
		Effect.gen(function* () {
			const log = quiet ? () => Effect.void : Console.log;
			const pluginFile = pluginConfigPath;

			// Resolve plugin file path
			const absolutePluginFile = resolve(process.cwd(), pluginFile);
			const rootDir = dirname(absolutePluginFile);

			// Check if file exists
			const file = Bun.file(absolutePluginFile);
			if (!(yield* Effect.promise(() => file.exists()))) {
				yield* Console.error(`Error: Plugin file not found: ${absolutePluginFile}`);
				return yield* Effect.fail(new Error("Plugin file not found"));
			}

			yield* log(`Building plugin from: ${pluginFile}`);

			// Import plugin definition
			const pluginDefinition = yield* Effect.tryPromise({
				try: async () => {
					const module = await import(absolutePluginFile);
					const definition = module.default as ClaudeBinaryPlugin<z.ZodTypeAny>;
					if (!definition?.config) {
						throw new Error("Plugin file must export a default ClaudeBinaryPlugin.create() result");
					}
					return definition;
				},
				catch: (error) => error as Error,
			});

			const config = pluginDefinition.config;

			// Read plugin manifest for name and version
			const manifest = yield* Effect.promise(() => PluginBuilder.readPluginManifest(rootDir));
			const pluginName = manifest?.name ?? config.prefix.toLowerCase().replace(/_/g, "-");
			const pluginVersion = manifest?.version ?? "1.0.0";

			// Extract hook entries
			const hookEntries = PluginBuilder.extractHookEntries(config);

			// Convert commands object to pipelineCommands format for generatePipelinePluginEntrypoint
			const pipelineCommands = config.commands
				? Object.entries(config.commands).map(([name, cmd]) => {
						const cmdDef = cmd as { pipeline?: string; description?: string; args?: unknown };
						const pipelinePath = cmdDef.pipeline ?? "";
						const resolvedPath = pipelinePath ? resolve(rootDir, pipelinePath) : "";
						return {
							name,
							filePath: resolvedPath,
							description: cmdDef.description ?? "",
							hasArgsSchema: !!cmdDef.args,
						};
					})
				: [];

			yield* log(`\nPlugin: ${pluginName} v${pluginVersion}`);
			yield* log(`Hooks: ${hookEntries.length}`);
			for (const hook of hookEntries) {
				const mode = hook.isPipeline ? "pipeline" : "handler";
				yield* log(`  ${hook.hookType}/${hook.name} (${mode})`);
			}
			if (pipelineCommands.length > 0) {
				yield* log(`Commands: ${pipelineCommands.length}`);
				for (const cmd of pipelineCommands) {
					yield* log(`  ${cmd.name}`);
				}
			}

			// Generate entrypoint
			const pluginImportPath = `./${pluginFile.replace(/\.ts$/, ".js")}`;
			const entrypointSource = PluginBuilder.generateEntrypoint({
				pluginPath: pluginImportPath,
				pluginName,
				pluginVersion,
				hooks: hookEntries,
				pipelineCommands,
			});

			// Write generated entrypoint
			const entrypointPath = resolve(rootDir, ".plugin-entrypoint.ts");
			yield* Effect.promise(() => Bun.write(entrypointPath, entrypointSource));

			// Determine build options (CLI flags override config)
			const shouldPersist = noPersist ? false : (config.persistLocal ?? true);
			const shouldBytecode = noBytecode ? false : (config.bytecode ?? false);
			const shouldCompile = bundle ? false : (config.compile ?? true);

			// Build the plugin
			const result = yield* Effect.promise(() =>
				PluginBuilder.build({
					rootDir,
					entrypoint: ".plugin-entrypoint.ts",
					bytecode: shouldBytecode,
					persistLocal: shouldPersist,
					compile: shouldCompile,
					minify: config.minify ?? true,
					sourcemap: config.sourcemap ?? true,
					cleanupTempFiles: true,
					quiet,
				}),
			);

			// Clean up generated entrypoint
			yield* Effect.promise(() => Bun.$`rm -f ${entrypointPath}`.quiet());

			if (!result.success) {
				yield* Console.error("\nBuild failed");
				return yield* Effect.fail(new Error("Build failed"));
			}

			// Skip proxy/hooks generation in quiet mode (proxy-invoked builds).
			// The proxy script is already running and must not be overwritten mid-execution.
			if (!quiet) {
				// Generate proxy script for cross-platform distribution
				const scriptsDir = "scripts";
				const proxyScriptRelPath = `${scriptsDir}/setup-proxy.sh`;
				const proxyScriptAbsPath = resolve(rootDir, proxyScriptRelPath);
				const proxyScriptDir = dirname(proxyScriptAbsPath);

				yield* Effect.promise(() => Bun.$`mkdir -p ${proxyScriptDir}`.quiet());

				const proxyScriptContent = PluginBuilder.generateProxyScript({
					binaryName: result.output,
					configFile: pluginFile,
					pluginName,
				});

				yield* Effect.promise(() => Bun.write(proxyScriptAbsPath, proxyScriptContent));
				yield* Effect.promise(() => Bun.$`chmod +x ${proxyScriptAbsPath}`.quiet());

				const hasSessionStart = hookEntries.some((h) => h.hookType === "SessionStart");
				if (!hasSessionStart) {
					yield* log("⚠ No SessionStart hooks - proxy will not trigger on-demand builds");
				}

				// Generate hooks.json with proxy routing for SessionStart
				const hooksOutputPath = config.hooksOutputPath ?? "hooks/hooks.json";
				const passthroughHooks = PluginBuilder.extractPassthroughEntries(config);
				const hooksJson = PluginBuilder.generateHooksJson({
					pluginBinaryName: result.output,
					hooks: hookEntries,
					passthroughHooks,
					proxyScript: proxyScriptRelPath,
				});

				// Write hooks.json
				const hooksJsonPath = resolve(rootDir, hooksOutputPath);
				const hooksDir = dirname(hooksJsonPath);

				// Ensure directory exists
				yield* Effect.promise(() => Bun.$`mkdir -p ${hooksDir}`.quiet());
				yield* Effect.promise(() => Bun.write(hooksJsonPath, `${JSON.stringify(hooksJson, null, "\t")}\n`));

				yield* log(`\nBuild complete: ${result.output}`);
				yield* log(`Proxy script: ${proxyScriptRelPath}`);
				yield* log(`Hooks config: ${hooksOutputPath}`);
			}
		}),
);

// Root command (just shows help when called without subcommand)
const rootCommand = Command.make("claude-binary-plugin", {}, () =>
	Console.log("Use 'claude-binary-plugin build' or 'init'. Run with --help for more information."),
).pipe(Command.withSubcommands([buildCommand, initCommand]));

// Create and run the CLI
const cli = Command.run(rootCommand, {
	name: "Claude Binary Plugin Builder",
	version: cliVersion,
});

cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
