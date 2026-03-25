# Build API

## Overview

The CLI has been removed. Building plugins is now done programmatically via
`ClaudeBinaryPlugin.build()`. Plugin authors create a `plugin.build.ts` script
in their project and run it directly with Bun.

## Programmatic Build Entry Point

```typescript
ClaudeBinaryPlugin.build(plugin, options)
```

**Parameters:**

- `plugin` — the plugin instance returned by `ClaudeBinaryPlugin.create()`
- `options` — `PluginBuildOptions` (all fields optional)

**Returns:** `Promise<PluginBuildResult>`

## PluginBuildOptions

Key fields:

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `rootDir` | `string` | `process.cwd()` | Root directory for the plugin (entrypoint and output location) |
| `compile` | `boolean` | `true` | Compile to single-file binary |
| `hooksJson` | `boolean` | `true` | Generate `hooks.json` manifest |
| `commands` | `boolean` | `true` | Include CLI commands in build |
| `clean` | `boolean` | `true` | Remove existing binary before building |
| `persistLocal` | `boolean` | `false` | Sync to Claude Code plugins cache after build |
| `target` | `string` | platform default | Bun compile target triple |
| `bytecode` | `boolean` | `false` | Emit bytecode for faster startup |

## Example: plugin.build.ts

```typescript
import plugin from "./plugin.config.ts";
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

await ClaudeBinaryPlugin.build(plugin, { rootDir: import.meta.dir });
```

Run with:

```bash
bun run plugin.build.ts
```

## Build Artifacts

The build produces:

1. `{name}.plugin` — compiled single-file Bun binary
2. `hooks.json` — Claude Code hook manifest
3. `sidecar.js` — OTEL sidecar (if OTEL is enabled)

## Implementation

`ClaudeBinaryPlugin.build()` uses a dynamic import of `src/build/builder.ts`
so that the build system is tree-shaken from the runtime binary.

- `src/build/builder.ts` — `PluginBuilder` orchestration class
- `src/build/HookExtractor.ts` — extracts hook entries from config
- `src/build/CommandExtractor.ts` — extracts command entries
- `src/build/EntrypointGenerator.ts` — generates TypeScript entrypoint
- `src/build/ManifestGenerator.ts` — generates hooks.json
- `src/build/ProxyTemplate.ts` — dev mode proxy script
