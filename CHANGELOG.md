# claude-binary-plugin

## 0.1.0

### Minor Changes

- 9e308f8: Add TypeScript SDK for building Claude Code plugins that compile to single-file Bun executables.

  Features:

  - Declarative pipeline system for defining hooks with Zod-validated inputs/outputs
  - Three-layer plugin model: input (hook events), options (env vars), state (computed at session)
  - Support for all Claude Code hook types: SessionStart, PreToolUse, PostToolUse, Stop, and more
  - Command runtime for CLI tools exposed via skill markdown files
  - OpenTelemetry observability with fire-and-forget sidecar architecture
  - Session registry with SQLite for state persistence across hooks
  - Type-safe environment management with BunPluginEnv base class
  - Build system that generates hooks.json manifest and compiles to standalone binaries
