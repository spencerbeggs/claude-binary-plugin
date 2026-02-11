---
status: current
module: claude-binary-plugin
category: documentation
created: 2026-01-22
updated: 2026-02-10
last-synced: 2026-02-10
completeness: 95
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

## Commands

### build

```bash
claude-binary-plugin build [plugin-config-path] [options]
```

#### Default Behavior

When run without arguments, the CLI looks for `plugin.config.ts` in
the current directory:

```bash
claude-binary-plugin build
```

This is equivalent to:

```bash
claude-binary-plugin build plugin.config.ts
```

#### Custom Config Path

Specify a custom config file path:

```bash
claude-binary-plugin build ./src/my-plugin.config.ts
```

#### Build Options

| Option | Description |
| ------ | ----------- |
| `--no-persist` | Don't persist to local Claude Code plugins cache |
| `--no-bytecode` | Don't compile to bytecode (faster builds) |
| `--bundle` | Bundle to JS instead of compiling to binary |
| `--quiet` | Suppress all non-error output; skip proxy/hooks.json generation |
| `--help` | Show help information |
| `--version` | Show CLI version |

### init

```bash
claude-binary-plugin init [directory] [options]
```

Scaffolds a new plugin project with all files, configuration, and
boilerplate needed to build and distribute a Claude Code plugin.

#### Modes

**Interactive (default)** - When invoked without flags (or with only
a target directory), the command launches an interactive wizard using
`@clack/prompts` that walks through project configuration
step-by-step.

**Programmatic** - All options can be passed as CLI flags. When all
required options are provided, the wizard is bypassed entirely. Use
`--yes` to accept defaults for any unspecified options.

#### Arguments

| Argument | Description | Default |
| -------- | ----------- | ------- |
| `directory` | Target directory | Current directory name |

#### Options

| Option | Type | Description |
| ------ | ---- | ----------- |
| `--name` | `string` | Project name (kebab-case) |
| `--type` | `string` | `plugin` or `marketplace` |
| `--prefix` | `string` | Env var prefix (SCREAMING_SNAKE) |
| `--description` | `string` | Plugin description |
| `--hooks` | `string[]` | Hook types to include |
| `--commands` | `boolean` | Include example command |
| `--otel` | `boolean` | Include OTEL telemetry setup |
| `--git` | `boolean` | Initialize git repository |
| `--install` | `boolean` | Run `bun install` after scaffold |
| `--yes`/`-y` | `boolean` | Accept all defaults |

**Defaults:** `--hooks` defaults to `SessionStart,PreToolUse`.
`--commands`, `--git`, and `--install` default to `true`.
`--otel` defaults to `false`. `--name` derives from directory.

#### Init Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Scaffold completed successfully |
| 1 | Scaffold failed (invalid options, write error) |

#### Examples

```bash
# Interactive wizard
claude-binary-plugin init my-plugin

# Quick scaffold with defaults
claude-binary-plugin init my-plugin --yes

# Full programmatic scaffold
claude-binary-plugin init my-plugin \
  --type=plugin \
  --prefix=MY_PLUGIN \
  --hooks=SessionStart,PreToolUse,PostToolUse \
  --commands \
  --otel

# Marketplace scaffold
claude-binary-plugin init my-marketplace \
  --type=marketplace
```

See `scaffold.md` for detailed template contents, interactive flow,
and implementation architecture.

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
2. **Proxy script** - Bash wrapper for just-in-time compilation
   (`scripts/setup-proxy.sh`)
3. **hooks.json** - Manifest file for Claude Code hook discovery
4. **Generated entrypoint** - Temporary `.plugin-entrypoint.ts` (cleaned
   up after build)

Output location is determined by:

- Plugin name from `.claude-plugin/plugin.json` manifest
- Falls back to prefix-derived name if no manifest exists

### Post-Compilation Steps

After the binary is compiled, the build command performs two additional
steps (unless `--quiet` is set):

1. **Generate proxy script** - Creates `scripts/setup-proxy.sh`, a bash
   script that wraps SessionStart hooks with just-in-time compilation
   support. This enables cross-platform distribution by building the
   binary on the target machine if it does not exist.

2. **Generate hooks.json** - Creates the hook manifest with SessionStart
   hooks routed through the proxy script and all other hooks pointing
   directly at the compiled binary. This ensures the proxy triggers
   on-demand builds while non-SessionStart hooks have zero overhead.

If no SessionStart hooks are defined in the plugin configuration, the
build emits a warning since the proxy will never trigger.

### Build Options Explained

**`--no-persist`** - Skips copying the built binary to the local
Claude Code plugins cache. Useful for CI builds or when deploying
to a custom location.

**`--no-bytecode`** - Disables bytecode compilation, producing a
larger but faster-to-build binary. Useful during development
iteration.

**`--bundle`** - Outputs bundled JavaScript instead of a compiled
Bun executable. Useful for debugging the generated code.

**`--quiet`** - Suppresses all non-error output and skips proxy
script and hooks.json generation. This flag is used internally by
the proxy script during on-demand builds to prevent
self-modification of the running proxy (see architecture.md for
details).

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Build completed successfully |
| 1 | Build failed (config, compilation error) |

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

## Distribution Workflow

The build command supports a cross-platform distribution workflow where
source code is committed to a repository and the binary is built on
each target machine at first use.

### Recommended .gitignore

```text
# Plugin binary (platform-specific, built on each machine)
*.plugin

# Dependencies (installed on each machine)
node_modules/

# Build artifacts
.plugin-entrypoint.ts
.build-lock/
```

### What to Commit

```text
plugin.config.ts          # Plugin definition
hooks/hooks.json          # Hook manifest (with proxy routing)
scripts/setup-proxy.sh    # Proxy script for on-demand builds
bun.lock                  # Lockfile for reproducible installs
src/                      # Source code
```

### How It Works

1. Run `claude-binary-plugin build` on the development machine
2. The binary, proxy script, and hooks.json are all generated
3. Commit everything except the binary and node_modules
4. On a new machine, Claude Code fires SessionStart
5. hooks.json routes SessionStart through the proxy script
6. The proxy detects the missing binary and runs the build
7. Subsequent hooks run directly against the compiled binary

See `architecture.md` for detailed proxy script behavior including
lock management, error handling, and the self-modification protection
mechanism.

## Planned Features

Before 1.0.0 release:

- **Template customization** - User-defined template overrides in
  `~/.claude/templates/`

## Implementation

The CLI is implemented in `src/cli/index.ts` using `@effect/cli` for
argument parsing. The `build` subcommand delegates to `PluginBuilder`
in `src/build/builder.ts`. The `init` subcommand is implemented in
`src/cli/init/`:

| File | Purpose |
| ---- | ------- |
| `src/cli/init/index.ts` | Command definition (`@effect/cli`) |
| `src/cli/init/wizard.ts` | Interactive wizard (`@clack/prompts`) |
| `src/cli/init/scaffold.ts` | Template engine (file generation) |
| `src/cli/init/templates/` | Template generators per project type |

The package version is resolved via `src/cli/macros.ts`, which imports
`package.json` at bundle time.

## Related Documentation

- `architecture.md` - Build system internals
- `scaffold.md` - Scaffold templates and interactive flow
- `testing.md` - Testing utilities
