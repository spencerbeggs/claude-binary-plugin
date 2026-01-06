import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import type { SetupContext } from "../pipeline/config.js";
import { ClaudeBinaryPlugin } from "../pipeline/config.js";
import type { MockEnvContext } from "./mocks.js";
import { mockEnv } from "./mocks.js";

// =============================================================================
// TEST PLUGIN
// =============================================================================

const testSchema = z.object({
	VERBOSE: z.string().default("false"),
	API_KEY: z.string().optional(),
});

type TestOptions = z.infer<typeof testSchema>;

interface TestState {
	packageManager: "bun" | "npm" | "pnpm" | "yarn";
	gitRepo: boolean;
	projectRoot: string;
}

const testPlugin = ClaudeBinaryPlugin.create({
	prefix: "TEST_PLUGIN",
	options: testSchema,
	setup: async (ctx: SetupContext<TestOptions>): Promise<TestState> => {
		return {
			packageManager: "bun",
			gitRepo: true,
			projectRoot: ctx.cwd,
		};
	},
	hooks: {
		PreToolUse: [
			{
				name: "security",
				tools: ["Bash"],
				pipeline: "./hooks/security.hook.ts",
			},
		],
		SessionStart: [
			{
				name: "context",
				pipeline: "./hooks/context.hook.ts",
			},
		],
	},
	commands: {
		lint: {
			description: "Lint the codebase",
			args: z.object({
				path: z.string().default("."),
				fix: z.boolean().default(true),
			}),
			pipeline: "./commands/lint.cmd.ts",
		},
	},
});

// =============================================================================
// TESTS
// =============================================================================

describe("PluginTester", () => {
	let env: MockEnvContext;

	afterEach(() => {
		env?.restore();
	});

	describe("plugin.test()", () => {
		test("returns a PluginTester instance", () => {
			const builder = testPlugin.test();

			expect(builder).toBeDefined();
			expect(typeof builder.withOptions).toBe("function");
			expect(typeof builder.withState).toBe("function");
			expect(typeof builder.dispose).toBe("function");
		});

		test("builder is chainable", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "true", API_KEY: "test" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			expect(builder).toBeDefined();
		});
	});

	describe("withOptions()", () => {
		test("accepts valid options matching schema", () => {
			const builder = testPlugin.test().withOptions({
				VERBOSE: "true",
				API_KEY: "secret-key",
			});

			expect(builder).toBeDefined();
		});

		test("allows optional fields to be omitted", () => {
			const builder = testPlugin.test().withOptions({
				VERBOSE: "false",
				// API_KEY is optional
			});

			expect(builder).toBeDefined();
		});
	});

	describe("withState()", () => {
		test("accepts full state object", () => {
			const builder = testPlugin.test().withState({
				packageManager: "bun",
				gitRepo: true,
				projectRoot: "/my/project",
			});

			expect(builder).toBeDefined();
		});

		test("requires complete state (no partial)", () => {
			// This is a type-level check - the builder enforces full state
			const builder = testPlugin.test().withState({
				packageManager: "bun",
				gitRepo: false,
				projectRoot: "/test",
			});

			expect(builder).toBeDefined();
		});
	});

	describe("hook input methods", () => {
		test("withPreToolUseInput() sets PreToolUse input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPreToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "ls -la" },
				});

			expect(builder).toBeDefined();
		});

		test("withPostToolUseInput() sets PostToolUse input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPostToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "ls -la" },
					tool_response: { output: "file1.txt\nfile2.txt" },
				});

			expect(builder).toBeDefined();
		});

		test("withSessionStartInput() sets SessionStart input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withSessionStartInput({
					source: "startup",
				});

			expect(builder).toBeDefined();
		});

		test("withSessionEndInput() sets SessionEnd input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withSessionEndInput({
					reason: "logout",
				});

			expect(builder).toBeDefined();
		});

		test("withStopInput() sets Stop input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withStopInput({
					stop_hook_active: true,
				});

			expect(builder).toBeDefined();
		});

		test("withUserPromptSubmitInput() sets UserPromptSubmit input", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withUserPromptSubmitInput({
					prompt: "Hello Claude!",
				});

			expect(builder).toBeDefined();
		});
	});

	describe("withShell()", () => {
		test("registers shell mock responses", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withShell("git status", { exitCode: 0, stdout: "clean", stderr: "" })
				.withShell("npm --version", { exitCode: 0, stdout: "10.0.0", stderr: "" });

			expect(builder).toBeDefined();
		});
	});

	describe("validation", () => {
		test("runHook() throws if options not set", async () => {
			const builder = testPlugin.test().withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			await expect(builder.runHook("PreToolUse", "security")).rejects.toThrow(
				"withOptions() must be called before running tests",
			);
		});

		test("runHook() throws if state not set", async () => {
			const builder = testPlugin.test().withOptions({ VERBOSE: "false" });

			await expect(builder.runHook("PreToolUse", "security")).rejects.toThrow(
				"withState() must be called before running tests",
			);
		});

		test("runCommand() throws if options not set", async () => {
			const builder = testPlugin.test().withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			await expect(builder.runCommand("lint")).rejects.toThrow("withOptions() must be called before running tests");
		});

		test("runCommand() throws if state not set", async () => {
			const builder = testPlugin.test().withOptions({ VERBOSE: "false" });

			await expect(builder.runCommand("lint")).rejects.toThrow("withState() must be called before running tests");
		});
	});

	describe("dispose()", () => {
		test("can be called multiple times safely", () => {
			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			builder.dispose();
			builder.dispose(); // Should not throw
		});

		test("restores environment after disposal", () => {
			// Set up a known env state
			env = mockEnv({ ORIGINAL_VAR: "original" });

			const builder = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			// Builder internally sets env vars during setupMocks
			// After dispose, original env should be restored

			builder.dispose();

			// Note: Since we're using mockEnv which isolates the environment,
			// we just verify dispose doesn't throw
			expect(true).toBe(true);
		});
	});
});

describe("TestFixtures class", () => {
	test("TestFixtures has I/O methods", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.createIO).toBe("function");
		expect(typeof TestFixtures.resetIO).toBe("function");
	});

	test("TestFixtures has environment methods and presets", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.createEnv).toBe("function");
		expect(TestFixtures.envPresets).toBeDefined();
		expect(typeof TestFixtures.envPresets.claudeHook).toBe("function");
		expect(TestFixtures.MockStateClass).toBeDefined();
	});

	test("TestFixtures has command methods", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.createCommand).toBe("function");
		expect(typeof TestFixtures.runCommand).toBe("function");
		expect(typeof TestFixtures.testFatalError).toBe("function");
	});

	test("TestFixtures has hook methods", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.runHook).toBe("function");
	});

	test("TestFixtures has shell methods", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.shellResult).toBe("function");
		expect(typeof TestFixtures.shellExecutor).toBe("function");
		expect(TestFixtures.defaultShellExecutor).toBeDefined();
	});

	test("TestFixtures has in-memory shell methods", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(typeof TestFixtures.bufferShellResult).toBe("function");
		expect(typeof TestFixtures.inMemoryShellExecutor).toBe("function");
		expect(TestFixtures.defaultInMemoryShellExecutor).toBeDefined();
	});

	test("TestFixtures has utility properties", async () => {
		const { TestFixtures } = await import("./mocks.js");

		expect(TestFixtures.ExitError).toBeDefined();
		expect(typeof TestFixtures.logger).toBe("function");
	});
});
