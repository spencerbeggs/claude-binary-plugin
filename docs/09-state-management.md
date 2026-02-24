# State Management

Each hook invocation spawns a new process with no shared memory. The `claude-binary-plugin` SDK solves this with a state persistence system that serializes computed state at SessionStart and makes it available to all subsequent hooks and commands within the same session.

## The Problem

Claude Code plugins are compiled executables. Every time Claude Code invokes a hook, it spawns a fresh process:

```text
SessionStart   --> new process --> exits
PreToolUse     --> new process --> exits
PostToolUse    --> new process --> exits
--cmd=lint     --> new process --> exits
```

There is no shared memory between these processes. Any state computed during SessionStart (such as detected package manager, available tools, or project configuration) would be lost unless explicitly persisted.

Additionally, Claude Code provides a `CLAUDE_ENV_FILE` mechanism for persisting variables, but it has limitations:

- Binary execution spawns subshells where parent variables are lost
- The env file path can change or become unavailable between conversation turns
- Commands run outside hook context and have no `CLAUDE_ENV_FILE`

The SDK works around these limitations with its own persistence layer.

## Three-Layer Model Recap

Every hook handler receives context from three layers. For a detailed explanation, see the plugin configuration documentation.

| Layer | Source | Access |
| --- | --- | --- |
| Input | Claude Code via stdin (hook event JSON) | `handler({ input })` |
| Options | Environment variables validated by Zod schema | `handler({ options })` |
| State | `setup()` return value, persisted across hooks | `handler({ state })` |

The rest of this guide focuses on Layer 3 (State) and how it persists across process boundaries.

## PluginEnv Class

The `PluginEnv` class handles environment loading, validation, and persistence. It provides context-aware loading through the `forContext()` static method.

### SessionStart Context

During SessionStart, `PluginEnv` loads `.env` files from the project root:

```typescript
const env = await MyEnv.forContext("sessionStart", {
  hookName: "my-hook",
  sessionId: event.session_id,
  projectRoot: event.cwd,
});
```

This reads `.env`, `.env.local`, and `.env.{NODE_ENV}` files from the project directory. The Bun runtime auto-loads `.env` files, but `forContext("sessionStart")` ensures they are loaded from the correct project root.

### Hook Context

For non-SessionStart hooks, `PluginEnv` loads persisted variables from the session-env directory:

```typescript
const env = await MyEnv.forContext("hook", {
  hookName: "my-hook",
  sessionId: event.session_id,
  sessionEnvDir: PluginEnv.getSessionEnvDir(event.session_id),
});
```

### Command Context

Commands run via `--cmd=name` parse environment from CLI arguments:

```typescript
const { env, remainingArgs } = await MyEnv.forContext("command", {
  args: process.argv.slice(2),
  commandName: "lint",
});
```

## State Persistence Flow

State flows from SessionStart to all subsequent hooks and commands through a multi-step persistence process.

### Step 1: Setup Computes State

During SessionStart, the `setup()` function runs to compute derived state:

```typescript
const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),
  setup: async ({ options, cwd }) => {
    return {
      packageManager: await detectPackageManager(cwd),
      hasTests: await hasTestConfig(cwd),
    };
  },
  // ...
});
```

The object returned by `setup()` becomes the computed state.

### Step 2: State Is Serialized

The runtime serializes the state as a base64-encoded JSON string and stores it in a magic variable:

```bash
MY_PLUGIN_PLUGIN_STATE="eyJwYWNrYWdlTWFuYWdlciI6ImJ1biIsImhhc1Rlc3RzIjp0cnVlfQ=="
```

### Step 3: Written to CLAUDE_ENV_FILE

All magic variables, validated options, and serialized state are written to the session env file that Claude Code provides via `CLAUDE_ENV_FILE`:

