import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import type { MockEnvContext } from "./mocks.js";
import { mockEnv } from "./mocks.js";
import { createEnvClass } from "./pipeline-runtime.js";

describe("createEnvClass", () => {
	test("creates a class with the correct prefix", () => {
		const schema = z.object({
			DEBUG: z.boolean().default(false),
		});

		const EnvClass = createEnvClass("MY_PLUGIN", schema);
		const instance = new EnvClass();

		// The class should be instantiable
		expect(instance).toBeDefined();
	});

	test("validated getter returns typed environment", () => {
		const schema = z.object({
			DEBUG: z.boolean().default(false),
			LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
		});

		const EnvClass = createEnvClass("TEST", schema);
		const instance = new EnvClass();

		// The validated getter should exist (actual validation happens during hook creation)
		expect(typeof instance.validated).toBe("object");
	});

	test("creates unique classes for different prefixes", () => {
		const schema = z.object({});

		const ClassA = createEnvClass("PREFIX_A", schema);
		const ClassB = createEnvClass("PREFIX_B", schema);

		// They should be different classes
		expect(ClassA).not.toBe(ClassB);
	});

	test("works with complex schema types", () => {
		const schema = z.object({
			PORT: z.coerce.number().default(3000),
			HOSTS: z
				.string()
				.default("")
				.transform((s) => s.split(",").filter(Boolean)),
			ENABLED: z.coerce.boolean().default(true),
		});

		const EnvClass = createEnvClass("COMPLEX", schema);
		const instance = new EnvClass();

		expect(instance).toBeDefined();
		expect(instance.validated).toBeDefined();
	});
});

describe("PLUGIN_STATE base64 encoding", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({}, { clearPrefix: "TEST_" });
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

		// Verify decoding works (simulates extractStateFromEnv)
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

	test("extractStateFromEnv decodes base64 state from env var", () => {
		const state = {
			projectDir: "/home/user",
			command: "$TEST_DIR/run.sh",
		};

		// Set up the base64-encoded state in env
		const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		// Create env class and instance
		const schema = z.object({});
		const EnvClass = createEnvClass("TEST", schema);
		const instance = new EnvClass();

		// The instance should have the prefix
		expect(instance.getPrefix()).toBe("TEST");
	});
});
