#!/usr/bin/env bun
/**
 * Build system for compiling Claude Code plugins.
 *
 * @remarks
 * This module provides functions for compiling plugin configurations into
 * single-file Bun executables with accompanying hooks.json manifests.
 *
 * **Build Process:**
 * 1. Generate TypeScript entrypoint from plugin config
 * 2. Compile to single-file executable with Bun.build()
 * 3. Generate hooks.json manifest for Claude Code
 * 4. Optionally sync to Claude Code plugins cache
 *
 * **Generated Artifacts:**
 * - `{name}.plugin` - Compiled Bun executable
 * - `hooks.json` - Hook manifest for Claude Code
 * - `sidecar.js` - OTEL sidecar script (if telemetry enabled)
 *
 * **Key Functions:**
 * - {@link buildPluginFromConfig} - Build from ClaudeBinaryPlugin instance
 * - {@link buildPlugin} - Low-level build with manual entrypoint
 * - {@link generatePipelinePluginEntrypoint} - Generate TypeScript entrypoint
 * - {@link generateHooksJson} - Generate hooks.json manifest
 * - {@link syncPluginToCache} - Sync to Claude Code plugins cache
 *
 * @example
 * ```typescript
 * import { ClaudeBinaryPlugin, buildPluginFromConfig } from "claude-binary-plugin";
 *
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   schema: z.object({}),
 *   hooks: { SessionStart: [{ name: "init", pipeline: "./hooks/init.ts" }] },
 * });
 *
 * const result = await buildPluginFromConfig(plugin, { rootDir: "." });
 * ```
 *
 * @see {@link PluginManifest} - Plugin manifest configuration
 * @see {@link BuildPluginOptions} - Build configuration options
 * @module
 */
import { relative, resolve } from "node:path";
import type { PassthroughHookEntry } from "../pipeline/config.js";

/**
 * Result of a shell command execution.
 * @public
 */
export interface ShellResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Shell executor function type for dependency injection.
 * @public
 */
export type ShellExecutor = (cmd: string) => Promise<ShellResult>;

/**
 * Default shell executor using Bun.$.
 * @public
 */
export const defaultShellExecutor: ShellExecutor = async (cmd: string): Promise<ShellResult> => {
	const result = await Bun.$`sh -c ${cmd}`.quiet().nothrow();
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString().trim(),
		stderr: result.stderr.toString().trim(),
	};
};

/**
 * Compilation target platforms for cross-compilation.
 * @public
 */
export type CompileTarget =
	| "bun-linux-x64"
	| "bun-linux-arm64"
	| "bun-windows-x64"
	| "bun-darwin-x64"
	| "bun-darwin-arm64"
	| "bun-linux-x64-baseline"
	| "bun-linux-x64-musl"
	| "bun-linux-arm64-musl";

// =============================================================================
// PIPELINE PLUGIN SUPPORT
// =============================================================================

/**
 * Hook event type for pipeline plugins.
 * @public
 */
export type PipelineHookEventType =
	| "PreToolUse"
	| "PostToolUse"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "SubagentStop"
	| "UserPromptSubmit"
	| "PreCompact"
	| "Notification"
	| "PermissionRequest";

/**
 * Configuration for a pipeline hook in the generated entrypoint.
 * @public
 */
export interface PipelineHookEntry {
	/** Hook event type (e.g., "PreToolUse", "SessionStart") */
	hookType: PipelineHookEventType;
	/** Hook name for CLI routing */
	name: string;
	/** Whether this is a pipeline (true) or raw handler (false) */
	isPipeline: boolean;
	/** Tool filter for PreToolUse/PostToolUse */
	tools?: string[];
	/** Description for help text */
	description?: string;
	/** File path for file-based hooks (resolved via import.meta.resolve) */
	filePath?: string;
}

/**
 * Configuration for a pipeline command in the generated entrypoint.
 * @public
 */
export interface PipelineCommandEntry {
	/** Command name for CLI routing */
	name: string;
	/** Description for help text */
	description?: string;
	/** File path for the command handler (resolved via import.meta.resolve) */
	filePath: string;
	/** Whether the command has an args schema */
	hasArgsSchema: boolean;
}

/**
 * Options for generating a pipeline plugin entrypoint.
 * @public
 */
export interface GeneratePipelinePluginOptions {
	/** Import path to the plugin definition file (relative to entrypoint) */
	pluginPath: string;
	/** Plugin name for help text */
	pluginName: string;
	/** Plugin version */
	pluginVersion: string;
	/** Array of hook configurations extracted from the plugin definition */
	hooks: PipelineHookEntry[];
	/** Pipeline-style commands with Zod arg schemas */
	pipelineCommands?: PipelineCommandEntry[];
}

/**
 * Generates the TypeScript source code for a pipeline-based plugin entrypoint.
 *
 * The generated code imports the plugin definition and uses the pipeline-runtime
 * module to execute hooks with proper Zod validation.
 *
 * @param options - Generation options
 * @returns Generated TypeScript source code
 * @public
 */
