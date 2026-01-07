# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Overview

`claude-binary-plugin` is a TypeScript SDK for building Claude Code plugins
that compile to single-file Bun executables. It provides a declarative
pipeline system for defining hooks and commands with Zod-validated
inputs/outputs, OpenTelemetry observability, and type-safe state
management.

## Release Status

**Target: 1.0.0** - This module is working toward its initial public release.

- **Feature complete** - Core functionality is implemented and stable
- **API refinement phase** - Focusing on API ergonomics and consistency
- **Documentation focus** - Improving docs to help users understand usage
- **Not yet public** - No external users or published packages
- **No backward compatibility concerns** - Make clean API changes freely
  without deprecation warnings or migration guides

IMPORTANT: When refactoring or renaming APIs, prefer clean breaks over compatibility
shims. Remove old code entirely rather than maintaining aliases.

## Key References

For detailed architecture and schema information, reference these docs:

- @.claude/design/ARCHITECTURE.md - System architecture, data flow, build
  system, command runtime, OTEL sidecar spawning and handshake
- @.claude/design/CLI.md - CLI binary usage, zero-config builds
- @.claude/design/SCHEMA.md - OTEL telemetry schema, event types, metrics
- @.claude/design/TESTING.md - Testing utilities and fluent API

## Development Commands

```bash
# Install dependencies
bun install

# Run tests (LLM-formatted output)
bun run test:ai

# Run tests (verbose)
bun run test

# Type check
bun run typecheck

# Lint and format
bun run lint:fix

# Build (compiles the package)
bun run build
```

## Code Conventions

### Bun Runtime

- Use `bun` instead of `node` for all runtime operations
- Use `Bun.file()` for file I/O, `Bun.$` for shell commands
- Use `bun:test` for testing, not jest or vitest
- Bun auto-loads `.env` files - don't use dotenv

### TypeScript

- Uses Biome for linting and formatting (tabs, 120 char lines)
- Import extensions required (`.js` for TypeScript files)
- Type-only imports must use `import type`
- Uses `tsgo` (native TypeScript) for type checking

### Type Safety Utilities

The SDK uses `type-fest` for enhanced type safety. See @docs/ARCHITECTURE.md
for detailed examples.

- **JSON Types** - `JsonObject`, `JsonValue` for tool inputs/outputs
- **Branded Types** - `SessionId`, `ToolUseId`, `TranscriptPath`, `HookName`
- **Immutable Context** - Handler params use `ReadonlyDeep<T>`

## Key Exports

All exports are from the main entry point:

```typescript
import {
  // Plugin definition
  ClaudeBinaryPlugin,
  Pipeline,
  PipelineRuntime,

  // State management
  PluginEnv,
  SessionRegistry,

  // Testing
  PluginTester,
  TestFixtures,
  MockState,

  // OTEL
  OtelConfig,
  TelemetryEmitter,
  TelemetryMetrics,
  TelemetrySpan,
} from "claude-binary-plugin";
```

## Core Source Files

Load these files as needed for deeper context:

| File | Purpose |
| ---- | ------- |
| `src/pipeline/config.ts` | `ClaudeBinaryPlugin.create()` factory |
| `src/pipeline/classes/PipelineRuntime.ts` | `PipelineRuntime.run()` execution |
| `src/pipeline/classes/Pipeline.ts` | `Pipeline` utilities (type guards, metrics) |
| `src/pipeline/types.ts` | Output schemas per hook type |
| `src/build/builder.ts` | `PluginBuilder` class |
| `src/state/plugin-state.ts` | `PluginEnv` base class |
| `src/state/session-registry.ts` | SQLite session lookup |
| `src/commands/runtime.ts` | `Commands` class |
| `src/core/schemas.ts` | Input Zod schemas |
| `src/core/tool-inputs.ts` | Typed tool inputs |
| `src/testing/builder.ts` | `PluginTester` class |
| `src/testing/mocks.ts` | `TestFixtures`, `MockState` |

### OTEL Classes

Located in `src/otel/classes/` unless noted:

| Class | Purpose |
| ----- | ------- |
| `OtelConfig` | Configuration, `isEnabled()` |
| `TelemetryEmitter` | Event emission |
| `TelemetryMetrics` | Metric recording |
| `TelemetrySpan` | Span instrumentation |
| `Platform` | Platform detection |
| `GitInfo` | Git repo detection |
| `PluginInfo` | Plugin metadata |
| `SidecarLauncher` | Sidecar spawning |
| `SidecarClientPool` | Client lifecycle |
| `SidecarClient` | IPC client (`src/otel/client.ts`) |

## Environment Variables

### Claude Code Provided

- `CLAUDE_PLUGIN_ROOT` - Plugin directory path
- `CLAUDE_PROJECT_DIR` - User's project directory
- `CLAUDE_ENV_FILE` - Session env file path (for persisted vars)
- `CLAUDE_SESSION_ID` - Session UUID

### OTEL Configuration

- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP HTTP endpoint
- `OTEL_EXPORTER_OTLP_HEADERS` - Auth headers for endpoint
- `OTEL_SIDECAR_SOCKET` - Custom socket path
