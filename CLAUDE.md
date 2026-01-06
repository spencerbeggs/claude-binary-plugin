# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository.

## Key References

For deeper context, reference these files:

**Documentation:**

- @docs/ARCHITECTURE.md - Complete system architecture, data flow, build
  system, command runtime, OTEL sidecar spawning and handshake
- @docs/CLI.md - CLI binary usage, zero-config builds, scaffolding plans
- @docs/SCHEMA.md - OTEL telemetry schema, event types, attributes, metrics

**Core Source Files (load as needed):**

- `src/pipeline/config.ts` - `ClaudeBinaryPlugin.create()` factory and type inference
- `src/pipeline/runtime.ts` - `runPipeline()` execution and response mapping
- `src/build/builder.ts` - `PluginBuilder` class for compilation and entrypoint generation
- `src/state/plugin-state.ts` - `ClaudeBinaryPluginState` base class for state management
- `src/commands/runtime.ts` - `runCommand()` for CLI command execution
- `src/state/session-registry.ts` - SQLite session lookup for state persistence
- `src/core/schemas.ts` - Zod schemas for Claude Code hook event inputs
- `src/otel/client.ts` - SidecarClient for fire-and-forget telemetry
- `src/otel/constants.ts` - OTEL attribute and metric name constants
- `src/otel/classes/` - Class-based OTEL API (emitters, metrics, spans)

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

When refactoring or renaming APIs, prefer clean breaks over compatibility
shims. Remove old code entirely rather than maintaining aliases.

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

## Architecture

### Three-Layer Plugin Model

```text
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Input (from Claude Code)                          │
│  Hook events: SessionStart, PreToolUse, PostToolUse, etc.   │
│  Passed as JSON via stdin to the plugin binary              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Options (user-configurable)                       │
│  Zod schema validates env vars with {PREFIX}_*              │
│  Example: SAVVY_WORKFLOW_DEBUG=true                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: State (computed at SessionStart)                  │
│  setup() runs once, detects environment                     │
│  Results persisted to CLAUDE_ENV_FILE for all hooks         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Hook Handlers                                              │
│  Pure functions: ({ input, options, env }) => output        │
│  Zod-validated outputs ensure type safety                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Modules

All exports are from the main entry point:

```typescript
import {
  // Plugin definition
  ClaudeBinaryPlugin,

  // Testing
  PluginTestBuilder,
  Mocks,

  // OTEL
  TelemetryEmitter,
  TelemetryMetrics,
  // ...
} from "claude-binary-plugin";
```

See `docs/TESTING.md` for testing utilities and `docs/SCHEMA.md` for OTEL.

### Source File Organization

- `src/index.ts` - Hook event classes, response builders, type exports
- `src/pipeline/config.ts` - Plugin config types, `ClaudeBinaryPlugin.create()`
- `src/pipeline/pipeline.ts` - `Pipeline` class (unified API for execution)
- `src/pipeline/runtime.ts` - `runPipeline()`, response mapping
- `src/pipeline/types.ts` - Output schemas per hook type
- `src/build/builder.ts` - `PluginBuilder` class, entrypoint generation
- `src/state/plugin-state.ts` - `ClaudeBinaryPluginState` base class
- `src/core/schemas.ts` - Zod schemas for hook event inputs
- `src/types/json.ts` - JSON type utilities (from type-fest) with Zod schemas
- `src/types/branded.ts` - Branded types for type-safe identifiers
- `src/otel/` - OpenTelemetry integration (class-based API)

### Data Flow

1. Claude Code invokes plugin binary with hook event JSON on stdin
2. Plugin runtime parses input with Zod schema (`src/core/schemas.ts`)
3. State loaded via `ClaudeBinaryPluginState` (options + computed state)
4. Handler called with `{ input, options, state }` context
5. Handler returns pipeline output with `status`, `action`, `summary`
6. Runtime validates output, emits OTEL telemetry
7. JSON response written to stdout, process exits

### Hook Types

| Event | When | Capability |
| ----- | ---- | ---------- |
| `SessionStart` | Session begins | Add context, run setup() |
| `SessionEnd` | Session ends | Cleanup only |
| `PreToolUse` | Before tool | Allow/deny/modify input |
| `PostToolUse` | After tool | Add context or block |
| `Stop` | Agent stopping | Block with reason |
| `SubagentStop` | Subagent stopping | Block with reason |
| `UserPromptSubmit` | User submits | Add context or block |
| `PermissionRequest` | Permission needed | Auto-allow/deny |

### Pipeline Output Types

All handlers must return a pipeline output object:

```typescript
{
  status: "executed" | "skipped" | "disabled" | "cached" |
          "error" | "timeout";
  summary: string;           // Human-readable log message
  action?: "allow" | "deny" | "ask" | "block" |
           "continue" | "modify" | "context" | "none";
  validation?: "passed" | "fixed" | "failed" | "warning";
  claudeContext?: string;    // Detailed context for Claude
  reason?: string;           // Concise reason for decisions
  userMessage?: string;      // Message shown in terminal
  updatedInput?: Record<string, unknown>;  // Modified input
  metrics?: Record<string, number>;        // Custom metrics
}
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

