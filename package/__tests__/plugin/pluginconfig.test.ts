import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
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
