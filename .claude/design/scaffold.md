# Scaffold Command

This document describes the `init` scaffolding command for the
`claude-binary-plugin` CLI.

## Overview

The `claude-binary-plugin init` command bootstraps new plugin projects
with all the files, configuration, and boilerplate needed to build and
distribute a Claude Code plugin. It supports two project types:

1. **Single Plugin** - A standalone plugin repository with hooks,
   commands, and skills
2. **Marketplace** - A monorepo containing multiple plugins with shared
   tooling and workspace configuration

The command operates in two modes: an **interactive wizard** that walks
users through project configuration step-by-step, and a **programmatic
mode** where all options are passed as CLI flags for scripting and CI.

```text
┌───────────────────────────────────────────────────────────────┐
│  claude-binary-plugin init                                     │
│  ─────────────────────────────────────────────────────────── │
│                                                                │
│  Interactive Mode (default)                                    │
│       │                                                        │
│       ▼                                                        │
│  @clack/prompts wizard                                         │
│       │                                                        │
│       ├── Project name                                         │
│       ├── Project type (plugin / marketplace)                  │
│       ├── Plugin prefix                                        │
│       ├── Description                                          │
│       ├── Hook selection                                       │
│       ├── Include commands?                                    │
│       ├── Include OTEL?                                        │
│       └── Confirm + scaffold                                   │
│                                                                │
│  Programmatic Mode (--name, --type, etc.)                      │
│       │                                                        │
│       ▼                                                        │
│  Skip prompts, validate flags, scaffold                        │
│                                                                │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│  Template Engine                                               │
│  ─────────────────────────────────────────────────────────── │
│                                                                │
│  1. Create directory structure                                 │
│  2. Generate files from templates                              │
│  3. Write package.json with dependencies                       │
│  4. Run bun install                                            │
│  5. Initialize git repository                                  │
│  6. Run initial build                                          │
│  7. Print next steps                                           │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

### Design Goals

- **Zero to working plugin in under a minute** - Scaffold, install, and
  build in one command
- **Correct from the start** - Generated code passes lint, typecheck,
  and tests immediately
- **Demonstrates best practices** - Templates show idiomatic patterns
  for hooks, commands, and testing
- **Cross-platform ready** - Scaffolded projects include the proxy
  script infrastructure for distribution
- **Type-safe by default** - All generated handlers use inferred types
  from `InferPluginPipeline` and `InferPluginCommands`

## Command Syntax

### Interactive Mode (Default)

```bash
claude-binary-plugin init
claude-binary-plugin init [directory]
```

When invoked without flags (or with only a target directory), the
command launches an interactive wizard using `@clack/prompts`.

### Programmatic Mode

```bash
claude-binary-plugin init [directory] [options]
```

All options can be passed as CLI flags to skip the interactive wizard.
If all required options are provided, the wizard is bypassed entirely.

### Arguments

| Argument | Description | Default |
| -------- | ----------- | ------- |
| `directory` | Target directory for the new project | Current directory name |

### Options

| Option | Type | Description |
| ------ | ---- | ----------- |
| `--name` | `string` | Project name (kebab-case) |
| `--type` | `string` | `plugin` or `marketplace` |
| `--prefix` | `string` | Env var prefix (SCREAMING_SNAKE) |
| `--description` | `string` | Plugin description |
| `--hooks` | `string[]` | Hook types to include |
| `--commands` | `boolean` | Include example command |
| `--otel` | `boolean` | Include OTEL telemetry setup |
| `--git` | `boolean` | Initialize git repository |
| `--install` | `boolean` | Run `bun install` after scaffold |
| `--yes` | `boolean` | Accept all defaults (skip wizard) |

**Defaults:** `--name` derives from directory, `--hooks` defaults
to `["SessionStart", "PreToolUse"]`, `--commands` and `--git` and
`--install` default to `true`, `--otel` defaults to `false`.

### Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Scaffold completed successfully |
| 1 | Scaffold failed (invalid options, write error, etc.) |

### Examples

```bash
# Interactive wizard
claude-binary-plugin init my-plugin

# Quick scaffold with defaults
claude-binary-plugin init my-plugin --yes

# Full programmatic scaffold
claude-binary-plugin init my-plugin \
  --type=plugin \
  --prefix=MY_PLUGIN \
  --description="Security and workflow hooks" \
  --hooks=SessionStart,PreToolUse,PostToolUse \
  --commands \
  --otel

