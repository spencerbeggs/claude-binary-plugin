# Plugin Configuration

Every plugin is defined by a single call to `ClaudeBinaryPlugin.create()`. This page covers every field in the configuration object and the type-inference utilities that make handlers fully typed.

## PluginConfig Interface

```typescript
interface PluginConfig<TOptionsSchema, TSetup, TCommands> {
  prefix: string;
  options: TOptionsSchema;
  setup?: TSetup;
  hooks: HooksMap<z.infer<TOptionsSchema>>;
  commands?: TCommands;

  // Build options (optional)
  bytecode?: boolean;
  persistLocal?: boolean;
  compile?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
  hooksOutputPath?: string;
}
```

## prefix

A SCREAMING_SNAKE_CASE string used as the namespace for all environment variables. Given the prefix `MY_PLUGIN`, the runtime reads environment variables such as `MY_PLUGIN_DEBUG` and `MY_PLUGIN_TIMEOUT_MS`. It also writes internal state variables like `MY_PLUGIN_PLUGIN_STATE` and `MY_PLUGIN_PROJECT_DIR`.

Choose a prefix that is unique and unlikely to collide with other tools or plugins in the same environment.

```typescript
prefix: "MY_PLUGIN",
```

## options

A Zod schema defining the configurable settings for your plugin. These values are read from environment variables at startup (prefixed with the `prefix` value) and validated through the schema. Users can set them via `.env` files, Claude Code `settings.json`, or the shell environment.

Because environment variables are always strings, use transforms and coercions to parse them into the types your handlers expect.

### Common Patterns

**Boolean from string:**

```typescript
DEBUG: z
  .string()
  .default("false")
  .transform((v) => v === "true"),
```

The environment variable `MY_PLUGIN_DEBUG` is read as a string. The transform converts `"true"` to `true` and everything else to `false`.

**Coerced number with default:**

```typescript
TIMEOUT_MS: z.coerce.number().default(30000),
```

The environment variable `MY_PLUGIN_TIMEOUT_MS` is coerced from string to number. If not set, it defaults to `30000`.

**String with default:**

```typescript
API_KEY: z.string().default(""),
```

### Complete Example

```typescript
options: z.object({
  DEBUG: z.string().default("false").transform((v) => v === "true"),
  TIMEOUT_MS: z.coerce.number().default(30000),
  ALLOWED_PATHS: z.string().default("src,lib").transform((v) => v.split(",")),
}),
```

After validation, the options object has the TypeScript type `{ DEBUG: boolean; TIMEOUT_MS: number; ALLOWED_PATHS: string[] }`.

## setup

An optional async function that runs once at SessionStart to compute derived state. The returned object is serialized as base64 JSON, persisted to disk, and made available to every subsequent hook and command in the session.

The setup function receives a `SetupContext`:

```typescript
interface SetupContext<TOptions> {
  options: TOptions;      // Validated options from the schema
  cwd: string;            // Current working directory from the session event
  sessionId: string;      // Claude Code session UUID
  baseState: BaseState;   // Framework-provided paths (projectDir, pluginDir, pluginEnvFile)
}
```

Use setup for detection logic that should only run once per session:

```typescript
setup: async ({ cwd }) => {
  const hasPackageJson = await Bun.file(`${cwd}/package.json`).exists();
  const hasTsConfig = await Bun.file(`${cwd}/tsconfig.json`).exists();
  return { hasPackageJson, hasTsConfig };
},
```

The return type is inferred automatically. Every hook and command handler receives the full object as `state` (merged with `BaseState`).

## hooks

A map of hook event types to arrays of hook definitions. Each key is one of the 10 Claude Code hook types. Each value is an array because a single hook type can have multiple handlers.

```typescript
hooks: {
  SessionStart: [{ name: "context", pipeline: "./hooks/context.hook.ts" }],
  PreToolUse: [
    { name: "security", tools: ["Bash"], pipeline: "./hooks/security.hook.ts" },
    { name: "edit-guard", tools: ["Edit", "Write"], pipeline: "./hooks/edit-guard.hook.ts" },
  ],
},
```

### Hook Event Types

| Event | When It Fires | Possible Actions |
| ----- | ------------- | ---------------- |
| `SessionStart` | Session begins | `context`, `none` |
| `SessionEnd` | Session ends | `none` |
| `PreToolUse` | Before a tool runs | `allow`, `deny`, `ask`, `modify` |
| `PostToolUse` | After a tool runs | `block`, `continue`, `context`, `none` |
| `Stop` | Agent is stopping | `block`, `continue` |
| `SubagentStop` | Subagent is stopping | `block`, `continue` |
| `UserPromptSubmit` | User submits a prompt | `block`, `continue`, `context`, `none` |
| `PreCompact` | Before compaction | `none` |
| `Notification` | Notification event | `none` |
| `PermissionRequest` | Permission needed | `allow`, `deny` |

### Hook Definition Types

There are four ways to define a hook.

#### Pipeline file hook (recommended)

Points to a file that exports a default pipeline handler:

```typescript
{
  name: "security",
  tools: ["Bash"],          // Tool filter (PreToolUse/PostToolUse only)
  pipeline: "./hooks/security.hook.ts",
}
```

#### Inline pipeline hook

Defines the handler function directly in the config:

```typescript
{
  name: "simple-check",
  pipeline: async ({ input, options, state }) => {
    return { status: "executed", action: "allow", summary: "ok" };
  },
}
```

#### Raw handler hook

