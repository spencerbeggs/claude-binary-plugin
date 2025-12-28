---
"claude-binary-plugin": minor
---

Refactor CLI to use @effect/cli with subcommand-based architecture.

**Breaking change**: CLI invocation now uses subcommands:
- Before: `claude-binary-plugin <plugin-file>`
- After: `claude-binary-plugin build [plugin-config-path]`

New features:
- Optional plugin config path argument (defaults to `plugin.config.ts`)
- Built-in `--help`, `--version`, `--wizard` flags from @effect/cli
- CLI version inlined at compile time via Bun macro (reads from package.json)
- Shell completion scripts via `--completions` (bash, zsh, fish, sh)
- Configurable log levels via `--log-level`

Dependencies added:
- `effect` for functional effect system
- `@effect/cli` for declarative CLI definition
- `@effect/platform` and `@effect/platform-bun` for Bun runtime integration