# Marketplace scaffold
claude-binary-plugin init my-marketplace --type=marketplace
```

## Interactive Flow

The interactive wizard uses `@clack/prompts` for a polished CLI
experience. The flow adapts based on the selected project type.

```text
┌─────────────────────────────────────────────────────────────────┐
│  $ claude-binary-plugin init                                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Claude Binary Plugin - Project Scaffolder               │   │
│  │                                                          │   │
│  │  Create a new Claude Code plugin project with            │   │
│  │  hooks, commands, and cross-platform distribution.       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ◆ What is your project name?                                    │
│  │ my-plugin                                                     │
│  └                                                               │
│                                                                  │
│  ◆ What type of project?                                         │
│  │ ○ Single Plugin - One plugin with hooks and commands          │
│  │ ● Marketplace   - Multiple plugins in a monorepo             │
│  └                                                               │
│                                                                  │
│  ◆ Environment variable prefix?                                  │
│  │ MY_PLUGIN  (derived from name, editable)                      │
│  └                                                               │
│                                                                  │
│  ◆ Short description?                                            │
│  │ Security and workflow hooks for Claude Code                   │
│  └                                                               │
│                                                                  │
│  ◆ Which hooks do you want to include?                           │
│  │ ◻ SessionStart (recommended)                                  │
│  │ ◼ PreToolUse                                                  │
│  │ ◻ PostToolUse                                                 │
│  │ ◻ Stop                                                        │
│  │ ◻ UserPromptSubmit                                            │
│  │ ◻ Notification                                                │
│  └                                                               │
│                                                                  │
│  ◆ Include an example command?                                   │
│  │ Yes                                                           │
│  └                                                               │
│                                                                  │
│  ◆ Include OTEL telemetry?                                       │
│  │ No                                                            │
│  └                                                               │
│                                                                  │
│  ◆ Ready to scaffold?                                            │
│  │                                                               │
│  │  Name:     my-plugin                                          │
│  │  Type:     Single Plugin                                      │
│  │  Prefix:   MY_PLUGIN                                          │
│  │  Hooks:    SessionStart, PreToolUse                           │
│  │  Commands: Yes                                                │
│  │  OTEL:     No                                                 │
│  │                                                               │
│  │ Yes                                                           │
│  └                                                               │
│                                                                  │
│  ◇ Creating project structure...                                 │
│  ◇ Writing plugin configuration...                               │
│  ◇ Generating hook handlers...                                   │
│  ◇ Generating command handler...                                 │
│  ◇ Writing package.json...                                       │
│  ◇ Running bun install...                                        │
│  ◇ Initializing git repository...                                │
│  ◇ Running initial build...                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Project scaffolded successfully!                        │   │
│  │                                                          │   │
│  │  cd my-plugin                                            │   │
│  │  claude-binary-plugin build                              │   │
│  │                                                          │   │
│  │  See CLAUDE.md for development instructions.             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### SessionStart Enforcement

SessionStart is always included regardless of user selection. The proxy
script distribution system requires at least one SessionStart hook to
trigger just-in-time compilation on new machines. If the user deselects
SessionStart, it is silently re-added with a note:

```text
◇ Note: SessionStart hook is required for cross-platform
  distribution and has been included automatically.
```

### Cancel Handling

All prompts check for cancellation via `@clack/prompts`' `isCancel()`.
If the user presses Ctrl+C at any point:

```text
◇ Scaffold cancelled.
```

Exit code 1.

## Single Plugin Template

### Directory Structure

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version)
├── hooks/
│   ├── context.hook.ts          # SessionStart: inject project context
│   └── security.hook.ts         # PreToolUse: tool filtering (if selected)
├── commands/
│   └── example.cmd.ts           # Example command handler (if selected)
├── skills/
│   └── example.md               # Example skill markdown (if commands selected)
├── tests/
│   ├── context.hook.test.ts     # SessionStart hook tests
│   ├── security.hook.test.ts    # PreToolUse hook tests (if selected)
│   └── example.cmd.test.ts      # Command tests (if selected)
├── plugin.config.ts             # ClaudeBinaryPlugin.create() definition
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── biome.jsonc                  # Linter/formatter configuration
├── .gitignore                   # Excludes binary, node_modules, build artifacts
└── CLAUDE.md                    # LLM context for developing this plugin
```

### Generated File Contents

#### .claude-plugin/plugin.json

The plugin manifest tells Claude Code about the plugin and provides the
name used for the compiled binary:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Security and workflow hooks for Claude Code"
}
```

