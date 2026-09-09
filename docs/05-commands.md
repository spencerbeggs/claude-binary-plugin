# Commands

Commands are CLI tools compiled into the plugin binary and invoked via `--cmd=name`. They let you expose plugin functionality directly to Claude through skill markdown files. Unlike hooks, which intercept Claude Code lifecycle events, commands are explicit tools that Claude can call on demand.

## How Commands Differ from Hooks

| Aspect | Hooks | Commands |
| ------ | ----- | -------- |
| Invocation | Automatic via stdin JSON | CLI `--cmd=name` via Bash tool |
| Input | Hook event JSON | CLI arguments (`--key=value`, positionals) |
| Output | JSON response | Markdown text for Claude |
| Purpose | Intercept and gate behavior | Expose tools and workflows |
| Exit codes | Managed by runtime | 0 (success), 1 (issues found), 2 (fatal) |

## Defining Commands

Commands are defined in the `commands` field of your plugin configuration alongside hooks. Each command has a name, description, a Zod schema for argument validation, and a handler (either a file path or an inline function).

```typescript
// plugin.config.ts
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferHandlers } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",

  options: z.object({
    DEBUG: z.string().default("false").transform((v) => v !== "false"),
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),

  setup: async ({ options, cwd }) => {
    return {};
  },

  hooks: {
    SessionStart: [{
      name: "context",
      pipeline: "./hooks/context.hook.ts",
    }],
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: "./hooks/security.hook.ts",
    }],
  },

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

export type Pipeline = InferHandlers<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

export default plugin;
```

## Type Inference with InferPluginCommands

The `InferPluginCommands` utility type extracts fully typed handler signatures from your plugin definition. Export it from your config file so command handlers get type safety for `args`, `options`, and `state`.

```typescript
// In plugin.config.ts
export type Commands = InferPluginCommands<typeof plugin>;

// In commands/example.cmd.ts
import type { Commands } from "../plugin.config.js";

const handler: Commands["example"] = async ({ args, options, state }) => {
  // args: { _positionals: string[] }     -- validated from Zod schema
  // options: { DEBUG: boolean, ... }      -- from plugin options schema
  // state: { projectDir, pluginDir, ... } -- base state + setup() return
  return { exitCode: 0, output: "# Done" };
};

export default handler;
```

## Command Handler Structure

Every command handler receives a context object with three layers and returns a `CommandOutput`.

### Handler Context

| Field | Source | Description |
| ----- | ------ | ----------- |
| `args` | CLI arguments validated by Zod | Typed from the command's `args` schema |
| `options` | Environment variables validated by plugin schema | Same options available to hooks |
| `state` | Computed by `setup()` at SessionStart | Base paths plus your custom state |

### CommandOutput

| Field | Type | Description |
| ----- | ---- | ----------- |
| `exitCode` | `number` | 0 = success, 1 = issues found, 2 = fatal error |
| `output` | `string` | Markdown content returned to Claude |
| `data` | `Record<string, unknown>` (optional) | Structured data for programmatic access |

### Complete Handler Example

```typescript
// commands/example.cmd.ts
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

## Skill Markdown Files

Claude learns how to invoke your commands through skill markdown files. These files include frontmatter metadata and usage instructions that Claude reads at the start of a session.

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

### Frontmatter Fields

| Field | Description |
| ----- | ----------- |
| `allowed-tools` | Tools Claude may use when running this command (typically `Bash`) |
| `description` | Short description shown in Claude's skill list |
| `argument-hint` | Placeholder shown to Claude for argument formatting |

The `$MY_PLUGIN_PLUGIN_DIR` variable is set during SessionStart and resolves to the plugin's installation directory. This ensures the command works regardless of where the plugin is installed.

## Execution Flow

The following sequence shows what happens when Claude invokes a command.

```text
1. Claude reads skill markdown at session start
   Learns: $MY_PLUGIN_PLUGIN_DIR/my-plugin.plugin --cmd=example [args]

2. Claude invokes via Bash tool
   $ /path/to/my-plugin.plugin --cmd=example src/

3. Commands.run() in the plugin binary
   a. Parse CLI arguments (--key=value flags, positional args)
   b. Validate against Zod schema
   c. Find session env dir (SQLite registry, env vars, or cwd)
   d. Load *hook*.sh files to restore persisted state
   e. Decode {PREFIX}_PLUGIN_STATE from base64 JSON
   f. Call handler({ args, options, state })
   g. Validate output structure
   h. Print markdown to stdout
   i. Exit with code

4. Claude receives markdown output and acts on it
```

## State Access

Commands have full access to the computed state from SessionStart without re-running detection logic. The state is persisted as a base64-encoded JSON blob in the session environment and decoded automatically before your handler runs.

```typescript
const handler: Commands["example"] = async ({ state }) => {
  // state.projectDir  -- always available (base state)
  // state.pluginDir   -- always available (base state)
  // state.myField     -- available if setup() returned it
  return {
    exitCode: 0,
    output: `Project directory: ${state.projectDir}`,
  };
};
```

## Argument Parsing

The `Commands` class parses CLI arguments in these formats:

- `--key=value` -- Named argument (string, number, or boolean coerced)
- `--flag` -- Boolean flag (set to `true`)
- `positional` -- Stored in the `_positionals` array

Arguments are validated against the command's Zod schema. If validation fails, the command outputs a markdown error message and exits with code 2.

## Exit Codes

| Code | Meaning | When to Use |
| ---- | ------- | ----------- |
| 0 | Success | Command completed without issues |
| 1 | Issues found | Lint errors, test failures, or recoverable problems |
| 2 | Fatal error | Invalid arguments, missing configuration, crashes |

## Testing Commands

Commands are tested using the `plugin.test()` fluent API. See the [command testing guide][command-testing] for patterns and examples.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import plugin from "../plugin.config.js";

describe("example command", () => {
  let ctx: ReturnType<typeof plugin.test>;

  beforeEach(() => {
    ctx = plugin.test()
      .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
      .withState({});
  });

  afterEach(() => {
    ctx.dispose();
  });

  test("outputs arguments", async () => {
    const result = await ctx.runCommand("example", {
      _positionals: ["src/", "lib/"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/, lib/");
  });

  test("handles no arguments", async () => {
    const result = await ctx.runCommand("example", {});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(none)");
  });
});
```

[command-testing]: ./06-testing/03-command-testing.md
