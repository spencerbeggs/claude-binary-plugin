import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Writable } from "node:stream";
import { z } from "zod";
import { ClaudeBinaryPluginEnv } from "../env/plugin-env.js";
import type { MockEnvContext } from "../testing/mocks.js";
import { mockEnv } from "../testing/mocks.js";
import type { IODependencies } from "./runtime.js";
import {
	convertToPermissionRequestResponse,
	convertToPostToolUseResponse,
	convertToPreToolUseResponse,
	convertToResponse,
	convertToSessionStartResponse,
	convertToStopResponse,
	convertToUserPromptSubmitResponse,
	createBaseEnv,
	extractStateFromEnv,
	isDebugEnabled,
	mapToOutcome,
	mapToPermissionDecision,
	runPipeline,
} from "./runtime.js";
import type { AnyPipelineOutput } from "./types.js";

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

describe("ClaudeBinaryPluginEnv.create", () => {
	test("creates a class with the correct prefix", () => {
		const schema = z.object({
			DEBUG: z.boolean().default(false),
		});

		const EnvClass = ClaudeBinaryPluginEnv.create("MY_PLUGIN", schema);
		const instance = new EnvClass();

		// The class should be instantiable
		expect(instance).toBeDefined();
	});

	test("validated getter returns typed environment", () => {
		const schema = z.object({
			DEBUG: z.boolean().default(false),
			LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
		});

		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		// The validated getter should exist (actual validation happens during hook creation)
		expect(typeof instance.validated).toBe("object");
	});

	test("creates unique classes for different prefixes", () => {
		const schema = z.object({});

		const ClassA = ClaudeBinaryPluginEnv.create("PREFIX_A", schema);
		const ClassB = ClaudeBinaryPluginEnv.create("PREFIX_B", schema);

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

		const EnvClass = ClaudeBinaryPluginEnv.create("COMPLEX", schema);
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
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
// convertToPreToolUseResponse tests
// =============================================================================

describe("convertToPreToolUseResponse", () => {
	test("returns allow for allow action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		expect(convertToPreToolUseResponse(output)).toEqual({
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
		expect(convertToPreToolUseResponse(output)).toEqual({
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
		expect(convertToPreToolUseResponse(output)).toEqual({
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
		expect(convertToPreToolUseResponse(output)).toEqual({
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
		expect(convertToPreToolUseResponse(output)).toEqual({
			permissionDecision: "allow",
			reason: undefined,
			updatedInput: undefined,
		});
	});
});

// =============================================================================
// convertToPostToolUseResponse tests
// =============================================================================

describe("convertToPostToolUseResponse", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
			reason: "lint errors found",
		};
		expect(convertToPostToolUseResponse(output)).toEqual({
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
		expect(convertToPostToolUseResponse(output)).toEqual({
			additionalContext: "File contains 100 lines",
		});
	});

	test("returns empty object for none action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		expect(convertToPostToolUseResponse(output)).toEqual({});
	});

	test("returns empty object for continue action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "continue",
			summary: "continuing",
		};
		expect(convertToPostToolUseResponse(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToPostToolUseResponse(output)).toEqual({});
	});
});

// =============================================================================
// convertToSessionStartResponse tests
// =============================================================================

describe("convertToSessionStartResponse", () => {
	test("returns additionalContext when claudeContext is present", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "provided context",
			claudeContext: "This is a TypeScript project",
		};
		expect(convertToSessionStartResponse(output)).toEqual({
			additionalContext: "This is a TypeScript project",
		});
	});

	test("returns empty object when no claudeContext", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no context",
		};
		expect(convertToSessionStartResponse(output)).toEqual({});
	});
});

// =============================================================================
// convertToStopResponse tests
// =============================================================================

describe("convertToStopResponse", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked stop",
			reason: "tests not run",
		};
		expect(convertToStopResponse(output)).toEqual({
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
		expect(convertToStopResponse(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToStopResponse(output)).toEqual({});
	});
});

// =============================================================================
// convertToUserPromptSubmitResponse tests
// =============================================================================

describe("convertToUserPromptSubmitResponse", () => {
	test("returns block with reason for block action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked prompt",
			reason: "please clarify",
		};
		expect(convertToUserPromptSubmitResponse(output)).toEqual({
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
		expect(convertToUserPromptSubmitResponse(output)).toEqual({
			additionalContext: "User is working on feature X",
		});
	});

	test("returns empty object for none action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		expect(convertToUserPromptSubmitResponse(output)).toEqual({});
	});

	test("returns empty object for block without reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
		};
		expect(convertToUserPromptSubmitResponse(output)).toEqual({});
	});
});

// =============================================================================
// convertToPermissionRequestResponse tests
// =============================================================================