```bash
# Written to ~/.claude/session-env/{uuid}/sessionstart-hook-0.sh
export MY_PLUGIN_PROJECT_DIR="/Users/x/my-project"
export MY_PLUGIN_PLUGIN_DIR="/Users/x/.claude/plugins/my-plugin"
export MY_PLUGIN_PLUGIN_ENV_FILE="/Users/x/.claude/session-env/{uuid}/sessionstart-hook-0.sh"
export MY_PLUGIN_PLUGIN_STATE="eyJwYWNrYWdlTWFuYWdlciI6ImJ1biJ9"
export MY_PLUGIN_TIMEOUT_MS="30000"
```

### Step 4: Session Registered in SQLite

The runtime registers the session mapping in a SQLite database so that subsequent hooks and commands can find the session-env directory:

```typescript
SessionRegistry.register({
  sessionId: event.session_id,
  projectDir: event.cwd,
  sessionEnvDir: dirname(claudeEnvFile),
});
```

The session-env directory is derived using `dirname(CLAUDE_ENV_FILE)`, not a regex. This is important because Claude Code has changed the file naming convention over time.

### Step 5: Subsequent Hooks Load State

When a non-SessionStart hook runs, the runtime:

1. Finds the session-env directory via the fallback chain
2. Loads all `*hook*.sh` files into `Bun.env`
3. Decodes `{PREFIX}_PLUGIN_STATE` from base64 JSON
4. Passes the typed state to the handler

```typescript
// The handler receives fully typed state
const handler: Pipeline["PreToolUse"] = async ({ input, options, state }) => {
  // state.packageManager is typed from setup() return
  if (state.packageManager === "bun") {
    // ...
  }
};
```

## Magic Variables

The SDK uses prefixed variables for reliable state transfer across process boundaries.

| Variable | Purpose |
| --- | --- |
| `{PREFIX}_PLUGIN_STATE` | Base64-encoded JSON of computed state from `setup()` |
| `{PREFIX}_PROJECT_DIR` | Absolute path to the user's project directory |
| `{PREFIX}_PLUGIN_DIR` | Absolute path to the plugin installation directory |
| `{PREFIX}_PLUGIN_ENV_FILE` | Path to the session env file |

With a prefix of `MY_PLUGIN`, the variables become:

```bash
MY_PLUGIN_PLUGIN_STATE="eyJwYWNrYWdlTWFuYWdlciI6ImJ1biJ9"
MY_PLUGIN_PROJECT_DIR="/Users/x/my-project"
MY_PLUGIN_PLUGIN_DIR="/Users/x/.claude/plugins/my-plugin"
MY_PLUGIN_PLUGIN_ENV_FILE="/Users/x/.claude/session-env/{uuid}/sessionstart-hook-0.sh"
```

## Session Env File Naming

Claude Code assigns a file path via `CLAUDE_ENV_FILE` for plugins to persist variables. The actual file lives in a session-env directory:

```text
~/.claude/session-env/{session-uuid}/
```

Claude Code has changed the naming convention for these files:

| Version | File Name | Example |
| --- | --- | --- |
| Old | `hook-{N}.sh` | `hook-0.sh`, `hook-1.sh` |
| New | `{hooktype}-hook-{N}.sh` | `sessionstart-hook-0.sh` |

The SDK handles both naming conventions through two design choices:

- `PluginEnv.loadAllHookFiles()` uses the glob pattern `*hook*.sh` to match both old and new naming. A glob of `hook-*.sh` would miss `sessionstart-hook-0.sh`.
- `PipelineRuntime.persistSessionEnv()` uses `dirname(CLAUDE_ENV_FILE)` to derive the session-env directory. A regex like `/\/hook-\d+\.sh$/` would fail on the new naming convention.

## SessionRegistry

The `SessionRegistry` class provides a SQLite-based lookup for session-to-env-dir mappings. The database is stored at `~/.claude/plugins/sessions.db`.

### Registering Sessions

Called automatically during SessionStart:

```typescript
import { SessionRegistry } from "claude-binary-plugin";

SessionRegistry.register({
  sessionId: "abc-123",
  projectDir: "/path/to/project",
  sessionEnvDir: "/Users/x/.claude/session-env/abc-123",
});
```

