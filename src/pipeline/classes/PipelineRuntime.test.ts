import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Writable } from "node:stream";
import { z } from "zod";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import type { MockEnvContext } from "../../testing/mocks.js";
import { TestFixtures } from "../../testing/mocks.js";
import type { AnyPipelineOutput } from "../types.js";
import type { IODependencies } from "./PipelineRuntime.js";
import { PipelineRuntime } from "./PipelineRuntime.js";

// Access internal test utilities
const {
	convertToPermissionRequestResponseData,
	convertToPostToolUseResponseData,
	convertToPreToolUseResponseData,
	convertToResponse,
	convertToSessionStartResponseData,
	convertToStopResponseData,
	convertToUserPromptSubmitResponseData,
	createBaseState,
	extractPersistedState,
	isDebugEnabled,
	mapToOutcome,
	mapToPermissionDecision,
} = PipelineRuntime.internal;

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
		const schema = z.object({
			VERBOSE: z.boolean().default(false),
		});

		const EnvClass = PluginEnv.create("MY_PLUGIN", schema);
		const instance = new EnvClass();

		// The class should be instantiable
		expect(instance).toBeDefined();
	});

	test("validated getter returns typed environment", () => {
		const schema = z.object({
			VERBOSE: z.boolean().default(false),
			LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
		});

		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		// The validated getter should exist (actual validation happens during hook creation)
		expect(typeof instance.validated).toBe("object");
	});

	test("creates unique classes for different prefixes", () => {
		const schema = z.object({});

		const ClassA = PluginEnv.create("PREFIX_A", schema);
		const ClassB = PluginEnv.create("PREFIX_B", schema);

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
		const schema = z.object({});
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
// mapToPermissionDecision tests
// =============================================================================

describe("mapToPermissionDecision", () => {
	test("returns allow for allow action", () => {
		expect(mapToPermissionDecision("allow")).toBe("allow");
	});

	test("returns deny for deny action", () => {
		expect(mapToPermissionDecision("deny")).toBe("deny");
	});

	test("returns ask for ask action", () => {
		expect(mapToPermissionDecision("ask")).toBe("ask");
	});

	test("returns allow for modify action", () => {
		expect(mapToPermissionDecision("modify")).toBe("allow");
	});

	test("returns undefined for block action", () => {
		expect(mapToPermissionDecision("block")).toBeUndefined();
	});

	test("returns undefined for continue action", () => {
		expect(mapToPermissionDecision("continue")).toBeUndefined();
	});

	test("returns undefined for context action", () => {
		expect(mapToPermissionDecision("context")).toBeUndefined();
	});

	test("returns undefined for none action", () => {
		expect(mapToPermissionDecision("none")).toBeUndefined();
	});

	test("returns undefined for undefined action", () => {
		expect(mapToPermissionDecision(undefined)).toBeUndefined();
	});
});

// =============================================================================
// convertToPreToolUseResponseData tests
// =============================================================================

describe("convertToPreToolUseResponseData", () => {
	test("returns allow for allow action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		expect(convertToPreToolUseResponseData(output)).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: undefined,
		});
	});

	test("returns deny for deny action with reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "deny",
			summary: "denied",
			reason: "dangerous command",
		};
		expect(convertToPreToolUseResponseData(output)).toEqual({
			permissionDecision: "deny",
			reason: "dangerous command",
			updatedInput: undefined,
		});
	});

	test("returns ask for ask action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "ask",
			summary: "asking user",
		};
		expect(convertToPreToolUseResponseData(output)).toEqual({
			permissionDecision: "ask",
			reason: undefined,
			updatedInput: undefined,
		});
	});

	test("returns allow with updatedInput for modify action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "modify",
			summary: "modified",
			updatedInput: { command: "safe-command" },
		};
		expect(convertToPreToolUseResponseData(output)).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: { command: "safe-command" },
		});
	});

	test("returns allow for output without action", () => {
		const output: AnyPipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		expect(convertToPreToolUseResponseData(output)).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: undefined,
		});
	});
});

// =============================================================================
// convertToPostToolUseResponseData tests
// =============================================================================

describe("convertToPostToolUseResponseData", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
			reason: "lint errors found",
		};
		expect(convertToPostToolUseResponseData(output)).toEqual({
			decision: "block",
			reason: "lint errors found",
		});
	});

	test("returns additionalContext for context action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "added context",
			claudeContext: "File contains 100 lines",
		};
		expect(convertToPostToolUseResponseData(output)).toEqual({
			additionalContext: "File contains 100 lines",
		});
	});

	test("returns empty object for none action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		expect(convertToPostToolUseResponseData(output)).toEqual({});
	});

	test("returns empty object for continue action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "continue",
			summary: "continuing",
		};
		expect(convertToPostToolUseResponseData(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToPostToolUseResponseData(output)).toEqual({});
	});
});

// =============================================================================
// convertToSessionStartResponseData tests
// =============================================================================

