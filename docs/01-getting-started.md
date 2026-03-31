# Getting Started

This guide walks through creating, building, and running a Claude Code plugin from scratch.

## Prerequisites

- [Bun][bun] >= 1.3.9
- [Zod][zod] >= 4.x is a peer dependency and will be installed automatically

## Create a New Project

Scaffold a project with the default hooks (SessionStart + PreToolUse), an example command, and a git repository:

```bash
bunx claude-binary-plugin init my-plugin --yes
```

This creates the following directory tree:

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version)
├── hooks/
│   ├── context.hook.ts          # SessionStart: inject project context
│   └── security.hook.ts         # PreToolUse: tool filtering
├── commands/
│   └── example.cmd.ts           # Example command handler
├── skills/
│   └── example.md               # Skill markdown for the command
├── tests/
│   ├── context.hook.test.ts     # SessionStart hook tests
│   ├── security.hook.test.ts    # PreToolUse hook tests
│   └── example.cmd.test.ts      # Command tests
├── plugin.config.ts             # ClaudeBinaryPlugin.create() definition
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── biome.jsonc                  # Linter/formatter configuration
├── .gitignore                   # Excludes binary, node_modules, build artifacts
└── CLAUDE.md                    # LLM context for developing this plugin
```

## Key Generated Files

### plugin.config.ts

The plugin definition is the single source of truth for what your plugin does. It declares the options schema, setup function, hooks, and commands:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferHandlers } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",

  options: z.object({
    DEBUG: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),

  setup: async ({ cwd }) => {
    const hasPackageJson = await Bun.file(`${cwd}/package.json`).exists();
    const hasTsConfig = await Bun.file(`${cwd}/tsconfig.json`).exists();
    return { hasPackageJson, hasTsConfig };
  },

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

  commands: {
    example: {
      description: "Run an example command",
      args: z.object({
        _positionals: z.array(z.string()).optional().default([]),
      }),
      pipeline: "./commands/example.cmd.ts",
    },
  },
});

export type Pipeline = InferHandlers<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

export default plugin;
```

### hooks/context.hook.ts

The SessionStart handler runs when Claude Code begins a session. It returns context that Claude sees as system instructions:

```typescript
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
  const lines: string[] = ["# Project Context"];

  if (state.hasPackageJson) {
    lines.push("- This project uses Node.js/Bun with a package.json");
  }

  if (state.hasTsConfig) {
    lines.push("- TypeScript is configured in this project");
  }

  if (options.DEBUG) {
    lines.push(`- Debug mode is enabled (timeout: ${options.TIMEOUT_MS}ms)`);
  }

  if (lines.length <= 1) {
    return {
      status: "executed",
      action: "none",
      summary: "no project context to inject",
    };
  }

  return {
    status: "executed",
    action: "context",
    summary: `injected ${lines.length - 1} context lines`,
    claudeContext: lines.join("\n"),
  };
};

export default handler;
```

### hooks/security.hook.ts

The PreToolUse handler intercepts tool calls before they execute. This handler only fires for Bash tool invocations (configured by the `tools: ["Bash"]` filter in the plugin config):

```typescript
import type { Pipeline } from "../plugin.config.js";

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r|--force|--recursive)/,
  /\bsudo\s+rm\b/,
  /\b(chmod|chown)\s+(-R|--recursive)\s+\//,
  /\bdd\s+.*of=\/dev\//,
  /\bmkfs\b/,
];

const handler: Pipeline["PreToolUse"] = ({ input }) => {
  const command = (input.tool_input as { command?: string }).command ?? "";

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        status: "executed",
        action: "deny",
        summary: "blocked dangerous command",
        reason: `This command matches a dangerous pattern and has been blocked: ${command.slice(0, 80)}`,
      };
    }
  }

  return {
    status: "executed",
    action: "allow",
    summary: "command allowed",
  };
};

export default handler;
```

### commands/example.cmd.ts

Commands are CLI tools compiled into the binary and invoked by Claude via `--cmd=<name>`. They output markdown:

```typescript
import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["example"] = async ({ args, options, state }): Promise<CommandOutput> => {
  const positionals = args._positionals;
  const targetDesc = positionals.length > 0 ? positionals.join(", ") : "project root";

  const lines: string[] = [
    "# Example Results",
    "",
    `**Target:** ${targetDesc}`,
    `**Project:** ${state.projectDir}`,
    "",
    "## Summary",
    "",
    "Command executed successfully.",
  ];

  if (options.DEBUG) {
    lines.push("", "## Debug Info", "", `- Timeout: ${options.TIMEOUT_MS}ms`);
  }

  return {
    exitCode: 0,
    output: lines.join("\n"),
  };
};

export default handler;
```

### skills/example.md

The skill file teaches Claude how to invoke the command. It includes frontmatter that Claude Code reads:

````markdown
---
allowed-tools: Bash, Read, Edit, TodoWrite
description: Run the example command
argument-hint: [path...]
---

# Example Command

Run the example command to execute plugin logic.

## Usage

```bash
$MY_PLUGIN_PLUGIN_DIR/my-plugin.plugin --cmd=example $ARGUMENTS
```

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Command executed successfully |
| 1 | Issues found (review output) |
| 2 | Script error (missing tools, config, etc.) |
````

### tests/

Each hook and command gets a dedicated test file using the fluent `PluginTester` API:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/security", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({ hasPackageJson: true, hasTsConfig: true });
  });

  afterEach(() => ctx.dispose());

  test("allows safe commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "git status" },
      })
      .runHook("PreToolUse", "security");

    expect(result.exitCode).toBe(0);
    expect(result.action).toBe("allow");
  });

  test("blocks dangerous rm -rf commands", async () => {
    const result = await ctx
      .withPreToolUseInput({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      })
      .runHook("PreToolUse", "security");

    expect(result.action).toBe("deny");
    expect(result.reason).toContain("dangerous");
  });
});
```

## Build the Plugin

Compile everything into a single-file Bun executable:

```bash
bunx claude-binary-plugin build
```

This produces three artifacts:

| File | Purpose |
| ---- | ------- |
| `my-plugin.plugin` | Compiled binary (platform-specific, gitignored) |
| `scripts/setup-proxy.sh` | Bash wrapper for cross-platform distribution |
| `hooks/hooks.json` | Hook manifest for Claude Code discovery |

The proxy script and hooks.json are committed to version control. The binary is not -- it is built on each machine at first use.

## Run Tests

```bash
bun test
```

Tests use the `PluginTester` fluent API, which provides type-safe mocking of inputs, options, state, and shell commands without spawning the actual binary.

## How Claude Code Discovers the Plugin

When a Claude Code session starts:

1. Claude Code reads `hooks/hooks.json` to discover available hooks.
2. SessionStart hooks are routed through `scripts/setup-proxy.sh`.
3. The proxy script checks whether the binary exists. If not, it runs `bun install` and `bunx claude-binary-plugin build --quiet` to compile it on the local machine.
4. Once the binary is ready, the proxy forwards the hook event to it.
5. All non-SessionStart hooks (PreToolUse, PostToolUse, etc.) point directly at the binary for zero overhead.

This design means you can commit your plugin source code to a git repository and it will work on any machine with Bun installed, regardless of platform.

## Next Steps

- [Plugin Configuration][plugin-configuration] -- understand every field in `ClaudeBinaryPlugin.create()`
- [Three-Layer Model][three-layer-model] -- how input, options, and state flow to your handlers

[bun]: https://bun.sh
[zod]: https://zod.dev
[plugin-configuration]: ./02-plugin-configuration.md
[three-layer-model]: ./03-three-layer-model.md