When a new session starts for the same project, all existing sessions for that project are updated to point to the new env directory. This ensures commands always find the most recent state.

### Looking Up Sessions

By session ID (used by hooks that have `CLAUDE_SESSION_ID`):

```typescript
const envDir = SessionRegistry.getBySessionId("abc-123");
```

By project directory (used by commands that lack session context):

```typescript
const envDir = SessionRegistry.getByProjectDir("/path/to/project");
```

### Automatic Cleanup

Sessions older than 7 days are automatically cleaned up:

```typescript
const deleted = SessionRegistry.cleanup();  // Default: 7 days
const deleted = SessionRegistry.cleanup(24 * 60 * 60);  // 24 hours
```

### Database Features

- WAL mode for concurrent read/write access from multiple hook processes
- Indexes on `project_dir` and `updated_at` for fast queries
- Automatic session expiration
- Silent failure on database errors (never crashes hooks)

## The findSessionEnvDir Fallback Chain

Both hooks and commands use a prioritized fallback chain to locate the session-env directory. This redundancy ensures state is accessible even in edge cases like continued conversations where environment variables may be stale.

### Hook Fallback Chain

| Priority | Source | When Available |
| --- | --- | --- |
| 1 | `SessionRegistry.getBySessionId(event.session_id)` | After SessionStart registered this session |
| 2 | `SessionRegistry.getBySessionId(CLAUDE_SESSION_ID)` | When Claude sets this env var |
| 3 | `dirname(CLAUDE_ENV_FILE)` | During active hook execution |
| 4 | `dirname(any *_PLUGIN_ENV_FILE env var)` | After SessionStart wrote magic vars |
| 5 | `SessionRegistry.getByProjectDir(cwd)` | Fallback using project directory |

### Command Fallback Chain

| Priority | Source | When Available |
| --- | --- | --- |
| 1 | `SessionRegistry.getBySessionId(CLAUDE_SESSION_ID)` | When Claude sets this env var |
| 2 | `dirname(CLAUDE_ENV_FILE)` | If env var is still available |
| 3 | `dirname(any *_PLUGIN_ENV_FILE env var)` | After SessionStart wrote magic vars |
| 4 | `SessionRegistry.getByProjectDir(cwd)` | Most common for commands |

Commands lack `event.session_id` (priority 1 in the hook chain) because they receive input via CLI arguments, not stdin JSON. The project directory fallback (priority 4) is the most common path for commands.

## Load-Before-Extract Ordering

There is a critical ordering constraint when loading state in non-SessionStart hooks and commands:

1. `PluginEnv.loadAllHookFiles(sessionEnvDir)` -- loads `*hook*.sh` files into `Bun.env`
2. `extractPersistedState(stateInstance)` -- reads `{PREFIX}_PLUGIN_STATE` from `Bun.env`

Step 1 **must** happen before step 2. Without loading the hook files first, `Bun.env` does not contain `{PREFIX}_PLUGIN_STATE` and `extractPersistedState()` returns an empty object `{}`. This ordering was the root cause of a bug where all non-SessionStart hooks returned empty responses.

## How Commands Access State

Commands are invoked via CLI (`--cmd=name`) and have no stdin JSON or session ID. They access state through this flow:

1. `Commands.findSessionEnvDir()` locates the session-env directory using the fallback chain (SQLite registry, env vars, or `cwd`)
2. `PluginEnv.loadAllHookFiles(dir)` reads `*hook*.sh` files into `Bun.env`
3. `extractPersistedState()` decodes `{PREFIX}_PLUGIN_STATE` from base64 JSON
4. The handler receives the fully typed state

```typescript
// In a command handler - state from setup() is available
const handler: Commands["lint"] = async ({ args, options, state }) => {
  // No need to re-detect; just use persisted state
  if (state.packageManager === "bun") {
    // run bun-specific linting
  }
};
```

This enables commands to use detection results computed during SessionStart without re-running expensive detection logic.
