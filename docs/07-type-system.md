# Type System

The `claude-binary-plugin` SDK uses advanced TypeScript features to provide full type safety from plugin definition through handler implementation. This guide covers the type inference system, branded types, JSON types, utility types, pipeline output types, and typed tool inputs.

## Type Inference Flow

The SDK's type system starts with `ClaudeBinaryPlugin.create()` and flows through to every handler you write. The inference chain works as follows:

1. You define your plugin with `ClaudeBinaryPlugin.create()`, passing a Zod schema for `options` and a `setup` function that returns computed state.
2. TypeScript captures the full config type as `typeof plugin`.
3. Utility types extract handler signatures from that captured type.
4. Your hook and command handlers get full autocomplete for `input`, `options`, and `state`.

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferHandlers, InferPluginCommands } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    DEBUG: z.string().default("false").transform((v) => v !== "false"),
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),
  setup: async ({ options, cwd }) => ({
    packageManager: "bun" as const,
    hasTests: true,
  }),
  hooks: {
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: "./hooks/security.hook.ts",
    }],
  },
  commands: {
    lint: {
      description: "Run linters",
      args: z.object({
        _positionals: z.array(z.string()).default([]),
        fix: z.boolean().default(true),
      }),
      pipeline: "./commands/lint.cmd.ts",
    },
  },
});

// Extract handler types from the plugin instance
export type Pipeline = InferHandlers<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;
export default plugin;
```

## Inference Utility Types

### InferHandlers

`InferHandlers<typeof plugin>` maps each hook type to its fully-typed handler signature. Use it in handler files to get autocomplete for `input`, `options`, and `state`.

```typescript
// hooks/security.hook.ts
import type { Pipeline } from "../plugin.config.js";

// Pipeline["PreToolUse"] resolves to:
// (ctx: {
//   input: ReadonlyDeep<PreToolUseInput>,
//   options: ReadonlyDeep<{ DEBUG: boolean; TIMEOUT_MS: number }>,
//   state: ReadonlyDeep<PluginState<{ packageManager: "bun"; hasTests: boolean }>>,
// }) => PreToolUsePipelineOutput | Promise<PreToolUsePipelineOutput>

const handler: Pipeline["PreToolUse"] = async ({ input, options, state }) => {
  // input.tool_name, input.tool_input are typed
  // options.DEBUG is boolean, options.TIMEOUT_MS is number
  // state.packageManager is "bun", state.hasTests is boolean
  // state.projectDir, state.pluginDir are strings (from BaseState)
  return { status: "executed", action: "allow", summary: "ok" };
};

export default handler;
```

Available keys on the `Pipeline` type:

| Key | Handler Type | Hook |
| --- | --- | --- |
| `SessionStart` | Pipeline handler | Session initialization |
| `SessionEnd` | Pipeline handler | Session cleanup |
| `PreToolUse` | Pipeline handler | Before tool execution |
| `PostToolUse` | Pipeline handler | After tool execution |
| `Stop` | Pipeline handler | Agent stopping |
| `SubagentStop` | Pipeline handler | Subagent stopping |
| `UserPromptSubmit` | Pipeline handler | Prompt submission |
| `PreCompact` | Pipeline handler | Before compaction |
| `Notification` | Pipeline handler | Notification events |
| `PermissionRequest` | Pipeline handler | Permission requests |
| `SessionStartRaw` | Raw handler | Full event access |
| `PreToolUseRaw` | Raw handler | Full event access |

Raw handler variants (suffixed with `Raw`) receive the full event object instead of the destructured `{ input, options, state }` context. Use these when you need direct access to event methods.

### InferPluginCommands

`InferPluginCommands<typeof plugin>` maps each command name to its handler signature. The `args` parameter is typed from the command's Zod schema.

```typescript
// commands/lint.cmd.ts
import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

// Commands["lint"] resolves to:
// (ctx: {
//   args: { _positionals: string[]; fix: boolean },
//   options: ReadonlyDeep<{ DEBUG: boolean; TIMEOUT_MS: number }>,
//   state: ReadonlyDeep<PluginState<{ packageManager: "bun"; hasTests: boolean }>>,
// }) => CommandOutput | Promise<CommandOutput>

const handler: Commands["lint"] = async ({ args, options, state }) => {
  const paths = args._positionals;  // string[]
  const autoFix = args.fix;         // boolean
  return { exitCode: 0, output: "# Lint passed" };
};

