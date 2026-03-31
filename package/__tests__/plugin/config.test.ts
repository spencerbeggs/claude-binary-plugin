import { describe, expect, test } from "bun:test";
import { Either, Schema } from "effect";
import { ClaudePlugin, PluginConfig } from "../../src/plugin/config.js";
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

describe("ClaudePlugin (basic)", () => {
	test("stores config and hooks", () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig")({
			prefix: Schema.Literal("TEST_PLUGIN"),
		}) {
			static readonly options = Schema.Struct({
				VERBOSE: Schema.optionalWith(Schema.Boolean, { default: () => false }),
			});
		}

		const plugin = new ClaudePlugin(TestConfig, {
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
		});

		expect(plugin.config).toBe(TestConfig);
		expect(plugin.hooks.SessionStart).toHaveLength(1);
	});

	test("accepts multiple hooks per event type", () => {
		class MultiConfig extends PluginConfig.extend<MultiConfig>("MultiConfig")({
			prefix: Schema.Literal("MULTI"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(MultiConfig, {
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
		});

		const hooks = plugin.hooks.PreToolUse;
		expect(hooks).toBeDefined();
		expect(hooks).toHaveLength(2);
		const first = hooks?.[0];
		const second = hooks?.[1];
		expect(first?.name).toBe("allowlist");
		expect(second?.name).toBe("security");
	});

	test("accepts raw handler mode", () => {
		class RawConfig extends PluginConfig.extend<RawConfig>("RawConfig")({
			prefix: Schema.Literal("RAW"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(RawConfig, {
			PreToolUse: [
				{
					name: "raw-handler",
					// biome-ignore lint/suspicious/noExplicitAny: Raw handler test needs untyped event access
					handler: async (ctx: { event: any; options: unknown; state: unknown }) => {
						// Raw handler has full control
						ctx.event.end(ctx.event.response().allow());
					},
				},
			],
		});

		expect(plugin.hooks.PreToolUse).toHaveLength(1);
	});

	test("type safety: pipeline return must match output schema", () => {
		class TypedConfig extends PluginConfig.extend<TypedConfig>("TypedConfig")({
			prefix: Schema.Literal("TYPED"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(TypedConfig, {
			SessionStart: [
				{
					name: "typed-hook",
					pipeline: (): SessionStartPipelineOutput => {
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
						return {
							status: "executed",
							action: "allow",
							summary: "allowed",
						};
					},
				},
			],
		});

		expect(plugin.config).toBeDefined();
	});
});

describe("ClaudePlugin (advanced)", () => {
	test("with setup function on config class", () => {
		class SetupConfig extends PluginConfig.extend<SetupConfig>("SetupConfig")({
			prefix: Schema.Literal("SETUP_TEST"),
		}) {
			static readonly options = Schema.Struct({
				DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }),
			});
			static readonly setup = async ({
				options: _options,
				cwd: _cwd,
			}: {
				options: Record<string, unknown>;
				cwd: string;
			}) => ({
				packageManager: "bun",
				detectedFeatures: ["typescript"],
			});
		}

		const _plugin = new ClaudePlugin(SetupConfig, {
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
		});

		expect(SetupConfig.setup).toBeDefined();
		expect(typeof SetupConfig.setup).toBe("function");
	});

	test("with commands as statics on config class", () => {
		class CmdConfig extends PluginConfig.extend<CmdConfig>("CmdConfig")({
			prefix: Schema.Literal("CMD_TEST"),
		}) {
			static readonly options = Schema.Struct({});
			static readonly commands = {
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
			};
		}

		expect(CmdConfig.commands).toBeDefined();
		expect(Object.keys(CmdConfig.commands)).toEqual(["lint", "test"]);
		expect(CmdConfig.commands.lint.description).toBe("Run linter");
		expect(CmdConfig.commands.test.description).toBe("Run tests");
	});

	test("with all hook types stores them correctly", () => {
		class AllHooksConfig extends PluginConfig.extend<AllHooksConfig>("AllHooksConfig")({
			prefix: Schema.Literal("ALL_HOOKS"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(AllHooksConfig, {
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
		});

		expect(plugin.hooks.SessionStart).toHaveLength(1);
		expect(plugin.hooks.SessionEnd).toHaveLength(1);
		expect(plugin.hooks.PreToolUse).toHaveLength(1);
		expect(plugin.hooks.PostToolUse).toHaveLength(1);
		expect(plugin.hooks.Stop).toHaveLength(1);
		expect(plugin.hooks.SubagentStop).toHaveLength(1);
		expect(plugin.hooks.UserPromptSubmit).toHaveLength(1);
	});

	test("with passthrough hooks preserves them", () => {
		class PassConfig extends PluginConfig.extend<PassConfig>("PassConfig")({
			prefix: Schema.Literal("PASS"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(PassConfig, {
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
		});

		expect(plugin.hooks.PreToolUse).toHaveLength(2);
	});

	test("with file-based pipeline hooks", () => {
		class FileHooksConfig extends PluginConfig.extend<FileHooksConfig>("FileHooksConfig")({
			prefix: Schema.Literal("FILE_HOOKS"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(FileHooksConfig, {
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
		});

		const sessionHook = plugin.hooks.SessionStart?.[0];
		expect(sessionHook).toBeDefined();
		expect(sessionHook?.name).toBe("context");
		// File path stored as pipeline string
		expect(typeof sessionHook?.pipeline).toBe("string");

		const preToolHook = plugin.hooks.PreToolUse?.[0];
		expect(preToolHook).toBeDefined();
		if (preToolHook && "tools" in preToolHook) {
			expect(preToolHook.tools).toEqual(["Bash", "Write"]);
		}
	});

	test("test() returns a PluginTester instance", () => {
		class TesterConfig extends PluginConfig.extend<TesterConfig>("TesterConfig")({
			prefix: Schema.Literal("TESTER"),
		}) {
			static readonly options = Schema.Struct({
				DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }),
			});
		}

		const plugin = new ClaudePlugin(TesterConfig, {
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
		});

		const tester = plugin.test();
		expect(tester).toBeDefined();
		// PluginTester should have fluent methods
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		expect(typeof tester.dispose).toBe("function");
		tester.dispose();
	});

	test("with inline command handler on config", () => {
		class InlineCmdConfig extends PluginConfig.extend<InlineCmdConfig>("InlineCmdConfig")({
			prefix: Schema.Literal("INLINE_CMD"),
		}) {
			static readonly options = Schema.Struct({});
			static readonly commands = {
				status: {
					description: "Show status",
					args: Schema.Struct({}),
					pipeline: async ({ state }: { state: { projectDir: string } }) => ({
						exitCode: 0,
						output: `Project: ${state.projectDir}`,
					}),
				},
			};
		}

		expect(InlineCmdConfig.commands?.status).toBeDefined();
		expect(InlineCmdConfig.commands?.status.description).toBe("Show status");
		expect(typeof InlineCmdConfig.commands?.status.pipeline).toBe("function");
	});

	test("with empty hooks is valid", () => {
		class EmptyConfig extends PluginConfig.extend<EmptyConfig>("EmptyConfig")({
			prefix: Schema.Literal("EMPTY"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(EmptyConfig, {});

		const instance = new EmptyConfig({ prefix: "EMPTY" });
		expect(instance.prefix).toBe("EMPTY");
		expect(Object.keys(plugin.hooks)).toHaveLength(0);
	});

	test("config class is accessible on the plugin instance", () => {
		class ReadonlyConfig extends PluginConfig.extend<ReadonlyConfig>("ReadonlyConfig")({
			prefix: Schema.Literal("READONLY"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(ReadonlyConfig, {});

		// Config is accessible
		expect(plugin.config).toBe(ReadonlyConfig);
		const instance = new ReadonlyConfig({ prefix: "READONLY" });
		expect(instance.prefix).toBe("READONLY");
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
// ClaudePlugin.test()
// =============================================================================

describe("ClaudePlugin.test()", () => {
	test("returns a PluginTester instance with fluent API", () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig1")({
			prefix: Schema.Literal("TESTER"),
		}) {
			static readonly options = Schema.Struct({});
		}
		const plugin = new ClaudePlugin(TestConfig, {});
		const tester = plugin.test();
		expect(tester).toBeDefined();
		expect(typeof tester.withOptions).toBe("function");
		expect(typeof tester.withState).toBe("function");
		expect(typeof tester.dispose).toBe("function");
		tester.dispose();
	});

	test("returns a new tester each time", () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("TestConfig2")({
			prefix: Schema.Literal("TESTER2"),
		}) {
			static readonly options = Schema.Struct({});
		}
		const plugin = new ClaudePlugin(TestConfig, {});
		const tester1 = plugin.test();
		const tester2 = plugin.test();
		expect(tester1).not.toBe(tester2);
		tester1.dispose();
		tester2.dispose();
	});
});

describe("ClaudePlugin.build()", () => {
	test("is an async function", () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("BuildTestConfig")({
			prefix: Schema.Literal("BUILD_TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}
		const plugin = new ClaudePlugin(TestConfig, {});
		expect(typeof plugin.build).toBe("function");
	});

	test("delegates to PluginBuilder.fromConfig and returns result", async () => {
		class TestConfig extends PluginConfig.extend<TestConfig>("BuildTestConfig2")({
			prefix: Schema.Literal("BUILD_TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}

		const plugin = new ClaudePlugin(TestConfig, {
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
		});

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

describe("ClaudePlugin.config", () => {
	test("config property references the config class", () => {
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
		class TestConfig extends PluginConfig.extend<TestConfig>("CfgConfig")({
			prefix: Schema.Literal("CFG"),
		}) {
			static readonly options = Schema.Struct({
				DEBUG: Schema.optionalWith(Schema.String, { default: () => "false" }),
			});
		}
		const plugin = new ClaudePlugin(TestConfig, hooks);

		expect(plugin.config).toBe(TestConfig);
		expect(plugin.hooks).toBe(hooks);
	});
});

// =============================================================================
// PluginConfig.extend() and ClaudePlugin (extended)
// =============================================================================

describe("PluginConfig.extend() and ClaudePlugin (extended)", () => {
	test("PluginConfig.extend() returns a class constructor", () => {
		const ExtConfig = PluginConfig.extend("ExtConfig1")({
			prefix: Schema.Literal("TEST"),
		});
		expect(typeof ExtConfig).toBe("function");
	});

	test("returned class can be instantiated", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig2")({
			prefix: Schema.Literal("TEST"),
		}) {}
		const instance = new MyConfig({ prefix: "TEST" });
		expect(instance).toBeInstanceOf(MyConfig);
	});

	test("ClaudePlugin stores config and hooks", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig3")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({ FOO: Schema.String });
		}
		const plugin = new ClaudePlugin(MyConfig, {});
		expect(plugin.config).toBe(MyConfig);
		expect(MyConfig.options).toBeDefined();
	});

	test("state is preserved as static on config class", () => {
		class TestState extends Schema.Class<TestState>("TestState")({
			git: Schema.Boolean,
		}) {}

		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig4")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
			static readonly state = TestState;
		}
		expect(MyConfig.state).toBe(TestState);
	});

	test("setup is preserved as static on config class", () => {
		const setupFn = () => ({ detected: true });
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig5")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
			static readonly setup = setupFn;
		}
		expect(MyConfig.setup).toBe(setupFn);
	});

	test("hooks are stored on ClaudePlugin", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig6")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}
		const handler = () => ({ status: "executed" as const, action: "allow" as const, summary: "ok" });
		const plugin = new ClaudePlugin(MyConfig, {
			PreToolUse: [{ name: "guard", pipeline: handler }],
		});
		expect(plugin.hooks.PreToolUse).toHaveLength(1);
	});

	test("instance has build method", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig7")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}
		expect(typeof new ClaudePlugin(MyConfig, {}).build).toBe("function");
	});

	test("instance has test method", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig8")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}
		expect(typeof new ClaudePlugin(MyConfig, {}).test).toBe("function");
	});

	test("prefix is a schema field on the config instance", () => {
		class MyConfig extends PluginConfig.extend<MyConfig>("ExtConfig9")({
			prefix: Schema.Literal("TEST"),
		}) {
			static readonly options = Schema.Struct({});
		}
		const instance = new MyConfig({ prefix: "TEST" });
		expect(instance.prefix).toBe("TEST");
	});
});
