#!/usr/bin/env bun

/**
 * Claude Binary Plugin Builder CLI
 *
 * Builds a Claude Code plugin from a declarative plugin definition file.
 *
 * Usage:
 *   claude-binary-plugin <plugin-file>
 *   claude-binary-plugin plugin.ts
 *   claude-binary-plugin ./src/plugin.ts --no-persist
 *
 * Options:
 *   --no-persist    Don't persist to local cache (overrides config)
 *   --no-bytecode   Don't compile to bytecode (overrides config)
 *   --bundle        Bundle to JS instead of compiling to binary
 *   --help          Show this help message
 */

import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { z } from "zod";
import {
	buildPlugin,
	extractPassthroughHookEntries,
	extractPipelineHookEntries,
	generateHooksJson,
	generatePipelinePluginEntrypoint,
	readPluginManifest,
} from "../builder.js";
import type { CompiledPlugin } from "../pipeline.js";

interface CLIOptions {
	help: boolean;
	noPersist: boolean;
	noBytecode: boolean;
	bundle: boolean;
}

function printHelp(): void {
	console.log(`
Claude Binary Plugin Builder

Builds a Claude Code plugin from a declarative plugin definition file.

Usage:
  claude-binary-plugin <plugin-file>
  claude-binary-plugin plugin.ts
  claude-binary-plugin ./src/plugin.ts --no-persist

Arguments:
  plugin-file     Path to the plugin definition file (e.g., plugin.ts)

Options:
  --no-persist    Don't persist to local cache (overrides config)
  --no-bytecode   Don't compile to bytecode (overrides config)
  --bundle        Bundle to JS instead of compiling to binary
  --help          Show this help message

Examples:
  # Build plugin.ts in current directory
  claude-binary-plugin plugin.ts

  # Build without persisting to cache
  claude-binary-plugin plugin.ts --no-persist

  # Bundle to JS for debugging
  claude-binary-plugin plugin.ts --bundle
`);
}

