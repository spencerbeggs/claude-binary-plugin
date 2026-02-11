---
status: current
module: claude-binary-plugin
category: architecture
created: 2026-01-22
updated: 2026-02-10
last-synced: 2026-02-10
completeness: 98
related:
  - .claude/design/schema.md
  - .claude/design/testing.md
  - .claude/design/cli.md
dependencies: []
---

# Architecture

This document describes the internal architecture of the
`claude-binary-plugin` SDK.

## Overview

The SDK enables developers to build Claude Code plugins that compile to
single-file Bun executables. Plugins receive hook events from Claude Code
via stdin, process them through a declarative pipeline system, and respond
via stdout.

```text
┌──────────────┐  stdin (JSON)   ┌──────────────────┐  stdout (JSON)
│  Claude Code │ ──────────────▶ │  Plugin Binary   │ ──────────────▶
│              │ ◀────────────── │  (Bun Executable)│
└──────────────┘                 └──────────────────┘
                                         │
                                         ▼
                                 ┌──────────────────┐
                                 │  OTEL Sidecar    │
                                 │  (Unix Socket)   │
                                 └──────────────────┘
```

## Core Concepts

### Plugin Definition

Plugins are defined using `ClaudeBinaryPlugin.create()` which returns a
configuration object used by the build system:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  // Environment variable prefix (e.g., MY_PLUGIN_TIMEOUT_MS)
  prefix: "MY_PLUGIN",

  // Zod schema for validating plugin options from env vars
  options: z.object({
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),

  // Runs at SessionStart to compute derived state
  setup: async ({ options, cwd }) => {
    return { detectedPackageManager: await detectPM(cwd) };
  },

  // Hook definitions
  hooks: {
    SessionStart: [{
      name: "context",
      pipeline: "./hooks/context.hook.ts",
    }],
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],  // Only run for Bash tool
      pipeline: "./hooks/security.hook.ts",
    }],
  },
});

export default plugin;
```

### Three-Layer Model

Every hook handler receives context from three distinct layers:

```text
┌───────────────────────────────────────────────────────────────────┐
│  Layer 1: INPUT                                                    │
│  ───────────────────────────────────────────────────────────────  │
│  Source: Claude Code via stdin                                     │
│  Content: Hook event data (session_id, tool_name, tool_input)     │
│  Validation: Zod schemas in src/core/schemas.ts                   │
│  Access: handler({ input, ... }) - the `input` parameter          │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Layer 2: OPTIONS                                                  │
│  ───────────────────────────────────────────────────────────────  │
│  Source: Environment variables with plugin prefix                  │
│  Content: User-configurable settings (TIMEOUT_MS, API_KEY, etc.)  │
│  Validation: Plugin's Zod schema with defaults and transforms    │
│  Access: handler({ options, ... }) - typed from schema            │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Layer 3: STATE (Computed Environment)                             │
│  ───────────────────────────────────────────────────────────────  │
│  Source: setup() function runs at SessionStart                     │
│  Content: Detection results, cached data, derived values          │
│  Persistence: Written to CLAUDE_ENV_FILE for subsequent hooks     │
│  Access: handler({ state, ... }) - typed from setup() return      │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Handler Function                                                  │
│  ───────────────────────────────────────────────────────────────  │
│  ({ input, options, state }) => PipelineOutput                    │
└───────────────────────────────────────────────────────────────────┘
```

### Type Safety

The SDK uses `type-fest` for enhanced type safety throughout the pipeline:

**Immutable Handler Context:**

Handler parameters are deeply readonly via `ReadonlyDeep<T>`:

```typescript
interface HandlerContext<TInput, TOptions, TState> {
  input: ReadonlyDeep<TInput>;     // Cannot mutate input
  options: ReadonlyDeep<TOptions>; // Cannot mutate options
  state: ReadonlyDeep<PluginState<TState>>; // Cannot mutate state
}
```

This prevents accidental mutations - handlers should be pure functions.

**JSON Types:**

Tool inputs and outputs use precise JSON types instead of `Record<string, unknown>`:

```typescript
import type { JsonObject, JsonValue } from "claude-binary-plugin";

// tool_input: JsonObject (not Record<string, unknown>)
// Ensures values are JSON-serializable
```

**Branded Identifiers:**

String identifiers use branded types to prevent mixing them up:

| Type | Field | Purpose |
| ---- | ----- | ------- |
| `SessionId` | `session_id` | Claude Code session UUID |
| `ToolUseId` | `tool_use_id` | Tool invocation identifier |
| `TranscriptPath` | `transcript_path` | Conversation transcript file |
| `HookName` | hook config | Custom hook identifier |

```typescript
// These are distinct types - can't accidentally swap them
function processHook(sessionId: SessionId, toolUseId: ToolUseId) { }
```

### Hook Event Types

Claude Code sends different event types at different lifecycle points:

| Event | When Triggered | Capabilities |
| ----- | -------------- | ------------ |
| `SessionStart` | Session begins | Add context, run setup() |
| `SessionEnd` | Session ends | Cleanup only |
| `PreToolUse` | Before tool runs | Allow/deny/modify input |
| `PostToolUse` | After tool runs | Add context or block |
| `Stop` | Agent stopping | Block with reason |
| `SubagentStop` | Subagent stopping | Block with reason |
| `UserPromptSubmit` | User submits prompt | Add context or block |
| `PermissionRequest` | Permission needed | Auto-allow/deny |
| `PreCompact` | Before compaction | Passthrough only |
| `Notification` | Notification event | Passthrough only |

### Hook Definition Types

Hooks can be defined in several ways, allowing flexibility and mixing
with native Claude Code hook definitions:

#### 1. Pipeline File Hook (recommended)

Points to a file exporting a default pipeline handler:

```typescript
{
  name: "pre-edit-code",
  description: "Pre-formats code before writing",
  tools: ["Edit", "Write", "Update"],  // Tool filter
  pipeline: "./hooks/pre-edit-code.hook.ts",
}
```

#### 2. Inline Pipeline Hook

Defines the handler function directly:

```typescript
{
  name: "simple-check",
  pipeline: async ({ input, options, state }) => {
    return { status: "executed", action: "allow", summary: "ok" };
  },
}
```

#### 3. Raw Handler Hook

For direct access to the HookEvent object (advanced):

```typescript
{
  name: "custom-handler",
  handler: "./hooks/custom.hook.ts",  // Or inline function
}
```

#### 4. Passthrough Hook

Includes native Claude Code hook entries directly in hooks.json.
Useful for mixing plugin hooks with external scripts:

```typescript
{
  matcher: "startup",
  hooks: [{ type: "command", command: "bash ./scripts/init.sh" }]
}
```

### Tool Filtering

PreToolUse and PostToolUse hooks support a `tools` array for fast-path
filtering. The hook only runs when the tool name matches:

```typescript
PreToolUse: [
  {
    name: "pre-bash",
    tools: ["Bash"],  // Only runs for Bash tool
    pipeline: "./hooks/pre-bash.hook.ts",
  },
  {
    name: "pre-edit-code",
    tools: ["Edit", "Write", "Update"],  // Multiple tools
    pipeline: "./hooks/pre-edit-code.hook.ts",
  },
]
```

When compiled, `tools` becomes the `matcher` field in hooks.json:

```json
{
  "matcher": "Edit|Write|Update",
  "hooks": [{ "type": "command", "command": "..." }]
}
```

### hooks.json Generation

The build system generates a `hooks.json` file that Claude Code uses
to discover and invoke plugin hooks. This file maps hook types to
command invocations.

When a proxy script path is provided (the default for `build`),
SessionStart hooks route through the proxy for just-in-time compilation
support, while all other hooks point directly at the binary:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/scripts/setup-proxy.sh --hook=SessionStart/context"
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Update",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/plugin.plugin --hook=PreToolUse/pre-edit"
        }]
      },
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/plugin.plugin --hook=PreToolUse/pre-bash"
        }]
      }
    ]
  }
}
```

