import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { Effect, Schema } from "effect";
import type { IODependencies } from "../../src/layers/PipelineRuntime.js";
import { PipelineRuntime } from "../../src/layers/PipelineRuntime.js";
import { makeTelemetryTest } from "../../src/layers/TelemetryTest.js";
import { PreToolUseEvent } from "../../src/schemas/hook-events.js";
import { PluginEnv } from "../../src/services/PluginEnv.js";
import type { MockEnvContext } from "../../src/testing/mocks.js";
import { TestFixtures } from "../../src/testing/mocks.js";
import type { AnyPipelineOutput } from "../../src/types/pipeline.js";

// Access internal test utilities
const { createBaseState, extractPersistedState, isDebugEnabled, mapToOutcome, toResponse } = PipelineRuntime.internal;

/**
 * Base event fields required by all hook events.
 */
const baseEventFields = {
	session_id: "550e8400-e29b-41d4-a716-446655440000",
	transcript_path: "/tmp/transcript.json",
	cwd: "/home/user/project",
	permission_mode: "default" as const,
};

/**
 * Helper to serialize data as JSON for inputText.
 */
function toInputText(data: Record<string, unknown>): string {
	return JSON.stringify(data);
}

/**
 * Helper to create a mock writable stream that captures output.
 */
function createMockWritable(): { stream: Writable; output: string[] } {
	const output: string[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			output.push(chunk.toString());
			callback();
		},
	});
	return { stream, output };
}

/**
 * Create a mock exit function that throws instead of exiting.
 */
class ExitError extends Error {
	constructor(public code: number) {
		super(`Process exited with code ${code}`);
		this.name = "ExitError";
	}
}

function createMockExit(): (code: number) => never {
	return (code: number): never => {
		throw new ExitError(code);
	};
}

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

// =============================================================================
// mapToOutcome tests
// =============================================================================

describe("mapToOutcome", () => {
	test("returns skipped for skipped status", () => {
		expect(mapToOutcome("skipped")).toBe("skipped");
	});

	test("returns error for error status", () => {
		expect(mapToOutcome("error")).toBe("error");
	});

	test("returns error for timeout status", () => {
		expect(mapToOutcome("timeout")).toBe("error");
	});

	test("returns skipped for disabled status", () => {
		expect(mapToOutcome("disabled")).toBe("skipped");
	});

	test("returns denied for cached with deny action", () => {
		expect(mapToOutcome("cached", "deny")).toBe("denied");
	});

	test("returns allowed for cached with allow action", () => {
		expect(mapToOutcome("cached", "allow")).toBe("allowed");
	});

	test("returns passthrough for cached without action", () => {
		expect(mapToOutcome("cached")).toBe("passthrough");
	});

	test("returns passthrough for executed without action", () => {
		expect(mapToOutcome("executed")).toBe("passthrough");
	});

	test("returns allowed for executed with allow action", () => {
		expect(mapToOutcome("executed", "allow")).toBe("allowed");
	});

	test("returns denied for executed with deny action", () => {
		expect(mapToOutcome("executed", "deny")).toBe("denied");
	});

	test("returns passthrough for executed with ask action", () => {
		expect(mapToOutcome("executed", "ask")).toBe("passthrough");
	});

	test("returns blocked for executed with block action", () => {
		expect(mapToOutcome("executed", "block")).toBe("blocked");
	});

	test("returns passthrough for executed with continue action", () => {
		expect(mapToOutcome("executed", "continue")).toBe("passthrough");
	});

	test("returns modified for executed with modify action", () => {
		expect(mapToOutcome("executed", "modify")).toBe("modified");
	});

	test("returns context_added for executed with context action", () => {
		expect(mapToOutcome("executed", "context")).toBe("context_added");
	});

	test("returns passthrough for executed with none action", () => {
		expect(mapToOutcome("executed", "none")).toBe("passthrough");
	});
});

// =============================================================================
// toResponse tests (delegates to hook-responses.ts functions)
// =============================================================================