export default handler;
```

### InferPluginOptions

`InferPluginOptions<typeof plugin>` extracts the validated options type from the plugin's Zod schema. This is the type after Zod transforms are applied.

```typescript
import type { InferPluginOptions } from "claude-binary-plugin";

type Options = InferPluginOptions<typeof plugin>;
// { DEBUG: boolean; TIMEOUT_MS: number }
// Note: DEBUG is boolean because of the .transform(), not string
```

### InferPluginState

`InferPluginState<typeof plugin>` extracts the state type from the `setup()` function's return type. If no `setup` is defined, it defaults to `Record<string, unknown>`.

```typescript
import type { InferPluginState } from "claude-binary-plugin";

type State = InferPluginState<typeof plugin>;
// { packageManager: "bun"; hasTests: boolean }
```

## Branded Types

The SDK uses branded types (also called tagged types) to prevent accidentally mixing up string identifiers that look the same at runtime but have different semantic meanings. These are implemented using `Tagged` from `type-fest`.

| Type | Field | Purpose |
| --- | --- | --- |
| `SessionId` | `session_id` | Claude Code session UUID |
| `ToolUseId` | `tool_use_id` | Tool invocation identifier |
| `HookName` | hook config `name` | Custom hook identifier |
| `TranscriptPath` | `transcript_path` | Conversation transcript file |

```typescript
import type { SessionId, ToolUseId, HookName } from "claude-binary-plugin";

// These are distinct types even though both are strings
function processHook(sessionId: SessionId, toolUseId: ToolUseId): void {
  // ...
}

const sid = "550e8400-e29b-41d4-a716-446655440000" as SessionId;
const tid = "tool-abc-123" as ToolUseId;

processHook(sid, tid);  // OK
processHook(tid, sid);  // Type error: types are incompatible
```

Branded types add a compile-time tag that makes structurally identical types incompatible. At runtime, they are regular strings with no overhead.

## JSON Types

The SDK provides precise JSON types from `type-fest` instead of using loose types like `Record<string, unknown>`. These guarantee that values are JSON-serializable.

### Core JSON Types

| Type | Description |
| --- | --- |
| `JsonValue` | Any valid JSON value (string, number, boolean, null, object, array) |
| `JsonObject` | Plain object with string keys and `JsonValue` values |
| `JsonArray` | Array of `JsonValue` elements |
| `JsonPrimitive` | String, number, boolean, or null |
| `Jsonifiable` | Values that can be passed to `JSON.stringify` (includes `Date`, etc.) |
| `Jsonify<T>` | The type of `T` after `JSON.parse(JSON.stringify(value))` |

```typescript
import type { JsonObject, JsonValue } from "claude-binary-plugin";

// tool_input is JsonObject, not Record<string, unknown>
function inspectToolInput(toolInput: JsonObject): void {
  const command = toolInput.command;  // JsonValue
  if (typeof command === "string") {
    console.log(`Command: ${command}`);
  }
}
```

### OTEL Types

| Type | Description |
| --- | --- |
| `OtelAttributes` | `Record<string, string \| number \| boolean>` for telemetry attributes |
| `OtelHeaders` | `Record<string, string>` for HTTP headers |

### Utility JSON Types

| Type | Description |
| --- | --- |
| `ParsedJson<T>` | Recursively applies to document the expected shape after parsing |
| `JsonObjectWith<K>` | A `JsonObject` with known keys of type `K` |

```typescript
import type { JsonObjectWith } from "claude-binary-plugin";

// Declares known keys while allowing arbitrary additional JSON keys
type BashInput = JsonObjectWith<"command" | "timeout">;
// { command: JsonValue; timeout: JsonValue; [key: string]: JsonValue }
```

## Utility Types from type-fest

The SDK re-exports commonly needed utility types from `type-fest` for use in plugin code.

| Type | Description |
| --- | --- |
| `ReadonlyDeep<T>` | Make all properties recursively readonly. Used internally for handler context. |
| `PartialDeep<T>` | Make all properties recursively optional. Used by `PluginTester.withOptions()`. |
| `RequiredDeep<T>` | Make all properties recursively required. Inverse of `PartialDeep`. |
| `WritableDeep<T>` | Remove readonly from all properties recursively. Inverse of `ReadonlyDeep`. |
| `Tagged<T, Tag>` | Create a branded/nominal type. Used for `SessionId`, `ToolUseId`, etc. |

```typescript
import type { ReadonlyDeep, WritableDeep, Tagged } from "claude-binary-plugin";

