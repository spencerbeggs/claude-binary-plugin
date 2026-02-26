# claude-binary-plugin

## 0.1.0

### Minor Changes

- [`7baae66`](https://github.com/spencerbeggs/claude-binary-plugin/commit/7baae66dcb6eb0d6cdbdfbacade2a5fe6b628a33) Refactor CLI to use @effect/cli with subcommand-based architecture.

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
- [`9e308f8`](https://github.com/spencerbeggs/claude-binary-plugin/commit/9e308f857f019a91e5b8c52db73f6b1c056f2b32) Add TypeScript SDK for building Claude Code plugins that compile to single-file Bun executables.

Features:

- Declarative pipeline system for defining hooks with Zod-validated inputs/outputs
- Three-layer plugin model: input (hook events), options (env vars), state (computed at session)
- Support for all Claude Code hook types: SessionStart, PreToolUse, PostToolUse, Stop, and more
- Command runtime for CLI tools exposed via skill markdown files
- OpenTelemetry observability with fire-and-forget sidecar architecture
- Session registry with SQLite for state persistence across hooks
- Type-safe environment management with ClaudeBinaryPluginEnv base class
- Build system that generates hooks.json manifest and compiles to standalone binaries