#### plugin.config.ts

The main plugin definition. This is the file `claude-binary-plugin build`
reads to generate the compiled binary:

```typescript
// plugin.config.ts — Plugin definition for my-plugin
//
// This file defines your plugin's configuration, options schema,
// setup function, hooks, and commands. It is the single source of
// truth for what your plugin does.
//
// Build: claude-binary-plugin build
// Test:  bun test

import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferPluginPipeline } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  // Environment variable prefix. All options become {PREFIX}_{OPTION}.
  // Example: MY_PLUGIN_DEBUG, MY_PLUGIN_TIMEOUT_MS
  prefix: "MY_PLUGIN",

  // Options schema — validated from environment variables at startup.
  // Set these in your .env file or Claude Code settings.json.
  options: z.object({
    // String "true"/"false" → boolean transform (common pattern for env vars)
    DEBUG: z.string().default("false").transform((v) => v !== "false"),
    // Numeric env var with coercion and default
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),

  // Setup runs once at SessionStart to compute derived state.
  // The returned object is persisted and available to all hooks and commands.
  setup: async ({ options, cwd, baseState }) => {
    return {
      // Add your detection logic here. For example:
      // packageManager: await detectPackageManager(cwd),
      // gitRepo: await isGitRepo(cwd),
    };
  },

  // Hook definitions — see architecture.md for hook types and capabilities.
  hooks: {
    SessionStart: [
      {
        name: "context",
        pipeline: "./hooks/context.hook.ts",
      },
    ],
    PreToolUse: [
      {
        name: "security",
        tools: ["Bash"],
        pipeline: "./hooks/security.hook.ts",
      },
    ],
  },

  // Command definitions — CLI tools invoked via --cmd=<name>.
  // Commands are exposed to Claude through skill markdown files.
  commands: {
    example: {
      description: "Example command that echoes arguments",
      args: z.object({
        _positionals: z.array(z.string()).optional().default([]),
      }),
      pipeline: "./commands/example.cmd.ts",
    },
  },
});

// Export type helpers for hook and command handlers.
// Use these in your handler files for full type inference:
//   import type { Pipeline } from "../plugin.config.js";
//   const handler: Pipeline["PreToolUse"] = ...
export type Pipeline = InferPluginPipeline<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

export default plugin;
```

When hooks or commands are not selected, the corresponding sections are
omitted from the generated file.

#### hooks/context.hook.ts (SessionStart)

The SessionStart hook runs when Claude Code begins a new session. Its
primary purpose is to inject context that helps Claude understand the
project:

```typescript
// hooks/context.hook.ts — SessionStart hook
//
// Runs once when Claude Code starts a new session.
// Returns context that Claude sees as system instructions.
//
// Handler type: Pipeline["SessionStart"]
// Input:  { source: "startup" | "resume" | "clear" | "compact" }
// Output: SessionStartPipelineOutput

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionStart"] = async ({ input, options, state }) => {
  // Build context lines based on detected state.
  // This context appears in Claude's system prompt.
  const lines: string[] = [
    "# My Plugin Context",
    "",
    `Session source: ${input.source}`,
    `Debug mode: ${options.DEBUG}`,
  ];

  return {
    status: "executed",
    action: "context",
    summary: "added project context",
    claudeContext: lines.join("\n"),
  };
};

export default handler;
```

#### hooks/security.hook.ts (PreToolUse)

The PreToolUse hook intercepts tool calls before they execute. This
example shows the allow/deny pattern for Bash commands:

```typescript
// hooks/security.hook.ts — PreToolUse hook for Bash tool
//
// Runs before Claude executes a tool. Can allow, deny, or modify.
// The `tools: ["Bash"]` filter in plugin.config.ts means this only
// runs for Bash tool invocations — other tools skip this hook entirely.
//
// Handler type: Pipeline["PreToolUse"]
// Input:  { tool_name, tool_input, tool_use_id }
// Output: PreToolUsePipelineOutput

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PreToolUse"] = async ({ input, options, state }) => {
  const toolInput = input.tool_input as { command?: string };
  const command = toolInput.command ?? "";

  // Example: deny dangerous commands
  const blocked = ["rm -rf /", "sudo rm", "mkfs", "dd if="];
  for (const pattern of blocked) {
    if (command.includes(pattern)) {
      return {
        status: "executed",
        action: "deny",
        summary: `blocked: ${pattern}`,
        reason: `Command contains blocked pattern: ${pattern}`,
      };
    }
  }

  // Allow everything else
  return {
    status: "executed",
    action: "allow",
    summary: "allowed command",
  };
};

export default handler;
```