describe("convertToSessionStartResponseData", () => {
	test("returns additionalContext when claudeContext is present", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "provided context",
			claudeContext: "This is a TypeScript project",
		};
		expect(convertToSessionStartResponseData(output)).toEqual({
			additionalContext: "This is a TypeScript project",
		});
	});

	test("returns empty object when no claudeContext", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no context",
		};
		expect(convertToSessionStartResponseData(output)).toEqual({});
	});
});

// =============================================================================
// convertToStopResponseData tests
// =============================================================================

describe("convertToStopResponseData", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked stop",
			reason: "tests not run",
		};
		expect(convertToStopResponseData(output)).toEqual({
			decision: "block",
			reason: "tests not run",
		});
	});

	test("returns empty object for continue action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "continue",
			summary: "allowing stop",
		};
		expect(convertToStopResponseData(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToStopResponseData(output)).toEqual({});
	});
});

// =============================================================================
// convertToUserPromptSubmitResponseData tests
// =============================================================================

describe("convertToUserPromptSubmitResponseData", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked prompt",
			reason: "please clarify",
		};
		expect(convertToUserPromptSubmitResponseData(output)).toEqual({
			decision: "block",
			reason: "please clarify",
		});
	});

	test("returns additionalContext for context action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "added context",
			claudeContext: "User is working on feature X",
		};
		expect(convertToUserPromptSubmitResponseData(output)).toEqual({
			additionalContext: "User is working on feature X",
		});
	});

	test("returns empty object for none action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		expect(convertToUserPromptSubmitResponseData(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToUserPromptSubmitResponseData(output)).toEqual({});
	});
});

// =============================================================================
// convertToPermissionRequestResponseData tests
// =============================================================================

describe("convertToPermissionRequestResponseData", () => {
	test("returns allow behavior for allow action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		expect(convertToPermissionRequestResponseData(output)).toEqual({
			behavior: "allow",
			message: undefined,
			interrupt: undefined,
			updatedInput: undefined,
		});
	});

	test("returns deny behavior for deny action with message and interrupt", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "deny",
			summary: "denied",
			reason: "dangerous",
			interrupt: true,
		};
		expect(convertToPermissionRequestResponseData(output)).toEqual({
			behavior: "deny",
			message: "dangerous",
			interrupt: true,
			updatedInput: undefined,
		});
	});

	test("returns allow with updatedInput", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed with modifications",
			updatedInput: { timeout: 5000 },
		};
		expect(convertToPermissionRequestResponseData(output)).toEqual({
			behavior: "allow",
			message: undefined,
			interrupt: undefined,
			updatedInput: { timeout: 5000 },
		});
	});

	test("returns allow for output without deny action", () => {
		const output: AnyPipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		expect(convertToPermissionRequestResponseData(output)).toEqual({
			behavior: "allow",
			message: undefined,
			interrupt: undefined,
			updatedInput: undefined,
		});
	});
});

// =============================================================================
// convertToResponse tests
// =============================================================================

