import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Allow } from "../../src/outcomes/Allow.js";
import type { InferHandlers, InferPluginOptions, InferPluginState } from "../../src/plugin/config.js";
import { ClaudePlugin, PluginConfig } from "../../src/plugin/config.js";

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

		const stateInstance = new MyState({ git: true });
		expect(stateInstance.canUseGit()).toBe(true);
	});
});

describe("ClaudePlugin", () => {
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
			// TypeScript should know these types
			const _mode: "strict" | "lenient" = options.MODE;
			const _git: boolean = state.git;
			return new Allow({ summary: "ok" });
		};

		expect(typeof handler).toBe("function");
	});

	test("InferPluginOptions extracts options from static property (not never)", () => {
		type Options = InferPluginOptions<typeof TestConfig>;
		// If Options is never or Record<string,unknown>, MODE won't be a known key
		// We verify at runtime that the inferred type actually matches
		const opts: Options = { MODE: "strict" };
		// This line fails at compile time if MODE is 'unknown' instead of the literal union
		const mode: "strict" | "lenient" = opts.MODE;
		expect(mode).toBe("strict");
	});

	test("InferPluginState extracts state from static property (not fallback)", () => {
		type State = InferPluginState<typeof TestConfig>;
		// If State fell back to Record<string, unknown>, this assignment would fail
		const state: State = new MyState({ git: true });
		// This line fails at compile time if git is 'unknown' instead of boolean
		const git: boolean = state.git;
		expect(git).toBe(true);
	});
});