Key points:

- `${CLAUDE_PLUGIN_ROOT}` - Claude Code provides this env var
- `--hook=Type/name` - Identifies which hook handler to run
- `matcher` - Pipe-separated tool names for filtering
- Multiple entries per hook type are supported
- Passthrough hooks are included verbatim
- SessionStart hooks route through the proxy script for on-demand builds
- Non-SessionStart hooks bypass the proxy for zero overhead

### Mixing Plugin and Native Hooks

You can combine compiled plugin hooks with native Claude Code hooks
using passthrough entries:

```typescript
const plugin = ClaudeBinaryPlugin.create({
  hooks: {
    PreToolUse: [
      // Compiled plugin hook
      {
        name: "security",
        tools: ["Bash"],
        pipeline: "./hooks/security.hook.ts",
      },
      // Native Claude Code hook (passthrough)
      {
        matcher: "WebFetch",
        hooks: [{
          type: "command",
          command: "bash ./scripts/log-fetches.sh"
        }]
      },
    ],
  },
});
```

Both are included in the generated hooks.json, allowing seamless
integration with existing hook scripts.

## Data Flow

### Hook Invocation Flow

```text
1. Claude Code spawns plugin binary with hook key argument
   $ ./my-plugin.plugin PreToolUse/security

2. Plugin reads JSON from stdin
   { "session_id": "abc-123", "tool_name": "Bash", "tool_input": {...} }

3. Runtime parses input with Zod schema (src/core/schemas.ts)
   PreToolUseInputSchema.parse(stdinData)

4. Runtime loads state:
   - SessionStart: Load .env files, run setup(), persist to CLAUDE_ENV_FILE
   - Other hooks: findSessionEnvDir() → loadAllHookFiles(*hook*.sh) →
     extractPersistedState() from {PREFIX}_PLUGIN_STATE in Bun.env

5. Runtime calls handler with typed context
   handler({ input, options, state })

6. Handler returns pipeline output
   { status: "executed", action: "allow", summary: "..." }

7. Runtime validates output, emits OTEL telemetry

8. Runtime converts to Claude Code response format
   { "permissionDecision": "allow" }

9. Response written to stdout as JSON
```

### State Persistence

At SessionStart, computed state is persisted for subsequent hooks:

```text
SessionStart Hook
       │
       ▼
┌──────────────────┐
│  setup() runs    │───▶ { packageManager: "bun", gitRepo: true }
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Serialize as    │───▶ MY_PLUGIN_PLUGIN_STATE="eyJ..." (base64)
│  base64 JSON     │
└──────────────────┘
       │
       ▼
┌──────────────────┐     ┌─────────────────────────────────────────┐
│  Write to        │───▶ │  ~/.claude/session-env/{uuid}/          │
│  CLAUDE_ENV_FILE │     │    sessionstart-hook-0.sh  (new naming) │
└──────────────────┘     │    hook-0.sh               (old naming) │
       │                 └─────────────────────────────────────────┘
       ▼
┌──────────────────┐
│  Derive dir via  │───▶ dirname(CLAUDE_ENV_FILE)
│  dirname()       │     (NOT regex - see "Session Env File Naming")
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Register in     │───▶ SQLite: session_id → session_env_dir
│  Session Registry│
└──────────────────┘

Subsequent Hooks (PreToolUse, etc.)
       │
       ▼
┌──────────────────┐
│  Find session    │◀── findSessionEnvDir() fallback chain
│  env directory   │    (see "Session Env Dir Lookup" below)
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Load *hook*.sh  │◀── PluginEnv.loadAllHookFiles(dir)
│  files           │    glob: *hook*.sh (matches both naming styles)
└──────────────────┘
       │
       ▼
│  extractPersistedState() decodes {PREFIX}_PLUGIN_STATE from Bun.env
       │
       ▼
│  State available in handler({ state: { packageManager, ... } })
```

## Build System

### Build Process

`PluginBuilder.fromConfig()` in `src/build/builder.ts`:

1. **Generates entrypoint code** - Creates a TypeScript file that:
   - Imports the plugin configuration
   - Imports all hook handler modules
   - Creates the state class from schema
   - Routes CLI arguments to the correct hook handler
   - Calls `PipelineRuntime.run()` with the right configuration

2. **Compiles to executable** - Uses `Bun.build()` with:
   - `target: "bun"` for Bun runtime
   - `bytecode: true` for faster startup (optional)
   - Single-file output with all dependencies bundled

3. **Generates proxy script** - Creates `scripts/setup-proxy.sh`:
   - Bash wrapper for just-in-time compilation on new machines
   - Fast path: `exec` directly to binary when it exists
   - Slow path: `bun install` + build with `--quiet` flag
   - See "Cross-Platform Distribution" section for details

4. **Generates manifest** - Creates `hooks.json`:
   - Lists all hook types and their handlers
   - Routes SessionStart hooks through the proxy script
   - Routes all other hooks directly to the binary
   - Used by Claude Code to discover available hooks

### Generated Entrypoint Structure

```typescript
// Generated entrypoint (simplified)
import {
  PipelineRuntime,
  createEnvClass
} from "claude-binary-plugin";
import plugin from "./plugin.ts";
import securityHandler from "./hooks/security.hook.ts";
import contextHandler from "./hooks/context.hook.ts";

const EnvClass = createEnvClass(
  plugin.prefix,
  plugin.schema,
  plugin.name
);

const hookKey = process.argv[2];  // e.g., "PreToolUse/security"

switch (hookKey) {
  case "PreToolUse/security":
    await PipelineRuntime.run({
      hookType: "PreToolUse",
      hookName: "security",
      pipeline: securityHandler,
      stateClass: StateClass,
      tools: ["Bash"],
      setup: plugin.setup,
      optionsSchema: plugin.options,
    });
    break;
  // ... other hooks
  default:
    PipelineRuntime.handleUnknown(hookKey, validHooks);
}
```

