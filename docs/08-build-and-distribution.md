# Build and Distribution

The `claude-binary-plugin` SDK compiles your plugin into a single-file Bun executable and provides a proxy-based system for cross-platform distribution. This guide covers the build command, generated artifacts, the proxy script architecture, and the end-to-end distribution workflow.

## Build Command

```bash
claude-binary-plugin build [plugin-config-path] [options]
```

When run without arguments, the CLI looks for `plugin.config.ts` in the current directory.

### Options

| Option | Description |
| --- | --- |
| (none) | Default build: compile binary, generate proxy script and hooks.json |
| `--no-persist` | Skip copying the binary to the local Claude Code plugins cache |
| `--no-bytecode` | Skip bytecode compilation (faster builds, larger binary) |
| `--bundle` | Output bundled JavaScript instead of a compiled binary (for debugging) |
| `--quiet` | Suppress all non-error output; skip proxy and hooks.json generation |

### Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Build completed successfully |
| 1 | Build failed (config error, compilation error) |

## Build Process

The build system performs four steps:

### Step 1: Generate Entrypoint

The builder reads your `plugin.config.ts` and generates a TypeScript entrypoint file (`.plugin-entrypoint.ts`) that:

- Imports your plugin configuration
- Imports all hook handler modules
- Creates a CLI argument router (`switch` on `--hook=Type/name`)
- Routes each hook to `PipelineRuntime.run()` with the correct configuration

```typescript
// Generated entrypoint (simplified)
import plugin from "./plugin.config.ts";
import securityHandler from "./hooks/security.hook.ts";

const hookKey = process.argv[2];  // e.g., "PreToolUse/security"

switch (hookKey) {
  case "PreToolUse/security":
    await PipelineRuntime.run({
      hookType: "PreToolUse",
      hookName: "security",
      pipeline: securityHandler,
      tools: ["Bash"],
    });
    break;
}
```

### Step 2: Compile to Executable

The generated entrypoint is compiled using `Bun.build()` with:

- `target: "bun"` for the Bun runtime
- `bytecode: true` for faster startup (unless `--no-bytecode`)
- Single-file output with all dependencies bundled

The result is a platform-specific executable (e.g., `my-plugin.plugin`).

### Step 3: Generate Proxy Script

Unless `--quiet` is set, the builder generates `scripts/setup-proxy.sh`. This bash script wraps SessionStart hooks to enable just-in-time compilation on new machines. See the [Proxy Script Architecture][proxy-architecture] section below for details.

### Step 4: Generate hooks.json

The builder generates a `hooks/hooks.json` manifest that Claude Code uses to discover and invoke plugin hooks. SessionStart hooks are routed through the proxy script, while all other hooks point directly at the binary.

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
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=PreToolUse/security"
        }]
      }
    ]
  }
}
```

Key points about hooks.json:

- `${CLAUDE_PLUGIN_ROOT}` is an environment variable provided by Claude Code
- `--hook=Type/name` identifies which hook handler to run
- `matcher` contains pipe-separated tool names for PreToolUse/PostToolUse filtering
- Multiple entries per hook type are supported

## Generated Artifacts

After a build completes, these files exist in your plugin directory:

```text
my-plugin/
  scripts/
    setup-proxy.sh         # Proxy script (commit to git)
  hooks/
    hooks.json             # Hook manifest (commit to git)
  my-plugin.plugin         # Compiled binary (.gitignore this)
  plugin.config.ts         # Plugin definition (commit to git)
  bun.lock                 # Lockfile (commit to git)
  node_modules/            # Dependencies (.gitignore this)
```

### What to Commit vs. Ignore

| File | Commit? | Reason |
| --- | --- | --- |
| `plugin.config.ts` | Yes | Source of truth for plugin definition |
| `hooks/hooks.json` | Yes | Claude Code hook discovery |
| `scripts/setup-proxy.sh` | Yes | Cross-platform build trigger |
| `bun.lock` | Yes | Reproducible installs |
| `src/` and `hooks/` source | Yes | Source code |
| `*.plugin` | No | Platform-specific binary |
| `node_modules/` | No | Installed per-machine |
| `.plugin-entrypoint.ts` | No | Temporary build artifact |
| `.build-lock/` | No | Temporary build lock |

Recommended `.gitignore`:

```text
*.plugin
node_modules/
.plugin-entrypoint.ts
.build-lock/
```

## Proxy Script Architecture

Compiled Bun executables are platform-specific. A binary built on macOS ARM64 will not run on Linux x86_64. The SDK solves this with a proxy script that performs just-in-time compilation on the target machine.

### Routing

```text
hooks.json Routing:

  SessionStart hooks --> scripts/setup-proxy.sh --> binary
  All other hooks    --> binary (directly)
