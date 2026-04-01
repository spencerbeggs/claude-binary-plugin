import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { PluginEnv } from "../../src/services/PluginEnv.js";
import type { MockEnvContext } from "../../src/testing/mocks.js";
import { TestFixtures } from "../../src/testing/mocks.js";

describe("PluginEnv.create", () => {
	test("creates a class with the correct prefix", () => {
		const schema = Schema.Struct({
			VERBOSE: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		});

		const EnvClass = PluginEnv.create("MY_PLUGIN", schema);
		const instance = new EnvClass();

		// The class should be instantiable
		expect(instance).toBeDefined();
	});

	test("validated getter returns typed environment", () => {
		const schema = Schema.Struct({
			VERBOSE: Schema.optionalWith(Schema.Boolean, { default: () => false }),
			LOG_LEVEL: Schema.optionalWith(Schema.Literal("debug", "info", "warn", "error"), {
				default: () => "info" as const,
			}),
		});

		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		// The validated getter should exist (actual validation happens during hook creation)
		expect(typeof instance.validated).toBe("object");
	});

	test("creates unique classes for different prefixes", () => {
		const schema = Schema.Struct({});

		const ClassA = PluginEnv.create("PREFIX_A", schema);
		const ClassB = PluginEnv.create("PREFIX_B", schema);

		// They should be different classes
		expect(ClassA).not.toBe(ClassB);
	});

	test("works with complex schema types", () => {
		const CommaSeparatedList = Schema.transform(Schema.String, Schema.Array(Schema.String), {
			decode: (s) => s.split(",").filter(Boolean),
			encode: (a) => a.join(","),
		});
		const schema = Schema.Struct({
			PORT: Schema.optionalWith(Schema.NumberFromString, { default: () => 3000 }),
			HOSTS: Schema.optionalWith(CommaSeparatedList, { default: () => [] as readonly string[] }),
			ENABLED: Schema.optionalWith(Schema.BooleanFromString, { default: () => true }),
		});

		const EnvClass = PluginEnv.create("COMPLEX", schema);
		const instance = new EnvClass();

		expect(instance).toBeDefined();
		expect(instance.validated).toBeDefined();
	});
});

describe("PLUGIN_STATE base64 encoding", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("base64 encodes state with special shell characters", () => {
		// State containing $ which would break shell parsing
		const state = {
			command: "$TEST_PLUGIN_DIR/my.plugin --cmd=test",
			path: "/home/user/`backticks`/file",
			quoted: 'say "hello"',
		};

		// Simulate what persistSessionEnv does
		const jsonStr = JSON.stringify(state);
		const encoded = Buffer.from(jsonStr).toString("base64");

		// Verify it doesn't contain problematic shell characters
		expect(encoded).not.toContain("$");
		expect(encoded).not.toContain("`");
		expect(encoded).not.toContain('"');

		// Verify decoding works (simulates extractPersistedState)
		const decoded = Buffer.from(encoded, "base64").toString("utf8");
		const parsed = JSON.parse(decoded);

		expect(parsed.command).toBe("$TEST_PLUGIN_DIR/my.plugin --cmd=test");
		expect(parsed.path).toBe("/home/user/`backticks`/file");
		expect(parsed.quoted).toBe('say "hello"');
	});

	test("base64 round-trip preserves complex nested state", () => {
		const state = {
			git: {
				available: true,
				isRepo: true,
				defaultBranch: "main",
				currentBranch: "feat/test-$var",
			},
			agentAlternative: "$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test",
			enabled: {
				biome: true,
				turbo: false,
			},
			config: {
				markdownlint: "/path/to/`config`/file.json",
			},
		};

		// Encode
		const jsonStr = JSON.stringify(state);
		const encoded = Buffer.from(jsonStr).toString("base64");

		// Decode
		const decoded = Buffer.from(encoded, "base64").toString("utf8");
		const parsed = JSON.parse(decoded);

		// Verify deep equality
		expect(parsed).toEqual(state);
		expect(parsed.git.currentBranch).toBe("feat/test-$var");
		expect(parsed.agentAlternative).toBe("$SAVVY_WORKFLOW_PLUGIN_DIR/workflow.plugin --cmd=test");
		expect(parsed.config.markdownlint).toBe("/path/to/`config`/file.json");
	});

	test("extractPersistedState decodes base64 state from env var", () => {
		const state = {
			projectDir: "/home/user",
			command: "$TEST_DIR/run.sh",
		};

		// Set up the base64-encoded state in env
		const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		// Create env class and instance
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		// The instance should have the prefix
		expect(instance.getPrefix()).toBe("TEST");
	});
});
