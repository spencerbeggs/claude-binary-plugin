# PluginConfig.extend() API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Plugin()` factory with `PluginConfig` Schema.Class base + `ClaudePlugin` orchestrator class, solving Bun tree-shaking of state schemas.

**Architecture:** `PluginConfig` is an empty Schema.Class whose `.extend()` creates config subclasses with `prefix` as a Schema field and `options`/`state`/`setup` as static readonly properties. `ClaudePlugin` takes a config class + hooks map and provides `.build()` and `.test()`. Hooks are value imports in the build file, giving the bundler a clear dependency graph.

**Tech Stack:** Effect Schema.Class, TypeScript static class properties, Bun build system

**Spec:** `docs/superpowers/specs/2026-03-31-pluginconfig-extend-design.md`

---

### Task 1: Create `PluginConfig` Schema.Class Base

**Files:**
- Modify: `package/src/plugin/config.ts` (replace `Plugin()` factory with `PluginConfig` class and `ClaudePlugin` class)

This task replaces the core API surface. The `Plugin()` factory, `PluginDefinition` interface, and `ClaudePlugin` interface are removed. In their place: `PluginConfig` Schema.Class and `ClaudePlugin` concrete class.

- [ ] **Step 1: Write the failing test for PluginConfig.extend()**

Create `package/__tests__/plugin/pluginconfig.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { Schema } from "effect";

// This import will fail until we create PluginConfig
import { PluginConfig } from "../../src/plugin/config.js";

describe("PluginConfig", () => {
	test("is a Schema.Class with empty base", () => {
		const instance = new PluginConfig({});
		expect(instance).toBeInstanceOf(PluginConfig);
	});

	test("extend() creates a subclass with prefix as Schema field", () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
			prefix: Schema.Literal("TEST"),
		}) {}

		const instance = new TestConfig({ prefix: "TEST" });
		expect(instance.prefix).toBe("TEST");
		expect(instance).toBeInstanceOf(PluginConfig);
	});

	test("extended class supports static readonly properties", () => {
		const optionsSchema = Schema.Struct({ MODE: Schema.String });

		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = optionsSchema;
		}

		expect(TestConfig.options).toBe(optionsSchema);
		// Instance still works
		const instance = new TestConfig({ prefix: "TEST" });
		expect(instance.prefix).toBe("TEST");
	});

	test("extended class supports state and setup statics", () => {
		class MyState extends Schema.Class<MyState>("MyState")({
			git: Schema.Boolean,
		}) {
			canUseGit() {
				return this.git;
			}
		}

		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
			prefix: Schema.Literal("MY_PLUGIN"),
		}) {
			static readonly options = Schema.Struct({ MODE: Schema.String });
			static readonly state = MyState;
			static readonly setup = async () => new MyState({ git: true });
		}

		expect(TestConfig.state).toBe(MyState);
		expect(typeof TestConfig.setup).toBe("function");

		// Verify state class has methods
		const stateInstance = new MyState({ git: true });
		expect(stateInstance.canUseGit()).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: FAIL — `PluginConfig` is not exported from `config.ts`

- [ ] **Step 3: Implement PluginConfig Schema.Class**

In `package/src/plugin/config.ts`, add the `PluginConfig` class near the top of the file (after the import block, before the handler types). Add `Schema` as a value import (it's currently type-only):

Change the import at line 1:
```typescript
// Before:
import type { Effect, Schema } from "effect";

// After:
import type { Effect } from "effect";
import { Schema } from "effect";
```

Add after the imports section (after line 17):
```typescript
// =============================================================================
// PLUGIN CONFIG BASE CLASS
// =============================================================================