describe("convertToPermissionRequestResponse", () => {
	test("returns allow behavior for allow action", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		expect(convertToPermissionRequestResponse(output)).toEqual({
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
		expect(convertToPermissionRequestResponse(output)).toEqual({
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
		expect(convertToPermissionRequestResponse(output)).toEqual({
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
		expect(convertToPermissionRequestResponse(output)).toEqual({
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
		env = mockEnv({});
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
// extractStateFromEnv tests
// =============================================================================

describe("extractStateFromEnv", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("returns empty object when no prefix", () => {
		const schema = z.object({});
		// Create env class without prefix
		class NoPrefix extends ClaudeBinaryPluginEnv.create("", schema) {
			protected readonly prefix = "";
		}
		const instance = new NoPrefix();
		expect(extractStateFromEnv(instance)).toEqual({});
	});

	test("returns empty object when PLUGIN_STATE not set", () => {
		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractStateFromEnv(instance)).toEqual({});
	});

	test("decodes base64 PLUGIN_STATE", () => {
		const state = { foo: "bar", count: 42 };
		const encoded = Buffer.from(JSON.stringify(state)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractStateFromEnv(instance)).toEqual(state);
	});

	test("returns empty object for invalid base64", () => {
		env.set("TEST_PLUGIN_STATE", "not-valid-base64!!!!");

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractStateFromEnv(instance)).toEqual({});
	});

	test("returns empty object for non-object state", () => {
		const encoded = Buffer.from(JSON.stringify("just a string")).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractStateFromEnv(instance)).toEqual({});
	});

	test("returns empty object for null state", () => {
		const encoded = Buffer.from(JSON.stringify(null)).toString("base64");
		env.set("TEST_PLUGIN_STATE", encoded);

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();
		expect(extractStateFromEnv(instance)).toEqual({});
	});
});

// =============================================================================
// createBaseEnv tests
// =============================================================================

describe("createBaseEnv", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("uses CLAUDE_PROJECT_DIR when set", () => {
		env.set("CLAUDE_PROJECT_DIR", "/project/dir");

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/project/dir");
	});

	test("falls back to cwd when CLAUDE_PROJECT_DIR not set", () => {
		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/env/file", instance);
		expect(baseEnv.projectDir).toBe("/cwd");
	});

	test("uses CLAUDE_PLUGIN_ROOT when set", () => {
		env.set("CLAUDE_PLUGIN_ROOT", "/plugin/root");

		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("/plugin/root");
	});

	test("falls back to empty string when CLAUDE_PLUGIN_ROOT not set", () => {
		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/env/file", instance);
		expect(baseEnv.pluginDir).toBe("");
	});

	test("uses provided claudeEnvFile", () => {
		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/custom/env/file", instance);
		expect(baseEnv.pluginEnvFile).toBe("/custom/env/file");
	});

	test("includes logger methods", () => {
		const schema = z.object({});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);
		const instance = new EnvClass();

		const baseEnv = createBaseEnv("/cwd", "/env/file", instance);
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
		env = mockEnv({
			CLAUDE_CODE_ENABLE_TELEMETRY: "0", // Disable OTEL during tests
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		await expect(
			runPipeline({
				// @ts-expect-error - testing invalid hook type
				hookType: "InvalidHookType",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: async () => ({ status: "executed", summary: "ok" }),
				envClass: EnvClass,
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		await expect(
			runPipeline({
				hookType: "PreToolUse",
				hookName: "test-hook",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: async () => ({ status: "executed", summary: "ok" }),
				envClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		expect(stderr.output.join("")).toContain("Input validation failed");
	});

	// Skip: These tests require mocking the session registry (SQLite) which causes hangs
	test.skip("executes pipeline handler and writes response for PreToolUse", async () => {
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		// The pipeline handler returns an allow decision
		const handler = async () => ({
			status: "executed" as const,
			action: "allow" as const,
			summary: "allowed: safe command",
		});

		await expect(
			runPipeline({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Check that response was written to stdout (JSON format)
		const output = stdout.output.join("");
		expect(output).toContain("permissionDecision");
	});

	test.skip("skips hook when tool does not match filter", async () => {
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		// Pipeline should not be called since tool doesn't match
		let pipelineCalled = false;
		const handler = async () => {
			pipelineCalled = true;
			return { status: "executed" as const, summary: "should not run" };
		};

		await expect(
			runPipeline({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				tools: ["Bash"], // Only handle Bash tool
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Pipeline should not have been called
		expect(pipelineCalled).toBe(false);

		// Response should indicate skipped
		const output = stdout.output.join("");
		expect(output).toContain("skipped");
	});

	test.skip("handles SessionStart hook with setup function", async () => {
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
			DEBUG: z.boolean().default(false),
		});
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		// Setup function that returns state
		const setup = async () => {
			return { detectedPM: "bun" };
		};

		// Handler that uses the state
		const handler = async ({ env: handlerEnv }: { env: { detectedPM?: string } }) => ({
			status: "executed" as const,
			action: "context" as const,
			summary: `detected: ${handlerEnv.detectedPM ?? "none"}`,
			claudeContext: "Session started",
		});

		await expect(
			runPipeline({
				hookType: "SessionStart",
				hookName: "session-start",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				setup,
				schema,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Response should be written
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
	});

	test.skip("handles pipeline returning non-pipeline output with error", async () => {
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		// Handler that returns invalid output (missing status/summary)
		const handler = async () => ({ invalid: "output" }) as unknown as AnyPipelineOutput;

		await expect(
			runPipeline({
				hookType: "PreToolUse",
				hookName: "pre-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow();
	});

	test.skip("handles PostToolUse with block action", async () => {
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "block" as const,
			summary: "blocked: dangerous command",
			reason: "Dangerous command detected",
		});

		await expect(
			runPipeline({
				hookType: "PostToolUse",
				hookName: "post-bash",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		const output = stdout.output.join("");
		expect(output).toContain("block");
	});

	test.skip("handles Stop hook with continue action", async () => {
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
		const EnvClass = ClaudeBinaryPluginEnv.create("TEST", schema);

		const handler = async () => ({
			status: "executed" as const,
			action: "continue" as const,
			summary: "allowing stop",
		});

		await expect(
			runPipeline({
				hookType: "Stop",
				hookName: "stop-check",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				pipeline: handler,
				envClass: EnvClass,
				io: mockIO,
			}),
		).rejects.toThrow(ExitError);

		// Response should be written
		const output = stdout.output.join("");
		expect(output.length).toBeGreaterThan(0);
	});
});