export function generatePipelinePluginEntrypoint(options: GeneratePipelinePluginOptions): string {
	const { pluginPath, pluginName, pluginVersion, hooks, pipelineCommands = [] } = options;

	// Group hooks by type for the switch statement
	const hooksByType = new Map<string, PipelineHookEntry[]>();
	for (const hook of hooks) {
		const list = hooksByType.get(hook.hookType) || [];
		list.push(hook);
		hooksByType.set(hook.hookType, list);
	}

	// Generate imports for file-based hooks
	const fileHookImports: string[] = [];
	const fileHookMap = new Map<string, string>(); // hookKey -> importName
	let fileHookIndex = 0;
	for (const hook of hooks) {
		if (hook.filePath) {
			const importName = `fileHook_${fileHookIndex++}`;
			const hookKey = `${hook.hookType}/${hook.name}`;
			fileHookMap.set(hookKey, importName);
			// Convert file:// URL to absolute path - Bun's bundler handles .ts files
			const importPath = hook.filePath.startsWith("file://") ? hook.filePath.slice(7) : hook.filePath;
			fileHookImports.push(`import ${importName} from "${importPath}";`);
		}
	}

	// Generate imports for pipeline command handlers
	const commandImports: string[] = [];
	const commandImportMap = new Map<string, string>(); // cmdName -> importName
	let commandIndex = 0;
	for (const cmd of pipelineCommands) {
		const importName = `cmdHandler_${commandIndex++}`;
		commandImportMap.set(cmd.name, importName);
		const importPath = cmd.filePath.startsWith("file://") ? cmd.filePath.slice(7) : cmd.filePath;
		commandImports.push(`import ${importName} from "${importPath}";`);
	}

	// Generate hook dispatch cases
	const hookCases: string[] = [];
	for (const [hookType, typeHooks] of hooksByType) {
		for (const hook of typeHooks) {
			const hookKey = `${hook.hookType}/${hook.name}`;
			const toolsArg = hook.tools?.length ? `[${hook.tools.map((t) => `"${t}"`).join(", ")}]` : "undefined";
			const fileHookImport = fileHookMap.get(hookKey);

			if (hook.isPipeline) {
				if (fileHookImport) {
					// File-based pipeline hook
					hookCases.push(`    case "${hookKey}": {
      return runPipeline({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        pipeline: ${fileHookImport},
        envClass: EnvClass,
        tools: ${toolsArg},
        schema: pluginConfig.schema,
        setup: pluginConfig.setup,
      });
    }`);
				} else {
					// Inline pipeline hook
					hookCases.push(`    case "${hookKey}": {
      const hookDef = pluginConfig.hooks.${hookType}?.find(h => h.name === "${hook.name}");
      if (!hookDef || !("pipeline" in hookDef)) throw new Error("Hook not found: ${hook.name}");
      return runPipeline({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        pipeline: hookDef.pipeline,
        envClass: EnvClass,
        tools: ${toolsArg},
        schema: pluginConfig.schema,
        setup: pluginConfig.setup,
      });
    }`);
				}
			} else {
				if (fileHookImport) {
					// File-based handler hook
					hookCases.push(`    case "${hookKey}": {
      return runRawHandler({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: ${fileHookImport},
        envClass: EnvClass,
      });
    }`);
				} else {
					// Inline handler hook
					hookCases.push(`    case "${hookKey}": {
      const hookDef = pluginConfig.hooks.${hookType}?.find(h => h.name === "${hook.name}");
      if (!hookDef || !("handler" in hookDef)) throw new Error("Hook not found: ${hook.name}");
      return runRawHandler({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: hookDef.handler,
        envClass: EnvClass,
      });
    }`);
				}
			}
		}
	}

	// Generate command cases
	const commandCases = pipelineCommands
		.map((c) => {
			const importName = commandImportMap.get(c.name);
			const argsSchemaAccess = c.hasArgsSchema ? `pluginConfig.commands["${c.name}"].args` : "emptyArgsSchema";
			return `    case "${c.name}": {
      return runCommandPipeline({
        commandName: "${c.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: ${importName},
        rawArgs: cmdArgs,
        argsSchema: ${argsSchemaAccess},
        envClass: EnvClass,
      });
    }`;
		})
		.join("\n");

	// Generate help text
	const hookDescriptions = hooks.map((h) => `  ${h.hookType}/${h.name}`.padEnd(35) + (h.description || "")).join("\n");

	const commandDescriptions = pipelineCommands.map((c) => `  ${c.name}`.padEnd(20) + (c.description || "")).join("\n");

	const validHooksArray = hooks.map((h) => `"${h.hookType}/${h.name}"`).join(", ");
	const validCommandsArray = pipelineCommands.map((c) => `"${c.name}"`).join(", ");

	// Generate imports section
	const hasPipelineCmds = pipelineCommands.length > 0;
	const commandRuntimeImport = hasPipelineCmds
		? `import { runCommand as runCommandPipeline, emptyArgsSchema } from "claude-binary-plugin";`
		: "";

	return `#!/usr/bin/env bun
/**
 * Auto-generated Pipeline Plugin Entrypoint
 *
 * This file is generated by buildPipelinePlugin() and should not be edited manually.
 * To modify hooks or commands, update the ClaudeBinaryPlugin.create() configuration.
 */

import { parseArgs } from "node:util";
import pluginDefinition from "${pluginPath}";
import { runPipeline, runRawHandler, ClaudeBinaryPluginEnv, handleUnknownHook, setPluginInfo } from "claude-binary-plugin";
${commandRuntimeImport}
${fileHookImports.length > 0 ? fileHookImports.join("\n") : ""}
${commandImports.length > 0 ? commandImports.join("\n") : ""}

// Plugin metadata - compiled constants, not env vars
const PLUGIN_NAME = "${pluginName}";
const PLUGIN_VERSION = "${pluginVersion}";

// Extract config from plugin definition
const pluginConfig = pluginDefinition.config;

// Create environment class from plugin schema (with pluginName for logging)
const EnvClass = ClaudeBinaryPluginEnv.create(pluginConfig.prefix, pluginConfig.schema, PLUGIN_NAME);

// Sidecar main function - dynamically imported only when needed
async function runSidecar(): Promise<void> {
  const { sidecarMain } = await import("claude-binary-plugin");
  sidecarMain();
}

const validHooks = [${validHooksArray}];
const validCommands = [${validCommandsArray}];

async function runHook(hookKey: string): Promise<never> {
  switch (hookKey) {
${hookCases.join("\n")}
    default:
      throw new Error(\`Unknown hook: \${hookKey}\`);
  }
}

async function runCommand(name: string, cmdArgs: string[]): Promise<void> {
  switch (name) {
${commandCases}
    default:
      throw new Error(\`Unknown command: \${name}\`);
  }
}

function printUsage(): void {
  console.error(\`
${pluginName} v${pluginVersion} - Pipeline Plugin

Usage:
  ${pluginName} --hook=<type>/<name>   Run a hook handler
  ${pluginName} --cmd=<name>           Run a command script
  ${pluginName} --sidecar              Run OTEL sidecar mode

Available hooks:
${hookDescriptions}

${pipelineCommands.length > 0 ? `Available commands:\n${commandDescriptions}` : ""}

Examples:
  ${pluginName} --hook=${hooks[0]?.hookType}/${hooks[0]?.name || "example"}
  ${pipelineCommands[0] ? `${pluginName} --cmd=${pipelineCommands[0].name}` : ""}
\`);
}

async function main(): Promise<void> {
  // Set plugin info for telemetry (module-level, not env vars)
  setPluginInfo({ name: PLUGIN_NAME, version: PLUGIN_VERSION });

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      hook: { type: "string", short: "h" },
      cmd: { type: "string", short: "c" },
      sidecar: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  // Sidecar mode - run OTEL collector
  if (values.sidecar) {
    await runSidecar();
    return;
  }

  if (values.hook) {
    const hookKey = values.hook;

    if (!validHooks.includes(hookKey)) {
      await handleUnknownHook(hookKey, validHooks);
    }

    await runHook(hookKey);
    return;
  }

  if (values.cmd) {
    const cmdName = values.cmd;

    if (!validCommands.includes(cmdName)) {
      console.error(\`Unknown command: \${cmdName}\`);
      console.error(\`Available commands: \${validCommands.join(", ")}\`);
      process.exit(1);
    }

    // Pass remaining positional args to the command
    await runCommand(cmdName, positionals);
    return;
  }

  console.error("Error: Must specify --hook=<type>/<name> or --cmd=<name>");
  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(\`[${pluginName}] Fatal error: \${error}\`);
  process.exit(2);
});
`;
}

/**
 * Hook definition with minimal required fields for extraction.
 * @public
 */
export interface ExtractableHook {
	name?: string;
	tools?: string[];
	description?: string;
	pipeline?: unknown;
	handler?: unknown;
	/** Passthrough hooks array (for raw hooks.json entries) */
	hooks?: Array<{ type: "command"; command: string }>;
	matcher?: string;
}

/**
 * Check if a hook entry is a passthrough (raw hooks.json entry).
 * Passthrough entries have a `hooks` array and no `name` property.
 */
function isPassthroughHook(hook: unknown): hook is PassthroughHookEntry {
	return (
		typeof hook === "object" &&
		hook !== null &&
		"hooks" in hook &&
		Array.isArray((hook as PassthroughHookEntry).hooks) &&
		!("name" in hook && (hook as { name?: string }).name)
	);
}

// PassthroughHookEntry is imported from pipeline/config.ts

/**
 * Extracted passthrough entries grouped by hook type.
 * @public
 */
export interface ExtractedPassthroughHooks {
	[hookType: string]: PassthroughHookEntry[];
}

/**
 * Extract hook entries from a ClaudeBinaryPlugin config for use with generatePipelinePluginEntrypoint.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Array of hook entries ready for code generation
 * @public
 */