function parseOptions(): { pluginFile: string; options: CLIOptions } | null {
	try {
		const { values, positionals } = parseArgs({
			args: process.argv.slice(2),
			options: {
				help: { type: "boolean", default: false },
				"no-persist": { type: "boolean", default: false },
				"no-bytecode": { type: "boolean", default: false },
				bundle: { type: "boolean", default: false },
			},
			allowPositionals: true,
			strict: true,
		});

		if (values.help) {
			printHelp();
			process.exit(0);
		}

		if (positionals.length === 0) {
			console.error("Error: Missing plugin file argument");
			console.error("Usage: claude-binary-plugin <plugin-file>");
			console.error("Run 'claude-binary-plugin --help' for more information");
			process.exit(1);
		}

		if (positionals.length > 1) {
			console.error("Error: Too many arguments");
			console.error("Usage: claude-binary-plugin <plugin-file>");
			process.exit(1);
		}

		const pluginFile = positionals[0];
		if (!pluginFile) {
			console.error("Error: Missing plugin file argument");
			process.exit(1);
		}

		return {
			pluginFile,
			options: {
				help: values.help ?? false,
				noPersist: values["no-persist"] ?? false,
				noBytecode: values["no-bytecode"] ?? false,
				bundle: values.bundle ?? false,
			},
		};
	} catch (error) {
		console.error(`Error: ${(error as Error).message}`);
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const parsed = parseOptions();
	if (!parsed) return;

	const { pluginFile, options } = parsed;

	// Resolve plugin file path
	const absolutePluginFile = resolve(process.cwd(), pluginFile);
	const rootDir = dirname(absolutePluginFile);

	// Check if file exists
	const file = Bun.file(absolutePluginFile);
	if (!(await file.exists())) {
		console.error(`Error: Plugin file not found: ${absolutePluginFile}`);
		process.exit(1);
	}

	console.log(`Building plugin from: ${pluginFile}`);

	// Import plugin definition
	let pluginDefinition: CompiledPlugin<z.ZodTypeAny>;
	try {
		const module = await import(absolutePluginFile);
		pluginDefinition = module.default;

		if (!pluginDefinition?.config) {
			console.error("Error: Plugin file must export a default ClaudeBinaryPlugin.create() result");
			process.exit(1);
		}
	} catch (error) {
		console.error(`Error importing plugin file: ${(error as Error).message}`);
		process.exit(1);
	}

	const config = pluginDefinition.config;

	// Read plugin manifest for name and version
	const manifest = await readPluginManifest(rootDir);
	const pluginName = manifest?.name ?? config.prefix.toLowerCase().replace(/_/g, "-");
	const pluginVersion = manifest?.version ?? "1.0.0";

	// Extract hook entries
	const hookEntries = extractPipelineHookEntries(config);

	// Convert commands object to pipelineCommands format for generatePipelinePluginEntrypoint
	// Commands are defined as: { lint: { pipeline, description, args }, ... }
	const pipelineCommands = config.commands
		? Object.entries(config.commands).map(([name, cmd]) => {
				const cmdDef = cmd as { pipeline?: string; description?: string; args?: unknown };
				// Resolve the file path for the command handler
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

	console.log(`\nPlugin: ${pluginName} v${pluginVersion}`);
	console.log(`Hooks: ${hookEntries.length}`);
	for (const hook of hookEntries) {
		const mode = hook.isPipeline ? "pipeline" : "handler";
		console.log(`  ${hook.hookType}/${hook.name} (${mode})`);
	}
	if (pipelineCommands.length > 0) {
		console.log(`Commands: ${pipelineCommands.length}`);
		for (const cmd of pipelineCommands) {
			console.log(`  ${cmd.name}`);
		}
	}

	// Generate entrypoint
	// Use relative path from the generated entrypoint to the plugin file
	const pluginImportPath = `./${pluginFile.replace(/\.ts$/, ".js")}`;
	const entrypointSource = generatePipelinePluginEntrypoint({
		pluginPath: pluginImportPath,
		pluginName,
		pluginVersion,
		hooks: hookEntries,
		pipelineCommands,
	});

	// Write generated entrypoint
	const entrypointPath = resolve(rootDir, ".plugin-entrypoint.ts");
	await Bun.write(entrypointPath, entrypointSource);

	// Determine build options (CLI flags override config)
	const shouldPersist = options.noPersist ? false : (config.persistLocal ?? true);
	const shouldBytecode = options.noBytecode ? false : (config.bytecode ?? false);
	const shouldCompile = options.bundle ? false : (config.compile ?? true);

	// Build the plugin
	const result = await buildPlugin({
		rootDir,
		entrypoint: ".plugin-entrypoint.ts",
		bytecode: shouldBytecode,
		persistLocal: shouldPersist,
		compile: shouldCompile,
		minify: config.minify ?? true,
		sourcemap: config.sourcemap ?? true,
		cleanupTempFiles: true,
	});

	// Clean up generated entrypoint
	await Bun.$`rm -f ${entrypointPath}`.quiet();

	if (!result.success) {
		console.error("\nBuild failed");
		process.exit(1);
	}

	// Generate hooks.json
	const hooksOutputPath = config.hooksOutputPath ?? "hooks/hooks.json";
	const passthroughHooks = extractPassthroughHookEntries(config);
	const hooksJson = generateHooksJson({
		pluginBinaryName: result.output,
		hooks: hookEntries,
		passthroughHooks,
	});

	// Write hooks.json
	const hooksJsonPath = resolve(rootDir, hooksOutputPath);
	const hooksDir = dirname(hooksJsonPath);

	// Ensure directory exists
	await Bun.$`mkdir -p ${hooksDir}`.quiet();
	await Bun.write(hooksJsonPath, `${JSON.stringify(hooksJson, null, "\t")}\n`);

	console.log(`\nBuild complete: ${result.output}`);
	console.log(`Hooks config: ${hooksOutputPath}`);
}

main().catch((error) => {
	console.error(`Fatal error: ${error}`);
	process.exit(2);
});