## Cross-Platform Distribution

### The Distribution Problem

Compiled Bun executables are platform-specific. A binary built on macOS
ARM64 will not run on Linux x86_64. This creates a challenge for plugin
distribution: plugins committed to a git repository need to work on
any developer's machine regardless of their platform.

The SDK solves this with a proxy script that performs just-in-time
compilation on the target machine. Source code and lockfile are committed
to the repository, while the platform-specific binary is `.gitignore`d.

### Proxy Script Architecture

The build system generates a bash proxy script (`scripts/setup-proxy.sh`)
that wraps SessionStart hooks. Non-SessionStart hooks point directly at
the binary, relying on the guarantee that Claude Code always fires
SessionStart before any other hook type.

```text
┌─────────────────────────────────────────────────────────────────┐
│  hooks.json Routing                                              │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  SessionStart hooks ──▶ scripts/setup-proxy.sh ──▶ binary       │
│  All other hooks    ──▶ binary (directly)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Proxy Script Execution Paths

The proxy has three execution paths:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Fast Path (zero overhead)                                       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Binary exists + node_modules present?                           │
│       │                                                          │
│       ▼                                                          │
│  exec to binary (replaces shell process, no subprocess)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Slow Path (first run on new machine)                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  1. Buffer stdin (hook event JSON from Claude Code)             │
│  2. Acquire mkdir-based lock (.build-lock directory)            │
│  3. bun install --silent                                         │
│  4. bun x claude-binary-plugin build --no-persist --quiet       │
│  5. Verify binary is executable                                  │
│  6. Forward buffered stdin to binary                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Error Path (build failure)                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  emit_error() outputs to stdout:                                 │
│    {"additionalContext":"[Plugin Build Error] ..."}              │
│                                                                  │
│  Also outputs to stderr for user visibility:                     │
│    [plugin-name] ERROR: <message>                                │
│                                                                  │
│  Exit code 2 (Claude Code shows stderr to user)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Build Lock

The proxy uses a `mkdir`-based lock to prevent concurrent builds when
multiple hooks fire simultaneously. This mechanism is portable across
macOS, Linux, and WSL because `mkdir` is atomic on all POSIX systems.

- **Lock directory**: `${PLUGIN_DIR}/.build-lock`
- **Stale detection**: Lock older than 5 minutes is removed
- **Wait behavior**: If another process holds the lock, the proxy waits
  up to 5 minutes, then re-checks if the binary was built
- **Cleanup**: `trap` removes the lock directory on exit

### Self-Modification Protection

The proxy script invokes the build system with the `--quiet` flag. When
`--quiet` is set during a build:

1. All non-error console output is suppressed
2. Proxy script regeneration is skipped entirely
3. hooks.json regeneration is skipped entirely

This prevents a critical bash bug: if the running proxy script were
overwritten mid-execution, bash would read corrupted data from the
modified file. The entire proxy script is also wrapped in a `{ ... }`
compound command block, which causes bash to read the full script into
memory before execution begins.

### Stat Portability

The proxy needs file modification times for stale lock detection. macOS
and Linux use different `stat` flags:

- macOS: `stat -f %m <file>` (BSD stat)
- Linux: `stat -c %Y <file>` (GNU coreutils)

The `get_mtime()` function tries the macOS form first, falling back to
GNU if that fails.

### Error Communication with Claude

When the build fails, the proxy communicates with Claude Code through
the `additionalContext` field in the JSON response:

```json
{
  "additionalContext": "[Plugin Build Error] The workflow plugin failed to build on this machine. Error: bun install failed. The plugin hooks and commands will not be available this session. To retry, delete the plugin cache and restart the session."
}
```

This lets Claude know the plugin is unavailable and suggest remediation
steps to the user. Exit code 2 causes Claude Code to display the stderr
output to the user as well.

### Generated Artifacts

After `claude-binary-plugin build` completes, the following files exist:

```text
plugin-directory/
├── scripts/
│   └── setup-proxy.sh         # Proxy script (committed to git)
├── hooks/
│   └── hooks.json             # Hook manifest (committed to git)
├── workflow.plugin             # Compiled binary (.gitignore'd)
├── plugin.config.ts            # Plugin definition (committed)
├── bun.lock                    # Lockfile (committed)
└── node_modules/               # Dependencies (.gitignore'd)
```

### End-to-End Flow

```text
Developer Machine (build):
  1. claude-binary-plugin build
  2. Compiles workflow.plugin (platform-specific)
  3. Generates scripts/setup-proxy.sh
  4. Generates hooks/hooks.json (SessionStart → proxy, others → binary)
  5. Binary is .gitignore'd; source + lockfile + proxy + hooks.json committed

New Machine (first session):
  1. Claude Code fires SessionStart
  2. hooks.json routes to scripts/setup-proxy.sh
  3. Proxy detects missing binary → slow path
  4. bun install → bun x claude-binary-plugin build --quiet
  5. Binary compiled for local platform
  6. Buffered stdin forwarded to binary → hook executes normally

New Machine (subsequent hooks):
  1. hooks.json routes PreToolUse/PostToolUse/etc. directly to binary
  2. Binary already exists → executes immediately
  3. No proxy overhead for non-SessionStart hooks

New Machine (subsequent sessions):
  1. SessionStart routes through proxy again
  2. Binary exists + node_modules present → fast path (exec)
  3. Zero overhead: shell process replaced by binary
```

### Proxy Template Implementation

The proxy script is generated by `generateProxyScript()` in
`src/build/proxy-template.ts`. The function accepts:

| Option | Description |
| ------ | ----------- |
| `binaryName` | Binary filename (e.g., `workflow.plugin`) |
| `configFile` | Plugin config path (default: `plugin.config.ts`) |
| `pluginName` | Name for log messages |

The generated script resolves its own location to find the plugin
directory, making it relocatable as long as the directory structure
is preserved.

## Runtime Execution

### PipelineRuntime.run() Method

The core runtime method in `src/pipeline/classes/PipelineRuntime.ts`:

```text
PipelineRuntime.run(options)
       │
       ├──▶ Create HookEvent from stdin
       │         │
       │         ▼
       │    EventClass.create({ stdin, stdout, stderr, stateClass })
       │         │
       │         ▼
       │    Parse JSON, validate with Zod, create state instance
       │
       ├──▶ Check tool filter (PreToolUse/PostToolUse)
       │         │
       │         ▼
       │    If tool not in filter: emit "skipped", passthrough
       │
       ├──▶ Load state
       │         │
       │         ▼
       │    SessionStart: Run setup() to get fresh state
       │    Other hooks: Extract state from {PREFIX}_PLUGIN_STATE
       │
       ├──▶ Call pipeline handler
       │         │
       │         ▼
       │    output = await pipeline({ input, options, state })
       │
       ├──▶ Validate output is pipeline format
       │         │
       │         ▼
       │    isPipelineOutput(output) - must have status, summary
       │
       ├──▶ Emit OTEL telemetry
       │         │
       │         ▼
       │    emitHookExecution(event, hookName, { duration, ... })
       │
       ├──▶ Convert to response format
       │         │
       │         ▼
       │    convertToResponse(hookType, output)
       │
       └──▶ Apply response and exit
                 │
                 ▼
            applyPipelineOutput(event, hookType, response)
            event.end(response)  // Writes JSON to stdout