describe("toResponse", () => {
	const allowOutput: AnyPipelineOutput = {
		status: "executed",
		action: "allow",
		summary: "allowed",
	};

	const contextOutput: AnyPipelineOutput = {
		status: "executed",
		action: "context",
		summary: "added context",
		claudeContext: "test context",
	};

	const blockOutput: AnyPipelineOutput = {
		status: "executed",
		action: "block",
		summary: "blocked",
		reason: "test reason",
	};

	test("converts PreToolUse response", () => {
		const result = toResponse("PreToolUse", allowOutput);
		expect(result).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: undefined,
		});
	});

	test("converts PostToolUse response", () => {
		const result = toResponse("PostToolUse", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts SessionStart response", () => {
		const result = toResponse("SessionStart", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts SessionEnd response (passthrough)", () => {
		const result = toResponse("SessionEnd", allowOutput);
		expect(result).toEqual({});
	});

	test("converts PreCompact response (passthrough)", () => {
		const result = toResponse("PreCompact", allowOutput);
		expect(result).toEqual({});
	});

	test("converts Notification response (passthrough)", () => {
		const result = toResponse("Notification", allowOutput);
		expect(result).toEqual({});
	});

	test("converts Stop response", () => {
		const result = toResponse("Stop", blockOutput);
		expect(result).toEqual({
			decision: "block",
			reason: "test reason",
		});
	});

	test("converts SubagentStop response", () => {
		const result = toResponse("SubagentStop", blockOutput);
		expect(result).toEqual({
			decision: "block",
			reason: "test reason",
		});
	});

	test("converts UserPromptSubmit response", () => {
		const result = toResponse("UserPromptSubmit", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts PermissionRequest response", () => {
		const result = toResponse("PermissionRequest", allowOutput);
		expect(result).toEqual({
			behavior: "allow",
			message: undefined,
			interrupt: undefined,
			updatedInput: undefined,
		});
	});
});

// =============================================================================
// isDebugEnabled tests
// =============================================================================

describe("isDebugEnabled", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("returns true when CLAUDE_DEBUG is 1", () => {
		env.set("CLAUDE_DEBUG", "1");
		expect(isDebugEnabled()).toBe(true);
	});

	test("returns true when CLAUDE_DEBUG is true", () => {
		env.set("CLAUDE_DEBUG", "true");
		expect(isDebugEnabled()).toBe(true);
	});

	test("returns false when CLAUDE_DEBUG is 0", () => {
		env.set("CLAUDE_DEBUG", "0");
		expect(isDebugEnabled()).toBe(false);
	});

	test("returns false when CLAUDE_DEBUG is false", () => {
		env.set("CLAUDE_DEBUG", "false");
		expect(isDebugEnabled()).toBe(false);
	});

	test("returns false when CLAUDE_DEBUG is not set", () => {
		expect(isDebugEnabled()).toBe(false);
	});
});

// =============================================================================
// extractPersistedState tests
// =============================================================================

describe("extractPersistedState", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("returns empty object when no prefix", () => {
		const schema = Schema.Struct({});
		// Create env class without prefix
		class NoPrefix extends PluginEnv.create("", schema) {
			protected readonly prefix = "";
		}
		const instance = new NoPrefix();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object when PLUGIN_STATE not set", () => {
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("decodes base64 PLUGIN_STATE", () => {
		const state = { foo: "bar", count: 42 };
		const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual(state);
	});

	test("returns empty object for invalid base64", () => {
		env.set("TEST_PLUGIN_STATE", "not-valid-base64!!!!");

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object for non-object state", () => {
		const encoded = Buffer.from(JSON.stringify("just a string")).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object for null state", () => {
		const encoded = Buffer.from(JSON.stringify(null)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});
});

// =============================================================================
// createBaseState tests
// =============================================================================

describe("createBaseState", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("uses CLAUDE_PROJECT_DIR when set", () => {
		env.set("CLAUDE_PROJECT_DIR", "/project/dir");

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/project/dir");
	});

	test("falls back to cwd when CLAUDE_PROJECT_DIR not set", () => {
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/cwd");
	});

	test("uses CLAUDE_PLUGIN_ROOT when set", () => {
		env.set("CLAUDE_PLUGIN_ROOT", "/plugin/root");

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("/plugin/root");
	});

	test("falls back to empty string when CLAUDE_PLUGIN_ROOT not set", () => {
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("");
	});

	test("uses provided claudeEnvFile", () => {
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/custom/env/file", instance);
		expect(baseEnv.pluginEnvFile).toBe("/custom/env/file");
	});

	test("does not include logger methods (removed in favor of Effect logging)", () => {
		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv).not.toHaveProperty("log");
		expect(baseEnv).not.toHaveProperty("info");
		expect(baseEnv).not.toHaveProperty("debug");
	});
});

