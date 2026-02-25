# Tool Filtering

PreToolUse and PostToolUse hooks support a `tools` array that limits the hook to specific tool names. This is a performance optimization and a clarity improvement: hooks only run when a matching tool is invoked, and the plugin configuration clearly shows which tools each hook handles.

## The tools Array

Add a `tools` array to a PreToolUse or PostToolUse hook definition to restrict which tool invocations trigger the hook:

```typescript
hooks: {
  PreToolUse: [
    {
      name: "security",
      tools: ["Bash"],          // Only fires for Bash tool
      pipeline: "./hooks/security.hook.ts",
    },
    {
      name: "file-guard",
      tools: ["Edit", "Write"], // Fires for Edit or Write tools
      pipeline: "./hooks/file-guard.hook.ts",
    },
  ],
  PostToolUse: [
    {
      name: "post-tool",
      tools: ["Bash"],          // Only fires after Bash completes
      pipeline: "./hooks/post-tool.hook.ts",
    },
  ],
},
```

## How It Becomes matcher in hooks.json

When the build system generates `hooks.json`, the `tools` array is converted to a pipe-separated `matcher` string:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=PreToolUse/security"
        }]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=PreToolUse/file-guard"
        }]
      }
    ]
  }
}
```

Claude Code uses the `matcher` field to decide whether to invoke the hook. If the tool name matches the pattern, the hook runs. If not, the hook is skipped entirely -- your plugin binary is never spawned.

## Hooks Without tools

If you omit the `tools` array, the hook runs for every tool invocation:

```typescript
PreToolUse: [
  {
    name: "audit-all",
    // No tools array -- fires for Bash, Edit, Write, Read, etc.
    pipeline: "./hooks/audit-all.hook.ts",
  },
],
```

In hooks.json, entries without `tools` have no `matcher` field and match everything.

## Performance Implications

Tool filtering is a fast-path optimization. When Claude Code checks `matcher` and finds no match, it skips the hook entirely. Your plugin binary is never spawned, stdin is never written, and no process is created.

For hooks without `tools`, the plugin binary launches on every tool call. If your handler needs to check the tool name and exit early for most tools, it is more efficient to declare the `tools` array up front:

```typescript
// Slower: spawns binary for every tool, checks inside handler
PreToolUse: [
  {
    name: "security",
    pipeline: "./hooks/security.hook.ts",
    // Every tool call spawns the binary
  },
],

// Faster: binary only spawns for Bash tool calls
PreToolUse: [
  {
    name: "security",
    tools: ["Bash"],
    pipeline: "./hooks/security.hook.ts",
  },
],
```

## Available Tool Names

These are the built-in Claude Code tool names you can use in the `tools` array:

| Tool | Description |
| --- | --- |
| `Bash` | Shell command execution |
| `Read` | File reading |
| `Write` | File creation and overwriting |
| `Edit` | String replacement in files |
| `Glob` | File pattern matching |
| `Grep` | Content search (ripgrep) |
| `Task` | Subagent spawning |
| `WebFetch` | Web page fetching |
| `WebSearch` | Web search |
| `NotebookEdit` | Jupyter notebook editing |
| `TodoRead` | Task list reading |
| `TodoWrite` | Task list writing |

Custom tool names from MCP servers are also supported. Use the exact tool name string.

## Multiple Hook Definitions Per Type

You can define multiple hooks for the same hook type, each targeting different tools:

```typescript
PreToolUse: [
  {
    name: "security",
    tools: ["Bash"],
    pipeline: "./hooks/security.hook.ts",
  },
  {
    name: "file-guard",
    tools: ["Edit", "Write"],
    pipeline: "./hooks/file-guard.hook.ts",
  },
  {
    name: "web-policy",
    tools: ["WebFetch", "WebSearch"],
    pipeline: "./hooks/web-policy.hook.ts",
  },
],
```

Each hook definition generates a separate entry in hooks.json with its own `matcher`. When Claude calls the Edit tool, only `file-guard` runs. When Claude calls Bash, only `security` runs.

## Passthrough Entries

You can mix compiled plugin hooks with native Claude Code hook entries using passthrough definitions. Passthrough entries are included verbatim in hooks.json:

```typescript
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
      command: "bash ./scripts/log-fetches.sh",
    }],
  },
],
```

Both entries appear in the generated hooks.json. The plugin hook compiles into the binary and routes through the standard pipeline. The passthrough hook runs the bash script directly without going through the SDK runtime.

## hooks.json Generation

The build system generates hooks.json with this routing structure:

- **SessionStart hooks** route through `scripts/setup-proxy.sh` for just-in-time compilation support
- **All other hooks** route directly to the compiled binary for zero overhead

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
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/my-plugin.plugin --hook=PreToolUse/file-guard"
        }]
      }
    ]
  }
}
```

The `${CLAUDE_PLUGIN_ROOT}` variable is provided by Claude Code at runtime and resolves to the plugin's installation directory.