```

### Output Conversion

Pipeline outputs use a standardized format that gets converted to
Claude Code's expected response:

```typescript
// Pipeline output (what handlers return)
{
  status: "executed",
  action: "deny",
  summary: "blocked dangerous command",
  reason: "rm -rf is not allowed",
}

// Converted to Claude Code response (what goes to stdout)
{
  "permissionDecision": "deny",
  "reason": "rm -rf is not allowed"
}
```

## State Management

### PluginEnv Class

The `PluginEnv` class in `src/state/classes/PluginEnv.ts` provides:

1. **Schema validation** - Validates env vars against Zod schema
2. **Context-aware loading** - Different loading strategies per context
3. **Persistence** - Writes vars to CLAUDE_ENV_FILE
4. **Registry integration** - Registers sessions for lookup

### forContext() Patterns

```typescript
// SessionStart: Load .env files from project root
const env = await MyEnv.forContext("sessionStart", {
  hookName: "my-hook",
  sessionId: event.session_id,
  projectRoot: event.cwd,
});

// Other hooks: Load from session-env directory
const env = await MyEnv.forContext("hook", {
  hookName: "my-hook",
  sessionId: event.session_id,
  sessionEnvDir: PluginEnv.getSessionEnvDir(event.session_id),
});

// Commands: Parse --vars argument
const { env, remainingArgs } = await MyEnv.forContext("command", {
  args: process.argv.slice(2),
  commandName: "lint",
});
```

### Session Registry

SQLite database for session lookups (enables hooks to find state):

```typescript
// Register at SessionStart
SessionRegistry.register({
  sessionId: "abc-123",
  projectDir: "/path/to/project",
  sessionEnvDir: "~/.claude/session-env/abc-123",
});

// Lookup by session ID (for hooks)
const dir = SessionRegistry.getBySessionId("abc-123");

// Lookup by project dir (for commands without session context)
const dir = SessionRegistry.getByProjectDir("/path/to/project");
```

### Variable Namespacing and State Persistence

Claude Code provides `CLAUDE_ENV_FILE` for plugins to persist variables
across hook invocations. However, this mechanism has limitations:

1. **Binary execution spawns subshells** - Variables set in the parent
   shell are lost when the plugin binary executes
2. **Continued conversations are buggy** - The env file path can change
   or become unavailable between conversation turns
3. **Commands run outside hook context** - No `CLAUDE_ENV_FILE` available

To work around these issues, the SDK implements a robust state
persistence system using "magic" prefixed variables.

#### The Problem

```text
SessionStart Hook
       │
       ▼
Claude Code sets CLAUDE_ENV_FILE=/path/to/env.sh
       │
       ▼
Plugin binary spawns (subshell) ──▶ CLAUDE_ENV_FILE is available
       │
       ▼
Hook writes state to CLAUDE_ENV_FILE
       │
       ▼
[Later hook or continued conversation]
       │
       ▼
Plugin binary spawns (subshell) ──▶ Variables may be lost or stale
```

#### The Solution

The SDK persists state independently and looks it up via SQLite:

```text
SessionStart Hook
       │
       ▼
1. Run setup() to compute state
       │
       ▼
2. Serialize state as base64 JSON
   {PREFIX}_PLUGIN_STATE="eyJwYWNrYWdlTWFuYWdlciI6ImJ1biIsLi4ufQ=="
       │
       ▼
3. Write ALL magic vars + options + state to CLAUDE_ENV_FILE
   (e.g., sessionstart-hook-0.sh or hook-0.sh)
       │
       ▼
4. Derive sessionEnvDir = dirname(CLAUDE_ENV_FILE)
       │
       ▼
5. Register mapping in SQLite:
   SessionRegistry.register({
     sessionId,
     projectDir,
     sessionEnvDir
   })
       │
       ▼
[Subsequent hooks]
       │
       ▼
1. Find session-env dir via findSessionEnvDir() fallback chain
       │
       ▼
2. PluginEnv.loadAllHookFiles(dir) — glob *hook*.sh
   This sets {PREFIX}_PLUGIN_STATE and all magic vars into Bun.env
       │
       ▼
3. extractPersistedState() decodes {PREFIX}_PLUGIN_STATE from base64
       │
       ▼
4. State available in handler({ state })

[Commands]
       │
       ▼
1. Commands.findSessionEnvDir() locates session-env dir
   (uses CLAUDE_ENV_FILE, *_PLUGIN_ENV_FILE, or SQLite registry)
       │
       ▼
2. PluginEnv.loadAllHookFiles(dir) — same as hooks
       │
       ▼
3. extractPersistedState() decodes state from Bun.env
       │
       ▼
