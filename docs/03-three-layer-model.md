# Three-Layer Model

Every hook handler in a claude-binary-plugin receives context from three distinct layers. This separation keeps hook logic clean: input comes from Claude Code, options come from the user, and state comes from one-time detection at session start.

## Overview

```text
+-----------------------------------------------------------------------+
|  Layer 1: INPUT                                                       |
|                                                                       |
|  Source:     Claude Code via stdin (JSON)                             |
|  Content:    Hook event data (session_id, tool_name, tool_input...)   |
|  Validation: Zod schemas per hook type                                |
|  Access:     handler({ input, ... })                                  |
+-----------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
|  Layer 2: OPTIONS                                                     |
|                                                                       |
|  Source:     Environment variables with plugin prefix                 |
|  Content:    User-configurable settings (DEBUG, TIMEOUT_MS, ...)      |
|  Validation: Plugin's Zod schema with defaults and transforms         |
|  Access:     handler({ options, ... })                                |
+-----------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
|  Layer 3: STATE                                                       |
|                                                                       |
|  Source:     setup() function, runs once at SessionStart              |
|  Content:    Detection results, cached data, derived values           |
|  Persistence: Serialized as base64 JSON to session env file           |
|  Access:     handler({ state, ... })                                  |
+-----------------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------------+
|  Handler Function                                                     |
|                                                                       |
|  ({ input, options, state }) => PipelineOutput                        |
+-----------------------------------------------------------------------+
```

## Layer 1: Input

Input is the hook event data that Claude Code sends via stdin as JSON. Each hook type has its own input shape, validated by a Zod schema before it reaches your handler.

| Hook Type | Key Input Fields |
| --------- | ---------------- |
| `SessionStart` | `source` ("startup", "resume", "clear", "compact") |
| `SessionEnd` | `reason` ("clear", "logout", "prompt_input_exit", "other") |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| `Stop` | `stop_hook_active` |
| `SubagentStop` | `stop_hook_active` |
| `UserPromptSubmit` | `prompt` |
| `PreCompact` | `trigger` ("manual", "auto"), `custom_instructions` |
| `Notification` | `message`, `notification_type` |
| `PermissionRequest` | `message`, `notification_type` |

All inputs also include base fields: `session_id`, `transcript_path`, `cwd`, and `permission_mode`.

Input is deeply readonly. Handlers cannot mutate it.

## Layer 2: Options

Options are user-configurable settings read from environment variables at startup. They are defined by the Zod schema in your plugin config and validated with defaults applied.

Given the prefix `MY_PLUGIN` and this schema:

```typescript
options: z.object({
  DEBUG: z.string().default("false").transform((v) => v === "true"),
  TIMEOUT_MS: z.coerce.number().default(30000),
}),
```

The runtime reads `MY_PLUGIN_DEBUG` and `MY_PLUGIN_TIMEOUT_MS` from the environment, validates them through the schema, and passes the result as `options`:

```typescript
// options: { DEBUG: boolean; TIMEOUT_MS: number }
```

Options are deeply readonly. They are the same for every hook invocation in a session.

## Layer 3: State

State is computed once by the `setup()` function during SessionStart. It is serialized as base64 JSON, written to the session env file, and deserialized for every subsequent hook and command in the session.

```typescript
setup: async ({ cwd }) => {
  const hasPackageJson = await Bun.file(`${cwd}/package.json`).exists();
  const hasTsConfig = await Bun.file(`${cwd}/tsconfig.json`).exists();
  return { hasPackageJson, hasTsConfig };
},
```

The state object your handlers receive is the return value of `setup()` merged with `BaseState`:

```typescript
interface BaseState {
  readonly projectDir: string;     // From CLAUDE_PROJECT_DIR or cwd
  readonly pluginDir: string;      // From CLAUDE_PLUGIN_ROOT
  readonly pluginEnvFile: string;  // From CLAUDE_ENV_FILE
}
```

So the full `state` in handlers is:

```typescript
// state: {
//   projectDir: string;
//   pluginDir: string;
//   pluginEnvFile: string;
//   hasPackageJson: boolean;
//   hasTsConfig: boolean;
// }
```

State is deeply readonly. It is the same for every hook invocation in a session (computed once, read many times).

### How State Persistence Works

1. During SessionStart, the runtime calls `setup()` and gets the return value.
2. The return value is JSON-stringified, base64-encoded, and written to the session env file as `MY_PLUGIN_PLUGIN_STATE`.
3. The session env directory is registered in a local SQLite database keyed by session ID and project directory.
4. On subsequent hooks, the runtime locates the session env directory, loads the env files, decodes `MY_PLUGIN_PLUGIN_STATE` from base64, and passes the parsed object as `state`.

This means `setup()` runs only once per session, but its results are available to every hook and command without re-running detection logic.

## Handler Signature

Pipeline handlers receive all three layers in a single context object:

```typescript
const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
  // input:   PreToolUseInput (readonly)
  // options: { DEBUG: boolean; TIMEOUT_MS: number } (readonly)
  // state:   BaseState & { hasPackageJson: boolean; hasTsConfig: boolean } (readonly)

  return {
    status: "executed",
    action: "allow",
    summary: "allowed",
  };
};
```

The `HandlerContext` interface that defines this shape:

```typescript
interface HandlerContext<TInput, TOptions, TState> {
  input: ReadonlyDeep<TInput>;
  options: ReadonlyDeep<TOptions>;
  state: ReadonlyDeep<PluginState<TState>>;
}
```

Every property is wrapped in `ReadonlyDeep` from type-fest, which makes the entire object tree immutable at the type level. Handlers should be pure functions that return new output objects rather than modifying their inputs.

## Concrete Example

Here is the scaffolded `context.hook.ts` handler for my-plugin, showing all three layers in use:

```typescript
import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
  // Layer 1: input.source tells us why the session started
  // Layer 2: options.DEBUG and options.TIMEOUT_MS come from env vars
  // Layer 3: state.hasPackageJson and state.hasTsConfig come from setup()

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

## Commands Receive the Same Context

Command handlers get the same three layers, but with `args` (validated CLI arguments) instead of `input` (hook event data):

```typescript
import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["example"] = async ({ args, options, state }): Promise<CommandOutput> => {
  // args:    { _positionals: string[] } -- validated from CLI
  // options: { DEBUG: boolean; TIMEOUT_MS: number } -- same as hooks
  // state:   BaseState & { hasPackageJson: boolean; ... } -- same as hooks

  return {
    exitCode: 0,
    output: `# Results\n\nProject: ${state.projectDir}`,
  };
};

export default handler;
```

Commands do not receive hook event JSON via stdin. They are invoked via CLI arguments (`--cmd=example [args...]`), and their `args` are validated against the Zod schema defined in the command configuration.

## Type Flow from Configuration to Handlers

The type inference chain starts at `ClaudeBinaryPlugin.create()` and flows through to handler files:

```text
ClaudeBinaryPlugin.create({
  prefix,
  options: z.object({ ... }),    ---> TOptionsSchema
  setup: async (ctx) => { ... }, ---> TSetup (return type inferred)
  hooks: { ... },
  commands: { ... },             ---> TCommands
})
        |
        v
InferPluginPipeline<typeof plugin>
        |
        +---> Pipeline["SessionStart"]  = ({ input, options, state }) => ...
        +---> Pipeline["PreToolUse"]    = ({ input, options, state }) => ...
        +---> Pipeline["PostToolUse"]   = ({ input, options, state }) => ...
        ...

InferPluginCommands<typeof plugin>
        |
        +---> Commands["example"]       = ({ args, options, state }) => ...
```

You never need to write the types manually. Export `Pipeline` and `Commands` from your plugin config, then import them in handler files for full inference:

```typescript
// plugin.config.ts
export type Pipeline = InferPluginPipeline<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

// hooks/security.hook.ts
import type { Pipeline } from "../plugin.config.js";
const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => { /* ... */ };
```