For direct access to the full HookEvent object. The handler is responsible for calling `event.end()`:

```typescript
{
  name: "custom",
  handler: "./hooks/custom.hook.ts",
}
```

#### Passthrough hook

Includes native Claude Code hook entries directly in hooks.json. Useful for mixing plugin hooks with external shell scripts:

```typescript
{
  matcher: "WebFetch",
  hooks: [{ type: "command", command: "bash ./scripts/log-fetches.sh" }],
}
```

### Tool Filtering

PreToolUse and PostToolUse hooks accept an optional `tools` array. When present, the hook only runs for the listed tools. Other tool invocations skip the hook entirely for zero overhead:

```typescript
{
  name: "security",
  tools: ["Bash"],              // Only fires for Bash
  pipeline: "./hooks/security.hook.ts",
}
```

In the generated `hooks.json`, the `tools` array becomes a pipe-separated `matcher` field:

```json
{
  "matcher": "Edit|Write|Update",
  "hooks": [{ "type": "command", "command": "..." }]
}
```

## commands

An optional map of command names to their definitions. Commands are CLI tools compiled into the plugin binary, invoked via `--cmd=<name>`, and exposed to Claude through skill markdown files.

```typescript
commands: {
  example: {
    description: "Run an example command",
    args: z.object({
      _positionals: z.array(z.string()).optional().default([]),
    }),
    pipeline: "./commands/example.cmd.ts",
  },
},
```

Each command definition has three fields:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `description` | `string` | Shown in help text and to the LLM |
| `args` | Zod schema | Validates CLI arguments; `_positionals` captures non-flag args |
| `pipeline` | `string` or function | Path to handler file or inline handler |

### CommandOutput

Command handlers return a `CommandOutput`:

```typescript
interface CommandOutput {
  exitCode: number;    // 0 = success, 1 = issues found, 2 = fatal error
  output: string;      // Markdown for LLM consumption
  data?: Record<string, unknown>;  // Optional structured data
}
```

## Type Inference Utilities

The SDK provides four utility types for extracting fully typed handler signatures from a plugin instance.

### InferHandlers

Maps every hook type to a typed pipeline handler. This is the type you use in hook handler files:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferHandlers } from "claude-binary-plugin";

const plugin = ClaudeBinaryPlugin.create({ /* ... */ });
export type Pipeline = InferHandlers<typeof plugin>;
export default plugin;
```

Then in a hook file:

```typescript
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
  // input, options, and state are fully typed
  return { status: "executed", action: "allow", summary: "allowed" };
};

export default handler;
```

The `Pipeline` type also includes raw handler variants suffixed with `Raw` (for example, `Pipeline["PreToolUseRaw"]`) for handlers that need direct access to the HookEvent object.

### InferPluginCommands

Maps every command name to a typed command handler:

```typescript
import type { InferPluginCommands } from "claude-binary-plugin";

export type Commands = InferPluginCommands<typeof plugin>;
```

Then in a command file:

```typescript
import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["example"] = async ({ args, options, state }): Promise<CommandOutput> => {
  return { exitCode: 0, output: "# Done" };
};

export default handler;
```

### InferPluginOptions

Extracts the validated options type from the Zod schema:

```typescript
import type { InferPluginOptions } from "claude-binary-plugin";

type Options = InferPluginOptions<typeof plugin>;
// { DEBUG: boolean; TIMEOUT_MS: number }
```

### InferPluginState

Extracts the state type from the setup function's return value, merged with `BaseState`:

```typescript
import type { InferPluginState } from "claude-binary-plugin";

type State = InferPluginState<typeof plugin>;
// { hasPackageJson: boolean; hasTsConfig: boolean }
```

At runtime, `state` also includes `BaseState` fields (`projectDir`, `pluginDir`, `pluginEnvFile`).

## Build Options

These optional fields on the config control how the binary is compiled:

| Field | Default | Description |
| ----- | ------- | ----------- |
| `bytecode` | `false` | Compile to bytecode for faster startup |
| `persistLocal` | `true` | Copy binary to local Claude Code plugins cache |
| `compile` | `true` | Compile to standalone binary (false = bundle JS only) |
| `minify` | `true` | Minify the output |
| `sourcemap` | `true` | Embed sourcemaps |
| `hooksOutputPath` | `"hooks/hooks.json"` | Output path for the hook manifest |

## The test() Method

Every plugin instance has a `.test()` method that returns a fluent test builder with full type inference:

```typescript
const ctx = plugin.test()
  .withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
  .withState({ hasPackageJson: true, hasTsConfig: true });

const result = await ctx
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("PreToolUse", "security");

expect(result.action).toBe("allow");
ctx.dispose();
```

The testing API is covered in detail in the internal design docs at `.claude/design/testing.md`.

## Complete my-plugin Example

Putting it all together, the scaffolded `plugin.config.ts` for the my-plugin project:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferHandlers } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",

  options: z.object({
    DEBUG: z.string().default("false").transform((v) => v === "true"),
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),

  setup: async ({ cwd }) => {
    const hasPackageJson = await Bun.file(`${cwd}/package.json`).exists();
    const hasTsConfig = await Bun.file(`${cwd}/tsconfig.json`).exists();
    return { hasPackageJson, hasTsConfig };
  },

  hooks: {
    SessionStart: [
      { name: "context", pipeline: "./hooks/context.hook.ts" },
    ],
    PreToolUse: [
      { name: "security", tools: ["Bash"], pipeline: "./hooks/security.hook.ts" },
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
