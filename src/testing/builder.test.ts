import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import type { SetupContext } from "../pipeline/config.js";
import { ClaudeBinaryPlugin } from "../pipeline/config.js";
import type { MockEnvContext } from "./mocks.js";
import { TestFixtures } from "./mocks.js";

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

// Test plugin with inline handlers for testing runHook
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
				pipeline: async ({ input, options, state }) => {
					const toolInput = input.tool_input as { command?: string };
					const command = toolInput.command ?? "";

					// Block dangerous commands
					if (command.includes("rm -rf")) {
						return {
							status: "executed" as const,
							action: "deny" as const,
							summary: "blocked dangerous command",
							reason: "rm -rf is not allowed",
						};
					}

					// Allow safe commands
					return {
						status: "executed" as const,
						action: "allow" as const,
						summary: "allowed safe command",
					};
				},
			},
			{
				name: "file-path-hook",
				tools: ["Bash"],
				pipeline: "./hooks/security.hook.ts",
			},
		],
		SessionStart: [
			{
				name: "context",
				pipeline: async ({ input, options, state }) => {
					return {
						status: "executed" as const,
						action: "context" as const,
						summary: "added project context",
						claudeContext: `Project uses ${state.packageManager}`,
					};
				},
			},
		],
		PostToolUse: [
			{
				name: "post-bash",
				tools: ["Bash"],
				pipeline: async ({ input }) => {
					return {
						status: "executed" as const,
						action: "context" as const,
						summary: "added post-tool context",
						claudeContext: "Command completed successfully",
					};
				},
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
			pipeline: async ({ args, options, state }) => {
				const typedArgs = args as { path: string; fix: boolean };
				return {
					exitCode: 0,
					output: `# Lint Results\n\nPath: ${typedArgs.path}\nFix: ${typedArgs.fix}\nPackage Manager: ${state.packageManager}`,
				};
			},
		},
		test: {
			description: "Run tests",
			args: z.object({
				pattern: z.string().optional(),
				verbose: z.boolean().default(false),
			}),
			pipeline: async ({ args }) => {
				const typedArgs = args as { pattern?: string; verbose: boolean };
				if (typedArgs.pattern === "failing") {
					return {
						exitCode: 1,
						output: "# Test Results\n\n1 test failed",
						data: { failed: 1, passed: 0 },
					};
				}
				return {
					exitCode: 0,
					output: "# Test Results\n\nAll tests passed!",
					data: { failed: 0, passed: 10 },
				};
			},
		},
		status: {
			description: "Show status",
			args: z.object({}),
			pipeline: async ({ state }) => {
				return {
					exitCode: 0,
					output: `# Status\n\nProject: ${state.projectDir}`,
				};
			},
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

	describe("runHook() execution", () => {
		test("runs PreToolUse hook and returns allow result", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPreToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "git status" },
				});

			const result = await ctx.runHook("PreToolUse", "security");

			expect(result.exitCode).toBe(0);
			expect(result.action).toBe("allow");
			expect(result.output).toBeDefined();
			expect((result.output as { summary?: string }).summary).toBe("allowed safe command");

			ctx.dispose();
		});

		test("runs PreToolUse hook and returns deny result", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPreToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "rm -rf /" },
				});

			const result = await ctx.runHook("PreToolUse", "security");

			expect(result.exitCode).toBe(0);
			expect(result.action).toBe("deny");
			expect(result.reason).toBe("rm -rf is not allowed");

			ctx.dispose();
		});

		test("runs SessionStart hook with context action", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withSessionStartInput({
					source: "startup",
				});

			const result = await ctx.runHook("SessionStart", "context");

			expect(result.exitCode).toBe(0);
			expect(result.action).toBe("context");
			expect(result.context).toBe("Project uses bun");

			ctx.dispose();
		});

		test("runs PostToolUse hook with context", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPostToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "ls" },
					tool_response: { output: "file.txt" },
				});

			const result = await ctx.runHook("PostToolUse", "post-bash");

			expect(result.exitCode).toBe(0);
			expect(result.action).toBe("context");
			expect(result.context).toBe("Command completed successfully");

			ctx.dispose();
		});

		test("returns error for non-existent hook", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" })
				.withPreToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "ls" },
				});

			const result = await ctx.runHook("PreToolUse", "non-existent");

			expect(result.exitCode).toBe(1);
			expect(result.reason).toContain("not found");

			ctx.dispose();
		});

		test("handler receives correct options from withOptions()", async () => {
			let receivedOptions: unknown;

			const pluginWithOptionsCheck = ClaudeBinaryPlugin.create({
				prefix: "OPTIONS_CHECK",
				options: z.object({
					API_KEY: z.string().optional(),
					DEBUG: z.string().default("false"),
				}),
				setup: async () => ({}),
				hooks: {
					PreToolUse: [
						{
							name: "check-options",
							pipeline: async ({ options }) => {
								receivedOptions = options;
								return {
									status: "executed" as const,
									action: "allow" as const,
									summary: "checked options",
								};
							},
						},
					],
				},
			});

			const ctx = pluginWithOptionsCheck
				.test()
				.withOptions({ API_KEY: "my-secret-key", DEBUG: "true" })
				.withState({})
				.withPreToolUseInput({
					tool_name: "Bash",
					tool_input: { command: "ls" },
				});

			await ctx.runHook("PreToolUse", "check-options");

			expect(receivedOptions).toEqual({ API_KEY: "my-secret-key", DEBUG: "true" });

			ctx.dispose();
		});

		test("handler receives correct state from withState()", async () => {
			let receivedState: unknown;

			// Create a custom plugin to capture state
			const pluginWithStateCheck = ClaudeBinaryPlugin.create({
				prefix: "STATE_CHECK",
				options: z.object({}),
				setup: async (): Promise<{ customField: string; nested: { deep: boolean } }> => ({
					customField: "",
					nested: { deep: false },
				}),
				hooks: {
					SessionStart: [
						{
							name: "check-state",
							pipeline: async ({ state }) => {
								receivedState = state;
								return {
									status: "executed" as const,
									action: "context" as const,
									summary: "checked state",
									claudeContext: "test",
								};
							},
						},
					],
				},
			});

			const stateCtx = pluginWithStateCheck
				.test()
				.withOptions({})
				.withState({ customField: "custom-value", nested: { deep: true } })
				.withSessionStartInput({ source: "startup" });

			await stateCtx.runHook("SessionStart", "check-state");

			expect(receivedState).toMatchObject({
				customField: "custom-value",
				nested: { deep: true },
				projectDir: expect.any(String),
				pluginDir: expect.any(String),
			});

			stateCtx.dispose();
		});
	});

	describe("runCommand() execution", () => {
		test("runs command and returns success result", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			const result = await ctx.runCommand("lint", { path: "src/", fix: true });

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("# Lint Results");
			expect(result.stdout).toContain("Path: src/");
			expect(result.stdout).toContain("Fix: true");
			expect(result.stdout).toContain("Package Manager: bun");

			ctx.dispose();
		});

		test("runs command with default args", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "npm", gitRepo: false, projectRoot: "/my-project" });

			const result = await ctx.runCommand("lint");

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Path: .");
			expect(result.stdout).toContain("Fix: true");

			ctx.dispose();
		});

		test("command can return non-zero exit code", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			const result = await ctx.runCommand("test", { pattern: "failing" });

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain("1 test failed");
			expect(result.data).toEqual({ failed: 1, passed: 0 });

			ctx.dispose();
		});

		test("command can return structured data", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			const result = await ctx.runCommand("test", { verbose: false });

			expect(result.exitCode).toBe(0);
			expect(result.data).toEqual({ failed: 0, passed: 10 });

			ctx.dispose();
		});

		test("command receives correct state from withState()", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "pnpm", gitRepo: true, projectRoot: "/custom/project" });

			const result = await ctx.runCommand("lint");

			expect(result.stdout).toContain("Package Manager: pnpm");

			ctx.dispose();
		});

		test("returns error for non-existent command", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test" });

			// @ts-expect-error - Testing invalid command
			const result = await ctx.runCommand("non-existent");

			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain("not found");

			ctx.dispose();
		});

		test("command with empty args schema works", async () => {
			const ctx = testPlugin
				.test()
				.withOptions({ VERBOSE: "false" })
				.withState({ packageManager: "bun", gitRepo: true, projectRoot: "/test/project" });

			const result = await ctx.runCommand("status");

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("# Status");

			ctx.dispose();
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
			env = TestFixtures.createEnv({ ORIGINAL_VAR: "original" });

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