#### commands/example.cmd.ts

Commands are CLI tools compiled into the binary and invoked via
`--cmd=<name>`. They output markdown for Claude to consume:

```typescript
// commands/example.cmd.ts — Example command
//
// Invoked via: ./my-plugin.plugin --cmd=example [args...]
// Claude learns about this command from skills/example.md.
//
// Handler type: Commands["example"]
// Input:  { args, options, state }
// Output: CommandOutput { exitCode, output }

import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["example"] = async ({
  args,
  options,
  state,
}): Promise<CommandOutput> => {
  const positionals = args._positionals;

  return {
    exitCode: 0,
    output: [
      "# Example Command",
      "",
      `Arguments: ${positionals.length > 0 ? positionals.join(", ") : "(none)"}`,
      `Debug: ${options.DEBUG}`,
      `Project: ${state.projectDir}`,
    ].join("\n"),
  };
};

export default handler;
```

#### skills/example.md

The skill file teaches Claude how to invoke the command. It includes
frontmatter for Claude Code's skill system:

````markdown
---
allowed-tools: Bash
description: Example command that echoes arguments
argument-hint: [args...]
---

# Example Command

Run the example command to test your plugin setup.

## Usage

```bash
$MY_PLUGIN_PLUGIN_DIR/my-plugin.plugin --cmd=example $ARGUMENTS
```

## Exit Codes

| Code | Meaning                        |
| ---- | ------------------------------ |
| 0    | Command executed successfully  |
| 2    | Script error                   |
````

#### tests/context.hook.test.ts

Tests use the `PluginTester` fluent API. Each hook gets a dedicated
test file:

```typescript
// tests/context.hook.test.ts — Tests for SessionStart/context hook

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionStart/context hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("adds context on startup", async () => {
    const result = await ctx
      .withSessionStartInput({ source: "startup" })
      .runHook("SessionStart", "context");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("context");
    expect(result.context).toContain("My Plugin Context");
  });

  test("works on resume", async () => {
    const result = await ctx
      .withSessionStartInput({ source: "resume" })
      .runHook("SessionStart", "context");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("context");
  });
});
```

#### tests/security.hook.test.ts

```typescript
// tests/security.hook.test.ts — Tests for PreToolUse/security hook

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/security hook", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("allows safe commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "git status" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("allow");
  });

  test("blocks dangerous commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("rm -rf /");
  });
});
```

#### package.json

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Security and workflow hooks for Claude Code",
  "type": "module",
  "scripts": {
    "build": "claude-binary-plugin build",
    "test": "bun test",
    "lint": "biome check --write",
    "typecheck": "bun x tsc --noEmit"
  },
  "dependencies": {
    "claude-binary-plugin": "^1.0.0"
  },
  "peerDependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "^1.3.0",
    "typescript": "^5.9.0",
    "zod": "^4.3.0"
  }
}
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["bun-types"]
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### biome.jsonc

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "indentStyle": "tab",
    "lineWidth": 120
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

#### .gitignore

```text
# Dependencies
node_modules/

# Plugin binary (platform-specific, built on each machine)
*.plugin

# Build artifacts
.plugin-entrypoint.ts
.build-lock/

# Environment
.env.local

# OS files
.DS_Store
```

#### CLAUDE.md

```markdown
# my-plugin

Claude Code plugin for security and workflow hooks.

## Development

Build: `claude-binary-plugin build`
Test: `bun test`
Lint: `bun run lint`
Typecheck: `bun run typecheck`

## Architecture

This plugin uses the `claude-binary-plugin` SDK to compile hooks and
commands into a single Bun executable.

### Hooks

| Hook | File | Purpose |
| ---- | ---- | ------- |
| SessionStart/context | hooks/context.hook.ts | Inject project context |
| PreToolUse/security | hooks/security.hook.ts | Filter dangerous commands |

### Commands

| Command | File | Purpose |
| ------- | ---- | ------- |
| example | commands/example.cmd.ts | Example command |

### Testing

Tests use the `PluginTester` fluent API from `claude-binary-plugin`.
Run `bun test` to execute all tests.
```

## Marketplace Template

### Marketplace Directory Structure