export function extractPipelineHookEntries(config: {
	hooks: Partial<Record<PipelineHookEventType, ExtractableHook[]>>;
}): PipelineHookEntry[] {
	const entries: PipelineHookEntry[] = [];

	for (const [hookType, hooks] of Object.entries(config.hooks)) {
		if (!Array.isArray(hooks)) continue;

		for (const hook of hooks) {
			// Skip passthrough entries - they go directly to hooks.json
			if (isPassthroughHook(hook)) continue;

			// At this point, hook must have a name (passthrough entries are skipped above)
			if (!hook.name) continue;

			// Check if this is a file-based hook (pipeline/handler is a string path)
			const pipelineValue = hook.pipeline;
			const handlerValue = hook.handler;
			const isFileBased =
				(typeof pipelineValue === "string" && pipelineValue.length > 0) ||
				(typeof handlerValue === "string" && handlerValue.length > 0);
			const filePath = isFileBased ? (pipelineValue as string) || (handlerValue as string) : undefined;

			entries.push({
				hookType: hookType as PipelineHookEventType,
				name: hook.name,
				isPipeline: "pipeline" in hook && hook.pipeline !== undefined,
				tools: hook.tools,
				description: hook.description,
				filePath,
			});
		}
	}

	return entries;
}

/**
 * Command definition with minimal required fields for extraction.
 * @public
 */
export interface ExtractableCommand {
	description?: string;
	args?: unknown;
	pipeline: string;
}

/**
 * Extracts pipeline command entries from a plugin configuration.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Array of pipeline command entries
 * @public
 */
export function extractPipelineCommandEntries(config: {
	commands?: Record<string, ExtractableCommand>;
}): PipelineCommandEntry[] {
	if (!config.commands) return [];

	const entries: PipelineCommandEntry[] = [];

	for (const [name, cmd] of Object.entries(config.commands)) {
		entries.push({
			name,
			description: cmd.description,
			filePath: cmd.pipeline,
			hasArgsSchema: cmd.args !== undefined,
		});
	}

	return entries;
}

/**
 * Extracts passthrough hook entries from a plugin configuration.
 * Passthrough entries are raw hooks.json entries that get included directly
 * without compilation into the binary.
 *
 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
 * @returns Object mapping hook types to their passthrough entries
 * @public
 */
export function extractPassthroughHookEntries(config: {
	hooks: Partial<Record<PipelineHookEventType, unknown[]>>;
}): ExtractedPassthroughHooks {
	const result: ExtractedPassthroughHooks = {};

	for (const [hookType, hooks] of Object.entries(config.hooks)) {
		if (!Array.isArray(hooks)) continue;

		const passthroughEntries: PassthroughHookEntry[] = [];
		for (const hook of hooks) {
			if (isPassthroughHook(hook)) {
				passthroughEntries.push({
					matcher: hook.matcher,
					hooks: hook.hooks,
				});
			}
		}

		if (passthroughEntries.length > 0) {
			result[hookType] = passthroughEntries;
		}
	}

	return result;
}

/**
 * Plugin manifest from .claude-plugin/plugin.json
 * @public
 */
export interface PluginManifest {
	name: string;
	version: string;
	description?: string;
	author?: { name: string; email?: string } | string;
	license?: string;
	repository?: string;
	commands?: string[];
	skills?: string[];
}

/**
 * Marketplace manifest from .claude-plugin/marketplace.json
 * @public
 */
export interface MarketplaceManifest {
	name: string;
	owner?: { name: string; email?: string };
	metadata?: {
		description?: string;
		version?: string;
		pluginRoot?: string;
	};
	strict?: boolean;
	plugins?: Array<{
		name: string;
		source: string;
		description?: string;
		version?: string;
	}>;
}

/**
 * Read a JSON manifest file from the given path.
 *
 * @param manifestPath - Absolute path to the manifest file
 * @returns Parsed manifest or null if not found/invalid
 */
