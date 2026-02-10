---
status: current
module: claude-binary-plugin
category: documentation
created: 2026-01-22
updated: 2026-02-10
last-synced: 2026-02-10
completeness: 90
related:
  - .claude/design/architecture.md
  - .claude/design/testing.md
dependencies: []
---

# CLI

The `claude-binary-plugin` package includes a CLI binary for building
plugins with zero configuration.

## Overview

The CLI provides a zero-configuration build tool for compiling Claude Code
plugins into single-file Bun executables. It handles entrypoint generation,
bundling, bytecode compilation, and manifest generation automatically.

## Installation

The CLI is available after installing the package:

```bash
bun add claude-binary-plugin
```

## Usage

```bash
claude-binary-plugin build [plugin-config-path] [options]
```

### Default Behavior

When run without arguments, the CLI looks for `plugin.config.ts` in the
current directory:

```bash
claude-binary-plugin build
```

This is equivalent to:

```bash
claude-binary-plugin build plugin.config.ts
```

### Custom Config Path

Specify a custom config file path:

```bash
claude-binary-plugin build ./src/my-plugin.config.ts
```

### Options

| Option | Description |
| ------ | ----------- |
| `--no-persist` | Don't persist to local Claude Code plugins cache |
| `--no-bytecode` | Don't compile to bytecode (faster builds) |
| `--bundle` | Bundle to JS instead of compiling to binary |
| `--help` | Show help information |
| `--version` | Show CLI version |

## Plugin Config File

The config file must export a default `ClaudeBinaryPlugin.create()` result:

```typescript
// plugin.config.ts
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),
  hooks: {
    SessionStart: [{
      name: "context",
      pipeline: "./hooks/context.hook.ts",
    }],
  },
});

export default plugin;
```

## Build Output

The CLI produces:

1. **Plugin binary** - Single-file Bun executable (e.g., `my-plugin.plugin`)
2. **hooks.json** - Manifest file for Claude Code hook discovery
3. **Generated entrypoint** - Temporary `.plugin-entrypoint.ts` (cleaned
   up after build)

Output location is determined by:

- Plugin name from `.claude-plugin/plugin.json` manifest
- Falls back to prefix-derived name if no manifest exists

### Build Options Explained

| Option | Effect |
| ------ | ------ |
| `--no-persist` | Skips copying the built binary to the local Claude Code plugins cache. Useful for CI builds or when deploying to a custom location. |
| `--no-bytecode` | Disables bytecode compilation, producing a larger but faster-to-build binary. Useful during development iteration. |
| `--bundle` | Outputs bundled JavaScript instead of a compiled Bun executable. Useful for debugging the generated code. |

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Build completed successfully |
| 1 | Build failed (missing config, invalid plugin definition, compilation error) |

The CLI uses `@effect/cli` for command parsing. Invalid arguments or
`--help`/`--version` flags are handled automatically by the framework.

## Troubleshooting

### Plugin file not found

```text
Error: Plugin file not found: /path/to/plugin.config.ts
```

The CLI resolves the config path relative to `process.cwd()`. Ensure
you are running the command from the correct directory, or provide an
explicit path.

### Invalid plugin definition

```text
Plugin file must export a default ClaudeBinaryPlugin.create() result
```

The config file must have a default export created by
`ClaudeBinaryPlugin.create()`. Verify:

- The file exports a `default` (not a named export)
- The export is the result of `ClaudeBinaryPlugin.create()`, not the
  config object itself

### Build compilation errors

Compilation errors from `Bun.build()` are printed to stderr. Common
causes include:

- Missing dependencies (run `bun install`)
- TypeScript errors in hook handler files
- Circular imports in the plugin code

## Planned Features

Before 1.0.0 release:

- **Scaffolding** - `claude-binary-plugin init` to scaffold new plugins
- **Marketplace scaffolding** - Templates for plugin marketplace repos

## Implementation

The CLI is implemented in `src/cli/index.ts` using `@effect/cli` for
argument parsing. It delegates to `PluginBuilder` in
`src/build/builder.ts` for the actual build process.

The package version is resolved via `src/cli/macros.ts`, which imports
`package.json` at bundle time.

## Related Documentation

- `architecture.md` - Build system internals
- `testing.md` - Testing utilities