4. State available in handler({ args, options, state })
```

**CRITICAL: Load-before-extract ordering.** Steps 2-3 above (for hooks
and commands) must happen in that exact order. Without loading the hook
files first via `loadAllHookFiles()`, `extractPersistedState()` finds
nothing in `Bun.env` and returns empty state `{}`. This ordering bug
caused all non-SessionStart hooks to return empty responses until it
was identified and fixed.

#### Magic Variables

The SDK uses prefixed variables for reliable state transfer:

| Variable | Purpose |
| -------- | ------- |
| `{PREFIX}_PLUGIN_STATE` | Base64-encoded JSON of computed state |
| `{PREFIX}_PROJECT_DIR` | Absolute path to project |
| `{PREFIX}_PLUGIN_DIR` | Absolute path to plugin |
| `{PREFIX}_PLUGIN_ENV_FILE` | Path to session env file |

Example with `SAVVY_WORKFLOW` prefix:

```bash
SAVVY_WORKFLOW_PLUGIN_STATE="eyJwYWNrYWdlTWFuYWdlciI6ImJ1biJ9"
SAVVY_WORKFLOW_PROJECT_DIR="/Users/x/my-project"
SAVVY_WORKFLOW_PLUGIN_DIR="/Users/x/.claude/plugins/workflow"
```

#### Why This Works

1. **SQLite is persistent** - Survives shell changes and restarts
2. **Project-based lookup** - Commands can find state without session ID
3. **Self-contained state** - Base64 JSON doesn't depend on shell parsing
4. **Multiple sessions handled** - Most recent session for project wins
5. **File naming resilient** - Uses `dirname()` not regex, `*hook*.sh`
   glob not `hook-*.sh`, so naming convention changes do not break state

This approach works around Claude Code's env file bugs while providing
reliable state access for both hooks and commands.

### Session Env File Naming and State Flow

This section documents critical implementation details about how Claude
Code names session env files and how state flows from SessionStart to
all subsequent hooks and commands. These details were discovered through
debugging production issues and are essential to preserve.

#### Claude Code Session Env File Naming Convention

Claude Code assigns a file path via `CLAUDE_ENV_FILE` for plugins to
write environment variables that persist across hook invocations. The
actual file lives in a session-env directory:

```text
~/.claude/session-env/{session-uuid}/
```

Claude Code has changed the naming convention for these files:

| Version | File Name | Example |
| ------- | --------- | ------- |
| Old | `hook-{N}.sh` | `hook-0.sh`, `hook-1.sh` |
| New | `{hooktype}-hook-{N}.sh` | `sessionstart-hook-0.sh` |

The SDK must handle **both** naming conventions since users may run
different Claude Code versions. This affects two operations:

1. **Loading hook files** (`PluginEnv.loadAllHookFiles()`): Uses the
   glob pattern `*hook*.sh` to match both old and new naming. A glob
   of `hook-*.sh` would **NOT** match `sessionstart-hook-0.sh`.

2. **Deriving sessionEnvDir** (`PipelineRuntime.persistSessionEnv()`):
   Uses `dirname(CLAUDE_ENV_FILE)` instead of regex. A regex like
   `/\/hook-\d+\.sh$/` would **NOT** match `sessionstart-hook-0.sh`,
   causing session registration to silently fail.

#### Session Env File Contents

A session env file (e.g., `sessionstart-hook-0.sh`) contains shell
`export` statements written during SessionStart by
`PipelineRuntime.persistSessionEnv()`:

```bash
export SAVVY_WORKFLOW_PROJECT_DIR="/path/to/project"
export SAVVY_WORKFLOW_PLUGIN_DIR="/path/to/plugin"
export SAVVY_WORKFLOW_PLUGIN_ENV_FILE="/path/to/session-env/{uuid}/sessionstart-hook-0.sh"
export SAVVY_WORKFLOW_PLUGIN_STATE="eyJ...base64..."
export SAVVY_WORKFLOW_TIMEOUT_MS="30000"
export SAVVY_WORKFLOW_DEBUG="false"
```

The file includes:

- **Magic variables** (`_PROJECT_DIR`, `_PLUGIN_DIR`, `_PLUGIN_ENV_FILE`)
  for path resolution in subsequent hooks and commands
- **`{PREFIX}_PLUGIN_STATE`** containing a base64-encoded JSON blob with
  the full computed state from `setup()`
- **Plugin options** validated through the Zod schema with defaults applied
- Values are double-quoted with bash-special characters escaped

The file is made executable (`chmod +x`) so bash can source it.

#### Detailed Data Flow: SessionStart to Subsequent Hooks

```text
SessionStart:
  1. Claude Code spawns binary:
     $ ./plugin --hook=SessionStart/context
     CLAUDE_ENV_FILE is set to session-env path

  2. Plugin reads stdin JSON, validates with Zod
     Input: { session_id, cwd, source, ... }

  3. PluginEnv.forContext("sessionStart") loads .env files from project root
     Reads: .env, .env.{NODE_ENV}, .env.local

  4. PipelineRuntime.run() calls setup() to compute state
     state = await setup({ options, cwd, sessionId, baseState })
     Returns: { packageManager: "bun", enabled: {...}, ... }

  5. PipelineRuntime.persistSessionEnv():
     a. Gets prefix from stateInstance.getPrefix()
     b. Builds vars record:
        - {PREFIX}_PROJECT_DIR = projectDir
        - {PREFIX}_PLUGIN_DIR = pluginDir
        - {PREFIX}_PLUGIN_ENV_FILE = claudeEnvFile
        - {PREFIX}_<option> for each validated option
        - {PREFIX}_PLUGIN_STATE = base64(JSON.stringify(state))
     c. Calls PluginEnv.persistVars() → writes to CLAUDE_ENV_FILE
     d. Derives sessionEnvDir = dirname(CLAUDE_ENV_FILE)
     e. Calls PluginEnv.registerSession(sessionId, projectDir, sessionEnvDir)
        → SQLite INSERT/UPSERT into sessions table

  6. Returns response (context injection, etc.)
     event.end(response) → writes JSON to stdout


