# Build System

## Overview

The SDK's build system compiles plugin configurations into single-file Bun
executables with accompanying `hooks.json` manifests. The CLI was removed;
the build is now purely programmatic via `PluginBuilder`.

## Entry Point

`PluginBuilder.fromConfig(plugin, options)` is the recommended build API:

```typescript
import { ClaudeBinaryPlugin, PluginBuilder } from "claude-binary-plugin";

const plugin = ClaudeBinaryPlugin.create({ ... });

const result = await PluginBuilder.fromConfig(plugin, {
  rootDir: ".",
  compile: true,
  minify: true,
});
```

## Build Pipeline Steps

1. **Extract hooks** (`HookExtractor`) -- Iterates plugin config's `hooks` map,
   separating pipeline hooks (have `name` + `pipeline` path) from passthrough
   hooks (raw `hooks.json` entries forwarded directly).

2. **Extract commands** (`CommandExtractor`) -- Iterates plugin config's `commands`
   map, extracting command name, description, file path, and args schema presence.

3. **Generate entrypoint** (`EntrypointGenerator`) -- Generates a TypeScript
   source file that imports the plugin definition and dispatches based on CLI
   arguments. Handles hook type routing, command routing, and `--sidecar` mode.

4. **Compile** -- Runs `Bun.build()` to compile the generated entrypoint into a
   single-file executable. Supports cross-compilation via `target` option.

5. **Generate hooks.json** (`ManifestGenerator`) -- Creates the `hooks.json`
   manifest that Claude Code reads. Maps hook event types to command strings
   using `${CLAUDE_PLUGIN_ROOT}` for portable paths. Merges passthrough entries.

6. **Generate proxy** (`ProxyTemplate`) -- Creates a shell proxy script for
   just-in-time compilation. The proxy checks for the binary, runs
   `bun install` + build if missing, then execs to the binary.

## Build Options

```typescript
interface BuildPluginOptions {
  rootDir?: string;       // Plugin root directory
  plugin?: string;        // Path to plugin config file
  marketplace?: string;   // Marketplace manifest path
  outputName?: string;    // Output binary name
  compile?: boolean;      // Whether to compile (default: true)
  minify?: boolean;       // Minify output
  sourcemap?: boolean;    // Include source maps
  bytecode?: boolean;     // Emit bytecode
  target?: string;        // Cross-compilation target
  clean?: boolean;        // Clean output directory first
  persistLocal?: boolean; // Write local config
  external?: string[];    // External packages
}
```

## Build Artifacts

| Artifact | Description |
| ---------- | ------------- |
 | `{name}.plugin` | Compiled Bun single-file executable |
| `hooks.json` | Hook manifest for Claude Code |
| `setup-proxy.sh` | Shell proxy for JIT compilation |
| `sidecar.js` | OTEL sidecar script (if telemetry enabled) |

## Module Decomposition

The build system is decomposed into focused modules:

| Module | File | Purpose |
| -------- | ------ | --------- |
 | `PluginBuilder` | `build/builder.ts` | Public facade (static class) |
| `HookExtractor` | `build/HookExtractor.ts` | Extract pipeline and passthrough hook entries |
| `CommandExtractor` | `build/CommandExtractor.ts` | Extract command entries |
| `EntrypointGenerator` | `build/EntrypointGenerator.ts` | Generate TypeScript entrypoint source |
| `ManifestGenerator` | `build/ManifestGenerator.ts` | Generate hooks.json content |
| `ProxyTemplate` | `build/ProxyTemplate.ts` | Generate setup proxy shell script |

## Consumer Pattern

Plugins define a build script (e.g., `plugin/plugin.build.ts`):

```typescript
import { ClaudeBinaryPlugin, PluginBuilder } from "claude-binary-plugin";
import plugin from "./plugin.config.js";

await PluginBuilder.fromConfig(plugin, {
  rootDir: import.meta.dir,
  compile: true,
  minify: true,
});
```

Run with `bun run build` (configured in the plugin's `package.json`).

## Effect Service

`PluginBuilderService` wraps the build system as an Effect service for use
in Effect programs. `PluginBuilderLive` delegates to `PluginBuilder` static
methods; `makePluginBuilderTest()` provides mock build results for testing.

## Generated Entrypoint Structure

The generated entrypoint code:

1. Parses CLI args to determine mode (hook, command, or sidecar)
2. For hooks: reads `--hook-type` and `--hook-name` args, dispatches to
   `PipelineRuntime.run()` with the correct handler
3. For commands: reads `--command` arg, dispatches to `Commands.run()`
4. For sidecar: calls `Sidecar.main()` to start the OTEL sidecar process