// Handler context is deeply readonly - prevents accidental mutations
interface HandlerContext<TInput, TOptions, TState> {
  input: ReadonlyDeep<TInput>;
  options: ReadonlyDeep<TOptions>;
  state: ReadonlyDeep<PluginState<TState>>;
}

// Create your own branded types
type ApiKey = Tagged<string, "ApiKey">;
type ProjectId = Tagged<string, "ProjectId">;
```

## Pipeline Output Types

Pipeline outputs use discriminated unions on the `status` field. Each hook type has specific valid actions.

### Execution Status

| Status | Meaning | Has `action`? |
| --- | --- | --- |
| `executed` | Hook ran normally | Yes (required) |
| `skipped` | Hook did not apply | No |
| `disabled` | Preconditions failed | No |
| `cached` | Used cached result | Yes |
| `error` | Uncaught exception | No |
| `timeout` | Exceeded time limit | No |

### Hook Actions by Type

| Hook Type | Valid Actions |
| --- | --- |
| PreToolUse | `allow`, `deny`, `ask`, `modify` |
| PostToolUse | `block`, `continue`, `context`, `none` |
| SessionStart | `context`, `none` |
| SessionEnd | `none` |
| Stop, SubagentStop | `block`, `continue` |
| UserPromptSubmit | `block`, `context`, `none` |
| PreCompact, Notification | `none` |
| PermissionRequest | `allow`, `deny` |

### Common Output Fields

| Field | Type | Description |
| --- | --- | --- |
| `status` | `ExecutionStatus` | Required. Execution status discriminator. |
| `summary` | `string` | Required. Human-readable log message. |
| `action` | `HookAction` | Required when `status === "executed"`. |
| `reason` | `string` | Concise reason for decisions (shown to Claude). |
| `claudeContext` | `string` | Detailed context injected into Claude's system prompt. |
| `userMessage` | `string` | Message shown to the user in the terminal. |
| `updatedInput` | `JsonObject` | Modified tool input (PreToolUse `modify` action only). |
| `validation` | `ValidationResult` | For linting/checking hooks: `passed`, `fixed`, `failed`, `warning`. |
| `quality` | `ExecutionQuality` | Degradation indicators (`degraded`, `partial`, `fallback`). |
| `metrics` | `PipelineMetrics` | Custom domain metrics for telemetry. |

### Example Output by Hook Type

```typescript
// PreToolUse: allow
{ status: "executed", action: "allow", summary: "safe command" }

// PreToolUse: deny with reason
{
  status: "executed",
  action: "deny",
  summary: "blocked rm -rf",
  reason: "Destructive command not allowed",
}

// PreToolUse: modify input
{
  status: "executed",
  action: "modify",
  summary: "added timeout",
  updatedInput: { command: "timeout 30 npm test" },
}

// SessionStart: add context
{
  status: "executed",
  action: "context",
  summary: "added project context",
  claudeContext: "This project uses Bun and TypeScript.",
}

// Stop: block with reason
{
  status: "executed",
  action: "block",
  summary: "tests not run",
  reason: "Please run the test suite before stopping.",
}
```

## Typed Tool Inputs

The SDK provides strongly-typed interfaces for every Claude Code tool input, along with type guards and a mapped type for exhaustive handling.

### Tool Input Interfaces

| Interface | Tool | Key Fields |
| --- | --- | --- |
| `BashToolInput` | Bash | `command`, `timeout?`, `dangerouslyDisableSandbox?` |
| `EditToolInput` | Edit | `file_path`, `old_string`, `new_string`, `replace_all?` |
| `WriteToolInput` | Write | `file_path`, `content` |
| `ReadToolInput` | Read | `file_path`, `offset?`, `limit?` |
| `GlobToolInput` | Glob | `pattern`, `path?` |
| `GrepToolInput` | Grep | `pattern`, `path?`, `glob?`, `output_mode?` |
| `WebFetchToolInput` | WebFetch | `url`, `prompt` |
| `WebSearchToolInput` | WebSearch | `query`, `allowed_domains?`, `blocked_domains?` |
| `TaskToolInput` | Task | `prompt`, `description`, `subagent_type`, `model?` |
| `NotebookEditToolInput` | NotebookEdit | `notebook_path`, `new_source`, `edit_mode?` |
| `TodoWriteToolInput` | TodoWrite | `todos` (array of `TodoItem`) |

### ToolInputGuard Class

The `ToolInputGuard` class provides static type guard methods for runtime validation of tool inputs.

```typescript
import { ToolInputGuard } from "claude-binary-plugin";

