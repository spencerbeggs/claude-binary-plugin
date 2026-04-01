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

			if (fileHookImport) {
				// File-based pipeline hook
				hookCases.push(`    case "${hookKey}": {
      program = Effect.gen(function* () {
        const runtime = yield* PipelineRuntimeService;
        return yield* runtime.run({
          hookType: "${hookType}",
          hookName: "${hook.name}",
          pluginName: PLUGIN_NAME,
          pluginVersion: PLUGIN_VERSION,
          handler: ${fileHookImport},
          stateClass: EnvClass,
          tools: ${toolsArg},
          optionsSchema: PluginConfigClass.options,
          stateSchema: StateSchema,
          setup: PluginConfigClass.setup,
          handlerLayer: PipelineLive,
        });
      });
      break;
    }`);
			} else {
				// Inline pipeline hook
				hookCases.push(`    case "${hookKey}": {
      const hookDef = configInstance.hooks.${hookType}?.find(h => h.name === "${hook.name}");
      if (!hookDef || !("handler" in hookDef)) throw new Error("Hook not found: ${hook.name}");
      program = Effect.gen(function* () {
        const runtime = yield* PipelineRuntimeService;
        return yield* runtime.run({
          hookType: "${hookType}",
          hookName: "${hook.name}",
          pluginName: PLUGIN_NAME,
          pluginVersion: PLUGIN_VERSION,
          handler: hookDef.handler,
          stateClass: EnvClass,
          tools: ${toolsArg},
          optionsSchema: PluginConfigClass.options,
          stateSchema: StateSchema,
          setup: PluginConfigClass.setup,
          handlerLayer: PipelineLive,
        });
      });
      break;
    }`);
			}
		}
	}

	// Generate command cases
	const commandCases = pipelineCommands
		.map((c) => {
			const importName = commandImportMap.get(c.name);
			const argsSchemaAccess = c.hasArgsSchema ? `configInstance.commands["${c.name}"].args` : "Schema.Struct({})";
			return `    case "${c.name}": {
      program = Effect.gen(function* () {
        const runner = yield* CommandRunner;
        return yield* runner.run({
          commandName: "${c.name}",
          pluginName: PLUGIN_NAME,
          pluginVersion: PLUGIN_VERSION,
          handler: ${importName},
          rawArgs: cmdArgs,
          argsSchema: ${argsSchemaAccess},
          stateClass: EnvClass,
        });
      });
      break;
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
	const commandRunnerImports = hasPipelineCmds
		? `import { CommandRunner, CommandRunnerLive } from "claude-binary-plugin";
import type { CommandOutput } from "claude-binary-plugin";`
		: "";
	const schemaImport = hasPipelineCmds
		? `import { Effect, Layer, Schema } from "effect";`
		: `import { Effect, Layer } from "effect";`;
	const runtimeLayerLine = hasPipelineCmds
		? `const RuntimeLayer = Layer.merge(PipelineRuntimeServiceLive, CommandRunnerLive);`
		: `const RuntimeLayer = PipelineRuntimeServiceLive;`;

	return `#!/usr/bin/env bun
/**
 * Auto-generated Pipeline Plugin Entrypoint
 *
 * This file is generated by buildPipelinePlugin() and should not be edited manually.
 * To modify hooks or commands, update the ClaudeBinaryPlugin.create() configuration.
 */

import { parseArgs } from "node:util";
${schemaImport}
import PluginConfigClass from "${pluginPath}";
import { PipelineLive, PipelineRuntimeService, PipelineRuntimeServiceLive, PluginEnv, PluginInfoService } from "claude-binary-plugin";
import type { RunResult } from "claude-binary-plugin";
${commandRunnerImports}
${fileHookImports.length > 0 ? fileHookImports.join("\n") : ""}
${commandImports.length > 0 ? commandImports.join("\n") : ""}

// Plugin metadata - compiled constants, not env vars
const PLUGIN_NAME = "${pluginName}";
const PLUGIN_VERSION = "${pluginVersion}";

// Read statics from the config class — they survive Bun tree-shaking
const configInstance = new PluginConfigClass();
const EnvClass = PluginEnv.create(configInstance.prefix, PluginConfigClass.options, PLUGIN_NAME);
const StateSchema = PluginConfigClass.state;

${runtimeLayerLine}

// Sidecar main function - dynamically imported only when needed
async function runSidecar(): Promise<void> {
  const { Sidecar } = await import("claude-binary-plugin");
  Sidecar.main();
}

const validHooks = [${validHooksArray}];
const validCommands = [${validCommandsArray}];

async function runHook(hookKey: string): Promise<void> {
  let program: Effect.Effect<RunResult, any, PipelineRuntimeService>;

  switch (hookKey) {
${hookCases.join("\n")}
    default:
      throw new Error(\`Unknown hook: \${hookKey}\`);
  }

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const pluginInfoService = yield* PluginInfoService;
      yield* pluginInfoService.set({ name: PLUGIN_NAME, version: PLUGIN_VERSION });
      return yield* program;
    }).pipe(Effect.provide(RuntimeLayer))
  );
  process.stdout.write(JSON.stringify(result.response));
}

async function runCommand(name: string, cmdArgs: string[]): Promise<void> {
  let program: Effect.Effect<CommandOutput, any, CommandRunner>;

  switch (name) {
${commandCases}
    default:
      throw new Error(\`Unknown command: \${name}\`);
  }

  const result = await Effect.runPromise(
    program.pipe(Effect.provide(RuntimeLayer))
  );
  console.log(result.output);
  process.exit(result.exitCode);
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
      // Consume stdin to avoid hanging
      await Bun.stdin.text();
      process.stderr.write(\`Unknown hook: \${hookKey}. Valid hooks: \${validHooks.join(", ")}\\n\`);
      process.exit(2);
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
  const response = {
    error: true,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(2);
});
`;
}
