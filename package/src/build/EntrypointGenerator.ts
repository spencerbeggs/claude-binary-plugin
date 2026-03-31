/**
 * Function to generate the TypeScript entrypoint code for pipeline plugins.
 *
 * @remarks
 * Generates a complete TypeScript source file that serves as the compiled
 * plugin's main entry point. The generated code handles CLI argument parsing,
 * hook dispatch, command routing, and sidecar mode.
 *
 * @internal
 */
import type { GeneratePipelinePluginOptions, PipelineHookEntry } from "./builder.js";

/**
 * Generates the TypeScript source code for a pipeline-based plugin entrypoint.
 *
 * The generated code imports the plugin definition and uses the pipeline-runtime
 * module to execute hooks with proper Effect Schema validation.
 *
 * @param options - Generation options
 * @returns Generated TypeScript source code
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
      return PipelineRuntime.run({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        pipeline: ${fileHookImport},
        stateClass: EnvClass,
        tools: ${toolsArg},
        optionsSchema: pluginConfig.options,
        stateSchema: StateSchema,
        setup: pluginConfig.setup,
        handlerLayer: PipelineLive,
      });
    }`);
				} else {
					// Inline pipeline hook
					hookCases.push(`    case "${hookKey}": {
      const hookDef = pluginConfig.hooks.${hookType}?.find(h => h.name === "${hook.name}");
      if (!hookDef || !("pipeline" in hookDef)) throw new Error("Hook not found: ${hook.name}");
      return PipelineRuntime.run({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        pipeline: hookDef.pipeline,
        stateClass: EnvClass,
        tools: ${toolsArg},
        optionsSchema: pluginConfig.options,
        stateSchema: StateSchema,
        setup: pluginConfig.setup,
        handlerLayer: PipelineLive,
      });
    }`);
				}
			} else {
				if (fileHookImport) {
					// File-based handler hook
					hookCases.push(`    case "${hookKey}": {
      return PipelineRuntime.runRaw({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: ${fileHookImport},
        stateClass: EnvClass,
      });
    }`);
				} else {
					// Inline handler hook
					hookCases.push(`    case "${hookKey}": {
      const hookDef = pluginConfig.hooks.${hookType}?.find(h => h.name === "${hook.name}");
      if (!hookDef || !("handler" in hookDef)) throw new Error("Hook not found: ${hook.name}");
      return PipelineRuntime.runRaw({
        hookType: "${hookType}",
        hookName: "${hook.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: hookDef.handler,
        stateClass: EnvClass,
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
			const argsSchemaAccess = c.hasArgsSchema ? `pluginConfig.commands["${c.name}"].args` : "Commands.emptySchema";
			return `    case "${c.name}": {
      return Commands.run({
        commandName: "${c.name}",
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        handler: ${importName},
        rawArgs: cmdArgs,
        argsSchema: ${argsSchemaAccess},
        stateClass: EnvClass,
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
	const commandRuntimeImport = hasPipelineCmds ? `import { Commands } from "claude-binary-plugin";` : "";

	return `#!/usr/bin/env bun
/**
 * Auto-generated Pipeline Plugin Entrypoint
 *
 * This file is generated by buildPipelinePlugin() and should not be edited manually.
 * To modify hooks or commands, update the ClaudeBinaryPlugin.create() configuration.
 */

import { parseArgs } from "node:util";
import pluginDefinition from "${pluginPath}";
import { PipelineLive, PipelineRuntime, PluginEnv, PluginInfo } from "claude-binary-plugin";
${commandRuntimeImport}
${fileHookImports.length > 0 ? fileHookImports.join("\n") : ""}
${commandImports.length > 0 ? commandImports.join("\n") : ""}

// Plugin metadata - compiled constants, not env vars
const PLUGIN_NAME = "${pluginName}";
const PLUGIN_VERSION = "${pluginVersion}";

// Extract config from plugin definition
const pluginConfig = pluginDefinition.config;

// Create environment class from plugin options schema (with pluginName for logging)
const EnvClass = PluginEnv.create(pluginConfig.prefix, pluginConfig.options, PLUGIN_NAME);

// State schema for typed decode/encode (undefined if plugin doesn't define state)
// Note: Assigned to a module-level variable and used in a side-effect to prevent
// Bun's bundler from tree-shaking the Schema.Class constructor and its methods.
const StateSchema = pluginConfig.state;
if (StateSchema) Object.defineProperty(globalThis, "__PLUGIN_STATE_SCHEMA__", { value: StateSchema });

// Sidecar main function - dynamically imported only when needed
async function runSidecar(): Promise<void> {
  const { Sidecar } = await import("claude-binary-plugin");
  Sidecar.main();
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
  PluginInfo.set({ name: PLUGIN_NAME, version: PLUGIN_VERSION });

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
      await PipelineRuntime.handleUnknown(hookKey, validHooks);
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