describe("convertToResponse", () => {
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
		const result = convertToResponse("PreToolUse", allowOutput);
		expect(result).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: undefined,
		});
	});

	test("converts PostToolUse response", () => {
		const result = convertToResponse("PostToolUse", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts SessionStart response", () => {
		const result = convertToResponse("SessionStart", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts SessionEnd response (passthrough)", () => {
		const result = convertToResponse("SessionEnd", allowOutput);
		expect(result).toEqual({});
	});

	test("converts PreCompact response (passthrough)", () => {
		const result = convertToResponse("PreCompact", allowOutput);
		expect(result).toEqual({});
	});

	test("converts Notification response (passthrough)", () => {
		const result = convertToResponse("Notification", allowOutput);
		expect(result).toEqual({});
	});

	test("converts Stop response", () => {
		const result = convertToResponse("Stop", blockOutput);
		expect(result).toEqual({
			decision: "block",
			reason: "test reason",
		});
	});

	test("converts SubagentStop response", () => {
		const result = convertToResponse("SubagentStop", blockOutput);
		expect(result).toEqual({
			decision: "block",
			reason: "test reason",
		});
	});

	test("converts UserPromptSubmit response", () => {
		const result = convertToResponse("UserPromptSubmit", contextOutput);
		expect(result).toEqual({
			additionalContext: "test context",
		});
	});

	test("converts PermissionRequest response", () => {
		const result = convertToResponse("PermissionRequest", allowOutput);
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
		const schema = z.object({});
		// Create env class without prefix
		class NoPrefix extends PluginEnv.create("", schema) {
			protected readonly prefix = "";
		}
		const instance = new NoPrefix();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object when PLUGIN_STATE not set", () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("decodes base64 PLUGIN_STATE", () => {
		const state = { foo: "bar", count: 42 };
		const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual(state);
	});

	test("returns empty object for invalid base64", () => {
		env.set("TEST_PLUGIN_STATE", "not-valid-base64!!!!");

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object for non-object state", () => {
		const encoded = Buffer.from(JSON.stringify("just a string")).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractPersistedState(instance)).toEqual({});
	});

	test("returns empty object for null state", () => {
		const encoded = Buffer.from(JSON.stringify(null)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
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

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/project/dir");
	});

	test("falls back to cwd when CLAUDE_PROJECT_DIR not set", () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/cwd");
	});

	test("uses CLAUDE_PLUGIN_ROOT when set", () => {
		env.set("CLAUDE_PLUGIN_ROOT", "/plugin/root");

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("/plugin/root");
	});

	test("falls back to empty string when CLAUDE_PLUGIN_ROOT not set", () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("");
	});

	test("uses provided claudeEnvFile", () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/custom/env/file", instance);
		expect(baseEnv.pluginEnvFile).toBe("/custom/env/file");
	});

	test("includes logger methods", () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseState("/cwd", "/env/file", instance);
		expect(typeof baseEnv.log).toBe("function");
		expect(typeof baseEnv.info).toBe("function");
		expect(typeof baseEnv.debug).toBe("function");
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

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);

		await expect(
			PipelineRuntime.run({
				// @ts-expect-error - testing invalid hook type
				hookType: "InvalidHookType",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: async () => ({ status: "executed", summary: "ok" }),
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

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: async () => ({ status: "executed", summary: "ok" }),
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({
			VERBOSE: z.boolean().default(false),
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
				pipeline: handler,
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

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST", schema);

		// Handler that returns invalid output (missing status/summary)
		const handler = async () => ({ invalid: "output" }) as unknown as AnyPipelineOutput;

		await expect(
			PipelineRuntime.run({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
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

		const schema = z.object({});
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
				pipeline: handler,
				stateClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Response should be written
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
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
// runRaw() TESTS
// =============================================================================

describe("PipelineRuntime.runRaw", () => {
	let exitSpy: ReturnType<typeof spyOn>;
	let consoleErrorSpy: ReturnType<typeof spyOn>;
	let stdinSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		exitSpy = spyOn(process, "exit").mockImplementation((() => {
			throw new ExitError(2);
		}) as never);
		consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
		stdinSpy = spyOn(Bun.stdin, "text").mockResolvedValue("");
	});

	afterEach(() => {
		exitSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		stdinSpy.mockRestore();
	});

	test("exits with code 2 for unknown hook type", async () => {
		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST_RAW", schema);

		await expect(
			PipelineRuntime.runRaw({
				// biome-ignore lint/suspicious/noExplicitAny: Testing invalid hook type
				hookType: "NonExistentHookType" as any,
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: async () => {},
				stateClass: EnvClass,
			}),
		).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		expect(consoleErrorSpy).toHaveBeenCalledWith("Unknown hook type: NonExistentHookType");
	});

	test("exits with code 2 on ZodError from invalid stdin input", async () => {
		// Provide invalid JSON that will fail Zod schema validation
		stdinSpy.mockResolvedValue(JSON.stringify({ invalid: "data" }));

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST_RAW_ZOD", schema);

		await expect(
			PipelineRuntime.runRaw({
				hookType: "PreToolUse",
				hookName: "zod-fail-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: async () => {},
				stateClass: EnvClass,
			}),
		).rejects.toThrow(ExitError);

		expect(exitSpy).toHaveBeenCalledWith(2);
		expect(consoleErrorSpy).toHaveBeenCalledWith("[zod-fail-hook] Input validation failed:");
	});

	test("re-throws non-ZodError from EventClass.create()", async () => {
		// Provide stdin that will cause a non-Zod error (e.g., empty string causes parse fail)
		stdinSpy.mockRejectedValue(new Error("stdin read failure"));

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST_RAW_ERR", schema);

		await expect(
			PipelineRuntime.runRaw({
				hookType: "PreToolUse",
				hookName: "error-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: async () => {},
				stateClass: EnvClass,
			}),
		).rejects.toThrow("stdin read failure");
	});

	test("calls handler with event, options, and state on successful create", async () => {
		const validInput = {
			session_id: "550e8400-e29b-41d4-a716-446655440000",
			transcript_path: "/tmp/transcript.json",
			cwd: "/home/user/project",
			permission_mode: "default",
			hook_event_name: "PreToolUse",
			tool_name: "Bash",
			tool_use_id: "tool-use-test-123",
			tool_input: { command: "echo hello" },
		};
		stdinSpy.mockResolvedValue(JSON.stringify(validInput));

		const schema = z.object({});
		const EnvClass = PluginEnv.create("TEST_RAW_OK", schema);

		const handlerMock = mock(async (_ctx: { event: unknown; options: unknown; state: unknown }) => {});

		// Spy on process.stdout.write to prevent actual output
		const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(() => true);

		try {
			await PipelineRuntime.runRaw({
				hookType: "PreToolUse",
				hookName: "success-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				handler: handlerMock,
				stateClass: EnvClass,
			});

			expect(handlerMock).toHaveBeenCalledTimes(1);
			const callArgs = (handlerMock.mock.calls[0] as unknown[])[0] as {
				event: unknown;
				options: unknown;
				state: unknown;
			};
			expect(callArgs.event).toBeDefined();
			expect(callArgs.options).toBeDefined();
			expect(callArgs.state).toBeDefined();
			// State should include base state fields
			const state = callArgs.state as Record<string, unknown>;
			expect(state.projectDir).toBeDefined();
		} finally {
			stdoutSpy.mockRestore();
		}
	});
});
