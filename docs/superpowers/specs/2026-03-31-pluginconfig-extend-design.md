# PluginConfig.extend() API Redesign

## Problem

Bun's `bun build --compile` aggressively tree-shakes the `state` Schema.Class off
the plugin config object. The state constructor is only accessed dynamically via
`Schema.decodeUnknownSync`, so the bundler determines it's "unused" and strips it.
This causes state methods (e.g., `getPmExec()`) to disappear from compiled binaries.

The current `Plugin()` factory attempted to solve this via closure capture, but Bun
still strips state from closures. A `__state__` named export hack was added as a
workaround, but it's fragile and non-obvious.

## Solution

Replace the `Plugin()` factory with two complementary classes:

1. **`PluginConfig`** — a Schema.Class base whose `.extend()` creates config subclasses
   with static properties that are proven to survive `bun build --compile`
2. **`ClaudePlugin`** — a runtime orchestrator that takes a config class + hooks map
   and provides `.build()` and `.test()`

## Three-File Pattern

Each plugin consists of three files with clear responsibilities:

### `plugin.config.ts` — declares what the plugin is

```typescript
import { PluginConfig } from "claude-binary-plugin";
import type { InferHandlers } from "claude-binary-plugin";
import { Schema } from "effect";
import { PluginState } from "./state.js";

class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
  prefix: Schema.Literal("MY_PLUGIN"),
}) {
  static readonly options = Schema.Struct({ MODE: Schema.String });
  static readonly state = PluginState;
  static readonly setup = async () => new PluginState({ git: true });
}

export type Handlers = InferHandlers<typeof MyConfig>;
export default MyConfig;
```

### `hooks/*.ts` — typed handlers

```typescript
import type { Handlers } from "../plugin.config.js";
import { Allow, Deny } from "claude-binary-plugin";

export const guardHandler: Handlers["PreToolUse"] = ({ input, options, state }) => {
  if (options.MODE === "strict" && input.tool_name === "Bash") {
    return new Deny({ summary: "blocked", reason: "strict mode" });
  }
  return new Allow({ summary: "ok" });
};

export default guardHandler;
```

### `plugin.build.ts` — wires handlers to config, builds

```typescript
import { ClaudePlugin } from "claude-binary-plugin";
import MyConfig from "./plugin.config.js";
import guardHandler from "./hooks/guard.js";
import initHandler from "./hooks/session-start.js";

const plugin = new ClaudePlugin(MyConfig, {
  SessionStart: [{ name: "init", handler: initHandler }],
  PreToolUse: [{ name: "guard", handler: guardHandler }],
});

await plugin.build({ rootDir: import.meta.dir });
```

## `PluginConfig` Base Class

`PluginConfig` is a Schema.Class with an empty base:

```typescript
class PluginConfig extends Schema.Class<PluginConfig>("PluginConfig")({}) {}
```

No fields on the base. `prefix` and any future data fields come from `.extend()`.
The base class exists so that:

1. Schema.Class machinery creates a real constructor/prototype chain (bundler-safe)
2. `.extend()` is inherited from Schema.Class — not custom code to maintain
3. `instanceof PluginConfig` works for validation in `ClaudePlugin` constructor

User config classes add:

- **Schema fields** via `.extend()`: `prefix` (validated at runtime via `Schema.Literal`)
- **Static readonly properties**: `options`, `state`, `setup` (meta-level, not serializable)

## `ClaudePlugin` Class

Runtime orchestrator — takes a config class and a hooks map:

```typescript
class ClaudePlugin<TConfig extends typeof PluginConfig> {
  constructor(
    readonly config: TConfig,
    readonly hooks: HooksMap<TConfig>,
  ) {}

  async build(options?: PluginBuildOptions): Promise<PluginBuildResult> { ... }
  test(): PluginTester<...> { ... }

  // Static sugar
  static async build<T extends typeof PluginConfig>(
    config: T, hooks: HooksMap<T>, options?: PluginBuildOptions,
  ): Promise<PluginBuildResult> {
    return new ClaudePlugin(config, hooks).build(options);
  }
}
```

Key separation: config describes *what the plugin is* (schema, state, setup).
`ClaudePlugin` describes *what the plugin does* (which handlers run for which hooks).
The same config can be used with different hook sets (e.g., test suite with mock handlers).

## Type Inference

