# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Overview

`claude-binary-plugin` is a TypeScript SDK for building Claude Code plugins
that compile to single-file Bun executables. It provides a declarative
pipeline system for defining hooks and commands with Effect Schema-validated
inputs/outputs, Effect services with layers for testability, OpenTelemetry
observability, and type-safe state management.

This is a Bun workspace monorepo with two packages:

- `package/` — the `claude-binary-plugin` SDK (source, tests, build)
- `plugin/` — a test plugin that dogfoods the SDK

## Release Status

**Target: 1.0.0** - This module is working toward its initial public release.

- **Feature complete** - Core functionality is implemented and stable
- **API refinement phase** - Focusing on API ergonomics and consistency
- **Not yet public** - No external users or published packages
- **No backward compatibility concerns** - Make clean API changes freely
  without deprecation warnings or migration guides

IMPORTANT: When refactoring or renaming APIs, prefer clean breaks over compatibility
shims. Remove old code entirely rather than maintaining aliases.

## Key References

Load these docs on-demand when working on the relevant subsystem.
Do NOT load unless the task specifically requires the details within.

- `.claude/design/architecture.md` - System architecture, directory structure,
  service/layer pattern, pipeline execution flow, build system
- `.claude/design/services.md` - All 10 Effect services, their interfaces,
  Live/Test layers, PipelineLive, LoggerLive
- `.claude/design/schema.md` - Effect Schema usage, Schema.Class pattern,
  hook event schemas, pipeline output schemas, branded types
- `.claude/design/testing.md` - Layer-based testing, test factories,
  PluginTester fluent API, test file organization
- `.claude/design/cli.md` - CLI build command, artifact generation
- `.claude/design/otel.md` - OTEL telemetry, sidecar architecture, IPC
  protocol (imperative, planned for Effect conversion)

## Development Commands

```bash
# Install all workspace dependencies
bun install

# Run SDK tests
cd package && bun test

# Run all tests via turbo
bun run test

# Type check all workspaces
bun run typecheck

# Lint and format
bun run lint:fix

# Build SDK (compiles the package)
cd package && bun run build

# Build test plugin
cd plugin && bun run build

# Test plugin live
claude --plugin-dir ./plugin
```

## Code Conventions

### Bun Runtime

- Use `bun` instead of `node` for all runtime operations
- Use `Bun.file()` for file I/O, `Bun.$` for shell commands
- Use `bun:test` for testing, not jest or vitest
- Bun auto-loads `.env` files — don't use dotenv

### TypeScript

- Uses Biome for linting and formatting (tabs, 120 char lines)
- Import extensions required (`.js` for TypeScript files)
- Type-only imports must use `import type`
- Uses `tsgo` (native TypeScript) for type checking

### Effect Patterns

- Services use `Context.Tag` in `src/services/`, implementations in `src/layers/`
- Errors use `Data.TaggedError`, one per file in `src/errors/`
- Hook event types use `Schema.Class` (type + schema + instanceof)
- Pipeline outputs use `Schema.Union` discriminated on `status`
- No barrel files — import directly from source files
- Two entry points: `src/index.ts` (public), `src/testing.ts` (test utils)
- Test layers replace global mocking (no `Bun.env` mutation, no `process.exit` mocking)

### Testing

- All tests in `__tests__/` mirroring `src/` structure
- Use test layer factories for service mocking
- Legacy `plugin.test()` fluent API still works but is being phased out
- Always call `ctx.dispose()` in `afterEach` when using legacy PluginTester

## Key Exports

All exports are from the main entry point:

```typescript
import {
  // Plugin definition
  ClaudeBinaryPlugin,

  // Schema.Class event types (type + schema)
  PreToolUseEvent,
  PostToolUseEvent,
  SessionStartEvent,

  // Services
  StdinReader,
  SchemaValidator,
  EnvLoader,

  // Layers
  PipelineLive,
  LoggerLive,

  // Errors
  PipelineError,
  SchemaValidationError,

  // State management
  PluginEnv,

  // OTEL
  OtelConfig,
} from "claude-binary-plugin";

// Test utilities (separate entry point)
import {
  makeStdinReaderTest,
  makeTelemetryTest,
  makeShellExecutorTest,
} from "claude-binary-plugin/testing";
```

## Core Source Files

Load these files as needed for deeper context:

| File | Purpose |
| ---- | ------- |
| `src/plugin/config.ts` | `ClaudeBinaryPlugin.create()` factory |
| `src/layers/PipelineRuntime.ts` | `PipelineRuntime.run()` |
| `src/layers/PipelineLive.ts` | Composed service layer |
| `src/schemas/hook-events.ts` | Schema.Class event definitions |
| `src/schemas/pipeline-outputs.ts` | Output schemas per hook type |
| `src/services/PluginEnv.ts` | `PluginEnv` base class |
| `src/layers/SessionRegistry.ts` | SQLite session lookup |
| `src/build/builder.ts` | `PluginBuilder` class |
| `src/types/tool-inputs.ts` | Typed tool inputs |
| `src/types/hook-events.ts` | Hook type enums and interfaces |

### OTEL Classes

All in `src/otel/`:

| Class | Purpose |
| ----- | ------- |
| `OtelConfig` | Configuration, `isEnabled()` |
| `TelemetryEmitter` | Event emission |
| `TelemetryMetrics` | Metric recording |
| `TelemetrySpan` | Span instrumentation |
| `SidecarLauncher` | Sidecar spawning |
| `SidecarClient` | IPC client |
| `SidecarServer` | Unix socket server |

## Environment Variables

### Claude Code Provided

- `CLAUDE_PLUGIN_ROOT` - Plugin directory path
- `CLAUDE_PROJECT_DIR` - User's project directory
- `CLAUDE_ENV_FILE` - Session env file path
- `CLAUDE_SESSION_ID` - Session UUID

### OTEL Configuration

- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP HTTP endpoint
- `OTEL_EXPORTER_OTLP_HEADERS` - Auth headers for endpoint
- `OTEL_SIDECAR_SOCKET` - Custom socket path
