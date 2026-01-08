import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { HookType } from "../../events/enums.js";
import type { MockEnvContext } from "../../testing/mocks.js";
import { TestFixtures } from "../../testing/mocks.js";
import { clearSidecarClients, getSidecarClient } from "./SidecarClient.js";
import { TelemetryEmitter } from "./TelemetryEmitter.js";

// Type for mock call assertions
interface MockEventMessage {
	type: string;
	sessionId: string;
	data: {
		name: string;
		body: string;
		severity?: string;
		attributes: Record<string, unknown>;
	};
}

/**
 * Helper to safely get the first mock call.
 * Throws if no calls were made.
 */
function getFirstCall(spy: ReturnType<typeof mock>): [MockEventMessage] {
	const call = spy.mock.calls[0];
	if (!call) {
		throw new Error("Expected spy to have been called");
	}
	return call as [MockEventMessage];
}

describe("TelemetryEmitter", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		// Enable OTEL for tests - need to be on darwin/linux and have telemetry enabled
		env = TestFixtures.createEnv({
			CLAUDE_CODE_ENABLE_TELEMETRY: "1",
		});
		// Clear any cached clients
		clearSidecarClients();
	});

	afterEach(() => {
		env.restore();
		clearSidecarClients();
	});

	describe("emitHookExecution", () => {
		test("emits event when OTEL is enabled", () => {
			// Get client and spy on emit
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "pre-bash", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: true,
				outcome: "allowed",
				summary: "auto-allowed: git status",
				toolName: "Bash",
				toolUseId: "tool-use-123",
				permissionDecision: "allow",
			});

			expect(emitSpy).toHaveBeenCalled();
			const call = getFirstCall(emitSpy);
			expect(call[0].type).toBe("event");
			expect(call[0].sessionId).toBe("test-session");
			expect(call[0].data.name).toBe("claude_code.hook.execution");
		});

		test("includes optional attributes when provided", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "security-check", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 100,
				success: false,
				outcome: "denied",
				summary: "denied: dangerous command",
				error: "rm -rf is not allowed",
				toolName: "Bash",
				permissionDecision: "deny",
				decisionSource: "hook",
				permissionDecisionReason: "Command would delete files",
				hasUpdatedInput: false,
				decision: "block",
				reason: "dangerous command",
				hasAdditionalContext: true,
				additionalContext: "This command was blocked for safety",
				metrics: {
					patternsMatched: 3,
					contextTokens: 50,
				},
				context: {
					commandType: "destructive",
					severity: "high",
				},
			});

			expect(emitSpy).toHaveBeenCalled();
			const call = getFirstCall(emitSpy);
			const attrs = call[0].data.attributes;

			expect(attrs["hook.name"]).toBe("security-check");
			expect(attrs["hook.type"]).toBe("PreToolUse");
			expect(attrs["hook.outcome"]).toBe("denied");
			expect(attrs["tool.name"]).toBe("Bash");
			expect(attrs["permission.decision"]).toBe("deny");
			expect(attrs["decision.source"]).toBe("hook");
			expect(attrs["permission.decision_reason"]).toBe("Command would delete files");
			expect(attrs["hook.decision"]).toBe("block");
			expect(attrs.reason).toBe("dangerous command");
			expect(attrs["metrics.patternsMatched"]).toBe(3);
			expect(attrs["metrics.contextTokens"]).toBe(50);
			expect(attrs["context.commandType"]).toBe("destructive");
		});

		test("does not emit when OTEL is disabled", () => {
			env.delete("CLAUDE_CODE_ENABLE_TELEMETRY");

			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "test-hook", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: true,
			});

			expect(emitSpy).not.toHaveBeenCalled();
		});

		test("uses summary as body when provided", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "test-hook", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: true,
				summary: "allowed: safe command",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toBe("allowed: safe command");
		});

		test("uses additionalContext as body when no summary", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PostToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "test-hook", {
				hookType: "PostToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: true,
				additionalContext: "File contains 100 lines",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toBe("File contains 100 lines");
		});

		test("uses generic message as body when no summary or context", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "test-hook", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: true,
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toContain("test-hook");
			expect(call[0].data.body).toContain("PreToolUse");
			expect(call[0].data.body).toContain("success");
		});

		test("sets severity to error when not successful", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			const event = {
				session_id: "test-session",
				timestamp: new Date().toISOString(),
				hook_event_name: HookType.PreToolUse,
			};

			TelemetryEmitter.emitHookExecution(event, "test-hook", {
				hookType: "PreToolUse",
				pluginName: "test-plugin",
				pluginVersion: "1.0.0",
				durationMs: 50,
				success: false,
				error: "Something went wrong",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.severity).toBe("error");
		});
	});

	describe("emitSchemaValidationError", () => {
		test("emits schema validation error event", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitSchemaValidationError("test-session", "pre-bash", {
				hookName: "pre-bash",
				issueCount: 2,
				validationPath: "tool_input.command",
				errorMessage: "Required field missing",
			});

			expect(emitSpy).toHaveBeenCalled();
			const call = getFirstCall(emitSpy);
			expect(call[0].type).toBe("event");
			expect(call[0].data.name).toBe("claude_code.hook.validation_error");
			expect(call[0].data.attributes["validation.path"]).toBe("tool_input.command");
			expect(call[0].data.attributes["validation.issue_count"]).toBe(2);
			expect(call[0].data.body).toContain("Schema validation failed");
		});

		test("does not emit when OTEL is disabled", () => {
			env.delete("CLAUDE_CODE_ENABLE_TELEMETRY");

			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitSchemaValidationError("test-session", "pre-bash", {
				hookName: "pre-bash",
				issueCount: 1,
				validationPath: "tool_input",
				errorMessage: "Invalid type",
			});

			expect(emitSpy).not.toHaveBeenCalled();
		});
	});

	describe("emitEnvValidationError", () => {
		test("emits env validation error event", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitEnvValidationError("test-session", "session-start", {
				hookName: "session-start",
				issueCount: 1,
				validationPath: "DEBUG",
				errorMessage: "Expected boolean, received string",
				envClassName: "WorkflowEnv",
			});

			expect(emitSpy).toHaveBeenCalled();
			const call = getFirstCall(emitSpy);
			expect(call[0].type).toBe("event");
			expect(call[0].data.name).toBe("claude_code.hook.env_error");
			expect(call[0].data.attributes["validation.path"]).toBe("DEBUG");
			expect(call[0].data.attributes["env.class"]).toBe("WorkflowEnv");
			expect(call[0].data.body).toContain("Environment validation failed");
		});

		test("does not include envClassName when not provided", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitEnvValidationError("test-session", "session-start", {
				hookName: "session-start",
				issueCount: 1,
				validationPath: "API_KEY",
				errorMessage: "Required",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.attributes["env.class"]).toBeUndefined();
		});

		test("does not emit when OTEL is disabled", () => {
			env.delete("CLAUDE_CODE_ENABLE_TELEMETRY");

			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitEnvValidationError("test-session", "session-start", {
				hookName: "session-start",
				issueCount: 1,
				validationPath: "DEBUG",
				errorMessage: "Invalid",
			});

			expect(emitSpy).not.toHaveBeenCalled();
		});
	});

	describe("emitFatalError", () => {
		test("emits fatal error event and returns true", async () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			const flushSpy = mock(async () => true);
			client.emit = emitSpy as typeof client.emit;
			client.flush = flushSpy;

			const result = await TelemetryEmitter.emitFatalError("test-session", {
				hookName: "pre-bash",
				errorType: "uncaughtException",
				errorMessage: "Cannot read property of undefined",
				errorStack: "Error: Cannot read property of undefined\n    at foo.js:10",
			});

			expect(result).toBe(true);
			expect(emitSpy).toHaveBeenCalled();
			expect(flushSpy).toHaveBeenCalled();

			const call = getFirstCall(emitSpy);
			expect(call[0].type).toBe("event");
			expect(call[0].data.name).toBe("claude_code.hook.fatal_error");
			expect(call[0].data.severity).toBe("fatal");
			expect(call[0].data.attributes["error.type"]).toBe("uncaughtException");
			expect(call[0].data.body).toContain("Fatal error in pre-bash");
			expect(call[0].data.body).toContain("Stack:");
		});

		test("truncates long stack traces", async () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			const flushSpy = mock(async () => true);
			client.emit = emitSpy as typeof client.emit;
			client.flush = flushSpy;

			const longStack = "x".repeat(2000);

			await TelemetryEmitter.emitFatalError("test-session", {
				hookName: "pre-bash",
				errorType: "uncaughtException",
				errorMessage: "Error",
				errorStack: longStack,
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toContain("... (truncated)");
			expect(call[0].data.body.length).toBeLessThan(longStack.length + 200);
		});

		test("includes validation error attributes when provided", async () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			const flushSpy = mock(async () => true);
			client.emit = emitSpy as typeof client.emit;
			client.flush = flushSpy;

			await TelemetryEmitter.emitFatalError("test-session", {
				hookName: "pre-bash",
				errorType: "ZodError",
				errorMessage: "Validation failed",
				isValidationError: true,
				issueCount: 3,
				validationPath: "tool_input.command",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.attributes["error.is_validation"]).toBe(true);
			expect(call[0].data.attributes["validation.issue_count"]).toBe(3);
			expect(call[0].data.attributes["validation.path"]).toBe("tool_input.command");
		});

		test("returns false when OTEL is disabled", async () => {
			env.delete("CLAUDE_CODE_ENABLE_TELEMETRY");

			const result = await TelemetryEmitter.emitFatalError("test-session", {
				hookName: "pre-bash",
				errorType: "Error",
				errorMessage: "Something failed",
			});

			expect(result).toBe(false);
		});
	});

	describe("emitHookExecutionDirect", () => {
		test("emits event without event object", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitHookExecutionDirect({
				sessionId: "test-session",
				hookName: "PreToolUse/unknown-hook",
				hookType: "PreToolUse",
				durationMs: 5,
				success: false,
				outcome: "error",
				summary: "Unknown hook",
				error: "Hook not found: unknown-hook",
			});

			expect(emitSpy).toHaveBeenCalled();
			const call = getFirstCall(emitSpy);
			expect(call[0].type).toBe("event");
			expect(call[0].sessionId).toBe("test-session");
			expect(call[0].data.name).toBe("claude_code.hook.execution");
			expect(call[0].data.attributes["hook.name"]).toBe("PreToolUse/unknown-hook");
			expect(call[0].data.attributes["hook.outcome"]).toBe("error");
			expect(call[0].data.attributes.error).toBe("Hook not found: unknown-hook");
		});

		test("uses summary as body when provided", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitHookExecutionDirect({
				sessionId: "test-session",
				hookName: "test-hook",
				hookType: "PreToolUse",
				durationMs: 10,
				success: true,
				summary: "Hook executed successfully",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toBe("Hook executed successfully");
		});

		test("uses error as body when no summary", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitHookExecutionDirect({
				sessionId: "test-session",
				hookName: "test-hook",
				hookType: "PreToolUse",
				durationMs: 10,
				success: false,
				error: "Hook execution failed",
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toBe("Hook execution failed");
		});

		test("uses generic message as body when no summary or error", () => {
			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitHookExecutionDirect({
				sessionId: "test-session",
				hookName: "test-hook",
				hookType: "PreToolUse",
				durationMs: 10,
				success: true,
			});

			const call = getFirstCall(emitSpy);
			expect(call[0].data.body).toContain("test-hook");
			expect(call[0].data.body).toContain("success");
		});

		test("does not emit when OTEL is disabled", () => {
			env.delete("CLAUDE_CODE_ENABLE_TELEMETRY");

			const client = getSidecarClient("test-session");
			const emitSpy = mock((_msg: MockEventMessage) => {});
			client.emit = emitSpy as typeof client.emit;

			TelemetryEmitter.emitHookExecutionDirect({
				sessionId: "test-session",
				hookName: "test-hook",
				hookType: "PreToolUse",
				durationMs: 10,
				success: true,
			});

			expect(emitSpy).not.toHaveBeenCalled();
		});
	});
});