/**
 * Base class for plugin configuration using Schema.Class.
 *
 * @remarks
 * Users extend this via `.extend()` to define their plugin config.
 * Schema fields (like `prefix`) go through `.extend()`.
 * Meta-level schemas (`options`, `state`, `setup`) go as static readonly
 * properties on the subclass — these survive Bun's tree-shaking.
 *
 * @example
 * ```ts
 * class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
 *   prefix: Schema.Literal("MY_PLUGIN"),
 * }) {
 *   static readonly options = Schema.Struct({ MODE: Schema.String });
 *   static readonly state = MyState;
 *   static readonly setup = async () => new MyState({ git: true });
 * }
 * ```
 *
 * @public
 */
export class PluginConfig extends Schema.Class<PluginConfig>("PluginConfig")({}) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add package/src/plugin/config.ts package/__tests__/plugin/pluginconfig.test.ts
git commit -m "feat: add PluginConfig Schema.Class base with .extend() support"
```

---

### Task 2: Implement `ClaudePlugin` Concrete Class

**Files:**
- Modify: `package/src/plugin/config.ts`
- Test: `package/__tests__/plugin/pluginconfig.test.ts`

- [ ] **Step 1: Write failing tests for ClaudePlugin**

Append to `package/__tests__/plugin/pluginconfig.test.ts`:

```typescript
import { ClaudePlugin } from "../../src/plugin/config.js";
import type { HooksMap } from "../../src/plugin/config.js";

