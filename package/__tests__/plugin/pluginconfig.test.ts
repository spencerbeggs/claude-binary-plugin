import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
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