```

Claude Code guarantees that SessionStart fires before any other hook type in a session. This means the proxy only needs to wrap SessionStart hooks. All other hooks point directly at the binary, which will exist after SessionStart completes.

### Execution Paths

The proxy script has three execution paths:

#### Fast Path (Zero Overhead)

When the binary and `node_modules/` both exist, the proxy calls `exec` to replace the shell process with the binary. There is no subprocess overhead.

```bash
# Binary exists + node_modules present?
exec "${BINARY_PATH}" "$@"
```

#### Slow Path (First Run on a New Machine)

When the binary is missing, the proxy performs an on-demand build:

1. Buffer stdin (the hook event JSON from Claude Code)
2. Acquire a `mkdir`-based lock (`.build-lock/` directory)
3. Run `bun install --silent`
4. Run `bun x claude-binary-plugin build --no-persist --quiet`
5. Verify the binary is executable
6. Forward the buffered stdin to the binary

#### Error Path (Build Failure)

If the build fails, the proxy communicates the failure to Claude Code via JSON on stdout and a human-readable message on stderr:

```json
{
  "additionalContext": "[Plugin Build Error] The my-plugin plugin failed to build on this machine. Error: bun install failed. The plugin hooks and commands will not be available this session. To retry, delete the plugin cache and restart the session."
}
```

Exit code 2 causes Claude Code to display the stderr output to the user.

### Build Lock

The proxy uses a `mkdir`-based lock to prevent concurrent builds when multiple hooks fire simultaneously. This mechanism is portable across macOS, Linux, and WSL because `mkdir` is atomic on all POSIX systems.

- Lock directory: `${PLUGIN_DIR}/.build-lock`
- Stale detection: lock older than 5 minutes is removed
- Wait behavior: if another process holds the lock, the proxy waits up to 5 minutes, then checks if the binary was built
- Cleanup: `trap` removes the lock directory on exit

### Self-Modification Protection

The proxy script is invoked with the `--quiet` flag during on-demand builds. When `--quiet` is set:

1. All non-error console output is suppressed
2. Proxy script regeneration is skipped entirely
3. hooks.json regeneration is skipped entirely

This prevents a critical bash bug: if the running proxy script were overwritten mid-execution, bash would read corrupted data from the modified file. Additionally, the entire proxy script is wrapped in a `{ ... }` compound command block, which causes bash to read the full script into memory before execution begins.

### Stat Portability

The proxy needs file modification times for stale lock detection. macOS and Linux use different `stat` flags:

- macOS: `stat -f %m <file>` (BSD stat)
- Linux: `stat -c %Y <file>` (GNU coreutils)

The `get_mtime()` function in the proxy script tries the macOS form first, falling back to GNU if that fails.

## Distribution Workflow

### Developer Machine

1. Run `claude-binary-plugin build` to compile the binary
2. The binary, proxy script, and hooks.json are all generated
3. Commit everything except the binary and `node_modules/`

### Teammate's Machine (First Session)

1. Clone or pull the repository
2. Claude Code starts a new session and fires SessionStart
3. hooks.json routes SessionStart through the proxy script
4. Proxy detects the missing binary and enters the slow path
5. `bun install` installs dependencies from the committed lockfile
6. `claude-binary-plugin build --no-persist --quiet` compiles for the local platform
7. The buffered stdin is forwarded to the newly built binary
8. The hook executes normally

### Teammate's Machine (Subsequent Hooks in Same Session)

1. hooks.json routes PreToolUse, PostToolUse, etc. directly to the binary
2. The binary already exists from the SessionStart build
3. No proxy overhead for non-SessionStart hooks

### Teammate's Machine (Subsequent Sessions)

1. SessionStart routes through the proxy again
2. Binary and `node_modules/` both exist, so the proxy takes the fast path
3. `exec` replaces the shell process with the binary -- zero overhead

## Build Options Explained

### --no-persist

By default, the build copies the compiled binary to the local Claude Code plugins cache (`~/.claude/plugins/`). This flag skips that step. Use it for CI builds or when deploying to a custom location.

### --no-bytecode

Bun supports compiling to bytecode for faster startup. This flag disables bytecode compilation, producing a binary that takes slightly longer to start but builds faster. Useful during development iteration when you rebuild frequently.

### --bundle

Instead of compiling to a native Bun executable, this outputs bundled JavaScript. The output can be inspected to debug bundling issues (missing dependencies, incorrect imports, etc.).

### --quiet

Suppresses all non-error output and skips proxy script and hooks.json generation. This flag is used internally by the proxy script during on-demand builds to prevent the self-modification problem described above. You generally should not use this flag directly unless you are generating the proxy and hooks.json separately.

[proxy-architecture]: #proxy-script-architecture