Subsequent Hooks (PreToolUse, PostToolUse, Stop, etc.):
  1. Claude Code spawns binary:
     $ ./plugin --hook=PreToolUse/security
     stdin: { session_id, tool_name, tool_input, ... }

  2. Plugin reads stdin JSON, validates with Zod

  3. PipelineRuntime.findSessionEnvDir(event) locates session-env dir
     Fallback chain (first match wins):
     a. SessionRegistry.getBySessionId(event.session_id)
     b. SessionRegistry.getBySessionId(CLAUDE_SESSION_ID env var)
     c. dirname(CLAUDE_ENV_FILE)
     d. dirname(any *_PLUGIN_ENV_FILE env var)
     e. SessionRegistry.getByProjectDir(cwd)

  4. PluginEnv.loadAllHookFiles(sessionEnvDir)
     - Runs: ls -1 {dir}/*hook*.sh
     - For each file: reads content, calls parseEnvFileContent()
     - This sets {PREFIX}_PLUGIN_STATE and all magic vars into Bun.env

  5. extractPersistedState(stateInstance):
     - Reads {PREFIX}_PLUGIN_STATE from Bun.env
     - Decodes base64 → JSON string → parsed object
     - Returns typed state object

  6. Handler receives full typed context:
     handler({ input, options, state })
```

**CRITICAL ordering constraint**: Step 4 (loadAllHookFiles) MUST happen
before step 5 (extractPersistedState). Without loading the hook files
first, `Bun.env` does not contain `{PREFIX}_PLUGIN_STATE` and
`extractPersistedState()` returns `{}`. This was the root cause of a
bug where all non-SessionStart hooks returned empty responses.

#### Detailed Data Flow: SessionStart to Commands

```text
Commands (invoked via --cmd=name):
  1. User/Claude invokes:
     $ ./plugin --cmd=lint src/
     No stdin JSON — input comes from CLI args

  2. Commands.run() parses CLI args, validates against Zod schema
     rawArgs → { _positionals: ["src/"], fix: true }

  3. Commands.findSessionEnvDir() locates session-env dir
     Fallback chain (first match wins):
     a. SessionRegistry.getBySessionId(CLAUDE_SESSION_ID)
     b. dirname(CLAUDE_ENV_FILE)
     c. dirname(any *_PLUGIN_ENV_FILE env var)
     d. SessionRegistry.getByProjectDir(cwd)

  4. PluginEnv.loadAllHookFiles(sessionEnvDir)
     Same as hooks — reads *hook*.sh files into Bun.env

  5. Creates stateInstance, reads from Bun.env:
     - validatedOptions from schema parse
     - baseState from {PREFIX}_PROJECT_DIR, {PREFIX}_PLUGIN_DIR, etc.
     - persistedState decoded from {PREFIX}_PLUGIN_STATE

  6. Handler receives full typed context:
     handler({ args, options, state })

  7. Outputs markdown to stdout, exits with code
```

Commands do not have `session_id` in their input (they are invoked via
CLI, not stdin JSON). They rely more heavily on the `*_PLUGIN_ENV_FILE`
vars and the project directory SQLite registry fallback.

#### Session Registration (persistSessionEnv)

During SessionStart, `PipelineRuntime.persistSessionEnv()` registers
the session mapping in SQLite:

```typescript
// In PipelineRuntime.persistSessionEnv():
const sessionEnvDir = dirname(claudeEnvFile);
if (event.session_id && baseState.projectDir) {
    PluginEnv.registerSession(
        event.session_id,
        baseState.projectDir,
        sessionEnvDir,
    );
}
```

Key implementation details:

1. **Uses `dirname()` not regex** to derive the session-env directory
   from `CLAUDE_ENV_FILE`. This is critical because the file naming
   convention has changed. A regex like `/\/hook-\d+\.sh$/` would not
   match `sessionstart-hook-0.sh`, causing session registration to
   silently fail.

2. **SQLite UPSERT** ensures the mapping is created or updated. When a
   new session starts for the same project, all existing sessions for
   that project are updated to point to the new env directory.

3. **Silently fails** if `CLAUDE_ENV_FILE` is not set (e.g., in test
   environments) rather than crashing the hook.

**Note**: The `PluginEnv.initializeSession()` method (used by some
plugins directly) still has a legacy regex-based extraction:
`envFilePath.replace(/\/hook-\d+\.sh$/, "")`. This only works with
the old naming convention. The `PipelineRuntime.persistSessionEnv()`
path uses the correct `dirname()` approach.

#### The findSessionEnvDir Fallback Chain

Both `PipelineRuntime.findSessionEnvDir()` (for hooks) and
`Commands.findSessionEnvDir()` (for commands) implement a prioritized
fallback chain to maximize reliability across different execution
contexts:

**PipelineRuntime.findSessionEnvDir() (hooks):**

| Priority | Source | When Available |
| -------- | ------ | -------------- |
| 1 | `SessionRegistry.getBySessionId(event.session_id)` | After SessionStart registered this session |
| 2 | `SessionRegistry.getBySessionId(CLAUDE_SESSION_ID)` | When Claude sets this env var |
| 3 | `dirname(CLAUDE_ENV_FILE)` | During active hook execution |
| 4 | `dirname(any *_PLUGIN_ENV_FILE env var)` | After SessionStart wrote magic vars |
| 5 | `SessionRegistry.getByProjectDir(cwd)` | Fallback using project directory |

**Commands.findSessionEnvDir() (commands):**

| Priority | Source | When Available |
| -------- | ------ | -------------- |
| 1 | `SessionRegistry.getBySessionId(CLAUDE_SESSION_ID)` | When Claude sets this env var |
| 2 | `dirname(CLAUDE_ENV_FILE)` | If env var is still available |
| 3 | `dirname(any *_PLUGIN_ENV_FILE env var)` | After SessionStart wrote magic vars |
| 4 | `SessionRegistry.getByProjectDir(cwd)` | Most common for commands |

Commands lack `event.session_id` (priority 1 in the hook chain) because
they receive input via CLI arguments, not stdin JSON. The project
directory fallback (priority 4/5) is the most common path for commands,
since commands typically run after the shell environment from
SessionStart has been lost.

This redundancy ensures state is accessible even in edge cases like
continued conversations where env vars may be stale or missing, or
when Claude Code changes its environment variable behavior between
versions.

## OTEL Integration

### Class-Based API

The OTEL module uses a class-based API for better discoverability and
IDE autocomplete. All telemetry functionality is accessed through
static class methods:

```typescript
import {
  OtelConfig,
  TelemetryEmitter,
  TelemetryMetrics,
  TelemetrySpan,
  Platform,
  GitInfo,
} from "claude-binary-plugin";

// Check if telemetry is enabled
if (OtelConfig.isEnabled()) {
  // Emit hook execution event
  TelemetryEmitter.emitHookExecution(event, "pre-bash", {
    hookType: "PreToolUse",
    pluginName: "workflow",
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

**Primary Classes:**

| Class | Purpose |
| ----- | ------- |
| `OtelConfig` | Configuration parsing, `isEnabled()` check |
| `TelemetryEmitter` | Event emission (`emitHookExecution`, etc.) |
| `TelemetryMetrics` | Metric recording (counters, histograms, gauges) |
| `TelemetrySpan` | Span instrumentation for tracing |
| `Platform` | Platform detection, socket path utilities |
| `GitInfo` | Git repository detection |
| `PluginInfo` | Plugin metadata for telemetry attributes |
| `SidecarClient` | IPC client for sidecar communication |
| `SidecarClientPool` | Client lifecycle management |
| `SidecarLauncher` | Sidecar process spawning |

### Sidecar Architecture Overview

The OTEL system uses a sidecar process for telemetry collection. This
design ensures hooks remain fast (fire-and-forget) while telemetry
is reliably delivered.

```text
┌───────────────────────────────────────────────────────────────┐
│  Hook Processes (short-lived)                                  │
│  ───────────────────────────────────────────────────────────  │
│  - One process per hook invocation                             │
│  - Connect to sidecar via Unix socket                         │
│  - Send telemetry (fire-and-forget)                           │
│  - Auto-spawn sidecar if not running                          │
└───────────────────────────────────────────────────────────────┘
                                  │
                                  │ IPC (Unix Socket)
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  Sidecar Process (long-running)                                │
│  ───────────────────────────────────────────────────────────  │
│  - Listens on Unix domain socket                               │
│  - Receives telemetry from all hooks                          │
│  - Batches and exports to OTLP endpoint                       │
│  - Auto-terminates after idle timeout (default: 5 min)        │
│  - Can be resurrected by any hook                             │
└───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  OTLP Endpoint (Grafana, Datadog, etc.)                        │
└───────────────────────────────────────────────────────────────┘
```

### Sidecar Spawning and Handshake

The sidecar is spawned on-demand and can be resurrected if it dies.
Every hook follows the same pattern:

```text
Hook Process
       │
       ▼
1. Try to connect to existing sidecar socket
       │
       ├── Connected? ──▶ Send ping with config, then emit data
       │
       └── Not connected?
               │
               ▼
2. Check if socket file exists (sidecar may be starting)
       │
       ├── Exists? ──▶ Wait up to 1 second, retry connect
       │
       └── Doesn't exist?
               │
               ▼
3. Spawn new sidecar process
       │
       ▼
4. Wait for socket to become available (up to 2 seconds)
       │
       ▼
5. Send ping message with OTEL config
       │
       ▼
6. Emit telemetry data
```

This pattern allows:

- **SessionStart** to create the sidecar if not running
- **Subsequent hooks** to reconnect or resurrect a dead sidecar
- **New OTEL configs** to be applied on the fly via ping

### The Ping Handshake

The `ping` message is critical for sidecar initialization:

```typescript
// Client sends ping with config
{
  type: "ping",
  sessionId: "abc-123",
  config: {
    endpoint: "https://otel.example.com",
    protocol: "http",
    serviceName: "claude-code",
    headers: { "Authorization": "Bearer ..." }
  }
}

// Sidecar responds
{ ok: true, version: "1.0.0" }
```

On receiving a ping, the sidecar:

1. Stores session configuration
2. Initializes or reinitializes OTEL providers with the config
3. Allows config updates on the fly (endpoint, headers, etc.)

This means:

- If the sidecar was started with one endpoint, a new session with
  a different endpoint will update the sidecar configuration
- Hooks don't need to know if the sidecar was just spawned or already
  running - the ping handles both cases

### Idle Timeout and Resurrection

The sidecar auto-terminates after a configurable idle period:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Sidecar Lifecycle                                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Spawned ──▶ Receives messages ──▶ Idle timer resets            │
│                     │                                            │
│                     ▼                                            │
│             No messages for 5 min                                │
│                     │                                            │
│                     ▼                                            │
│             Sidecar exits (cleanup)                              │
│                     │                                            │
│                     ▼                                            │
│  [Next hook runs] ──▶ Spawns new sidecar ──▶ Ping with config   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Key behaviors:

- **Every message resets the idle timer** - Activity keeps sidecar alive
- **Graceful shutdown on SIGTERM/SIGINT** - Flushes pending telemetry
- **Socket cleanup** - Removes socket file on exit
- **Auto-resurrection** - Next hook spawns a fresh sidecar

### Message Queue and Fire-and-Forget

Hooks use non-blocking, fire-and-forget telemetry:

```typescript
class SidecarClient {
  private messageQueue: SidecarMessage[] = [];

  emit(message: SidecarMessage): void {
    if (this.state !== "connected") {
      // Queue message, attempt connection (spawn if needed)
      this.messageQueue.push(message);
      this.connectOrSpawn().then(() => this.drainQueue());
      return;
    }

    // Send immediately
    this.socket.write(serializeMessage(message));
  }

  // Before hook exits, flush pending messages
  async flush(timeoutMs = 1000): Promise<boolean> {
    // Wait for queue drain with timeout
    // Returns false if timed out (some messages may be lost)
  }
}
```

This ensures:

- Hooks never block on telemetry
- Messages are queued if sidecar is starting
- Flush before exit ensures delivery (with timeout)

### Message Protocol

Hooks send JSON Lines (newline-delimited JSON) over the socket:

```typescript
// Ping - Initialize providers, accept config updates
{ type: "ping", sessionId: "abc", config: {...} }

// Event - Log event with attributes
{ type: "event", sessionId: "abc", data: {...} }

// Metric - Record histogram/counter
{ type: "metric", sessionId: "abc", data: {...} }

// Span - Trace span
{ type: "span", sessionId: "abc", data: {...} }

// Shutdown - Session ended or request full shutdown
{ type: "shutdown", sessionId: "abc" }  // Session only
{ type: "shutdown" }                     // Full shutdown
```

### Event Types

| Event Name | Description |
| ---------- | ----------- |
| `claude_code.hook.execution` | Hook completed (outcome, duration) |
| `claude_code.hook.validation_error` | Schema validation failed |
| `claude_code.hook.env_error` | Environment validation failed |
| `claude_code.hook.fatal_error` | Uncaught exception |

## Command Runtime

Commands are CLI tools compiled into the plugin binary, invoked via
`--cmd=<name>`. They expose plugin functionality to Claude through
skill markdown files.

### Command Definition

Commands are defined in the plugin configuration alongside hooks:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: optionsSchema,
  setup: async (ctx) => { /* detection logic */ },

  // Commands - CLI tools invoked via --cmd=<name>
  commands: {
    lint: {
      description: "Fix lint errors across the codebase",
      args: z.object({
        _positionals: z.array(z.string()).optional().default(["."]),
        fix: z.boolean().optional().default(true),
      }),
      pipeline: "./commands/lint.cmd.ts",
    },
    test: {
      description: "Run tests and fix failures",
      args: z.object({
        _positionals: z.array(z.string()).optional().default([]),
      }),
      pipeline: "./commands/test.cmd.ts",
    },
  },

  hooks: { /* ... */ },
});