```text
my-marketplace/
├── .claude-plugin/
│   └── marketplace.json             # Marketplace manifest
├── plugins/
│   └── example-plugin/
│       ├── .claude-plugin/
│       │   └── plugin.json          # Plugin manifest
│       ├── hooks/
│       │   ├── context.hook.ts      # SessionStart hook
│       │   └── security.hook.ts     # PreToolUse hook (if selected)
│       ├── commands/
│       │   └── example.cmd.ts       # Example command (if selected)
│       ├── skills/
│       │   └── example.md           # Skill file (if commands selected)
│       ├── tests/
│       │   ├── context.hook.test.ts
│       │   ├── security.hook.test.ts
│       │   └── example.cmd.test.ts
│       ├── plugin.config.ts         # Plugin definition
│       ├── package.json             # Plugin-level package.json
│       ├── tsconfig.json            # Extends root, composite: true
│       └── biome.jsonc              # Extends root biome config
├── package.json                     # Workspace root
├── tsconfig.json                    # Root with project references
├── biome.jsonc                      # Root biome configuration
├── turbo.json                       # Turborepo task orchestration
├── .gitignore                       # Workspace-level ignores
└── CLAUDE.md                        # LLM context for the marketplace
```

### Marketplace-Specific Files

#### .claude-plugin/marketplace.json

```json
{
  "name": "my-marketplace",
  "version": "0.1.0",
  "description": "A marketplace of Claude Code plugins",
  "plugins": [
    {
      "name": "example-plugin",
      "source": "plugins/example-plugin"
    }
  ]
}
```

#### Root package.json

```json
{
  "name": "my-marketplace",
  "version": "0.1.0",
  "private": true,
  "description": "A marketplace of Claude Code plugins",
  "type": "module",
  "workspaces": ["plugins/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "turbo": "^2.8.0",
    "typescript": "^5.9.0"
  }
}
```

#### Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "types": ["bun-types"]
  },
  "references": [
    { "path": "plugins/example-plugin" }
  ]
}
```

#### Root biome.jsonc

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "indentStyle": "tab",
    "lineWidth": 120
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

#### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["*.plugin", "hooks/hooks.json", "scripts/setup-proxy.sh"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^typecheck"]
    }
  }
}
```

#### Plugin-Level package.json (plugins/example-plugin/)

```json
{
  "name": "example-plugin",
  "version": "0.1.0",
  "description": "Example plugin",
  "type": "module",
  "scripts": {
    "build": "claude-binary-plugin build",
    "test": "bun test",
    "lint": "biome check --write",
    "typecheck": "bun x tsc --noEmit"
  },
  "dependencies": {
    "claude-binary-plugin": "^1.0.0"
  },
  "peerDependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "zod": "^4.3.0"
  }
}
```

#### Plugin-Level tsconfig.json (plugins/example-plugin/)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### Plugin-Level biome.jsonc (plugins/example-plugin/)

```json
{
  "extends": ["//"]
}
```

The hook, command, skill, and test files within each plugin follow the
exact same templates as the single plugin project.

## Implementation Architecture

### File Locations

```text
src/
├── cli/
│   ├── index.ts               # Root CLI — add initCommand to withSubcommands
│   ├── macros.ts              # Existing — package version resolution
│   └── init/
│       ├── index.ts           # Init command definition (@effect/cli)
│       ├── wizard.ts          # Interactive wizard (@clack/prompts)
│       ├── scaffold.ts        # Template engine (file generation)
│       └── templates/
│           ├── shared.ts      # Shared template helpers
│           ├── plugin.ts      # Single plugin templates
│           └── marketplace.ts # Marketplace templates
```

### Module Responsibilities

#### src/cli/init/index.ts

The `@effect/cli` command definition. Parses CLI arguments, determines
whether to run the interactive wizard or programmatic mode, then
delegates to the scaffold engine:

```typescript
import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { runWizard } from "./wizard.js";
import { scaffold } from "./scaffold.js";

// CLI argument/option definitions
const directory = Args.directory({ name: "directory" }).pipe(
  Args.withDefault("."),
);

const name = Options.text("name").pipe(
  Options.optional,
  Options.withDescription("Project name (kebab-case)"),
);

const type = Options.choice("type", ["plugin", "marketplace"]).pipe(
  Options.optional,
  Options.withDescription("Project type"),
);

// ... other options

export const initCommand = Command.make(
  "init",
  { directory, name, type, /* ... */ },
  (opts) => Effect.gen(function* () {
    // If all required options present → programmatic mode
    // Otherwise → interactive wizard
    const config = opts.name && opts.type
      ? buildConfigFromFlags(opts)
      : yield* Effect.promise(() => runWizard(opts));

    yield* Effect.promise(() => scaffold(config));
  }),
);
```