The SDK uses `type-fest` for enhanced type safety:

**JSON Types** - Precise types for JSON data (tool inputs/outputs):

```typescript
import type { JsonObject, JsonValue } from "claude-binary-plugin";
import { JsonObjectSchema } from "claude-binary-plugin";

// tool_input and tool_response are typed as JsonObject
// Use JsonObjectSchema for Zod validation
```

**Branded Types** - Prevent mixing up string identifiers:

```typescript
import type { SessionId, ToolUseId } from "claude-binary-plugin";

// These are distinct types that can't be accidentally swapped
function processHook(sessionId: SessionId, toolUseId: ToolUseId) { }
```

**Immutable Handler Context** - All handler parameters are deeply readonly:

```typescript
// HandlerContext uses ReadonlyDeep from type-fest
const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
  // input.tool_name = "x"; // Compile error - readonly
  return { status: "executed", action: "allow", summary: "ok" };
};
```

### Testing Patterns

See `docs/TESTING.md` for comprehensive testing documentation.

The SDK provides a fluent testing API via `plugin.test()`:

```typescript
const ctx = plugin.test()
  .withOptions({ DEBUG: false })  // PartialDeep - only specify what you need
  .withState({ packageManager: "bun" });  // PartialDeep - deeply partial

const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");

expect(result.action).toBe("allow");
ctx.dispose();
```

Test methods use `PartialDeep` from type-fest, so you only need to provide
the fields your test cares about - nested objects are also partial.

## OTEL Telemetry

The SDK includes an OpenTelemetry sidecar for metrics and events,
accessed via a class-based API:

```typescript
import {
  OTELConfig,
  TelemetryEmitter,
  TelemetryMetrics,
  TelemetrySpan,
} from "claude-binary-plugin";

// Check if telemetry is enabled
if (OTELConfig.isEnabled()) {
  // Emit hook execution event
  TelemetryEmitter.emitHookExecution(event, "pre-bash", {
    hookType: "PreToolUse",
    pluginName: "my-plugin",
    pluginVersion: "1.0.0",
    durationMs: 42,
    success: true,
    outcome: "allowed",
  });

  // Record metrics
  TelemetryMetrics.recordCounter(event, "files.processed", 5);
  TelemetryMetrics.recordHistogram(event, "parse.duration", 123, "ms");
}

// Instrument hooks with automatic span tracking
const handler = TelemetrySpan.instrumentHook("pre-bash", async (event) => {
  return { status: "executed", action: "allow", summary: "ok" };
});
```

**Key classes:**

| Class | Purpose |
| ----- | ------- |
| `OTELConfig` | Configuration parsing, `isEnabled()` check |
| `TelemetryEmitter` | Event emission (`emitHookExecution`, etc.) |
| `TelemetryMetrics` | Metric recording (counters, histograms, gauges) |
| `TelemetrySpan` | Span instrumentation for tracing |
| `SidecarClient` | Low-level IPC client |

**Architecture:**

- Sidecar spawned at SessionStart if `CLAUDE_CODE_OTEL_ENDPOINT` set
- Hooks communicate via Unix domain socket (IPC)
- Events include hook execution, validation errors, decisions
- Metrics track hook duration, tool usage, context consumption

See `docs/SCHEMA.md` for the complete telemetry schema specification.

## Environment Variables

### Claude Code Provided

- `CLAUDE_PLUGIN_ROOT` - Plugin directory path
- `CLAUDE_PROJECT_DIR` - User's project directory
- `CLAUDE_ENV_FILE` - Session env file path (for persisted vars)
- `CLAUDE_SESSION_ID` - Session UUID

### OTEL Configuration

- `CLAUDE_CODE_OTEL_ENDPOINT` - OTLP HTTP endpoint
- `CLAUDE_CODE_OTEL_HEADERS` - Auth headers for endpoint
- `CLAUDE_CODE_OTEL_SIDECAR_SOCKET` - Custom socket path