// Export types for command handlers
export type Commands = InferPluginCommands<typeof plugin>;
```

### Command Handler

Command handlers receive the same three-layer context as hooks:

```typescript
// commands/lint.cmd.ts
import type { CommandOutput } from "claude-binary-plugin/pipeline";
import type { Commands } from "../plugin.js";

const handler: Commands["lint"] = async ({
  args,
  options,
  state
}): Promise<CommandOutput> => {
  // args: Validated from Zod schema
  // options: Plugin options (TIMEOUT_MS, etc.) from Layer 2
  // state: Computed state from setup()

  const targetPaths = args._positionals;
  const results = await runLinters(targetPaths, state.enabled);

  return {
    exitCode: 0,  // 0=success, 1=issues found, 2=fatal error
    output: formatMarkdown(results),  // Markdown for LLM
  };
};

export default handler;
```

### Command Markdown Files

Commands are exposed to Claude via markdown files with explicit
instructions. The compiled command's job is to execute logic and
provide context back to Claude. The markdown file teaches Claude
how to invoke the command and interpret the output:

```markdown
---
allowed-tools: Bash, Read, Edit, TodoWrite
description: Fix lint errors across the codebase automatically
argument-hint: [path]
---

# Lint Command

Run the lint command to check and auto-fix code quality issues.

## Usage

\`\`\`bash
$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=lint $ARGUMENTS
\`\`\`

## Exit Codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 0    | Command executed successfully              |
| 2    | Script error (missing tools, config, etc.) |

## Process

1. **Run the lint command** - safe issues are auto-fixed
2. **Review output** - shows only errors requiring manual fix
3. **Fix errors** - use Read/Edit to address each issue
4. **Re-run until clean** - loop until all checks pass
```

Key elements:

- **Frontmatter** - `allowed-tools`, `description`, `argument-hint`
- **Usage section** - Shows the exact command invocation
- **Exit codes** - Helps Claude interpret success/failure
- **Process** - Guides Claude through the workflow

### Command Execution Flow