async function readManifestFile<T>(manifestPath: string): Promise<T | null> {
	const file = Bun.file(manifestPath);

	if (!(await file.exists())) {
		return null;
	}

	try {
		return (await file.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Read the plugin.json manifest.
 *
 * @param pluginPath - Path to plugin.json, or directory containing .claude-plugin/plugin.json
 * @returns Plugin manifest or null if not found
 * @public
 */
export async function readPluginManifest(pluginPath: string): Promise<PluginManifest | null> {
	// If path ends with .json, read directly; otherwise treat as directory
	const manifestPath = pluginPath.endsWith(".json") ? pluginPath : resolve(pluginPath, ".claude-plugin/plugin.json");

	return readManifestFile<PluginManifest>(manifestPath);
}

/**
 * Read the marketplace.json manifest.
 *
 * @param marketplacePath - Path to marketplace.json, or directory containing .claude-plugin/marketplace.json
 * @returns Marketplace manifest or null if not found
 * @public
 */
export async function readMarketplaceManifest(marketplacePath: string): Promise<MarketplaceManifest | null> {
	// If path ends with .json, read directly; otherwise treat as directory
	const manifestPath = marketplacePath.endsWith(".json")
		? marketplacePath
		: resolve(marketplacePath, ".claude-plugin/marketplace.json");

	return readManifestFile<MarketplaceManifest>(manifestPath);
}

/**
 * Options for compiling a unified plugin binary.
 * @public
 */
export interface BuildPluginOptions {
	/**Root directory containing the plugin (defaults to cwd) */
	rootDir?: string;
	/**
	 * Path to plugin.json manifest file or directory containing .claude-plugin/plugin.json.
	 * Default: `${rootDir}/.claude-plugin/plugin.json`
	 *
	 * @example
	 * ```ts
	 * // Explicit path to plugin.json
	 * plugin: import.meta.resolve("./.claude-plugin/plugin.json")
	 * // Or directory containing .claude-plugin/plugin.json
	 * plugin: import.meta.dir
	 * ```
	 */
	plugin?: string;
	/**
	 * Path to marketplace.json manifest file or directory containing .claude-plugin/marketplace.json.
	 * Default: searches `${rootDir}/../../.claude-plugin/marketplace.json` (standard monorepo structure)
	 *
	 * When set, the marketplace name is used for:
	 * - Cache path for persistLocal: `${CLAUDE_CONFIG_HOME}/plugins/cache/${marketplaceName}/${pluginName}/${version}`
	 * - Debug log naming: `${pluginName}@${marketplaceName}-debug.log`
	 *
	 * @example
	 * ```ts
	 * // Explicit path to marketplace.json
	 * marketplace: import.meta.resolve("../../.claude-plugin/marketplace.json")
	 * // Or directory containing .claude-plugin/marketplace.json
	 * marketplace: resolve(import.meta.dir, "../..")
	 * ```
	 */
	marketplace?: string;
	/**
	 * Path to the plugin entrypoint file (relative to rootDir).
	 */
	entrypoint?: string;
	/**
	 * Output filename for the compiled binary.
	 * Default: auto-derived from plugin.json name as `${name}.plugin`, or "plugin.plugin" if not found.
	 */
	outputName?: string;
	/**
	 * Whether to compile to a standalone binary (default: true).
	 * When false, bundles to JavaScript for easier debugging.
	 */
	compile?: boolean;
	/** Whether to minify output (default: true) */
	minify?: boolean;
	/**Whether to embed sourcemaps (default: true for debugging) */
	sourcemap?: boolean;
	/**
	 * Whether to compile to bytecode for faster startup (default: false).
	 * Bytecode compilation moves parsing overhead from runtime to bundle time,
	 * resulting in ~2x faster startup. Note: This is experimental and requires
	 * CommonJS format (no top-level await).
	 * @see https://bun.sh/docs/bundler/executables#bytecode-compilation
	 */
	bytecode?: boolean;
	/** Cross-compilation target (defaults to current platform) */
	target?: CompileTarget;
	/**Whether to clean existing plugin binary before building (default: true) */
	clean?: boolean;
	/** Whether to clean up .bun-build temp files after building (default: true) */
	cleanupTempFiles?: boolean;
	/**Shell executor for running build commands (for testing) */
	shell?: ShellExecutor;
	/**
	 * Plugin name used in help text and for per-plugin debug log files.
	 * Default: auto-derived from plugin.json name, or from outputName if not found.
	 */
	pluginName?: string;
	/**
	 * Marketplace name override. Default: auto-derived from marketplace.json name.
	 * Used for cache path and debug log naming.
	 */
	marketplaceName?: string;
	/** Packages to exclude from bundling (e.g., `["@commitlint/load"]`) */
	external?: string[];
	/**
	 * Whether to persist the built plugin to Claude's local cache.
	 * When enabled, copies the plugin directory to:
	 * `${CLAUDE_CONFIG_HOME}/plugins/cache/${marketplaceName}/${pluginName}/${version}`
	 *
	 * This is useful during development to immediately test plugin changes
	 * without needing to reinstall from the marketplace.
	 *
	 * Requires `marketplaceName` to be set.
	 * @defaultValue false
	 */
	persistLocal?: boolean;
}

/**
 * Result of compiling a plugin binary.
 * @public
 */
export interface PluginBuildResult {
	/**Original source file path (relative to rootDir) */
	entrypoint: string;
	/** Output executable path */
	output: string;
	/**Whether the build succeeded */
	success: boolean;
	/** Error if build failed */
	error?: Error;
	/**Build duration in milliseconds*/
	duration: number;
}

/**
 * Configuration for persisting a plugin to local cache.
 * @public
 */
export interface PersistLocalConfig {
	/** Root directory of the plugin */
	rootDir: string;
	/** Marketplace name (e.g., "savvy-web-claude-tools") */
	marketplaceName: string;
	/** Shell executor for running commands */
	shell: ShellExecutor;
}

/**
 * Reads plugin.json and returns the cache path for a plugin.
 *
 * @param config - Configuration for determining cache path
 * @returns Cache path or null if plugin.json not found or invalid
 * @public
 */
export async function getPluginCachePath(config: PersistLocalConfig): Promise<string[]> {
	const { rootDir, marketplaceName } = config;

	// Read plugin.json from .claude-plugin directory
	const pluginJsonPath = resolve(rootDir, ".claude-plugin/plugin.json");
	const pluginJsonFile = Bun.file(pluginJsonPath);

	if (!(await pluginJsonFile.exists())) {
		throw new Error(`⚠ Cannot persist to cache: plugin.json not found at ${pluginJsonPath}`);
	}

	try {
		const pluginJson = await pluginJsonFile.json();
		const { name, version } = pluginJson as { name: string; version: string };

		if (!name || !version) {
			throw new Error("⚠ Cannot persist to cache: plugin.json missing name or version");
		}

		// Prefer CLAUDE_CONFIG_DIR if set (XDG-compliant), otherwise use legacy ~/.claude
		const basePath = Bun.env.CLAUDE_CONFIG_DIR || resolve(Bun.env.HOME || "~", ".claude");
		const cachePath = resolve(basePath, "plugins/cache", marketplaceName, name, version);

		return [cachePath];
	} catch (error) {
		throw new Error(`⚠ Cannot persist to cache: failed to parse plugin.json - ${(error as Error).message}`);
	}
}

/**
 * Syncs a plugin directory to Claude's local cache.
 *
 * This clears the existing cache and copies all plugin files to the cache directory.
 *
 * @param config - Configuration for syncing
 * @returns true if successful, false otherwise
 * @public
 */
export async function syncPluginToCache(config: PersistLocalConfig): Promise<boolean> {
	const { rootDir, shell } = config;

	const cachePaths = await getPluginCachePath(config);

	console.log(`  Source: ${rootDir}`);
	console.log(`  Targets: ${cachePaths.length} cache location(s)`);

	let successCount = 0;

	for (const cachePath of cachePaths) {
		console.log(`  → ${cachePath}`);

		try {
			// Remove existing cache directory
			await shell(`rm -rf "${cachePath}"`);

			// Create parent directories
			await shell(`mkdir -p "${cachePath}"`);

			// Copy plugin directory contents to cache
			// Using rsync for efficient copying, excluding common dev files
			const rsyncResult = await shell(
				`rsync -a --delete \
					--exclude='.git' \
					--exclude='node_modules/.cache' \
					--exclude='*.bun-build' \
					--exclude='.DS_Store' \
					"${rootDir}/" "${cachePath}/"`,
			);

			if (rsyncResult.exitCode !== 0) {
				// Fallback to cp if rsync is not available
				const cpResult = await shell(`cp -R "${rootDir}/." "${cachePath}/"`);
				if (cpResult.exitCode !== 0) {
					console.error(`    ✗ Failed to copy plugin to cache: ${cpResult.stderr}`);
					continue;
				}
			}

			successCount++;
		} catch (error) {
			console.error(`    ✗ Error persisting to ${cachePath}: ${(error as Error).message}`);
		}
	}

	if (successCount === cachePaths.length) {
		console.log(`✓ Plugin persisted to ${successCount} cache location(s)`);
		return true;
	}

	if (successCount > 0) {
		console.log(`⚠ Plugin persisted to ${successCount}/${cachePaths.length} cache location(s)`);
		return true;
	}

	console.error(`✗ Failed to persist plugin to any cache location`);
	return false;
}

/**
 * Compiles a plugin into a single unified executable.
 *
 * This creates a single binary that bundles all hooks and commands,
 * reducing the total size compared to multiple separate binaries
 * (since the Bun runtime is only included once).
 *
 * When `hooks` and/or `commands` are provided, the entrypoint is auto-generated.
 * Otherwise, a manual entrypoint file is expected.
 *
 * @example
 * ```ts
 * // plugins/workflow/build.ts - Declarative configuration (recommended)
 * import { buildPlugin } from "claude-binary-plugin";
 *
 * await buildPlugin({
 *   rootDir: import.meta.dir,
 *   outputName: "workflow.plugin",
 *   hooks: [
 *     { name: "pre-edit-code", path: "./hooks/pre-edit-code.hook.js", description: "Lint before edit" },
 *   ],
 *   commands: [
 *     { name: "lint", path: "./commands/scripts/lint.js", description: "Run linters" },
 *   ],
 * });
 * ```
 *
 * The unified binary can then be invoked as:
 * workflow.plugin --hook=pre-edit-code
 * workflow.plugin --cmd=lint
 *
 * @param options - Build configuration options
 * @returns Result of the build operation
 * @public
 */
export async function buildPlugin(options: BuildPluginOptions = {}): Promise<PluginBuildResult> {
	const startTime = performance.now();

	const rootDir = options.rootDir ?? process.cwd();

	// Read plugin manifest from explicit path or default location
	const pluginPath = options.plugin ?? rootDir;
	const pluginManifest = await readPluginManifest(pluginPath);
	const manifestPluginName = pluginManifest?.name;

	// Read marketplace manifest from explicit path or default monorepo location
	const defaultMarketplacePath = resolve(rootDir, "../../.claude-plugin/marketplace.json");
	const marketplacePath = options.marketplace ?? defaultMarketplacePath;
	const marketplaceManifest = await readMarketplaceManifest(marketplacePath);
	const manifestMarketplaceName = marketplaceManifest?.name;

	// Derive defaults from manifests
	const defaultOutputName = manifestPluginName ? `${manifestPluginName}.plugin` : "plugin.plugin";
	const defaultMarketplaceName = manifestMarketplaceName;

	const {
		entrypoint = "plugin.ts",
		outputName = defaultOutputName,
		compile = true,
		minify = true,
		sourcemap = true,
		bytecode = false,
		target,
		clean = true,
		cleanupTempFiles = true,
		shell = defaultShellExecutor,
		marketplaceName = defaultMarketplaceName,
		external = [],
		persistLocal = false,
	} = options;

	const absoluteRootDir = resolve(rootDir);
	// Add .js extension for bundles (if not already present)
	const outputExt = compile ? "" : outputName.endsWith(".js") ? "" : ".js";
	const outputPath = resolve(absoluteRootDir, outputName + outputExt);
	const relativeOutput = relative(absoluteRootDir, outputPath);

	const entrypointPath = resolve(absoluteRootDir, entrypoint);
	const relativeEntrypoint = relative(absoluteRootDir, entrypointPath);

	// Clean existing plugin binary before building
	if (clean) {
		await shell(`rm -f "${outputPath}"`);
	}

	/** Helper to clean up .bun-build temp files left by bun build --compile */
	const cleanBunBuildTempFiles = async () => {
		const cwd = process.cwd();
		await shell(`rm -f "${cwd}"/.*.bun-build 2>/dev/null || true`);
		if (cwd !== absoluteRootDir) {
			await shell(`rm -f "${absoluteRootDir}"/.*.bun-build 2>/dev/null || true`);
		}
	};

	// Check if entrypoint exists
	const entrypointFile = Bun.file(entrypointPath);
	if (!(await entrypointFile.exists())) {
		const duration = performance.now() - startTime;
		return {
			entrypoint: relativeEntrypoint,
			output: relativeOutput,
			success: false,
			error: new Error(`Entrypoint not found: ${entrypointPath}`),
			duration,
		};
	}

	const action = compile ? "Compiling" : "Bundling";
	console.log(`\n${action} unified plugin...`);
	console.log(`Entrypoint: ${relativeEntrypoint}`);
	console.log(`Output: ${relativeOutput}`);

	// Build compile command arguments
	const args = ["build", entrypointPath, "--outfile", outputPath];

	if (compile) {
		args.splice(1, 0, "--compile");
	}

	if (minify) {
		args.push("--minify");
	}

	if (sourcemap) {
		args.push("--sourcemap");
	}

	if (bytecode) {
		args.push("--bytecode");
	}

	// When bundling (not compiling), default to bun target unless explicitly set
	const effectiveTarget = target || (!compile ? "bun" : undefined);
	if (effectiveTarget) {
		args.push("--target", effectiveTarget);
	}

	// Add external packages
	for (const pkg of external) {
		args.push("--external", pkg);
	}

	try {
		const cmd = `bun ${args.join(" ")}`;
		const result = await shell(cmd);

		const duration = performance.now() - startTime;

		// Clean up temp files
		if (cleanupTempFiles && compile) {
			await cleanBunBuildTempFiles();
		}

		if (result.exitCode !== 0) {
			const errorMessage = result.stderr;
			const verb = compile ? "compile" : "bundle";
			console.error(`\n✗ Failed to ${verb} plugin`);
			console.error(`  ${errorMessage}`);
			return {
				entrypoint: relativeEntrypoint,
				output: relativeOutput,
				success: false,
				error: new Error(`Plugin compilation failed: ${errorMessage}`),
				duration,
			};
		}

		const verb = compile ? "compiled" : "bundled";
		console.log(`\n✓ Plugin ${verb} successfully (${duration.toFixed(0)}ms)`);

		// Persist plugin to local cache if enabled
		if (persistLocal) {
			if (!marketplaceName) {
				console.warn("⚠ persistLocal requires marketplaceName to be set");
			} else {
				await syncPluginToCache({
					rootDir: absoluteRootDir,
					marketplaceName,
					shell,
				});
			}
		}

		return {
			entrypoint: relativeEntrypoint,
			output: relativeOutput,
			success: true,
			duration,
		};
	} catch (error) {
		const duration = performance.now() - startTime;

		// Clean up temp files even on error
		if (cleanupTempFiles && compile) {
			await cleanBunBuildTempFiles();
		}

		const verb = compile ? "compiling" : "bundling";
		console.error(`\n✗ Error ${verb} plugin`);
		console.error(`  ${(error as Error).message}`);

		return {
			entrypoint: relativeEntrypoint,
			output: relativeOutput,
			success: false,
			error: error as Error,
			duration,
		};
	}
}

// =============================================================================
// HOOKS.JSON GENERATION
// =============================================================================

/**
 * Options for generating hooks.json
 * @public
 */
export interface GenerateHooksJsonOptions {
	/** Plugin binary name (e.g., "bun-plugin-builder.plugin") */
	pluginBinaryName: string;
	/** Array of hook configurations extracted from the plugin definition */
	hooks: PipelineHookEntry[];
	/** Passthrough hooks to include directly in hooks.json */
	passthroughHooks?: ExtractedPassthroughHooks;
}

/**
 * Hook command entry in hooks.json.
 * @public
 */
export interface HooksJsonCommand {
	type: "command";
	command: string;
}

/**
 * Hook entry with optional matcher.
 * @public
 */
export interface HooksJsonEntry {
	matcher?: string;
	hooks: HooksJsonCommand[];
}

/**
 * The hooks.json file structure.
 * @public
 */
export interface HooksJsonFile {
	hooks: Record<string, HooksJsonEntry[]>;
}

/**
 * Generates the hooks.json content from hook entries.
 *
 * This function creates the Claude Code hooks.json format that maps
 * hook event types to their command handlers. All hooks use `${CLAUDE_PLUGIN_ROOT}`
 * which Claude Code provides for every hook invocation.
 *
 * @param options - Generation options
 * @returns The hooks.json object structure
 *
 * @example
 * ```ts
 * const hooksJson = generateHooksJson({
 *   pluginBinaryName: "my-plugin.plugin",
 *   hooks: [
 *     { hookType: "SessionStart", name: "context", isPipeline: true },
 *     { hookType: "PreToolUse", name: "filter", isPipeline: true, tools: ["Bash", "Write"] },
 *   ],
 * });
 * // Result:
 * // {
 * //   hooks: {
 * //     SessionStart: [{ hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=SessionStart/context" }] }],
 * //     PreToolUse: [{ matcher: "Bash|Write", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=PreToolUse/filter" }] }],
 * //   }
 * // }
 * ```
 * @public
 */
export function generateHooksJson(options: GenerateHooksJsonOptions): HooksJsonFile {
	const { pluginBinaryName, hooks, passthroughHooks = {} } = options;

	// Group hooks by type
	const hooksByType = new Map<string, PipelineHookEntry[]>();
	for (const hook of hooks) {
		const list = hooksByType.get(hook.hookType) || [];
		list.push(hook);
		hooksByType.set(hook.hookType, list);
	}

	// Build the hooks object
	const result: HooksJsonFile = { hooks: {} };

	// Collect all hook types (from both compiled and passthrough)
	const allHookTypes = new Set([...hooksByType.keys(), ...Object.keys(passthroughHooks)]);

	for (const hookType of allHookTypes) {
		const entries: HooksJsonEntry[] = [];

		// Add compiled hooks
		const typeHooks = hooksByType.get(hookType) || [];
		for (const hook of typeHooks) {
			const hookId = `${hookType}/${hook.name}`;
			const command = `\${CLAUDE_PLUGIN_ROOT}/${pluginBinaryName} --hook=${hookId}`;

			const entry: HooksJsonEntry = {
				hooks: [{ type: "command", command }],
			};

			// Add matcher for tool-specific hooks
			if (hook.tools && hook.tools.length > 0) {
				entry.matcher = hook.tools.join("|");
			}

			entries.push(entry);
		}

		// Add passthrough hooks
		const passthroughEntries = passthroughHooks[hookType] || [];
		for (const passthrough of passthroughEntries) {
			entries.push({
				matcher: passthrough.matcher,
				hooks: passthrough.hooks,
			});
		}

		if (entries.length > 0) {
			result.hooks[hookType] = entries;
		}
	}

	return result;
}

// =============================================================================
// PLUGIN CONFIG BUILD (for ClaudeBinaryPlugin.build())
// =============================================================================

/**
 * Build a plugin from a ClaudeBinaryPlugin instance.
 *
 * @remarks
 * This function is the bridge between `ClaudeBinaryPlugin.build()` and the
 * underlying build system. It extracts hooks and commands from the plugin
 * configuration and invokes the standard build process.
 *
 * **Build Steps:**
 * 1. Read plugin.json/marketplace.json manifests for name/version
 * 2. Extract hooks, commands, and passthrough entries from plugin.config
 * 3. Resolve file paths for file-based handlers
 * 4. Generate TypeScript entrypoint using generatePipelinePluginEntrypoint()
 * 5. Compile to single-file executable with Bun.build()
 * 6. Generate hooks.json manifest for Claude Code
 * 7. Optionally sync to Claude Code plugins cache
 *
 * @param plugin - The plugin instance (ClaudeBinaryPlugin)
 * @param options - Build configuration options
 * @returns Result of the build operation
 *
 * @example
 * ```ts
 * import plugin from "./plugin.ts";
 * import { buildPluginFromConfig } from "claude-binary-plugin";
 *
 * const result = await buildPluginFromConfig(plugin, {
 *   rootDir: import.meta.dir,
 *   compile: true,
 * });
 * ```
 *
 * @public
 */
export async function buildPluginFromConfig(
	plugin: {
		config: {
			hooks: Partial<Record<PipelineHookEventType, ExtractableHook[]>>;
			commands?: Record<string, ExtractableCommand>;
			hooksOutputPath?: string;
		};
	},
	options: {
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
	} = {},
): Promise<PluginBuildResult> {
	const startTime = performance.now();

	const rootDir = options.rootDir ?? process.cwd();
	const absoluteRootDir = resolve(rootDir);
	const shell = defaultShellExecutor;

	// Read plugin manifest from explicit path or default location
	const pluginPath = options.plugin ?? rootDir;
	const pluginManifest = await readPluginManifest(pluginPath);
	const manifestPluginName = pluginManifest?.name;
	const manifestPluginVersion = pluginManifest?.version ?? "0.0.0";

	// Read marketplace manifest from explicit path or default monorepo location
	const defaultMarketplacePath = resolve(rootDir, "../../.claude-plugin/marketplace.json");
	const marketplacePath = options.marketplace ?? defaultMarketplacePath;
	const marketplaceManifest = await readMarketplaceManifest(marketplacePath);
	const manifestMarketplaceName = marketplaceManifest?.name;

	// Derive plugin identifier for logging
	const pluginIdentifier = manifestPluginName
		? manifestMarketplaceName
			? `${manifestPluginName}@${manifestMarketplaceName}`
			: manifestPluginName
		: "plugin";

	// Derive output name
	const defaultOutputName = manifestPluginName ? `${manifestPluginName}.plugin` : "plugin.plugin";
	const outputName = options.outputName ?? defaultOutputName;
	const outputPath = resolve(absoluteRootDir, outputName);
	const relativeOutput = relative(absoluteRootDir, outputPath);

	// Build options
	const compile = options.compile ?? true;
	const minify = options.minify ?? true;
	const sourcemap = options.sourcemap ?? true;
	const bytecode = options.bytecode ?? false;
	const target = options.target;
	const clean = options.clean ?? true;
	const persistLocal = options.persistLocal ?? false;
	const external = options.external ?? [];

	// Clean existing plugin binary before building
	if (clean) {
		await shell(`rm -f "${outputPath}"`);
	}

	// Extract hooks and commands from plugin config
	const hookEntries = extractPipelineHookEntries(plugin.config);
	const commandEntries = extractPipelineCommandEntries(plugin.config);
	const passthroughHooks = extractPassthroughHookEntries(plugin.config);

	// Resolve file paths for file-based handlers using import.meta.resolve
	const resolvedHooks: PipelineHookEntry[] = hookEntries.map((hook) => {
		if (hook.filePath && !hook.filePath.startsWith("file://") && !hook.filePath.startsWith("/")) {
			// Relative path - resolve from rootDir
			return {
				...hook,
				filePath: resolve(absoluteRootDir, hook.filePath),
			};
		}
		return hook;
	});

	const resolvedCommands: PipelineCommandEntry[] = commandEntries.map((cmd) => {
		if (cmd.filePath && !cmd.filePath.startsWith("file://") && !cmd.filePath.startsWith("/")) {
			// Relative path - resolve from rootDir
			return {
				...cmd,
				filePath: resolve(absoluteRootDir, cmd.filePath),
			};
		}
		return cmd;
	});

	console.log(`\nBuilding plugin: ${pluginIdentifier}`);
	console.log(`  Hooks: ${resolvedHooks.length}`);
	console.log(`  Commands: ${resolvedCommands.length}`);
	console.log(`  Passthrough hooks: ${Object.keys(passthroughHooks).length} types`);

	// Generate entrypoint
	const generatedEntrypointName = ".plugin-entrypoint.ts";
	const entrypointPath = resolve(absoluteRootDir, generatedEntrypointName);
	const relativeEntrypoint = relative(absoluteRootDir, entrypointPath);

	// We need a plugin path for the import - use a relative path from entrypoint
	// This assumes the plugin definition is in a file that exports the plugin
	// For now, we'll create an entrypoint that imports from "./plugin.ts" by default
	const pluginImportPath = "./plugin.ts";

	const entrypointSource = generatePipelinePluginEntrypoint({
		pluginPath: pluginImportPath,
		pluginName: manifestPluginName ?? "plugin",
		pluginVersion: manifestPluginVersion,
		hooks: resolvedHooks,
		pipelineCommands: resolvedCommands,
	});

	console.log(`Generating plugin entrypoint...`);
	await Bun.write(entrypointPath, entrypointSource);

	// Build compile command arguments
	const action = compile ? "Compiling" : "Bundling";
	console.log(`\n${action} unified plugin...`);
	console.log(`Entrypoint: ${relativeEntrypoint} (auto-generated)`);
	console.log(`Output: ${relativeOutput}`);

	const args = ["build", entrypointPath, "--outfile", outputPath];

	if (compile) {
		args.splice(1, 0, "--compile");
	}

	if (minify) {
		args.push("--minify");
	}

	if (sourcemap) {
		args.push("--sourcemap");
	}

	if (bytecode) {
		args.push("--bytecode");
	}

	// When bundling (not compiling), default to bun target unless explicitly set
	const effectiveTarget = target || (!compile ? "bun" : undefined);
	if (effectiveTarget) {
		args.push("--target", effectiveTarget);
	}

	// Add external packages
	for (const pkg of external) {
		args.push("--external", pkg);
	}

	/** Helper to clean up generated entrypoint */
	const cleanGeneratedEntrypoint = async () => {
		await shell(`rm -f "${entrypointPath}"`);
	};

	/** Helper to clean up .bun-build temp files left by bun build --compile */
	const cleanBunBuildTempFiles = async () => {
		const cwd = process.cwd();
		await shell(`rm -f "${cwd}"/.*.bun-build 2>/dev/null || true`);
		if (cwd !== absoluteRootDir) {
			await shell(`rm -f "${absoluteRootDir}"/.*.bun-build 2>/dev/null || true`);
		}
	};

	try {
		const cmd = `bun ${args.join(" ")}`;
		const result = await shell(cmd);

		// Clean up temp files
		if (compile) {
			await cleanBunBuildTempFiles();
		}
		await cleanGeneratedEntrypoint();

		if (result.exitCode !== 0) {
			const duration = performance.now() - startTime;
			const errorMessage = result.stderr;
			const verb = compile ? "compile" : "bundle";
			console.error(`\n✗ Failed to ${verb} plugin`);
			console.error(`  ${errorMessage}`);
			return {
				entrypoint: "(auto-generated)",
				output: relativeOutput,
				success: false,
				error: new Error(errorMessage),
				duration,
			};
		}

		// Generate hooks.json
		const hooksJson = generateHooksJson({
			pluginBinaryName: outputName,
			hooks: resolvedHooks,
			passthroughHooks,
		});

		// Write hooks.json
		const hooksOutputPath = plugin.config.hooksOutputPath ?? "hooks/hooks.json";
		const hooksJsonPath = resolve(absoluteRootDir, hooksOutputPath);

		// Ensure directory exists
		const hooksDir = resolve(hooksJsonPath, "..");
		await shell(`mkdir -p "${hooksDir}"`);

		await Bun.write(hooksJsonPath, JSON.stringify(hooksJson, null, "\t"));
		console.log(`✓ Generated hooks.json: ${relative(absoluteRootDir, hooksJsonPath)}`);

		const duration = performance.now() - startTime;
		const verb = compile ? "compiled" : "bundled";
		console.log(`\n✓ Plugin ${verb} successfully (${duration.toFixed(0)}ms)`);

		// Persist plugin to local cache if enabled
		if (persistLocal) {
			if (!manifestMarketplaceName) {
				console.warn("⚠ persistLocal requires marketplace.json to be present");
			} else {
				await syncPluginToCache({
					rootDir: absoluteRootDir,
					marketplaceName: manifestMarketplaceName,
					shell,
				});
			}
		}

		return {
			entrypoint: "(auto-generated)",
			output: relativeOutput,
			success: true,
			duration,
		};
	} catch (error) {
		const duration = performance.now() - startTime;

		// Clean up temp files even on error
		if (compile) {
			await cleanBunBuildTempFiles();
		}
		await cleanGeneratedEntrypoint();

		const verb = compile ? "compiling" : "bundling";
		console.error(`\n✗ Error ${verb} plugin`);
		console.error(`  ${(error as Error).message}`);

		return {
			entrypoint: "(auto-generated)",
			output: relativeOutput,
			success: false,
			error: error as Error,
			duration,
		};
	}
}

// =============================================================================
// PLUGIN BUILDER NAMESPACE
// =============================================================================

/**
 * Unified namespace for plugin build system operations.
 *
 * @remarks
 * The `PluginBuilder` namespace consolidates all build-related functions into a
 * single, discoverable API. This includes compiling plugins, generating manifests,
 * extracting hook/command definitions, and managing the plugin cache.
 *
 * **Namespace Organization:**
 *
 * | Category | Methods |
 * |----------|---------|
 * | Build | `build`, `fromConfig` |
 * | Code Generation | `generateEntrypoint`, `generateHooksJson` |
 * | Extraction | `extractHookEntries`, `extractCommandEntries`, `extractPassthroughEntries` |
 * | Cache | `getCachePath`, `syncToCache` |
 * | Manifests | `readPluginManifest`, `readMarketplaceManifest` |
 *
 * @example
 * ```typescript
 * import { PluginBuilder } from "claude-binary-plugin";
 *
 * // Build from a ClaudeBinaryPlugin instance
 * const result = await PluginBuilder.fromConfig(plugin, {
 *   rootDir: import.meta.dir,
 *   compile: true,
 *   persistLocal: true,
 * });
 *
 * // Or build with manual entrypoint
 * const result = await PluginBuilder.build({
 *   rootDir: ".",
 *   entrypoint: "./plugin-entry.ts",
 *   outputName: "my-plugin.plugin",
 * });
 *
 * // Generate hooks.json
 * const hooksJson = PluginBuilder.generateHooksJson({
 *   pluginBinaryName: "my-plugin.plugin",
 *   hooks: PluginBuilder.extractHookEntries(plugin.config),
 * });
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export const PluginBuilder = {
	// =========================================================================
	// BUILD OPERATIONS
	// =========================================================================

	/**
	 * Compile a plugin into a single executable.
	 *
	 * @remarks
	 * Creates a single Bun executable that bundles all hooks and commands.
	 * Requires a manual entrypoint file - for auto-generated entrypoints,
	 * use {@link PluginBuilder.fromConfig} instead.
	 *
	 * @param options - Build configuration options
	 * @returns Result of the build operation
	 *
	 * @example
	 * ```typescript
	 * const result = await PluginBuilder.build({
	 *   rootDir: import.meta.dir,
	 *   entrypoint: "./plugin-entry.ts",
	 *   outputName: "my-plugin.plugin",
	 *   compile: true,
	 *   minify: true,
	 * });
	 *
	 * if (result.success) {
	 *   console.log(`Built: ${result.output}`);
	 * }
	 * ```
	 *
	 * @see {@link BuildPluginOptions}
	 * @public
	 */
	build: buildPlugin,

	/**
	 * Build a plugin from a ClaudeBinaryPlugin configuration.
	 *
	 * @remarks
	 * This is the recommended build method. It automatically:
	 * - Reads plugin.json/marketplace.json manifests
	 * - Extracts hooks, commands, and passthrough entries
	 * - Generates the TypeScript entrypoint
	 * - Compiles to a single-file executable
	 * - Generates hooks.json for Claude Code
	 * - Optionally syncs to Claude Code plugins cache
	 *
	 * @param plugin - The plugin instance from ClaudeBinaryPlugin.create()
	 * @param options - Build configuration options
	 * @returns Result of the build operation
	 *
	 * @example
	 * ```typescript
	 * import plugin from "./plugin.ts";
	 *
	 * const result = await PluginBuilder.fromConfig(plugin, {
	 *   rootDir: import.meta.dir,
	 *   compile: true,
	 *   persistLocal: true,
	 * });
	 * ```
	 *
	 * @public
	 */
	fromConfig: buildPluginFromConfig,

	// =========================================================================
	// CODE GENERATION
	// =========================================================================

	/**
	 * Generate TypeScript source code for a pipeline plugin entrypoint.
	 *
	 * @remarks
	 * Creates the entrypoint code that imports the plugin definition and
	 * routes CLI arguments to the correct hook handlers. This is called
	 * automatically by {@link PluginBuilder.fromConfig}.
	 *
	 * @param options - Generation options including plugin path, hooks, commands
	 * @returns Generated TypeScript source code
	 *
	 * @example
	 * ```typescript
	 * const source = PluginBuilder.generateEntrypoint({
	 *   pluginPath: "./plugin.ts",
	 *   pluginName: "my-plugin",
	 *   pluginVersion: "1.0.0",
	 *   hooks: PluginBuilder.extractHookEntries(plugin.config),
	 *   pipelineCommands: PluginBuilder.extractCommandEntries(plugin.config),
	 * });
	 *
	 * await Bun.write(".plugin-entrypoint.ts", source);
	 * ```
	 *
	 * @see {@link GeneratePipelinePluginOptions}
	 * @public
	 */
	generateEntrypoint: generatePipelinePluginEntrypoint,

	/**
	 * Generate hooks.json content from hook entries.
	 *
	 * @remarks
	 * Creates the Claude Code hooks.json format that maps hook event types
	 * to their command handlers. All hooks use `${CLAUDE_PLUGIN_ROOT}` which
	 * Claude Code provides for every hook invocation.
	 *
	 * @param options - Generation options
	 * @returns The hooks.json object structure
	 *
	 * @example
	 * ```typescript
	 * const hooksJson = PluginBuilder.generateHooksJson({
	 *   pluginBinaryName: "my-plugin.plugin",
	 *   hooks: [
	 *     { hookType: "SessionStart", name: "context", isPipeline: true },
	 *     { hookType: "PreToolUse", name: "filter", isPipeline: true, tools: ["Bash"] },
	 *   ],
	 * });
	 *
	 * await Bun.write("hooks.json", JSON.stringify(hooksJson, null, 2));
	 * ```
	 *
	 * @see {@link GenerateHooksJsonOptions}
	 * @see {@link HooksJsonFile}
	 * @public
	 */
	generateHooksJson,

	// =========================================================================
	// EXTRACTION UTILITIES
	// =========================================================================

	/**
	 * Extract pipeline hook entries from a plugin configuration.
	 *
	 * @remarks
	 * Extracts hook definitions that will be compiled into the plugin binary.
	 * Skips passthrough hooks which are handled separately.
	 *
	 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
	 * @returns Array of hook entries ready for code generation
	 *
	 * @example
	 * ```typescript
	 * const hookEntries = PluginBuilder.extractHookEntries(plugin.config);
	 * console.log(`Found ${hookEntries.length} hooks to compile`);
	 * ```
	 *
	 * @see {@link PipelineHookEntry}
	 * @public
	 */
	extractHookEntries: extractPipelineHookEntries,

	/**
	 * Extract pipeline command entries from a plugin configuration.
	 *
	 * @remarks
	 * Extracts command definitions that will be compiled into the plugin binary.
	 *
	 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
	 * @returns Array of command entries ready for code generation
	 *
	 * @example
	 * ```typescript
	 * const commandEntries = PluginBuilder.extractCommandEntries(plugin.config);
	 * console.log(`Found ${commandEntries.length} commands to compile`);
	 * ```
	 *
	 * @see {@link PipelineCommandEntry}
	 * @public
	 */
	extractCommandEntries: extractPipelineCommandEntries,

	/**
	 * Extract passthrough hook entries from a plugin configuration.
	 *
	 * @remarks
	 * Passthrough entries are raw hooks.json entries that get included directly
	 * without compilation into the binary. Useful for mixing compiled hooks
	 * with external scripts.
	 *
	 * @param config - The plugin configuration from ClaudeBinaryPlugin.create()
	 * @returns Object mapping hook types to their passthrough entries
	 *
	 * @example
	 * ```typescript
	 * const passthrough = PluginBuilder.extractPassthroughEntries(plugin.config);
	 * // passthrough.PreToolUse might contain external script hooks
	 * ```
	 *
	 * @see {@link ExtractedPassthroughHooks}
	 * @public
	 */
	extractPassthroughEntries: extractPassthroughHookEntries,

	// =========================================================================
	// CACHE OPERATIONS
	// =========================================================================

	/**
	 * Get the cache path(s) for a plugin.
	 *
	 * @remarks
	 * Reads plugin.json and returns the cache path where the plugin would
	 * be persisted. The path is constructed as:
	 * `${CLAUDE_CONFIG_DIR}/plugins/cache/${marketplaceName}/${pluginName}/${version}`
	 *
	 * @param config - Configuration for determining cache path
	 * @returns Array of cache paths
	 *
	 * @example
	 * ```typescript
	 * const paths = await PluginBuilder.getCachePath({
	 *   rootDir: import.meta.dir,
	 *   marketplaceName: "my-marketplace",
	 *   shell: PluginBuilder.defaultShellExecutor,
	 * });
	 * console.log(`Cache path: ${paths[0]}`);
	 * ```
	 *
	 * @see {@link PersistLocalConfig}
	 * @public
	 */
	getCachePath: getPluginCachePath,

	/**
	 * Sync a plugin directory to Claude's local cache.
	 *
	 * @remarks
	 * Clears the existing cache and copies all plugin files to the cache
	 * directory. This enables immediate testing of plugin changes without
	 * reinstalling from the marketplace.
	 *
	 * @param config - Configuration for syncing
	 * @returns true if successful, false otherwise
	 *
	 * @example
	 * ```typescript
	 * await PluginBuilder.syncToCache({
	 *   rootDir: import.meta.dir,
	 *   marketplaceName: "my-marketplace",
	 *   shell: PluginBuilder.defaultShellExecutor,
	 * });
	 * ```
	 *
	 * @see {@link PersistLocalConfig}
	 * @public
	 */
	syncToCache: syncPluginToCache,

	// =========================================================================
	// MANIFEST READING
	// =========================================================================

	/**
	 * Read a plugin.json manifest.
	 *
	 * @remarks
	 * Reads the plugin manifest from the given path or from the default
	 * `.claude-plugin/plugin.json` location within a directory.
	 *
	 * @param pluginPath - Path to plugin.json or directory containing it
	 * @returns Plugin manifest or null if not found
	 *
	 * @example
	 * ```typescript
	 * const manifest = await PluginBuilder.readPluginManifest(import.meta.dir);
	 * if (manifest) {
	 *   console.log(`Plugin: ${manifest.name} v${manifest.version}`);
	 * }
	 * ```
	 *
	 * @see {@link PluginManifest}
	 * @public
	 */
	readPluginManifest,

	/**
	 * Read a marketplace.json manifest.
	 *
	 * @remarks
	 * Reads the marketplace manifest from the given path or from the default
	 * `.claude-plugin/marketplace.json` location within a directory.
	 *
	 * @param marketplacePath - Path to marketplace.json or directory containing it
	 * @returns Marketplace manifest or null if not found
	 *
	 * @example
	 * ```typescript
	 * const manifest = await PluginBuilder.readMarketplaceManifest("../../");
	 * if (manifest) {
	 *   console.log(`Marketplace: ${manifest.name}`);
	 * }
	 * ```
	 *
	 * @see {@link MarketplaceManifest}
	 * @public
	 */
	readMarketplaceManifest,

	// =========================================================================
	// UTILITIES
	// =========================================================================

	/**
	 * Default shell executor using Bun.$.
	 *
	 * @remarks
	 * Executes shell commands quietly with nothrow to capture all output.
	 * Inject a mock executor for testing.
	 *
	 * @example
	 * ```typescript
	 * const result = await PluginBuilder.defaultShellExecutor("ls -la");
	 * console.log(result.stdout);
	 * ```
	 *
	 * @see {@link ShellExecutor}
	 * @public
	 */
	defaultShellExecutor,
} as const;
