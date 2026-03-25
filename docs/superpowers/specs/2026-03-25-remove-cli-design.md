# Remove CLI Design

## Overview

Remove the `@effect/cli`-based CLI command system and make
`ClaudeBinaryPlugin.build()` the sole build entry point. Plugin
authors write a `plugin.build.ts` script that calls the build API
directly with `bun run`.

## Goals

- Remove `@effect/cli` dependency and CLI infrastructure
- Simplify the build workflow to a single function call
- Fix the hardcoded import path bug in `buildPluginFromConfig()`
- Preserve all existing build functionality and artifacts

## Current State

The CLI (`src/cli/index.ts`) defines a single `build` subcommand
using `@effect/cli`. It:

1. Imports the plugin config file (dynamic `import()`)
2. Reads the plugin manifest (`.claude-plugin/plugin.json`)
3. Extracts hook/command entries
4. Generates a temporary `.plugin-entrypoint.ts`
5. Compiles with `bun build --compile`
6. Generates `hooks.json` and `scripts/setup-proxy.sh`
7. Cleans up

This same logic already exists in the programmatic API:
`ClaudeBinaryPlugin.build()` delegates to
`PluginBuilder.fromConfig()` → `buildPluginFromConfig()`.

The CLI is a thin wrapper adding `@effect/cli` arg parsing for a
single command. The dependency cost outweighs the value.

## Design

### Plugin Author Workflow

Two files:

```typescript
// plugin.config.ts — defines the plugin
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

export default ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  hooks: { ... },
});
```

```typescript
// plugin.build.ts — runs the build
import plugin from "./plugin.config.ts";

await ClaudeBinaryPlugin.build(plugin, {
  rootDir: import.meta.dir,
});
```

Build with: `bun run plugin.build.ts`

### Build Options

The `ClaudeBinaryPlugin.build()` options object (already exists as
`PluginBuildOptions` in `config.ts`):

```typescript
interface PluginBuildOptions {
  rootDir: string;
  compile?: boolean;      // default true
  bytecode?: boolean;     // default true
  bundle?: boolean;       // default false (JS output only)
  persistLocal?: boolean; // persist .local.md config
  quiet?: boolean;        // suppress non-error output
}
```

These match the current CLI flags. Plugin authors set them in code.

### Bug Fix: Hardcoded Import Path

`buildPluginFromConfig()` in `builder.ts` hardcodes
`pluginImportPath = "./plugin.ts"` when generating the entrypoint.
This should use the actual config file path relative to `rootDir`,
or accept it as a parameter.

Fix: Add an optional `configPath` to `PluginBuildOptions` that
defaults to `"./plugin.config.ts"`. The entrypoint generator uses
this as the import path.

## File Disposition

### Deleted Files

| File | Lines | Reason |
| ---- | ----- | ------ |
| `src/cli/index.ts` | ~150 | CLI command definitions |
| `src/cli/macros.ts` | ~15 | Version injection macro |
| `__tests__/cli/index.test.ts` | ~200 | CLI integration tests |
| `__tests__/cli/macros.test.ts` | ~30 | Macro tests |

### Modified Files

| File | Change |
| ---- | ------ |
| `src/build/builder.ts` | Fix hardcoded import path in `buildPluginFromConfig()` |
| `src/plugin/config.ts` | Add `configPath` to `PluginBuildOptions` |
| `src/index.ts` | Remove CLI-related exports (if any) |
| `package.json` | Remove `@effect/cli` dependency, remove `bin` entry |

### Unchanged Files

| File | Reason |
| ---- | ------ |
| `src/build/EntrypointGenerator.ts` | Generates entrypoint from hook entries (no CLI dependency) |
| `src/build/HookExtractor.ts` | Extracts hook definitions (no CLI dependency) |
| `src/build/ManifestGenerator.ts` | Generates hooks.json (no CLI dependency) |
| `src/build/ProxyTemplate.ts` | Generates setup-proxy.sh (no CLI dependency) |
| `src/build/CommandExtractor.ts` | Extracts command definitions (no CLI dependency) |

## Dependencies Removed

- `@effect/cli` — CLI framework (the sole consumer)

## Dependencies Kept

- `@effect/platform` — used by `PlatformLogger.toFile` in PluginLoggerLive
- `@effect/platform-bun` — used by `BunFileSystem.layer` in PluginLoggerLive and SidecarLoggerLive
- `effect` — core runtime

## Migration Notes

- No external users yet (pre-1.0) — clean removal, no deprecation
- Plugin authors who used the CLI switch to `bun run plugin.build.ts`
- All build artifacts (binary, hooks.json, proxy script) unchanged
- Net change: ~400 lines deleted