const handler: Pipeline["PreToolUse"] = async ({ input }) => {
  // Type guard narrows input.tool_input to BashToolInput
  if (ToolInputGuard.isBash(input.tool_input)) {
    const { command, dangerouslyDisableSandbox } = input.tool_input;

    if (dangerouslyDisableSandbox) {
      return { status: "executed", action: "deny", summary: "sandbox bypass blocked" };
    }

    if (command.includes("rm -rf /")) {
      return { status: "executed", action: "deny", summary: "destructive command blocked" };
    }
  }

  return { status: "executed", action: "allow", summary: "allowed" };
};
```

Available type guard methods:

- `ToolInputGuard.isBash(input)` -- narrows to `BashToolInput`
- `ToolInputGuard.isEdit(input)` -- narrows to `EditToolInput`
- `ToolInputGuard.isWrite(input)` -- narrows to `WriteToolInput`
- `ToolInputGuard.isRead(input)` -- narrows to `ReadToolInput`
- `ToolInputGuard.isGlob(input)` -- narrows to `GlobToolInput`
- `ToolInputGuard.isGrep(input)` -- narrows to `GrepToolInput`
- `ToolInputGuard.isWebFetch(input)` -- narrows to `WebFetchToolInput`
- `ToolInputGuard.isWebSearch(input)` -- narrows to `WebSearchToolInput`
- `ToolInputGuard.isTask(input)` -- narrows to `TaskToolInput`
- `ToolInputGuard.isNotebookEdit(input)` -- narrows to `NotebookEditToolInput`
- `ToolInputGuard.isTodoWrite(input)` -- narrows to `TodoWriteToolInput`

### Generic Type Guards

For dynamic tool name handling, use the generic methods:

```typescript
// Check by tool name string
if (ToolInputGuard.is("Bash", input.tool_input)) {
  console.log(input.tool_input.command);  // typed as BashToolInput
}

// Get typed input or undefined
const bashInput = ToolInputGuard.getTyped("Bash", input.tool_input);
if (bashInput) {
  console.log(bashInput.command);  // BashToolInput
}
```

### ToolInputMap and TypedToolName

The `ToolInputMap` interface maps tool name strings to their input types. `TypedToolName` is the union of all known tool names.

```typescript
import type { ToolInputMap, TypedToolName } from "claude-binary-plugin";

// TypedToolName = "Bash" | "Edit" | "Write" | "Read" | "Glob" | "Grep"
//              | "WebFetch" | "WebSearch" | "Task" | "NotebookEdit" | "TodoWrite"

// Use for exhaustive handling
function logToolUse<T extends TypedToolName>(
  toolName: T,
  input: ToolInputMap[T],
): void {
  console.log(`Using tool: ${toolName}`);
}
```

## Handler Context Immutability

All handler parameters are deeply readonly via `ReadonlyDeep<T>`. This enforces that handlers are pure functions -- they read their context and return a new output object rather than mutating inputs.

```typescript
const handler: Pipeline["PreToolUse"] = async ({ input, options, state }) => {
  // These would all cause compile errors:
  // input.tool_name = "Edit";           // Error: readonly
  // options.DEBUG = true;                // Error: readonly
  // state.packageManager = "npm";        // Error: readonly

  // Instead, read values and return a new output
  if (options.DEBUG) {
    console.log(`Tool: ${input.tool_name}`);
  }

  return { status: "executed", action: "allow", summary: "ok" };
};
```

If you need a mutable copy for complex transformations, use `WritableDeep`:

```typescript
import type { WritableDeep, JsonObject } from "claude-binary-plugin";

const handler: Pipeline["PreToolUse"] = async ({ input }) => {
  // Create a mutable copy of tool_input for modification
  const modified: WritableDeep<JsonObject> = { ...input.tool_input };
  modified.timeout = 30000;

  return {
    status: "executed",
    action: "modify",
    summary: "added timeout",
    updatedInput: modified,
  };
};
```