describe("ClaudePlugin", () => {
	// Shared config for tests
	class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
		prefix: Schema.Literal("TEST"),
	}) {
		static readonly options = Schema.Struct({
			MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
				default: () => "strict" as const,
			}),
		});
	}

	test("constructor accepts config class and hooks map", () => {
		const hooks = {
			PreToolUse: [
				{
					name: "guard",
					pipeline: () => ({ status: "executed" as const, action: "allow" as const, summary: "ok" }),
				},
			],
		};
		const plugin = new ClaudePlugin(TestConfig, hooks);
		expect(plugin.config).toBe(TestConfig);
		expect(plugin.hooks).toBe(hooks);
	});

	test("build() method exists", () => {
		const plugin = new ClaudePlugin(TestConfig, {});
		expect(typeof plugin.build).toBe("function");
	});

	test("test() method returns a PluginTester", () => {
		const plugin = new ClaudePlugin(TestConfig, {});
		const tester = plugin.test();
		expect(tester).toBeDefined();
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		expect(typeof tester.dispose).toBe("function");
		tester.dispose();
	});

	test("static build() sugar works", () => {
		expect(typeof ClaudePlugin.build).toBe("function");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: FAIL — `ClaudePlugin` is not exported

- [ ] **Step 3: Implement ClaudePlugin class**

In `package/src/plugin/config.ts`, add after the `PluginConfig` class definition:

```typescript
/**
 * Runtime orchestrator that takes a config class and hooks map.
 *
 * @remarks
 * Config describes *what the plugin is* (schema, state, setup).
 * ClaudePlugin describes *what the plugin does* (which handlers run for which hooks).
 * The same config can be used with different hook sets (e.g., test suite with mock handlers).
 *
 * @example
 * ```ts
 * const plugin = new ClaudePlugin(MyConfig, {
 *   PreToolUse: [{ name: "guard", handler: guardHandler }],
 * });
 * await plugin.build({ rootDir: import.meta.dir });
 * ```
 *
 * @public
 */
export class ClaudePlugin<TConfig extends typeof PluginConfig = typeof PluginConfig> {
	constructor(
		readonly config: TConfig,
		readonly hooks: HooksMap<unknown>,
	) {}

	async build(options: PluginBuildOptions = {}): Promise<PluginBuildResult> {
		const { PluginBuilder } = await import("../build/builder.js");
		return PluginBuilder.fromConfig(this as any, options);
	}

	test() {
		// biome-ignore lint/suspicious/noExplicitAny: Runtime creation doesn't need strict types
		const { PluginTester: Tester } = require("../testing/builder.js") as any;
		return new Tester(this.config, this.hooks);
	}

	static async build<T extends typeof PluginConfig>(
		config: T,
		hooks: HooksMap<unknown>,
		options: PluginBuildOptions = {},
	): Promise<PluginBuildResult> {
		return new ClaudePlugin(config, hooks).build(options);
	}
}
```

Note: The `HooksMap` type parameter and `PluginTester` constructor will need further updates in later tasks. For now, use `HooksMap<unknown>` to get the basic structure passing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/plugin/config.ts package/__tests__/plugin/pluginconfig.test.ts
git commit -m "feat: add ClaudePlugin orchestrator class"
```

---

### Task 3: Update Type Inference to Read From Statics

**Files:**
- Modify: `package/src/plugin/config.ts` (lines 1228-1515 — type inference utilities)
- Test: `package/__tests__/plugin/pluginconfig.test.ts`

The existing `InferHandlers`, `InferPluginOptions`, `InferPluginState` read from `ClaudePlugin<TOptionsSchema, TStateSchema>` instance properties. They need to read from static properties on a `typeof PluginConfig` subclass instead.

- [ ] **Step 1: Write failing tests for new type inference**

Append to `package/__tests__/plugin/pluginconfig.test.ts`:

```typescript
import type { InferHandlers } from "../../src/plugin/config.js";
import { Allow } from "../../src/outcomes/Allow.js";
import { Deny } from "../../src/outcomes/Deny.js";

describe("InferHandlers with PluginConfig.extend()", () => {
	class MyState extends Schema.Class<MyState>("MyState")({
		git: Schema.Boolean,
	}) {
		canUseGit() {
			return this.git;
		}
	}

	class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
		prefix: Schema.Literal("TEST"),
	}) {
		static readonly options = Schema.Struct({
			MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
				default: () => "strict" as const,
			}),
		});
		static readonly state = MyState;
	}

	test("InferHandlers produces typed handler signatures", () => {
		// This is a compile-time test — if it compiles, it works
		type Handlers = InferHandlers<typeof TestConfig>;

		const handler: Handlers["PreToolUse"] = ({ input, options, state }) => {
			// TypeScript should know these types:
			// options.MODE is "strict" | "lenient"
			// state.git is boolean
			// state.canUseGit() is boolean
			const _mode: "strict" | "lenient" = options.MODE;
			const _git: boolean = state.git;
			return new Allow({ summary: "ok" });
		};

		expect(typeof handler).toBe("function");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: FAIL — type errors because `InferHandlers` expects a `ClaudePlugin` instance, not a `typeof PluginConfig`

- [ ] **Step 3: Update InferHandlers and helper types**

In `package/src/plugin/config.ts`, replace the type inference section (starting around line 1228) with new versions that read from statics:

Replace `ResolvePlugin`, `ExtractOptionsSchema`, `ExtractSetup`, `ExtractCommands`, `InferPluginOptions`, `InferPluginState`, and update `InferHandlers`:

```typescript
// =============================================================================
// TYPE INFERENCE UTILITIES
// =============================================================================

/**
 * Extract the options Schema from a PluginConfig subclass's static `options` property.
 * @public
 */
export type ExtractOptionsSchema<T> = T extends { options: infer S extends Schema.Schema.Any } ? S : never;

/**
 * Extract the state Schema from a PluginConfig subclass's static `state` property.
 * @public
 */
export type ExtractStateSchema<T> = T extends { state: infer S extends Schema.Schema.Any } ? S : never;

/**
 * Extract the setup function from a PluginConfig subclass's static `setup` property.
 * @public
 */
export type ExtractSetup<T> = T extends { setup: infer F } ? F : undefined;

/**
 * Extract the commands map from a PluginConfig subclass's static `commands` property.
 * @public
 */
export type ExtractCommands<T> = T extends { commands: infer C extends Record<string, CommandDefinitionBase> }
	? C
	: Record<string, CommandDefinitionBase>;

/**
 * Extract the inferred Options type from a PluginConfig subclass.
 * @public
 */
export type InferPluginOptions<T> = ExtractOptionsSchema<T> extends Schema.Schema.Any
	? Schema.Schema.Type<ExtractOptionsSchema<T>>
	: Record<string, unknown>;

/**
 * Extract the inferred State type from a PluginConfig subclass.
 * @public
 */
export type InferPluginState<T> = ExtractStateSchema<T> extends Schema.Schema.Any
	? Schema.Schema.Type<ExtractStateSchema<T>>
	: Record<string, unknown>;
```

Update `InferHandlers` to use the new helper types (keep the same interface structure but change the constraint and inference source):

```typescript
export interface InferHandlers<T> {
	SessionStart: SessionStartHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SessionEnd: SessionEndHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreToolUse: PreToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PostToolUse: PostToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;
	Stop: StopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SubagentStop: SubagentStopHandler<InferPluginOptions<T>, InferPluginState<T>>;
	UserPromptSubmit: UserPromptSubmitHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreCompact: PreCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;
	Notification: NotificationHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PermissionRequest: PermissionRequestHandler<InferPluginOptions<T>, InferPluginState<T>>;

	// Raw handlers
	SessionStartRaw: SessionStartRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SessionEndRaw: SessionEndRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreToolUseRaw: PreToolUseRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PostToolUseRaw: PostToolUseRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	StopRaw: StopRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	SubagentStopRaw: SubagentStopRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	UserPromptSubmitRaw: UserPromptSubmitRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PreCompactRaw: PreCompactRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	NotificationRaw: NotificationRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
	PermissionRequestRaw: PermissionRequestRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
}
```

Update `InferPluginCommands` similarly:

```typescript
export type InferPluginCommands<T> = {
	[K in keyof ExtractCommands<T>]: ExtractCommands<T>[K] extends CommandDefinition<infer TArgs>
		? CommandHandler<Schema.Schema.Type<TArgs>, InferPluginOptions<T>, InferPluginState<T>>
		: never;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/plugin/pluginconfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package/src/plugin/config.ts package/__tests__/plugin/pluginconfig.test.ts
git commit -m "feat: update InferHandlers to read from PluginConfig statics"
```

---

### Task 4: Remove `Plugin()` Factory and Old Types

**Files:**
- Modify: `package/src/plugin/config.ts` — delete `Plugin()`, `PluginDefinition`, old `ClaudePlugin` interface
- Modify: `package/src/index.ts` — update exports

- [ ] **Step 1: Remove old API from config.ts**

In `package/src/plugin/config.ts`:

1. Delete the `PluginDefinition` interface (lines ~1028-1051)
2. Delete the old `ClaudePlugin` interface (lines ~1061-1074)
3. Delete the `Plugin()` factory function (lines ~1104-1131)
4. Delete the old `ResolvePlugin` helper type
5. Keep `PluginConfig` (the interface — rename it to `PluginConfigLegacy` or delete it if nothing references it internally). Check if `PipelineRuntime` or `PluginTester` uses the `PluginConfig` interface — if so, keep it as an internal type until those are updated in later tasks.

- [ ] **Step 2: Update exports in index.ts**

In `package/src/index.ts`:

1. Remove: `export { Plugin } from "./plugin/config.js";`
2. Remove from the type export block: `PluginDefinition`
3. Add to exports: `export { PluginConfig, ClaudePlugin } from "./plugin/config.js";`
4. Add to type exports: `ExtractStateSchema` (new helper)
5. Keep all other type exports (`InferHandlers`, `InferPluginOptions`, `InferPluginState`, `HooksMap`, etc.)

- [ ] **Step 3: Run type check**

Run: `cd package && bunx tsgo --noEmit`
Expected: Compilation errors in files that still reference `Plugin()` — this is expected. Note them for the next tasks.

- [ ] **Step 4: Commit**

```bash
git add package/src/plugin/config.ts package/src/index.ts
git commit -m "refactor: remove Plugin() factory, export PluginConfig and ClaudePlugin"
```

---

### Task 5: Update `PluginTester` for New API

**Files:**
- Modify: `package/src/testing/builder.ts` (lines 486-527 — constructor and private field)

- [ ] **Step 1: Write failing test**

Create `package/__tests__/testing/plugintester-new.test.ts`:

```typescript
import { afterEach, describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Allow } from "../../src/outcomes/Allow.js";
import { Deny } from "../../src/outcomes/Deny.js";
import { PluginConfig, ClaudePlugin } from "../../src/plugin/config.js";
import type { InferHandlers } from "../../src/plugin/config.js";

class TestState extends Schema.Class<TestState>("TestState")({
	git: Schema.Boolean,
}) {
	canUseGit() {
		return this.git;
	}
}

class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
	prefix: Schema.Literal("TEST"),
}) {
	static readonly options = Schema.Struct({
		MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
			default: () => "strict" as const,
		}),
	});
	static readonly state = TestState;
}

const guardHandler: InferHandlers<typeof TestConfig>["PreToolUse"] = ({ input, options }) => {
	if (options.MODE === "strict" && input.tool_name === "Bash") {
		const cmd = (input.tool_input as { command?: string }).command ?? "";
		if (cmd.includes("rm -rf")) {
			return new Deny({ summary: "blocked", reason: "destructive" });
		}
	}
	return new Allow({ summary: `allowed ${input.tool_name}` });
};

describe("PluginTester with PluginConfig.extend()", () => {
	let plugin: InstanceType<typeof ClaudePlugin>;

	afterEach(() => {
		// Cleanup if needed
	});

	test("plugin.test() returns a PluginTester with fluent API", () => {
		plugin = new ClaudePlugin(TestConfig, {
			PreToolUse: [{ name: "guard", pipeline: guardHandler }],
		});
		const tester = plugin.test();
		expect(tester).toBeDefined();
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		tester.dispose();
	});

	test("runHook executes handler and returns result", async () => {
		plugin = new ClaudePlugin(TestConfig, {
			PreToolUse: [{ name: "guard", pipeline: guardHandler }],
		});
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new TestState({ git: true }))
			.withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "rm -rf /" } })
			.runHook("PreToolUse", "guard");

		expect(result.action).toBe("deny");
		tester.dispose();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && bun test __tests__/testing/plugintester-new.test.ts`
Expected: FAIL — `PluginTester` constructor still expects `PluginDefinition`

- [ ] **Step 3: Update PluginTester constructor**

In `package/src/testing/builder.ts`:

Change the constructor and private field (around line 517-526):

```typescript
// Before:
private readonly pluginConfig: PluginDefinition<any, any>;

constructor(pluginConfig: PluginDefinition<any, any>) {
	this.pluginConfig = pluginConfig;
}

// After:
private readonly configClass: typeof PluginConfig;
private readonly hooksMap: Record<string, any[]>;

constructor(configClass: typeof PluginConfig, hooks: Record<string, any[]> = {}) {
	this.configClass = configClass;
	this.hooksMap = hooks;
}
```

Update internal references from `this.pluginConfig.hooks` to `this.hooksMap`, and from `this.pluginConfig.options`/`this.pluginConfig.state` to `this.configClass.options`/`(this.configClass as any).state`. The `as any` is needed because TypeScript doesn't know about the statics on the base `typeof PluginConfig` — the statics are on the user's subclass.

Key methods to update:
- `runHook()` (~line 1462): Change `this.pluginConfig.hooks` to `this.hooksMap`
- `resolveHandler()` (~line 1810): Change hook lookup to use `this.hooksMap`
- Any method referencing `this.pluginConfig.commands` should use `(this.configClass as any).commands`

Also update the import at the top of `builder.ts`:
```typescript
// Add:
import { PluginConfig } from "../plugin/config.js";
// Remove PluginDefinition from imports if no longer needed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && bun test __tests__/testing/plugintester-new.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd package && bun test`
Expected: Some old tests may fail because they still use `Plugin()`. That's expected — we'll update them in Task 7.

- [ ] **Step 6: Commit**

```bash
git add package/src/testing/builder.ts package/__tests__/testing/plugintester-new.test.ts
git commit -m "refactor: update PluginTester to accept PluginConfig class + hooks map"
```

---

### Task 6: Update EntrypointGenerator

**Files:**
- Modify: `package/src/build/EntrypointGenerator.ts`

- [ ] **Step 1: Update generated entrypoint template**

In `package/src/build/EntrypointGenerator.ts`, update the generated template string (starting around line 168):

Replace:
```typescript
import pluginDefinition from "${pluginPath}";
import { __state__ as StateSchemaImport } from "${pluginPath}";
import { PipelineLive, PipelineRuntime, PluginEnv, PluginInfo } from "claude-binary-plugin";
```

With:
```typescript
import PluginConfigClass from "${pluginPath}";
import { PipelineLive, PipelineRuntime, PluginEnv, PluginInfo } from "claude-binary-plugin";
```

Replace:
```typescript
// Extract config from plugin definition
const pluginConfig = pluginDefinition.config;

// Create environment class from plugin options schema (with pluginName for logging)
const EnvClass = PluginEnv.create(pluginConfig.prefix, pluginConfig.options, PLUGIN_NAME);

// State schema — imported directly as a named export to survive tree-shaking
const StateSchema = StateSchemaImport;
```

With:
```typescript
// Read statics directly from the config class — they survive Bun's tree-shaking
const configInstance = new PluginConfigClass();
const EnvClass = PluginEnv.create(configInstance.prefix, PluginConfigClass.options, PLUGIN_NAME);
const StateSchema = PluginConfigClass.state;
```

Update all references in the hook cases from `pluginConfig.options` to `PluginConfigClass.options`, `pluginConfig.setup` to `PluginConfigClass.setup`, etc.

In the inline hook cases, update from:
```typescript
const hookDef = pluginConfig.hooks.${hookType}?.find(h => h.name === "${hook.name}");
```
to reference the hooks passed via the build system (these will be value imports, not looked up from config).

- [ ] **Step 2: Run type check**

Run: `cd package && bunx tsgo --noEmit`
Expected: PASS for EntrypointGenerator (it generates strings, so type checking is about its own code, not the generated output)

- [ ] **Step 3: Commit**

```bash
git add package/src/build/EntrypointGenerator.ts
git commit -m "refactor: update EntrypointGenerator to read PluginConfig statics"
```

---

### Task 7: Update `PluginBuilder.fromConfig()`

**Files:**
- Modify: `package/src/build/builder.ts` (lines ~1322-1345 and ~1727-1751)

- [ ] **Step 1: Update `buildPluginFromConfig` signature**

The function currently expects `plugin.config.hooks`. With the new API, `ClaudePlugin` stores hooks directly (not nested under `.config`). Update the parameter type:

```typescript
// Before:
async function buildPluginFromConfig(
	plugin: {
		config: {
			hooks: Partial<Record<PipelineHookEventType, ExtractableHook[]>>;
			commands?: Record<string, ExtractableCommand>;
			hooksOutputPath?: string;
		};
	},
	options: { ... },
)

// After:
async function buildPluginFromConfig(
	plugin: {
		config: typeof PluginConfig;
		hooks: Partial<Record<PipelineHookEventType, ExtractableHook[]>>;
	},
	options: { ... },
)
```

Update internal references:
- `plugin.config.hooks` → `plugin.hooks`
- `plugin.config.commands` → `(plugin.config as any).commands` (static on config class)
- `plugin.config.hooksOutputPath` → `(plugin.config as any).hooksOutputPath` (static on config class, if used)

Update the static `fromConfig()` method on `PluginBuilder` to match.

- [ ] **Step 2: Update HookExtractor calls**

In `buildPluginFromConfig`, the calls to `extractPipelineHookEntries(plugin.config)` and similar need to change:

```typescript
// Before:
const hookEntries = extractPipelineHookEntries(plugin.config);
const commandEntries = extractPipelineCommandEntries(plugin.config);
const passthroughHooks = extractPassthroughHookEntries(plugin.config);

// After:
const hookEntries = extractPipelineHookEntries({ hooks: plugin.hooks });
const commandEntries = extractPipelineCommandEntries({ commands: (plugin.config as any).commands });
const passthroughHooks = extractPassthroughHookEntries({ hooks: plugin.hooks });
```

- [ ] **Step 3: Run type check**

Run: `cd package && bunx tsgo --noEmit`

- [ ] **Step 4: Commit**

```bash
git add package/src/build/builder.ts
git commit -m "refactor: update PluginBuilder.fromConfig() for ClaudePlugin API"
```

---

### Task 8: Update Test Plugin

**Files:**
- Modify: `plugin/plugin.config.ts`
- Modify: `plugin/plugin.build.ts`
- Modify: `plugin/hooks/session-start.ts`
- Modify: `plugin/hooks/pre-tool-use.ts`
- No changes to: `plugin/state.ts`

- [ ] **Step 1: Rewrite plugin.config.ts**

```typescript
import { PluginConfig } from "claude-binary-plugin";
import type { InferHandlers } from "claude-binary-plugin";
import { Schema } from "effect";
import { PluginState } from "./state.js";

class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
	prefix: Schema.Literal("TEST_PLUGIN"),
}) {
	static readonly options = Schema.Struct({
		MODE: Schema.optionalWith(Schema.Literal("strict", "lenient"), {
			default: () => "strict" as const,
		}),
		MAX_RETRIES: Schema.optionalWith(Schema.Number, {
			default: () => 3,
		}),
	});
	static readonly state = PluginState;
	static readonly setup = async () => {
		const hasGit = await Bun.$`which git`
			.quiet()
			.nothrow()
			.then((r) => r.exitCode === 0);
		const hasBun = await Bun.$`which bun`
			.quiet()
			.nothrow()
			.then((r) => r.exitCode === 0);
		return new PluginState({
			git: hasGit,
			bun: hasBun,
			packageManager: hasBun ? "bun" : "npm",
		});
	};
}

export type Handlers = InferHandlers<typeof TestConfig>;
export default TestConfig;
```

- [ ] **Step 2: Rewrite plugin.build.ts**

```typescript
import { ClaudePlugin } from "claude-binary-plugin";
import TestConfig from "./plugin.config.js";
import preToolUseHandler from "./hooks/pre-tool-use.js";
import sessionStartHandler from "./hooks/session-start.js";

const plugin = new ClaudePlugin(TestConfig, {
	SessionStart: [{ name: "init", pipeline: sessionStartHandler }],
	PreToolUse: [{ name: "guard", pipeline: preToolUseHandler }],
});

const result = await plugin.build({
	rootDir: import.meta.dir,
});

if (!result.success) {
	console.error("Build failed:", result.output);
	process.exit(1);
}
console.log(`Built: ${result.output} (${result.duration}ms)`);
```

- [ ] **Step 3: Verify hook files need no changes**

`plugin/hooks/session-start.ts` and `plugin/hooks/pre-tool-use.ts` already use:
```typescript
import type { Handlers } from "../plugin.config.js";
```

Since `Handlers` is now `InferHandlers<typeof TestConfig>` (reading from statics), the types should still flow correctly. Verify no changes needed.

- [ ] **Step 4: Type check the test plugin**

Run: `cd plugin && bunx tsgo --noEmit`
Expected: PASS

- [ ] **Step 5: Build the test plugin**

Run: `cd plugin && bun run build:prod`
Expected: Build succeeds, producing a `.plugin` binary

- [ ] **Step 6: Commit**

```bash
git add plugin/plugin.config.ts plugin/plugin.build.ts plugin/hooks/session-start.ts plugin/hooks/pre-tool-use.ts
git commit -m "refactor: update test plugin to use PluginConfig.extend() API"
```

---

### Task 9: Update Existing Tests

**Files:**
- Modify: `package/__tests__/plugin/config.test.ts`
- Modify: `package/__tests__/testing/builder.test.ts`

- [ ] **Step 1: Update config.test.ts**

All tests in `config.test.ts` that use `Plugin()` need to be rewritten to use `PluginConfig.extend()` + `ClaudePlugin`. The test structure stays the same — just the API changes.

Pattern for each test:

```typescript
// Before:
class TestPlugin extends Plugin("TEST", {
	options: Schema.Struct({ ... }),
	hooks: { PreToolUse: [{ name: "guard", pipeline: handler }] },
}) {}
const plugin = new TestPlugin();
expect(plugin.config.hooks.PreToolUse).toHaveLength(1);

// After:
class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
	prefix: Schema.Literal("TEST"),
}) {
	static readonly options = Schema.Struct({ ... });
}
const plugin = new ClaudePlugin(TestConfig, {
	PreToolUse: [{ name: "guard", pipeline: handler }],
});
expect(plugin.hooks.PreToolUse).toHaveLength(1);
```

Key changes across the file:
- Replace `import { Plugin }` with `import { PluginConfig, ClaudePlugin }`
- Each `class X extends Plugin("PREFIX", { ... }) {}` becomes a `PluginConfig.extend()` class + `new ClaudePlugin(config, hooks)`
- `plugin.config.hooks` → `plugin.hooks`
- `plugin.config.options` → `plugin.config.options` (now a static)
- `plugin.config.setup` → `plugin.config.setup` (now a static)
- `plugin.config.commands` → `plugin.config.commands` (now a static)
- `plugin.prefix` → access via config instance: `new (plugin.config)({}).prefix` or just test the config class directly

- [ ] **Step 2: Update builder.test.ts**

Same pattern — replace `Plugin()` usage with `PluginConfig.extend()` + `ClaudePlugin`.

- [ ] **Step 3: Run full test suite**

Run: `cd package && bun test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add package/__tests__/plugin/config.test.ts package/__tests__/testing/builder.test.ts
git commit -m "test: update all tests to use PluginConfig.extend() API"
```

---

### Task 10: Clean Up and Final Verification

**Files:**
- Modify: `package/src/plugin/config.ts` — remove any dead code from old API
- Modify: `package/src/index.ts` — verify exports are clean

- [ ] **Step 1: Remove dead code**

Search `package/src/plugin/config.ts` for any remaining references to:
- `PluginDefinition` (should be deleted)
- Old `ClaudePlugin` interface (should be deleted, replaced by class)
- `Plugin` function (should be deleted)
- `ResolvePlugin` helper (should be deleted)

Remove the old `PluginConfig` interface (lines ~892-1010) if nothing references it internally. If `PipelineRuntime` or other internal code uses it, keep it as an internal type but don't export it.

- [ ] **Step 2: Verify exports**

In `package/src/index.ts`, verify:
- `PluginConfig` is exported (the Schema.Class, not the old interface)
- `ClaudePlugin` is exported (the concrete class)
- `Plugin` is NOT exported
- `PluginDefinition` is NOT exported
- `InferHandlers`, `InferPluginOptions`, `InferPluginState`, `InferPluginCommands` are still exported
- `HooksMap` is still exported

- [ ] **Step 3: Run full type check**

Run: `cd package && bunx tsgo --noEmit`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd package && bun test`
Expected: ALL PASS

- [ ] **Step 5: Build test plugin and verify binary works**

Run: `cd plugin && bun run build:prod`
Run: `claude --plugin-dir ./plugin` (manual smoke test)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: clean up dead code from Plugin() factory removal"
```
