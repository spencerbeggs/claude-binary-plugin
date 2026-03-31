import { describe, expect, test } from "bun:test";
import { Either, Schema } from "effect";
import { Plugin } from "../../src/plugin/config.js";
import type { PreToolUsePipelineOutput, SessionStartPipelineOutput } from "../../src/schemas/pipeline-outputs.js";
import {
	PostToolUseOutputSchema,
	PreToolUseOutputSchema,
	SessionStartOutputSchema,
	StopOutputSchema,
} from "../../src/schemas/pipeline-outputs.js";
import { Pipeline } from "../../src/types/pipeline.js";

/** Helper to mimic safeParse using Effect Schema */
function safeDecode<A, I>(schema: Schema.Schema<A, I>) {
	return (input: unknown) => {
		const result = Schema.decodeUnknownEither(schema)(input);
		if (Either.isRight(result)) {
			return { success: true as const, data: result.right };
		}
		return { success: false as const };
	};
}

describe("Pipeline Output Schemas", () => {
	describe("SessionStartOutputSchema", () => {
		const parse = safeDecode(SessionStartOutputSchema);

		test("accepts executed/context output", () => {
			const result = parse({
				status: "executed",
				action: "context",
				summary: "provided project context",
				claudeContext: "Project uses TypeScript",
			});
			expect(result.success).toBe(true);
			if (result.success && result.data.status === "executed") {
				expect(result.data.claudeContext).toBe("Project uses TypeScript");
			}
		});

		test("accepts executed/none output (passthrough)", () => {
			const result = parse({
				status: "executed",
				action: "none",
				summary: "no context to add",
			});
			expect(result.success).toBe(true);
		});

		test("accepts disabled output", () => {
			const result = parse({
				status: "disabled",
				summary: "disabled: detection failed",
			});
			expect(result.success).toBe(true);
		});

		test("rejects executed without action", () => {
			const result = parse({
				status: "executed",
				summary: "missing action",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("PreToolUseOutputSchema", () => {
		const parse = safeDecode(PreToolUseOutputSchema);

		test("accepts executed/allow output", () => {
			const result = parse({
				status: "executed",
				action: "allow",
				summary: "allowed: safe command",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/deny output with reason", () => {
			const result = parse({
				status: "executed",
				action: "deny",
				summary: "denied: dangerous command",
				reason: "Command would delete files",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/ask output", () => {
			const result = parse({
				status: "executed",
				action: "ask",
				summary: "ask: needs confirmation",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/modify output with updatedInput", () => {
			const result = parse({
				status: "executed",
				action: "modify",
				summary: "modified: added timeout",
				updatedInput: { timeout: 5000 },
			});
			expect(result.success).toBe(true);
			if (result.success && result.data.status === "executed") {
				expect(result.data.updatedInput).toEqual({ timeout: 5000 });
			}
		});

		test("accepts skipped output", () => {
			const result = parse({
				status: "skipped",
				summary: "skipped: tool not in filter",
			});
			expect(result.success).toBe(true);
		});

		test("rejects executed without action", () => {
			const result = parse({
				status: "executed",
				summary: "missing action",
			});
			expect(result.success).toBe(false);
		});

		test("rejects missing status", () => {
			const result = parse({
				action: "allow",
				summary: "missing status",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("PostToolUseOutputSchema", () => {
		const parse = safeDecode(PostToolUseOutputSchema);

		test("accepts executed/none output (passthrough)", () => {
			const result = parse({
				status: "executed",
				action: "none",
				summary: "no action needed",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/context output", () => {
			const result = parse({
				status: "executed",
				action: "context",
				summary: "added context",
				claudeContext: "File contains sensitive data",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/block output", () => {
			const result = parse({
				status: "executed",
				action: "block",
				summary: "blocked: validation failed",
				reason: "Tool failed validation",
			});
			expect(result.success).toBe(true);
		});

		test("accepts skipped output", () => {
			const result = parse({
				status: "skipped",
				summary: "skipped: not applicable",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("StopOutputSchema", () => {
		const parse = safeDecode(StopOutputSchema);

		test("accepts executed/continue output (passthrough)", () => {
			const result = parse({
				status: "executed",
				action: "continue",
				summary: "allowing stop",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/block output with reason", () => {
			const result = parse({
				status: "executed",
				action: "block",
				summary: "blocking stop",
				reason: "Please run the tests",
			});
			expect(result.success).toBe(true);
		});

		test("accepts skipped output", () => {
			const result = parse({
				status: "skipped",
				summary: "skipped: hook not active",
			});
			expect(result.success).toBe(true);
		});
	});
});

describe("Plugin() factory (basic)", () => {
	test("returns compiled plugin config", () => {
		const envSchema = Schema.Struct({
			VERBOSE: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		});

		class TestPlugin extends Plugin("TEST_PLUGIN", {
			options: envSchema,
			hooks: {
				SessionStart: [
					{
						name: "test-context",
						pipeline: async (): Promise<SessionStartPipelineOutput> => {
							return {
								status: "executed",
								action: "context",
								summary: "provided context",
								claudeContext: "Test context",
							};
						},
					},
				],
			},
		}) {}
		const plugin = new TestPlugin();

		expect(plugin.config).toBeDefined();
		expect(plugin.prefix).toBe("TEST_PLUGIN");
		expect(plugin.config.hooks.SessionStart).toHaveLength(1);
	});

	test("accepts multiple hooks per event type", () => {
		class MultiPlugin extends Plugin("MULTI", {
			options: Schema.Struct({}),
			hooks: {
				PreToolUse: [
					{
						name: "allowlist",
						tools: ["Bash"],
						pipeline: (): PreToolUsePipelineOutput => ({
							status: "executed",
							action: "allow",
							summary: "allowed: allowlist",
						}),
					},
					{
						name: "security",
						tools: ["Write", "Edit"],
						pipeline: (): PreToolUsePipelineOutput => ({
							status: "executed",
							action: "ask",
							summary: "ask: security check",
						}),
					},
				],
			},
		}) {}
		const plugin = new MultiPlugin();

		const hooks = plugin.config.hooks.PreToolUse;
		expect(hooks).toBeDefined();
		expect(hooks).toHaveLength(2);
		const first = hooks?.[0];
		const second = hooks?.[1];
		expect(first?.name).toBe("allowlist");
		expect(second?.name).toBe("security");
	});

	test("accepts raw handler mode", () => {
		class RawPlugin extends Plugin("RAW", {
			options: Schema.Struct({}),
			hooks: {
				PreToolUse: [
					{
						name: "raw-handler",
						handler: async (ctx) => {
							// Raw handler has full control
							ctx.event.end(ctx.event.response().allow());
						},
					},
				],
			},
		}) {}
		const plugin = new RawPlugin();

		expect(plugin.config.hooks.PreToolUse).toHaveLength(1);
	});

	test("type safety: pipeline return must match output schema", () => {
		// This is a compile-time test - if types are wrong, this won't compile
		class TypedPlugin extends Plugin("TYPED", {
			options: Schema.Struct({}),
			hooks: {
				SessionStart: [
					{
						name: "typed-hook",
						pipeline: (): SessionStartPipelineOutput => {
							// Must return SessionStartPipelineOutput shape
							return {
								status: "executed",
								action: "context",
								summary: "typed context",
								claudeContext: "typed",
							};
						},
					},
				],
				PreToolUse: [
					{
						name: "typed-pretool",
						pipeline: (): PreToolUsePipelineOutput => {
							// Must return PreToolUsePipelineOutput shape
							return {
								status: "executed",
								action: "allow",
								summary: "allowed",
							};
						},
					},
				],
			},
		}) {}
		const plugin = new TypedPlugin();

		expect(plugin.config).toBeDefined();
	});
});

describe("Plugin() factory (advanced)", () => {
	test("with setup function preserves config", () => {
		const setupFn = async ({ options: _options, cwd: _cwd }: { options: Record<string, unknown>; cwd: string }) => ({
			packageManager: "bun",
			detectedFeatures: ["typescript"],
		});
		class SetupPlugin extends Plugin("SETUP_TEST", {
			options: Schema.Struct({
				DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }),
			}),
			setup: setupFn,
			hooks: {
				SessionStart: [
					{
						name: "context",
						pipeline: async ({ state }) => ({
							status: "executed" as const,
							action: "context" as const,
							summary: "provided context",
							claudeContext: `PM: ${state.packageManager}`,
						}),
					},
				],
			},
		}) {}
		const plugin = new SetupPlugin();

		expect(plugin.prefix).toBe("SETUP_TEST");
		expect(plugin.config.setup).toBeDefined();
		expect(typeof plugin.config.setup).toBe("function");
	});

	test("with commands stores command definitions", () => {
		class CmdPlugin extends Plugin("CMD_TEST", {
			options: Schema.Struct({}),
			hooks: {},
			commands: {
				lint: {
					description: "Run linter",
					args: Schema.Struct({
						_positionals: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
						fix: Schema.optionalWith(Schema.Boolean, { default: () => true }),
					}),
					pipeline: "./commands/lint.cmd.ts",
				},
				test: {
					description: "Run tests",
					pipeline: "./commands/test.cmd.ts",
				},
			},
		}) {}
		const plugin = new CmdPlugin();

		expect(plugin.config.commands).toBeDefined();
		expect(Object.keys(plugin.config.commands ?? {})).toEqual(["lint", "test"]);
		expect(plugin.config.commands?.lint.description).toBe("Run linter");
		expect(plugin.config.commands?.test.description).toBe("Run tests");
	});

	test("with all hook types stores them correctly", () => {
		class AllHooksPlugin extends Plugin("ALL_HOOKS", {
			options: Schema.Struct({}),
			hooks: {
				SessionStart: [
					{
						name: "init",
						pipeline: async () => ({
							status: "executed" as const,
							action: "context" as const,
							summary: "ok",
							claudeContext: "",
						}),
					},
				],
				SessionEnd: [
					{
						name: "cleanup",
						pipeline: async () => ({ status: "executed" as const, action: "none" as const, summary: "ok" }),
					},
				],
				PreToolUse: [
					{
						name: "filter",
						tools: ["Bash"],
						pipeline: async () => ({ status: "executed" as const, action: "allow" as const, summary: "ok" }),
					},
				],
				PostToolUse: [
					{
						name: "reporter",
						pipeline: async () => ({ status: "executed" as const, action: "none" as const, summary: "ok" }),
					},
				],
				Stop: [
					{
						name: "guard",
						pipeline: async () => ({ status: "executed" as const, action: "continue" as const, summary: "ok" }),
					},
				],
				SubagentStop: [
					{
						name: "sub-guard",
						pipeline: async () => ({ status: "executed" as const, action: "continue" as const, summary: "ok" }),
					},
				],
				UserPromptSubmit: [
					{
						name: "prompt",
						pipeline: async () => ({ status: "executed" as const, action: "none" as const, summary: "ok" }),
					},
				],
			},
		}) {}
		const plugin = new AllHooksPlugin();

		expect(plugin.config.hooks.SessionStart).toHaveLength(1);
		expect(plugin.config.hooks.SessionEnd).toHaveLength(1);
		expect(plugin.config.hooks.PreToolUse).toHaveLength(1);
		expect(plugin.config.hooks.PostToolUse).toHaveLength(1);
		expect(plugin.config.hooks.Stop).toHaveLength(1);
		expect(plugin.config.hooks.SubagentStop).toHaveLength(1);
		expect(plugin.config.hooks.UserPromptSubmit).toHaveLength(1);
	});

	test("with passthrough hooks preserves them", () => {
		class PassPlugin extends Plugin("PASS", {
			options: Schema.Struct({}),
			hooks: {
				PreToolUse: [
					{
						name: "compiled",
						pipeline: async () => ({
							status: "executed" as const,
							action: "allow" as const,
							summary: "ok",
						}),
					},
					{
						matcher: "WebFetch",
						hooks: [{ type: "command" as const, command: "bash ./scripts/log.sh" }],
					},
				],
			},
		}) {}
		const plugin = new PassPlugin();

		expect(plugin.config.hooks.PreToolUse).toHaveLength(2);
	});

	test("with build options stores them", () => {
		class BuildOptsPlugin extends Plugin("BUILD_OPTS", {
			options: Schema.Struct({}),
			hooks: {},
			bytecode: true,
			persistLocal: false,
			compile: true,
			minify: false,
			sourcemap: false,
			hooksOutputPath: "custom/hooks.json",
		}) {}
		const plugin = new BuildOptsPlugin();

		expect(plugin.config.bytecode).toBe(true);
		expect(plugin.config.persistLocal).toBe(false);
		expect(plugin.config.compile).toBe(true);
		expect(plugin.config.minify).toBe(false);
		expect(plugin.config.sourcemap).toBe(false);
		expect(plugin.config.hooksOutputPath).toBe("custom/hooks.json");
	});

	test("with file-based pipeline hooks", () => {
		class FileHooksPlugin extends Plugin("FILE_HOOKS", {
			options: Schema.Struct({}),
			hooks: {
				SessionStart: [
					{
						name: "context",
						pipeline: "./hooks/context.hook.ts",
					},
				],
				PreToolUse: [
					{
						name: "security",
						tools: ["Bash", "Write"],
						pipeline: "./hooks/security.hook.ts",
					},
				],
			},
		}) {}
		const plugin = new FileHooksPlugin();

		const sessionHook = plugin.config.hooks.SessionStart?.[0];
		expect(sessionHook).toBeDefined();
		expect(sessionHook?.name).toBe("context");
		// File path stored as pipeline string
		expect(typeof sessionHook?.pipeline).toBe("string");

		const preToolHook = plugin.config.hooks.PreToolUse?.[0];
		expect(preToolHook).toBeDefined();
		if (preToolHook && "tools" in preToolHook) {
			expect(preToolHook.tools).toEqual(["Bash", "Write"]);
		}
	});

	test("test() returns a PluginTester instance", () => {
		class TesterPlugin extends Plugin("TESTER", {
			options: Schema.Struct({
				DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }),
			}),
			hooks: {
				SessionStart: [
					{
						name: "context",
						pipeline: async () => ({
							status: "executed" as const,
							action: "context" as const,
							summary: "ok",
							claudeContext: "test",
						}),
					},
				],
			},
		}) {}
		const plugin = new TesterPlugin();

		const tester = plugin.test();
		expect(tester).toBeDefined();
		// PluginTester should have fluent methods
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		expect(typeof tester.dispose).toBe("function");
		tester.dispose();
	});

	test("with inline command handler", () => {
		class InlineCmdPlugin extends Plugin("INLINE_CMD", {
			options: Schema.Struct({}),
			hooks: {},
			commands: {
				status: {
					description: "Show status",
					args: Schema.Struct({}),
					pipeline: async ({ state }: { state: { projectDir: string } }) => ({
						exitCode: 0,
						output: `Project: ${state.projectDir}`,
					}),
				},
			},
		}) {}
		const plugin = new InlineCmdPlugin();

		expect(plugin.config.commands?.status).toBeDefined();
		expect(plugin.config.commands?.status.description).toBe("Show status");
		expect(typeof plugin.config.commands?.status.pipeline).toBe("function");
	});

	test("with empty hooks is valid", () => {
		class EmptyPlugin extends Plugin("EMPTY", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const plugin = new EmptyPlugin();

		expect(plugin.prefix).toBe("EMPTY");
		expect(Object.keys(plugin.config.hooks)).toHaveLength(0);
	});

	test("config is readonly on the instance", () => {
		class ReadonlyPlugin extends Plugin("READONLY", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const plugin = new ReadonlyPlugin();

		// Config is accessible
		expect(plugin.config).toBeDefined();
		expect(plugin.prefix).toBe("READONLY");
	});
});

describe("Helper functions", () => {
	test("Pipeline.isPipelineHook identifies pipeline hooks", () => {
		const pipelineHook = {
			name: "test",
			pipeline: () => ({
				status: "executed" as const,
				action: "context" as const,
				summary: "test",
			}),
		};
		const rawHook = {
			name: "test",
			handler: () => {},
		};

		expect(Pipeline.isPipelineHook(pipelineHook)).toBe(true);
		expect(Pipeline.isPipelineHook(rawHook)).toBe(false);
	});

	test("Pipeline.isRawHook identifies raw hooks", () => {
		const pipelineHook = {
			name: "test",
			pipeline: () => ({
				status: "executed" as const,
				action: "context" as const,
				summary: "test",
			}),
		};
		const rawHook = {
			name: "test",
			handler: () => {},
		};

		expect(Pipeline.isRawHook(rawHook)).toBe(true);
		expect(Pipeline.isRawHook(pipelineHook)).toBe(false);
	});
});

// =============================================================================
// Plugin() instance methods
// =============================================================================

describe("Plugin().test()", () => {
	test("returns a PluginTester instance with fluent API", () => {
		class TestPlugin extends Plugin("TESTER", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const plugin = new TestPlugin();
		const tester = plugin.test();
		expect(tester).toBeDefined();
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		expect(typeof tester.dispose).toBe("function");
		tester.dispose();
	});

	test("returns a new tester each time", () => {
		class TestPlugin extends Plugin("TESTER2", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const plugin = new TestPlugin();
		const tester1 = plugin.test();
		const tester2 = plugin.test();
		expect(tester1).not.toBe(tester2);
		tester1.dispose();
		tester2.dispose();
	});
});

describe("Plugin().build()", () => {
	test("is an async function", () => {
		class TestPlugin extends Plugin("BUILD_TEST", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const plugin = new TestPlugin();
		expect(typeof plugin.build).toBe("function");
	});

	test("delegates to PluginBuilder.fromConfig and returns result", async () => {
		class TestPlugin extends Plugin("BUILD_TEST", {
			options: Schema.Struct({}),
			hooks: {
				SessionStart: [
					{
						name: "init",
						pipeline: async () => ({
							status: "executed" as const,
							action: "context" as const,
							summary: "test",
						}),
					},
				],
			},
		}) {}
		const plugin = new TestPlugin();

		// Silence console output from the build process
		const origLog = console.log;
		const origErr = console.error;
		const origWarn = console.warn;
		console.log = () => {};
		console.error = () => {};
		console.warn = () => {};

		try {
			const result = await plugin.build({
				rootDir: `/tmp/nonexistent-plugin-test-dir-xyz-${Date.now()}`,
			});
			expect(result).toBeDefined();
			expect(typeof result.success).toBe("boolean");
			expect(typeof result.duration).toBe("number");
		} finally {
			console.log = origLog;
			console.error = origErr;
			console.warn = origWarn;
		}
	});
});

describe("Plugin().config", () => {
	test("config property is readonly and contains the plugin configuration", () => {
		const hooks = {
			SessionStart: [
				{
					name: "ctx",
					pipeline: async () => ({
						status: "executed" as const,
						action: "context" as const,
						summary: "ctx",
					}),
				},
			],
		};
		class TestPlugin extends Plugin("CFG", {
			options: Schema.Struct({ DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }) }),
			hooks,
		}) {}
		const plugin = new TestPlugin();

		expect(plugin.prefix).toBe("CFG");
		expect(plugin.config.hooks).toBe(hooks);
	});
});

// =============================================================================
// Plugin() factory (extended)
// =============================================================================

describe("Plugin() factory (extended)", () => {
	test("returns a class constructor", () => {
		const Base = Plugin("TEST", {
			options: Schema.Struct({ MODE: Schema.String }),
			hooks: {},
		});
		expect(typeof Base).toBe("function");
	});

	test("returned class can be extended", () => {
		class MyPlugin extends Plugin("TEST", {
			options: Schema.Struct({}),
			hooks: {},
		}) {}
		const instance = new MyPlugin();
		expect(instance).toBeInstanceOf(MyPlugin);
	});

	test("instance has config with all fields", () => {
		class MyPlugin extends Plugin("TEST", {
			options: Schema.Struct({ FOO: Schema.String }),
			hooks: {},
		}) {}
		const instance = new MyPlugin();
		expect(instance.config).toBeDefined();
		expect(instance.config.options).toBeDefined();
		expect(instance.prefix).toBe("TEST");
	});

	test("state is preserved on config (not tree-shaken)", () => {
		class TestState extends Schema.Class<TestState>("TestState")({
			git: Schema.Boolean,
		}) {}

		class MyPlugin extends Plugin("TEST", {
			options: Schema.Struct({}),
			state: TestState,
			hooks: {},
		}) {}
		expect(new MyPlugin().config.state).toBe(TestState);
	});

	test("setup is preserved on config", () => {
		const setupFn = () => ({ detected: true });
		class MyPlugin extends Plugin("TEST", {
			options: Schema.Struct({}),
			setup: setupFn,
			hooks: {},
		}) {}
		expect(new MyPlugin().config.setup).toBe(setupFn);
	});

	test("hooks are preserved on config", () => {
		const handler = () => ({ status: "executed" as const, action: "allow" as const, summary: "ok" });
		class MyPlugin extends Plugin("TEST", {
			options: Schema.Struct({}),
			hooks: {
				PreToolUse: [{ name: "guard", pipeline: handler }],
			},
		}) {}
		const hooks = new MyPlugin().config.hooks;
		expect(hooks.PreToolUse).toHaveLength(1);
	});

	test("instance has build method", () => {
		class MyPlugin extends Plugin("TEST", { options: Schema.Struct({}), hooks: {} }) {}
		expect(typeof new MyPlugin().build).toBe("function");
	});

	test("instance has test method", () => {
		class MyPlugin extends Plugin("TEST", { options: Schema.Struct({}), hooks: {} }) {}
		expect(typeof new MyPlugin().test).toBe("function");
	});

	test("user can add methods to extended class", () => {
		class MyPlugin extends Plugin("TEST", { options: Schema.Struct({}), hooks: {} }) {
			getVersion() {
				return "1.0.0";
			}
		}
		expect(new MyPlugin().getVersion()).toBe("1.0.0");
	});
});
