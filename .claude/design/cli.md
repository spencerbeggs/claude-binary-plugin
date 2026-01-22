---
status: current
module: claude-binary-plugin
category: documentation
created: 2026-01-22
updated: 2026-01-22
last-synced: 2026-01-22
completeness: 80
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

Output location is determined by:

- Plugin name from `.claude-plugin/plugin.json` manifest
- Falls back to prefix-derived name if no manifest exists

## Planned Features

Before 1.0.0 release:

- **Scaffolding** - `claude-binary-plugin init` to scaffold new plugins
- **Marketplace scaffolding** - Templates for plugin marketplace repos

## Related Documentation

- `architecture.md` - Build system internals
- `testing.md` - Testing utilities