// =============================================================================
// runPipeline tests
// =============================================================================

describe("runPipeline", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({
			CLAUDE_CODE_ENABLE_TELEMETRY: "0", // Disable OTEL during tests
			CLAUDE_PLUGIN_ROOT: "/tmp/test-plugin", // Required for state loading
			CLAUDE_PROJECT_DIR: "/tmp/test-project", // Required for SessionStart
		});
	});

	afterEach(() => {
		env.restore();
	});

	test("exits with code 2 for unknown hook type", async () => {
		const stderr = createMockWritable();
		const mockIO: IODependencies = {
			inputText: toInputText({}),
			stdout: createMockWritable().stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		await expect(
			PipelineRuntime.run({
				// @ts-expect-error - testing invalid hook type
				hookType: "InvalidHookType",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: async () => ({ status: "executed", summary: "ok" }),
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		expect(stderr.output.join("")).toContain("Unknown hook type: InvalidHookType");
	});

	test("exits with code 2 for invalid input JSON", async () => {
		const stderr = createMockWritable();
		const mockIO: IODependencies = {
			inputText: toInputText({ invalid: "data" }), // Missing required fields
			stdout: createMockWritable().stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: async () => ({ status: "executed", summary: "ok" }),
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		expect(stderr.output.join("")).toContain("Input validation failed");
	});

	test("executes pipeline handler and writes response for PreToolUse", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-456",
			tool_input: { command: "ls" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// The pipeline handler returns an allow decision
		const handler = async () => ({
			status: "executed" as const,
			action: "allow" as const,
			summary: "allowed: safe command",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Check that response was written to stdout (JSON format)
		const output = stdout.output.join("");
		expect(output).toContain("permissionDecision");
	});

	test("skips hook when tool does not match filter", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Read", // Different tool than filter
			tool_use_id: "tool-use-456",
			tool_input: { file_path: "/test.txt" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// Pipeline should not be called since tool doesn't match
		let pipelineCalled = false;
		const handler = async () => {
			pipelineCalled = true;
			return { status: "executed" as const, summary: "should not run" };
		};

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				tools: ["Bash"], // Only handle Bash tool
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Pipeline should not have been called
		expect(pipelineCalled).toBe(false);

		// Response should be an empty passthrough (tool filter skip produces {})
		const output = stdout.output.join("");
		expect(JSON.parse(output)).toEqual({});
	});

	test("handles SessionStart hook with setup function", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const sessionStartInput = {
			...baseEventFields,
			hook_event_name: "SessionStart" as const,
			source: "startup" as const,
		};

		const mockIO: IODependencies = {
			inputText: toInputText(sessionStartInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({
			VERBOSE: Schema.optionalWith(Schema.Boolean, { default: () => false }),
		});
		const EnvClass = PluginEnv.create("TEST", schema);

		// Setup function that returns state
		const setup = async () => {
			return { detectedPM: "bun" };
		};

		// Handler that uses the state
		const handler = async ({ state: handlerState }: { state: { detectedPM?: string } }) => ({
			status: "executed" as const,
			action: "context" as const,
			summary: `detected: ${handlerState.detectedPM ?? "none"}`,
			claudeContext: "Session started",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "SessionStart",
				hookName: "session-start",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				setup,
				optionsSchema: schema,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Response should be written
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
	});

	test("handles pipeline returning non-pipeline output with error", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-456",
			tool_input: { command: "ls" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// Handler that returns invalid output (missing status/summary)
		const handler = async () => ({ invalid: "output" }) as unknown as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow();
	});

	test("handles PostToolUse with block action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const postToolUseInput = {
			...baseEventFields,
			hook_event_name: "PostToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-456",
			tool_input: { command: "rm -rf /" },
			tool_response: { content: "error: permission denied" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(postToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "block" as const,
			summary: "blocked: dangerous command",
			reason: "Dangerous command detected",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "PostToolUse",
				hookName: "post-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("block");
	});

	test("handles UserPromptSubmit hook with context action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const userPromptInput = {
			...baseEventFields,
			hook_event_name: "UserPromptSubmit" as const,
			prompt: "Help me write some tests",
		};

		const mockIO: IODependencies = {
			inputText: toInputText(userPromptInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "context" as const,
			summary: "added prompt context",
			claudeContext: "User is working on test coverage",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "UserPromptSubmit",
				hookName: "prompt-handler",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("additionalContext");
		expect(output).toContain("User is working on test coverage");
	});

	test("handles UserPromptSubmit hook with block action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const userPromptInput = {
			...baseEventFields,
			hook_event_name: "UserPromptSubmit" as const,
			prompt: "delete everything",
		};

		const mockIO: IODependencies = {
			inputText: toInputText(userPromptInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "block" as const,
			summary: "blocked prompt",
			reason: "Prompt seems dangerous",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "UserPromptSubmit",
				hookName: "prompt-handler",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("block");
		expect(output).toContain("Prompt seems dangerous");
	});

	test("handles PermissionRequest hook with allow action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const permissionInput = {
			...baseEventFields,
			hook_event_name: "PermissionRequest" as const,
			message: "Allow filesystem access?",
			notification_type: "permission",
			tool_name: "Read",
			tool_input: { file_path: "/test.txt" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(permissionInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "allow" as const,
			summary: "allowed permission",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "PermissionRequest",
				hookName: "permission-handler",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("behavior");
		expect(output).toContain("allow");
	});

	test("handles PermissionRequest hook with deny action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const permissionInput = {
			...baseEventFields,
			hook_event_name: "PermissionRequest" as const,
			message: "Allow dangerous operation?",
			notification_type: "permission",
			tool_name: "Bash",
			tool_input: { command: "rm -rf /" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(permissionInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "deny" as const,
			summary: "denied permission",
			reason: "Too dangerous",
			interrupt: true,
		});

		await expect(
			PipelineRuntime.run({
				hookType: "PermissionRequest",
				hookName: "permission-handler",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("behavior");
		expect(output).toContain("deny");
	});

	test("handles SessionEnd hook (passthrough)", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const sessionEndInput = {
			...baseEventFields,
			hook_event_name: "SessionEnd" as const,
			reason: "logout" as const,
		};

		const mockIO: IODependencies = {
			inputText: toInputText(sessionEndInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "none" as const,
			summary: "session ended",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "SessionEnd",
				hookName: "end-handler",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Passthrough hooks return empty object
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
	});

	test("handles SubagentStop hook with block action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const subagentStopInput = {
			...baseEventFields,
			hook_event_name: "SubagentStop" as const,
			stop_hook_active: true,
		};

		const mockIO: IODependencies = {
			inputText: toInputText(subagentStopInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "block" as const,
			summary: "blocked subagent stop",
			reason: "Not done yet",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "SubagentStop",
				hookName: "subagent-guard",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("block");
	});

	test("handles PreToolUse with modify action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-789",
			tool_input: { command: "npm test" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "modify" as const,
			summary: "modified command",
			updatedInput: { command: "bun test" },
		});

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("permissionDecision");
		expect(output).toContain("updatedInput");
	});

	test("handles pipeline throwing an error", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-456",
			tool_input: { command: "ls" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => {
			throw new Error("Pipeline internal error");
		};

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow();
	});

	test("handles Stop hook with continue action", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const stopInput = {
			...baseEventFields,
			hook_event_name: "Stop" as const,
			stop_hook_active: false,
		};

		const mockIO: IODependencies = {
			inputText: toInputText(stopInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "continue" as const,
			summary: "allowing stop",
		});

		await expect(
			PipelineRuntime.run({
				hookType: "Stop",
				hookName: "stop-check",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Response should be written
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
	});

	test("handler receives Event instance created via fromInput (not raw input)", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-instanceof",
			tool_input: { command: "ls" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// biome-ignore lint/suspicious/noExplicitAny: Capturing event for instanceof check
		let receivedEvent: any;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "instanceof-check",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: ({ input }) => {
					receivedEvent = input;
					return { status: "executed", action: "allow", summary: "ok" };
				},
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		expect(receivedEvent).toBeInstanceOf(PreToolUseEvent);
	});

	test("handles handler returning Effect.succeed()", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-use-effect",
			tool_input: { command: "echo effect" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const schema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// Handler returns an Effect instead of a Promise
		const handler = () =>
			Effect.succeed({
				status: "executed" as const,
				action: "allow" as const,
				summary: "allowed via Effect",
			});

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash-effect",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Check that response was written to stdout (JSON format)
		const output = stdout.output.join("");
		expect(output).toContain("permissionDecision");
		expect(output).toContain("allow");
	});
});

// =============================================================================
// handleUnknown() TESTS
// =============================================================================

describe("PipelineRuntime.handleUnknown", () => {
	let exitSpy: ReturnType<typeof spyOn>;
	let stderrSpy: ReturnType<typeof spyOn>;
	let stdinSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		exitSpy = spyOn(process, "exit").mockImplementation((() => {
			throw new ExitError(2);
		}) as never);
		stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
		stdinSpy = spyOn(Bun.stdin, "text").mockResolvedValue("");
	});

	afterEach(() => {
		exitSpy.mockRestore();
		stderrSpy.mockRestore();
		stdinSpy.mockRestore();
	});

	test("exits with code 2 for invalid hook key format (no slash)", async () => {
		await expect(PipelineRuntime.handleUnknown("InvalidKey", ["PreToolUse/security"])).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		expect(stderrSpy).toHaveBeenCalled();
		const writeArg = (stderrSpy.mock.calls[0] as string[])[0];
		expect(writeArg).toContain("Invalid hook key format");
		expect(writeArg).toContain("InvalidKey");
	});

	test("exits with code 2 for valid hook key with error message listing valid hooks", async () => {
		stdinSpy.mockResolvedValue(JSON.stringify({ session_id: "test-session-123" }));

		await expect(
			PipelineRuntime.handleUnknown("PreToolUse/unknown-hook", ["PreToolUse/security", "SessionStart/context"]),
		).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		// The last stderr.write call should contain the error message with valid hooks
		const calls = stderrSpy.mock.calls as string[][];
		const lastWriteArg = calls[calls.length - 1]?.[0];
		expect(lastWriteArg).toContain("Unknown hook: PreToolUse/unknown-hook");
		expect(lastWriteArg).toContain("PreToolUse/security");
		expect(lastWriteArg).toContain("SessionStart/context");
	});

	test("handles stdin parsing errors gracefully", async () => {
		stdinSpy.mockResolvedValue("not valid json {{{");

		await expect(PipelineRuntime.handleUnknown("PreToolUse/bad", ["PreToolUse/security"])).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		const calls = stderrSpy.mock.calls as string[][];
		const lastWriteArg = calls[calls.length - 1]?.[0];
		expect(lastWriteArg).toContain("Unknown hook: PreToolUse/bad");
	});

	test("handles empty stdin gracefully", async () => {
		stdinSpy.mockResolvedValue("");

		await expect(PipelineRuntime.handleUnknown("Stop/guard", ["Stop/guard-real"])).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		const calls = stderrSpy.mock.calls as string[][];
		const lastWriteArg = calls[calls.length - 1]?.[0];
		expect(lastWriteArg).toContain("Unknown hook: Stop/guard");
	});
});

// =============================================================================
// Telemetry Integration Tests
// =============================================================================

describe("Telemetry integration in PipelineRuntime.run", () => {
	let env: MockEnvContext;
	let telemetryCtx: ReturnType<typeof makeTelemetryTest>;

	beforeEach(() => {
		env = TestFixtures.createEnv({
			CLAUDE_CODE_ENABLE_TELEMETRY: "0",
			CLAUDE_PLUGIN_ROOT: "/tmp/test-plugin",
			CLAUDE_PROJECT_DIR: "/tmp/test-project",
		});
		telemetryCtx = makeTelemetryTest();
	});

	afterEach(() => {
		env.restore();
	});

	test("calls preconnect at the start of pipeline run", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-123",
			tool_input: { command: "echo hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_TELEM", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed tool",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		expect(telemetryCtx.preconnectCount).toBeGreaterThanOrEqual(1);
	});

	test("calls flush after pipeline execution", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-123",
			tool_input: { command: "echo hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_FLUSH", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed tool",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		expect(telemetryCtx.flushCount).toBeGreaterThanOrEqual(1);
	});

	test("emits hook execution data via Telemetry service", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-123",
			tool_input: { command: "echo hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_EMIT", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed: echo hello",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		// Verify hook execution data was emitted
		expect(telemetryCtx.events.length).toBe(1);
		const emitted = telemetryCtx.events[0];
		expect(emitted.hookType).toBe("PreToolUse");
		expect(emitted.hookName).toBe("pre-bash");
		expect(emitted.pluginName).toBe("test-plugin");
		expect(emitted.pluginVersion).toBe("1.0.0");
		expect(emitted.success).toBe(true);
		expect(emitted.outcome).toBe("allowed");
		expect(emitted.summary).toBe("allowed: echo hello");
		expect(emitted.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("emits skipped telemetry when tool filter does not match", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Write",
			tool_use_id: "tool-456",
			tool_input: { path: "/tmp/test.txt", content: "hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_SKIP", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "should not reach",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				tools: ["Bash"], // Only matches Bash, not Write
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		// Should emit skipped telemetry
		expect(telemetryCtx.events.length).toBe(1);
		const emitted = telemetryCtx.events[0];
		expect(emitted.outcome).toBe("skipped");
		expect(emitted.success).toBe(true);
		// Should also flush
		expect(telemetryCtx.flushCount).toBeGreaterThanOrEqual(1);
	});
});

// =============================================================================
// Channel logging
// =============================================================================

describe("channel logging", () => {
	let tmpDir: string;
	const pluginName = "channel-log-test";
	const savedEnv: Record<string, string | undefined> = {};

	beforeEach(async () => {
		tmpDir = await mkdtemp(path.join(os.tmpdir(), "pipeline-log-test-"));
		// Save and set env vars for logger
		for (const key of ["CLAUDE_ENV_FILE", "CLAUDE_DEBUG"]) {
			savedEnv[key] = Bun.env[key];
		}
		Bun.env.CLAUDE_ENV_FILE = path.join(tmpDir, "env.sh");
		Bun.env.CLAUDE_DEBUG = "1";
	});

	afterEach(async () => {
		// Restore env
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value !== undefined) {
				Bun.env[key] = value;
			} else {
				delete Bun.env[key];
			}
		}
		await rm(tmpDir, { recursive: true, force: true });
	});

	/**
	 * Helper to read NDJSON log entries from the log file.
	 */
	async function readLogs(): Promise<Record<string, unknown>[]> {
		// Give the batched logger a moment to flush
		await new Promise((resolve) => setTimeout(resolve, 1500));
		const logFile = path.join(tmpDir, `${pluginName}.log`);
		try {
			const content = await Bun.file(logFile).text();
			return content
				.trim()
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line));
		} catch {
			return [];
		}
	}

	test("pipeline channel logs are emitted during successful execution", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-123",
			tool_input: { command: "echo hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_CHANLOG", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed tool",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		const pipelineLogs = logs.filter((l) => l.channel === "pipeline");
		expect(pipelineLogs.some((l) => (l.message as string).includes("input decoded"))).toBe(true);
		expect(pipelineLogs.some((l) => (l.message as string).includes("invoking handler"))).toBe(true);
		expect(pipelineLogs.some((l) => (l.message as string).includes("handler completed"))).toBe(true);
		expect(pipelineLogs.some((l) => (l.message as string).includes("output validated"))).toBe(true);
		expect(pipelineLogs.some((l) => (l.message as string).includes("response written to stdout"))).toBe(true);
	});

	test("event channel log includes toolName for tool hooks", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-456",
			tool_input: { command: "ls" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_EVTLOG", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		const eventLogs = logs.filter((l) => l.channel === "event");
		expect(eventLogs.length).toBeGreaterThanOrEqual(1);
		const hookEventLog = eventLogs.find((l) => (l.message as string).includes("hook event received"));
		expect(hookEventLog).toBeDefined();
		expect(hookEventLog?.toolName).toBe("Bash");
	});

	test("otel channel logs are emitted for telemetry", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-789",
			tool_input: { command: "pwd" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_OTELLOG", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		const otelLogs = logs.filter((l) => l.channel === "otel");
		expect(otelLogs.some((l) => (l.message as string).includes("emitting hook execution telemetry"))).toBe(true);
		expect(otelLogs.some((l) => (l.message as string).includes("telemetry flush"))).toBe(true);
	});

	test("state channel log is emitted for non-SessionStart hooks", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-state",
			tool_input: { command: "date" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_STATELOG", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		const stateLogs = logs.filter((l) => l.channel === "state");
		expect(stateLogs.some((l) => (l.message as string).includes("resolved session env dir"))).toBe(true);
		expect(stateLogs.some((l) => (l.message as string).includes("loaded persisted state"))).toBe(true);
		// keyCount should be a number
		const stateLog = stateLogs.find((l) => (l.message as string).includes("loaded persisted state"));
		expect(typeof stateLog?.keyCount).toBe("number");
	});

	test("scope-level annotations appear on all log entries", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Bash",
			tool_use_id: "tool-scope",
			tool_input: { command: "whoami" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_SCOPE", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "allowed",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "scope-test-hook",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		// All log entries should have the scope-level annotations
		for (const log of logs) {
			expect(log.hookType).toBe("PreToolUse");
			expect(log.hookName).toBe("scope-test-hook");
			expect(log.pluginName).toBe(pluginName);
		}
	});

	test("tool filtered skip emits pipeline channel log", async () => {
		const stdout = createMockWritable();
		const stderr = createMockWritable();
		const telemetryCtx = makeTelemetryTest();

		const preToolUseInput = {
			...baseEventFields,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Write",
			tool_use_id: "tool-filter",
			tool_input: { file_path: "/tmp/test.txt", content: "hello" },
		};

		const mockIO: IODependencies = {
			inputText: toInputText(preToolUseInput),
			stdout: stdout.stream,
			stderr: stderr.stream,
			exit: createMockExit(),
			cwd: () => "/test",
		};

		const envSchema = Schema.Struct({});
		const EnvClass = PluginEnv.create("TEST_FILTER", envSchema);

		const handler = async () =>
			({
				status: "executed",
				action: "allow",
				summary: "should not reach",
			}) as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName,
				pluginVersion: "1.0.0",
				handler: handler,
				stateClass: EnvClass,
				tools: ["Bash"], // Only matches Bash, not Write
				io: mockIO,
				_telemetry: telemetryCtx.service,
			}),
		).rejects.toThrow(ExitError);

		const logs = await readLogs();
		const pipelineLogs = logs.filter((l) => l.channel === "pipeline");
		expect(pipelineLogs.some((l) => (l.message as string).includes("tool filtered, skipping"))).toBe(true);
	});
});
