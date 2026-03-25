# CLI

## Overview

The SDK provides a CLI binary at `src/cli/index.ts` using `@effect/cli`.
It has a single command: `build`.

## Build Command

```bash
claude-binary-plugin build [config-path]
```

**Arguments:**

- `config-path` — path to plugin config file (default: auto-detect)

**Options:**

- `--skip-commands` — exclude CLI commands from build
- `--skip-compile` — generate entrypoint but don't compile
- `--skip-hooks-json` — don't generate hooks.json

**What it does:**

1. Loads the plugin config from the specified file
2. Calls `PluginBuilder.fromConfig()` to compile
3. Generates: binary, hooks.json, optionally sidecar.js

## Implementation

- `src/cli/index.ts` — @effect/cli command definitions
- `src/cli/macros.ts` — Bun macros for compile-time values
- Boolean options default to `false` — use `--skip-*` pattern for
  features that default to ON

## Removed

The `init` scaffold command was removed. Plugin projects are now created
from a standalone template repository.