#### src/cli/init/wizard.ts

The interactive wizard using `@clack/prompts`. Each prompt maps to a
configuration option:

```typescript
import * as p from "@clack/prompts";

export interface ScaffoldConfig {
  directory: string;
  name: string;
  type: "plugin" | "marketplace";
  prefix: string;
  description: string;
  hooks: string[];
  includeCommands: boolean;
  includeOtel: boolean;
  initGit: boolean;
  runInstall: boolean;
}

export async function runWizard(
  defaults: Partial<ScaffoldConfig>,
): Promise<ScaffoldConfig> {
  p.intro("Claude Binary Plugin - Project Scaffolder");

  const config = await p.group({
    name: () => p.text({
      message: "What is your project name?",
      initialValue: defaults.name ?? "",
      validate: (v) => {
        if (!v) return "Name is required";
        if (!/^[a-z][a-z0-9-]*$/.test(v)) return "Must be kebab-case";
      },
    }),
    type: () => p.select({
      message: "What type of project?",
      options: [
        { value: "plugin", label: "Single Plugin" },
        { value: "marketplace", label: "Marketplace" },
      ],
    }),
    // ... remaining prompts
  }, {
    onCancel: () => {
      p.cancel("Scaffold cancelled.");
      process.exit(1);
    },
  });

  return { ...defaults, ...config } as ScaffoldConfig;
}
```

#### src/cli/init/scaffold.ts

The template engine that creates directories and writes files:

```typescript
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ScaffoldConfig } from "./wizard.js";
import { generatePluginProject } from "./templates/plugin.js";
import { generateMarketplaceProject } from "./templates/marketplace.js";

export interface GeneratedFile {
  path: string;      // Relative to project root
  content: string;   // File contents
  executable?: boolean; // Set +x flag
}

export async function scaffold(config: ScaffoldConfig): Promise<void> {
  const files = config.type === "plugin"
    ? generatePluginProject(config)
    : generateMarketplaceProject(config);

  // Create directories and write files
  for (const file of files) {
    const fullPath = join(config.directory, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await Bun.write(fullPath, file.content);
    if (file.executable) {
      await Bun.$`chmod +x ${fullPath}`.quiet();
    }
  }

  // Post-scaffold steps
  if (config.runInstall) {
    await Bun.$`cd ${config.directory} && bun install`.quiet();
  }
  if (config.initGit) {
    await Bun.$`cd ${config.directory} && git init`.quiet();
  }
}
```

#### src/cli/init/templates/shared.ts

Shared template generation helpers:

```typescript
export function toScreamingSnake(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

export function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function generatePluginConfig(config: ScaffoldConfig): string {
  // Generates plugin.config.ts content based on selected hooks/commands
}

export function generateHookHandler(
  hookType: string,
  hookName: string,
  prefix: string,
): string {
  // Generates hook handler file content
}

export function generateCommandHandler(
  commandName: string,
  prefix: string,
): string {
  // Generates command handler file content
}

export function generateTest(
  hookType: string,
  hookName: string,
): string {
  // Generates test file content
}
```

### CLI Integration

The init command is added to the root command alongside the existing
build command:

```typescript
// src/cli/index.ts (modified)
import { initCommand } from "./init/index.js";

const rootCommand = Command.make("claude-binary-plugin", {}, () =>
  Console.log("Use 'claude-binary-plugin build' or 'init'. Run with --help."),
).pipe(Command.withSubcommands([buildCommand, initCommand]));
```

### Dependency: @clack/prompts

Add `@clack/prompts` as a regular dependency (not devDependency) since
the CLI binary ships with the SDK:

```json
{
  "dependencies": {
    "@clack/prompts": "^0.10.0"
  }
}
```

The `@clack/prompts` package is small (~15KB) and has zero dependencies,
making it suitable for inclusion in the CLI binary.

## Name Derivation

When the user provides a project name, several derived values are
computed automatically:

| Input | Derivation | Example |
| ----- | ---------- | ------- |
| Name | As provided (kebab-case) | `my-plugin` |
| Prefix | SCREAMING_SNAKE_CASE of name | `MY_PLUGIN` |
| Binary name | `{name}.plugin` | `my-plugin.plugin` |
| Plugin dir var | `${PREFIX}_PLUGIN_DIR` | `$MY_PLUGIN_PLUGIN_DIR` |