```text
┌───────────────────────────────────────────────────────────────┐
│  Claude sees command markdown                                  │
│  ───────────────────────────────────────────────────────────  │
│  Learns: $PLUGIN_DIR/plugin --cmd=lint [path]                 │
└───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  Claude invokes via Bash tool                                  │
│  ───────────────────────────────────────────────────────────  │
│  $ /path/to/workflow.plugin --cmd=lint src/                   │
└───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  Commands.run() in src/commands/runtime.ts                     │
│  ───────────────────────────────────────────────────────────  │
│  1. Parse CLI args: --key=value flags, positional args        │
│  2. Validate against Zod schema                                │
│  3. Find session env dir (SQLite, env vars, or cwd)           │
│  4. Load *hook*.sh files to restore persisted state           │
│  5. Decode {PREFIX}_PLUGIN_STATE from base64 JSON             │
│  6. Call handler({ args, options, state })                    │
│  7. Output markdown to stdout                                  │
│  8. Exit with code                                             │
└───────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  Claude receives markdown output                               │
│  ───────────────────────────────────────────────────────────  │
│  # Lint Results                                                │
│                                                                │
│  ## Issues Requiring Manual Fix                                │
│                                                                │
│  ### Biome                                                     │
│  - src/foo.ts:12 - Missing semicolon                          │
│  ...                                                           │
└───────────────────────────────────────────────────────────────┘
```

### Key Differences from Hooks

| Aspect | Hooks | Commands |
| ------ | ----- | -------- |
| Invocation | Auto via stdin JSON | CLI `--cmd=name` |
| Input | Hook event JSON | CLI arguments |
| Output | JSON response | Markdown text |
| Purpose | Intercept behavior | Expose tools |
| Exit codes | Handled by runtime | 0/1/2 |

### State Access

Commands have full access to the computed state from SessionStart:

```text
SessionStart (runs once at session begin)
       │
       ▼
setup() computes state ───▶ { packageManager, enabled, config }
       │
       ▼
State persisted to CLAUDE_ENV_FILE as base64 JSON
  (e.g., sessionstart-hook-0.sh or hook-0.sh)
       │
       ▼
Commands load state via:
  1. Commands.findSessionEnvDir() → session-env dir
     (SQLite registry, CLAUDE_ENV_FILE, *_PLUGIN_ENV_FILE, or cwd)
  2. PluginEnv.loadAllHookFiles(dir) → parse *hook*.sh files
  3. Decode {PREFIX}_PLUGIN_STATE → access in handler({ state })
```

This enables commands to use detection results without re-running:

```typescript
// In command handler - no need to detect, just use state
const handler: Commands["lint"] = async ({ state }) => {
  if (state.enabled.biome) {
    await runBiome(state.config.biome);
  }
  if (state.enabled.shellcheck) {
    await runShellcheck(state.config.shellcheckBin);
  }
  // ...
};
```

## File Structure Reference

```text
src/
├── index.ts              # Hook events, response builders
├── build/
│   ├── builder.ts        # PluginBuilder class, entrypoint gen
│   └── proxy-template.ts # Proxy script generator for distribution
├── cli/
│   ├── index.ts          # CLI binary, @effect/cli commands
│   └── macros.ts         # Build-time package version resolution
├── commands/
│   └── runtime.ts        # Commands class, arg parsing
├── core/
│   ├── schemas.ts        # Input Zod schemas
│   └── tool-inputs.ts    # Tool input types
├── state/
│   └── classes/
│       ├── PluginEnv.ts  # PluginEnv base class
│       ├── SessionRegistry.ts # SQLite session lookup
│       └── EnvCodecs.ts  # Zod codecs for env vars
├── events/
│   ├── classes/          # HookEvent classes
│   │   ├── HookEvent.ts  # Base class
│   │   ├── PreToolUseEvent.ts  # Tool use hooks
│   │   ├── PostToolUseEvent.ts
│   │   ├── SessionStartEvent.ts
│   │   ├── SessionEndEvent.ts
│   │   ├── StopEvent.ts
│   │   ├── SubagentStopEvent.ts
│   │   ├── UserPromptSubmitEvent.ts
│   │   ├── PreCompactEvent.ts
│   │   ├── NotificationEvent.ts
│   │   ├── PermissionRequestEvent.ts
│   │   ├── ResponseBuilders.ts # Response builder functions
│   │   └── SchemaValidator.ts  # Input validation
│   ├── types.ts          # Event types
│   ├── enums.ts          # HookType enum
│   └── response-types.ts # Response types
├── pipeline/
│   ├── config.ts         # ClaudeBinaryPlugin.create()
│   ├── types.ts          # Output types, Zod schemas
│   ├── metrics.ts        # Token estimation, metrics
│   └── classes/
│       ├── PipelineRuntime.ts # PipelineRuntime.run(), runRaw()
│       └── Pipeline.ts   # Pipeline utilities (type guards, metrics)
├── testing/
│   ├── mocks.ts          # Low-level test utilities
│   └── builder.ts        # PluginTester (see testing.md)
├── types/
│   ├── json.ts           # JSON types from type-fest, Zod schemas
│   ├── branded.ts        # Branded types (SessionId, ToolUseId, etc.)
│   └── utility.ts        # Type-fest re-exports (Jsonify, PartialDeep, etc.)
├── utils/
│   └── debug-logger.ts   # File-based debug logging
└── otel/
    ├── classes/          # Class-based API (primary)
    │   ├── OtelConfig.ts # Configuration parsing
    │   ├── Platform.ts   # Platform detection
    │   ├── GitInfo.ts    # Git repo detection
    │   ├── PluginInfo.ts # Plugin metadata
    │   ├── SessionEnv.ts # Session utilities
    │   ├── ClaudeAccountInfo.ts # Account detection
    │   ├── SidecarMessage.ts # Message serialization
    │   ├── SidecarClientPool.ts # Client management
    │   ├── SidecarLauncher.ts # Sidecar spawning
    │   ├── TelemetryEmitter.ts # Event emission
    │   ├── TelemetryMetrics.ts # Metric recording
    │   ├── TelemetrySpan.ts # Span instrumentation
    │   ├── SidecarClient.ts # IPC client
    │   └── Sidecar.ts    # Sidecar process entry point
    ├── sidecar/          # Sidecar process
    │   └── classes/      # Sidecar implementation
    │       ├── SidecarServer.ts # Unix socket server
    │       ├── SidecarRouter.ts # Message routing
    │       ├── SidecarProviders.ts # OTEL providers
    │       ├── SidecarExporters.ts # OTLP exporters
    │       ├── SidecarResource.ts # Resource attributes
    │       ├── SidecarLifecycle.ts # Idle timeout, shutdown
    │       ├── SidecarLog.ts # Log handler
    │       ├── EventHandler.ts # Event message handler
    │       ├── MetricHandler.ts # Metric message handler
    │       └── SpanHandler.ts # Span message handler
    ├── protocol.ts       # Message types
    └── version.macro.ts  # Build-time version injection
```

## Related Documentation

- `testing.md` - Testing utilities and fluent API
- `schema.md` - OTEL telemetry schema specification