Types flow from config class statics through `InferHandlers` to handler files.
No explicit generics for the user anywhere.

```typescript
type InferHandlers<T extends typeof PluginConfig> = {
  SessionStart: SessionStartHandler<InferOptions<T>, InferState<T>>;
  PreToolUse: PreToolUseHandler<InferOptions<T>, InferState<T>>;
  // ... all hook types
};

type InferOptions<T> = T extends { options: infer S extends Schema.Schema.Any }
  ? Schema.Schema.Type<S>
  : Record<string, unknown>;

type InferState<T> = T extends { state: infer S extends Schema.Schema.Any }
  ? Schema.Schema.Type<S>
  : Record<string, unknown>;
```

`HooksMap` for the `ClaudePlugin` constructor is also typed to the config's options:

```typescript
type HooksMap<T extends typeof PluginConfig> = {
  SessionStart?: SessionStartHookDefinition<InferOptions<T>>[];
  PreToolUse?: (PreToolUseHookDefinition<InferOptions<T>> & ToolFilter)[];
  // ...
};
```

## Testing

The fluent API surface is unchanged. `PluginTester` constructor takes
`{ config, hooks }` from the `ClaudePlugin` instance instead of `PluginDefinition`:

```typescript
const plugin = new ClaudePlugin(MyConfig, {
  PreToolUse: [{ name: "guard", handler: guardHandler }],
});

const result = await plugin.test()
  .withOptions({ MODE: "strict" })
  .withState(new PluginState({ git: true }))
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "rm -rf /" } })
  .runHook("PreToolUse", "guard");

expect(result.outcome).toBeInstanceOf(Deny);
```

Internal change: `PluginTester` reads `options` and `state` from `config.options` /
`config.state` (statics), and looks up handlers from the hooks map. Since handlers
are value imports, `resolveHandler` no longer needs the file-import codepath.

## EntrypointGenerator

The generated entrypoint reads statics directly — no `__state__` hack:

```typescript
import PluginConfigClass from "${configPath}";
import guardHandler from "${hookPaths.guard}";

// prefix is a Schema field on the instance; options/state/setup are statics on the class
const configInstance = new PluginConfigClass();
const EnvClass = PluginEnv.create(configInstance.prefix, PluginConfigClass.options, PLUGIN_NAME);
const StateSchema = PluginConfigClass.state;  // static, not tree-shaken

switch (hookKey) {
  case "PreToolUse/guard":
    return PipelineRuntime.run({
      pipeline: guardHandler,
      optionsSchema: PluginConfigClass.options,
      stateSchema: StateSchema,
      setup: PluginConfigClass.setup,
      // ...
    });
}
```

All handlers are value imports from the build file's dependency graph.

## What Changes

### Removed

- `Plugin()` factory function
- `PluginDefinition` interface
- `__state__` named export hack in EntrypointGenerator
- `ClaudePlugin` interface (becomes a concrete class)

### Modified

- `src/plugin/config.ts` — `PluginConfig` Schema.Class base, `ClaudePlugin` class,
  `InferHandlers` reads from statics
- `src/build/EntrypointGenerator.ts` — reads statics, no `__state__` import
- `src/build/builder.ts` — `PluginBuilder.fromConfig()` accepts `ClaudePlugin` instance
- `src/testing/builder.ts` — `PluginTester` accepts `{ config, hooks }` from `ClaudePlugin`
- `src/index.ts` — export `PluginConfig` and `ClaudePlugin` instead of `Plugin`

### Unchanged

- All outcome classes, ContextBuilder
- PipelineRuntime (execution engine)
- All services and layers
- All schema files (hook-inputs, hook-events, hook-responses)
- OTEL subsystem

### Test plugin (`plugin/`)

- `plugin.config.ts` — rewrite to `PluginConfig.extend()` with statics
- `hooks/*.ts` — use `Handlers` type from config
- `plugin.build.ts` — `new ClaudePlugin(MyConfig, hooks).build()`

## Why This Works

1. `PluginConfig` is a Schema.Class — its constructor is a runtime value the bundler
   must preserve
2. `static readonly` properties on the config subclass are proven to survive
   `bun build --compile`
3. Handlers are value imports in `plugin.build.ts` — the bundler sees the full
   dependency graph with no dynamic resolution
4. No hacks, no workarounds — the design aligns with how Bun's bundler works