The prefix is editable in the interactive wizard. In programmatic mode,
`--prefix` overrides the derived value.

## Cross-Platform Distribution

Scaffolded projects include all infrastructure for the proxy-based
cross-platform distribution system described in `architecture.md`.

### What Gets Generated

The `claude-binary-plugin build` command (run during scaffold) generates:

1. `scripts/setup-proxy.sh` - Proxy script for just-in-time compilation
2. `hooks/hooks.json` - Hook manifest routing SessionStart through proxy
3. `my-plugin.plugin` - Compiled binary (`.gitignore`'d)

### What Gets Committed

The `.gitignore` template excludes platform-specific artifacts:

| File | Committed | Reason |
| ---- | --------- | ------ |
| `plugin.config.ts` | Yes | Source of truth |
| `hooks/hooks.json` | Yes | Claude Code discovery |
| `scripts/setup-proxy.sh` | Yes | Cross-platform build trigger |
| `bun.lock` | Yes | Reproducible installs |
| `*.plugin` | No | Platform-specific binary |
| `node_modules/` | No | Installed per-machine |
| `.plugin-entrypoint.ts` | No | Build artifact |

### End-to-End: Scaffold to Distribution

```text
Developer Machine:
  1. claude-binary-plugin init my-plugin
  2. Scaffold creates all files
  3. bun install runs automatically
  4. claude-binary-plugin build runs automatically
  5. Binary + proxy + hooks.json all generated
  6. git init creates repository
  7. Developer commits source + proxy + hooks.json

Teammate's Machine:
  1. git clone the repository
  2. Claude Code session starts
  3. SessionStart routes through proxy
  4. Proxy detects missing binary → slow path
  5. bun install → claude-binary-plugin build --quiet
  6. Binary compiled for local platform
  7. Plugin works identically
```

## Testing Strategy

### Unit Tests for the Scaffold System

Tests for the scaffold system verify file generation without actually
writing to disk. The template functions return `GeneratedFile[]` arrays
that can be inspected:

```typescript
import { describe, test, expect } from "bun:test";
import { generatePluginProject } from "./templates/plugin.js";

describe("Single plugin scaffold", () => {
  const config = {
    directory: "/tmp/test-plugin",
    name: "test-plugin",
    type: "plugin" as const,
    prefix: "TEST_PLUGIN",
    description: "A test plugin",
    hooks: ["SessionStart", "PreToolUse"],
    includeCommands: true,
    includeOtel: false,
    initGit: false,
    runInstall: false,
  };

  test("generates correct file list", () => {
    const files = generatePluginProject(config);
    const paths = files.map((f) => f.path);

    expect(paths).toContain("plugin.config.ts");
    expect(paths).toContain(".claude-plugin/plugin.json");
    expect(paths).toContain("hooks/context.hook.ts");
    expect(paths).toContain("hooks/security.hook.ts");
    expect(paths).toContain("commands/example.cmd.ts");
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
  });

  test("generates valid plugin.config.ts", () => {
    const files = generatePluginProject(config);
    const configFile = files.find((f) => f.path === "plugin.config.ts");

    expect(configFile?.content).toContain('prefix: "TEST_PLUGIN"');
    expect(configFile?.content).toContain("SessionStart");
    expect(configFile?.content).toContain("PreToolUse");
    expect(configFile?.content).toContain("commands:");
  });

  test("omits commands when not selected", () => {
    const noCommands = { ...config, includeCommands: false };
    const files = generatePluginProject(noCommands);
    const paths = files.map((f) => f.path);

    expect(paths).not.toContain("commands/example.cmd.ts");
    expect(paths).not.toContain("skills/example.md");

    const configFile = files.find((f) => f.path === "plugin.config.ts");
    expect(configFile?.content).not.toContain("commands:");
  });

  test("always includes SessionStart", () => {
    const noSessionStart = {
      ...config,
      hooks: ["PreToolUse"],
    };
    const files = generatePluginProject(noSessionStart);
    const configFile = files.find((f) => f.path === "plugin.config.ts");

    // SessionStart is enforced even when not selected
    expect(configFile?.content).toContain("SessionStart");
  });

  test("generates valid package.json", () => {
    const files = generatePluginProject(config);
    const pkg = files.find((f) => f.path === "package.json");
    const parsed = JSON.parse(pkg!.content);

    expect(parsed.name).toBe("test-plugin");
    expect(parsed.dependencies["claude-binary-plugin"]).toBeDefined();
    expect(parsed.peerDependencies.zod).toBeDefined();
  });
});
```

### Integration Tests

Integration tests scaffold a project in a temp directory, then verify
the generated project actually builds and tests pass:

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "./scaffold.js";

describe("Scaffold integration", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true });
  });

  test("scaffolded plugin builds successfully", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "scaffold-test-"));
    const projectDir = join(tempDir, "test-plugin");

    await scaffold({
      directory: projectDir,
      name: "test-plugin",
      type: "plugin",
      prefix: "TEST_PLUGIN",
      description: "Test",
      hooks: ["SessionStart", "PreToolUse"],
      includeCommands: true,
      includeOtel: false,
      initGit: false,
      runInstall: true,
    });

    // Verify build works
    const build = await Bun.$`cd ${projectDir} && claude-binary-plugin build`
      .quiet().nothrow();
    expect(build.exitCode).toBe(0);
  }, 30000);

  test("scaffolded plugin tests pass", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "scaffold-test-"));
    const projectDir = join(tempDir, "test-plugin");

    await scaffold({
      directory: projectDir,
      name: "test-plugin",
      type: "plugin",
      prefix: "TEST_PLUGIN",
      description: "Test",
      hooks: ["SessionStart", "PreToolUse"],
      includeCommands: true,
      includeOtel: false,
      initGit: false,
      runInstall: true,
    });

    // Verify tests pass
    const test = await Bun.$`cd ${projectDir} && bun test`
      .quiet().nothrow();
    expect(test.exitCode).toBe(0);
  }, 30000);
});
```

### What to Test

| Category | Tests |
| -------- | ----- |
| File generation | Correct files created for each project type |
| Template content | Valid TypeScript, valid JSON, correct imports |
| Hook selection | Only selected hooks appear in config and files |
| Command toggle | Commands included/excluded based on flag |
| Name derivation | Kebab-case, prefix, binary name |
| SessionStart enforcement | Always included even when deselected |
| Marketplace structure | Workspace config, turbo tasks, references |
| Integration | Build succeeds, tests pass on scaffolded project |

## Hook-Specific Templates

Each hook type generates a handler file with appropriate boilerplate
and comments explaining the hook's purpose and capabilities.

### Available Hook Types

| Hook Type | Generated File | Description |
| --------- | -------------- | ----------- |
| `SessionStart` | `context.hook.ts` | Context injection |
| `PreToolUse` | `security.hook.ts` | Allow/deny tools |
| `PostToolUse` | `post-tool.hook.ts` | Post-tool context |
| `Stop` | `stop-guard.hook.ts` | Block stops |
| `SubagentStop` | `subagent-guard.hook.ts` | Block subagent stops |
| `UserPromptSubmit` | `prompt-filter.hook.ts` | Prompt validation |
| `Notification` | `notification.hook.ts` | Observer |
| `PermissionRequest` | `permission.hook.ts` | Auto-allow/deny |

All handler files are placed in the `hooks/` directory.

Each template includes:

- File-level comment explaining purpose and I/O
- Type annotation using `Pipeline["HookType"]`
- Working example logic appropriate to the hook type
- Corresponding test file in `tests/`

## Future Considerations

### Plugin Marketplace Publishing

When the SDK adds marketplace support, the scaffold command will need
additional templates for:

- CI/CD workflows (GitHub Actions for build + publish)
- Marketplace metadata (icons, categories, pricing)
- Plugin versioning and changelog generation

### Template Customization

A potential enhancement is user-defined template overrides. Users could
place custom templates in `~/.claude/templates/` that the scaffold
command merges with defaults. This is deferred until post-1.0.

### OTEL Template

When `--otel` is selected, the scaffold includes additional setup in
the SessionStart hook for sidecar initialization and configuration.
The template demonstrates:

- `OtelConfig.isEnabled()` check
- `TelemetryEmitter.emitHookExecution()` in hook handlers
- Sidecar auto-spawn on SessionStart
- Environment variable configuration for OTLP endpoints

This is straightforward since the SDK handles sidecar lifecycle
automatically; the template just shows how to emit custom events.

## Related Documentation

- `architecture.md` - Build system, proxy script, state persistence
- `cli.md` - CLI binary usage and options
- `testing.md` - PluginTester fluent API used in generated tests
