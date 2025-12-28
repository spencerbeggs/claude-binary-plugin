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
import { ClaudeBinaryPlugin } from "claude-binary-plugin/pipeline";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  // Environment variable prefix (e.g., MY_PLUGIN_DEBUG)
  prefix: "MY_PLUGIN",

  // Zod schema for validating plugin options from env vars
  schema: z.object({
    DEBUG: z.string().default("false").transform(v => v === "true"),
  }),

  // Runs at SessionStart to compute derived state
  setup: async ({ options, cwd, env }) => {
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
│  Validation: Zod schemas in src/schemas.ts                        │
│  Access: handler({ input, ... }) - the `input` parameter          │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Layer 2: OPTIONS                                                  │
│  ───────────────────────────────────────────────────────────────  │
│  Source: Environment variables with plugin prefix                  │
│  Content: User-configurable settings (DEBUG, API_KEY, etc.)       │
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
│  Access: handler({ env, ... }) - merged with base env paths       │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  Handler Function                                                  │
│  ───────────────────────────────────────────────────────────────  │
│  ({ input, options, env }) => PipelineOutput                      │
└───────────────────────────────────────────────────────────────────┘
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
  pipeline: async ({ input, options, env }) => {
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
command invocations:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/plugin.plugin --hook=SessionStart/context"
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

3. Runtime parses input with Zod schema (src/schemas.ts)
   PreToolUseInputSchema.parse(stdinData)

4. Runtime loads environment:
   - SessionStart: Load .env files, run setup()
   - Other hooks: Load from CLAUDE_ENV_FILE via session registry

5. Runtime calls handler with typed context
   handler({ input, options, env })

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
┌──────────────────┐
│  Write to        │───▶ ~/.claude/session-env/{uuid}/hook-0.sh
│  CLAUDE_ENV_FILE │
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
│  Look up session │◀── SessionRegistry.getBySessionId(session_id)
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Load hook-*.sh  │◀── Parse env file, decode base64 state
│  files           │
└──────────────────┘
       │
       ▼
│  State available in handler({ env: { packageManager, ... } })
```

## Build System

### Build Process

The `buildPlugin()` function in `src/builder.ts`:

1. **Generates entrypoint code** - Creates a TypeScript file that:
   - Imports the plugin configuration
   - Imports all hook handler modules
   - Creates the env class from schema
   - Routes CLI arguments to the correct hook handler
   - Calls `runPipeline()` with the right configuration

2. **Compiles to executable** - Uses `Bun.build()` with:
   - `target: "bun"` for Bun runtime
   - `bytecode: true` for faster startup (optional)
   - Single-file output with all dependencies bundled

3. **Generates manifest** - Creates `hooks.json`:
   - Lists all hook types and their handlers
   - Used by Claude Code to discover available hooks

### Generated Entrypoint Structure

```typescript
// Generated entrypoint (simplified)
import {
  runPipeline,
  createEnvClass
} from "claude-binary-plugin/pipeline-runtime";
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
    await runPipeline({
      hookType: "PreToolUse",
      hookName: "security",
      pipeline: securityHandler,
      envClass: EnvClass,
      tools: ["Bash"],
      setup: plugin.setup,
      schema: plugin.schema,
    });
    break;
  // ... other hooks
  default:
    handleUnknownHook(hookKey, validHooks);
}
```

## Runtime Execution

### runPipeline() Function

The core runtime function in `src/pipeline-runtime.ts`:

```text
runPipeline(options)
       │
       ├──▶ Create HookEvent from stdin
       │         │
       │         ▼
       │    EventClass.create({ stdin, stdout, stderr, envClass })
       │         │
       │         ▼
       │    Parse JSON, validate with Zod, create env instance
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
       │    output = await pipeline({ input, options, env })
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

## Environment Management

### ClaudeBinaryPluginEnv Class

The `ClaudeBinaryPluginEnv` class in `src/plugin-env.ts` provides:

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
  sessionEnvDir: ClaudeBinaryPluginEnv.getSessionEnvDir(event.session_id),
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
3. Write to hook-*.sh files in session-env directory
       │
       ▼
4. Register mapping in SQLite:
   SessionRegistry.register({
     sessionId,
     projectDir,
     sessionEnvDir
   })
       │
       ▼
[Subsequent hooks or commands]
       │
       ▼
1. Look up session-env dir via SessionRegistry
   - By sessionId (for hooks with CLAUDE_SESSION_ID)
   - By projectDir (for commands using cwd)
       │
       ▼
2. Load hook-*.sh files from session-env dir
       │
       ▼
3. Decode {PREFIX}_PLUGIN_STATE from base64
       │
       ▼
4. State available in handler({ env })
```

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

This approach works around Claude Code's env file bugs while providing
reliable state access for both hooks and commands.

## OTEL Integration

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
const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  schema: optionsSchema,
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
export type Commands = ClaudeBinaryPlugin.InferCommands<typeof plugin>;
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
  env
}): Promise<CommandOutput> => {
  // args: Validated from Zod schema
  // options: Plugin options (DEBUG, etc.) from Layer 2
  // env: Computed state from setup()

  const targetPaths = args._positionals;
  const results = await runLinters(targetPaths, env.enabled);

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
│  runCommand() in command-runtime.ts                            │
│  ───────────────────────────────────────────────────────────  │
│  1. Parse CLI args: --key=value flags, positional args        │
│  2. Validate against Zod schema                                │
│  3. Find session env dir (SQLite or CLAUDE_ENV_FILE)          │
│  4. Load hook-*.sh files to restore persisted state           │
│  5. Decode {PREFIX}_PLUGIN_STATE from base64 JSON             │
│  6. Call handler({ args, options, env })                      │
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
State persisted to hook-0.sh as base64 JSON
       │
       ▼
Commands load state via:
  1. SessionRegistry.getByProjectDir(cwd) → session-env dir
  2. ClaudeBinaryPluginEnv.loadAllHookFiles(dir) → parse hook-*.sh
  3. Decode {PREFIX}_PLUGIN_STATE → access in handler({ env })
```

This enables commands to use detection results without re-running:

```typescript
// In command handler - no need to detect, just use env
const handler: Commands["lint"] = async ({ env }) => {
  if (env.enabled.biome) {
    await runBiome(env.config.biome);
  }
  if (env.enabled.shellcheck) {
    await runShellcheck(env.config.shellcheckBin);
  }
  // ...
};
```

## File Structure Reference

```text
src/
├── index.ts              # Hook events, response builders
├── pipeline.ts           # ClaudeBinaryPlugin.create()
├── pipeline-runtime.ts   # runPipeline(), runRawHandler()
├── pipeline-types.ts     # Output types, Zod schemas
├── pipeline-metrics.ts   # Token estimation, metrics
├── command-runtime.ts    # runCommand(), arg parsing
├── builder.ts            # buildPlugin(), entrypoint gen
├── plugin-env.ts         # ClaudeBinaryPluginEnv base class
├── schemas.ts            # Input Zod schemas
├── session-registry.ts   # SQLite session lookup
├── debug-logger.ts       # File-based debug logging
├── mocks.ts              # Test utilities
└── otel/
    ├── index.ts          # OTEL module exports
    ├── client.ts         # SidecarClient for IPC
    ├── config.ts         # OTEL configuration
    ├── constants.ts      # Attribute/metric names
    ├── events.ts         # Event emitters
    ├── metrics.ts        # Metric recorders
    ├── instrumentation.ts# Span wrappers
    ├── protocol.ts       # Message serialization
    ├── platform.ts       # Socket path handling
    ├── spawn.ts          # Sidecar spawning
    ├── git-info.ts       # Git repo detection
    ├── plugin-info.ts    # Plugin metadata
    └── sidecar.ts        # Sidecar entry point
```
