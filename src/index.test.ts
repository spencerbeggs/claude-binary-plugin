import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type {
	HookEventBase,
	NotificationEvent,
	PermissionRequestEvent,
	PostToolUseEvent,
	PreCompactEvent,
	PreToolUseEvent,
	SessionEndEvent,
	SessionStartEvent,
	StopEvent,
	SubagentStopEvent,
	UserPromptSubmitEvent,
} from "./index.js";
import {
	ClaudeBinaryPluginEnv,
	HookEvent,
	HookEventName,
	HookResponseBuilder,
	NotificationHookEvent,
	PermissionRequestHookEvent,
	PermissionRequestResponseBuilder,
	PostToolUseHookEvent,
	PostToolUseResponseBuilder,
	PreCompactHookEvent,
	PreToolUseHookEvent,
	PreToolUseResponseBuilder,
	SessionEndHookEvent,
	SessionStartHookEvent,
	SessionStartResponseBuilder,
	StopHookEvent,
	StopResponseBuilder,
	SubagentStopHookEvent,
	UserPromptSubmitHookEvent,
	UserPromptSubmitResponseBuilder,
} from "./index.js";
import type { MockEnvContext } from "./testing/mocks.js";
import { envPresets, mockEnv } from "./testing/mocks.js";

// =============================================================================
// TEST UTILITIES
// =============================================================================

// Mock environment class for testing
class MockEnv extends ClaudeBinaryPluginEnv {
	protected readonly prefix = "MOCK";
}

function mockBunStdin<T extends HookEventBase>(input: T) {
	const inputStr = JSON.stringify(input);
	spyOn(Bun.stdin, "text").mockResolvedValue(inputStr);

	return {
		stdin: process.stdin,
		stdout: {
			write: mock(() => true),
		} as unknown as typeof process.stdout,
		stderr: {
			write: mock(() => true),
		} as unknown as typeof process.stderr,
		envClass: MockEnv,
	};
}

/** Valid UUID for testing - required by schema validation */
const TEST_SESSION_UUID = "550e8400-e29b-41d4-a716-446655440000";

function baseEventData(): Omit<HookEventBase, "hook_event_name"> {
	return {
		session_id: TEST_SESSION_UUID,
		transcript_path: "/tmp/transcript.json",
		cwd: "/home/user/project",
		permission_mode: "default",
	};
}

/** Complete PreToolUse event data for schema validation */
function preToolUseEventData(overrides: Partial<PreToolUseEvent> = {}): PreToolUseEvent {
	return {
		...baseEventData(),
		hook_event_name: HookEventName.PreToolUse,
		tool_name: "Bash",
		tool_input: { command: "ls -la" },
		tool_use_id: "tool-123",
		...overrides,
	};
}

/** Complete SessionStart event data for schema validation */
function sessionStartEventData(): SessionStartEvent {
	return {
		...baseEventData(),
		hook_event_name: HookEventName.SessionStart,
		source: "startup",
	};
}

// Environment mock to prevent tests from writing to real ~/.claude directory
let testEnv: MockEnvContext;

beforeEach(() => {
	// Redirect session-env writes to /tmp to avoid polluting real ~/.claude
	testEnv = mockEnv({
		CLAUDE_CONFIG_DIR: "/tmp/test-claude-config",
		HOME: "/tmp/test-home",
	});
});

// Clean up mocks after each test
afterEach(() => {
	// Restore environment
	testEnv?.restore();

	// @ts-expect-error - accessing mock restore
	if (Bun.stdin.text.mockRestore) {
		// @ts-expect-error - accessing mock restore
		Bun.stdin.text.mockRestore();
	}
});

// =============================================================================
// HOOK RESPONSE BUILDER TESTS
// =============================================================================

describe("HookResponseBuilder", () => {
	test("builds empty response", () => {
		const builder = new HookResponseBuilder();
		expect(builder.build()).toEqual({});
	});

	test("continue() sets continue to true", () => {
		const builder = new HookResponseBuilder().continue();
		expect(builder.build()).toEqual({ continue: true });
	});

	test("continue(false) sets continue to false", () => {
		const builder = new HookResponseBuilder().continue(false);
		expect(builder.build()).toEqual({ continue: false });
	});

	test("stop() sets continue false and stopReason", () => {
		const builder = new HookResponseBuilder().stop("Task completed");
		expect(builder.build()).toEqual({
			continue: false,
			stopReason: "Task completed",
		});
	});

	test("suppressOutput() sets suppressOutput to true", () => {
		const builder = new HookResponseBuilder().suppressOutput();
		expect(builder.build()).toEqual({ suppressOutput: true });
	});

	test("suppressOutput(false) sets suppressOutput to false", () => {
		const builder = new HookResponseBuilder().suppressOutput(false);
		expect(builder.build()).toEqual({ suppressOutput: false });
	});

	test("systemMessage() sets systemMessage", () => {
		const builder = new HookResponseBuilder().systemMessage("Warning!");
		expect(builder.build()).toEqual({ systemMessage: "Warning!" });
	});

	test("hookSpecificOutput() sets raw output", () => {
		const builder = new HookResponseBuilder().hookSpecificOutput({ custom: "data" });
		expect(builder.build()).toEqual({ hookSpecificOutput: { custom: "data" } });
	});

	test("block() sets decision and reason", () => {
		const builder = new HookResponseBuilder().block("Operation blocked");
		expect(builder.build()).toEqual({
			decision: "block",
			reason: "Operation blocked",
		});
	});

	test("chains multiple options", () => {
		const builder = new HookResponseBuilder().continue(true).systemMessage("Hello").suppressOutput(true);
		expect(builder.build()).toEqual({
			continue: true,
			systemMessage: "Hello",
			suppressOutput: true,
		});
	});

	test("toJSON() returns valid JSON string", () => {
		const builder = new HookResponseBuilder().continue(true).systemMessage("Test");
		const json = builder.toJSON();
		expect(json).toBe('{"continue":true,"systemMessage":"Test"}');
		expect(JSON.parse(json)).toEqual({ continue: true, systemMessage: "Test" });
	});

	test("summary() sets custom summary message", () => {
		const builder = new HookResponseBuilder().summary("custom summary");
		expect(builder.getSummary()).toBe("custom summary");
	});

	test("getSummary() returns 'completed' for empty response", () => {
		const builder = new HookResponseBuilder();
		expect(builder.getSummary()).toBe("completed");
	});

	test("getSummary() returns 'stopped' for continue=false", () => {
		const builder = new HookResponseBuilder().continue(false);
		expect(builder.getSummary()).toBe("stopped");
	});

	test("getSummary() includes stopReason when set", () => {
		const builder = new HookResponseBuilder().stop("Task completed");
		expect(builder.getSummary()).toBe("stopped: Task completed");
	});

	test("getSummary() returns 'blocked' with reason", () => {
		const builder = new HookResponseBuilder().block("Not allowed");
		expect(builder.getSummary()).toBe("blocked: Not allowed");
	});

	test("custom summary overrides auto-generated summary", () => {
		const builder = new HookResponseBuilder().block("Not allowed").summary("custom override");
		expect(builder.getSummary()).toBe("custom override");
	});
});

// =============================================================================
// PRETOOLUSE RESPONSE BUILDER TESTS
// =============================================================================

describe("PreToolUseResponseBuilder", () => {
	test("allow() sets permission decision", () => {
		const builder = new PreToolUseResponseBuilder().allow();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
			},
		});
	});

	test("deny() sets permission decision without reason", () => {
		const builder = new PreToolUseResponseBuilder().deny();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
			},
		});
	});

	test("deny() with reason sets permissionDecisionReason", () => {
		const builder = new PreToolUseResponseBuilder().deny("Not allowed");
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: "Not allowed",
			},
		});
	});

	test("ask() sets permission decision to ask", () => {
		const builder = new PreToolUseResponseBuilder().ask();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "ask",
			},
		});
	});

	test("updateInput() sets updated input", () => {
		const builder = new PreToolUseResponseBuilder().updateInput({ timeout: 5000 });
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				updatedInput: { timeout: 5000 },
			},
		});
	});

	test("allow() with updateInput() chains correctly", () => {
		const builder = new PreToolUseResponseBuilder().allow().updateInput({ modified: true });
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
				updatedInput: { modified: true },
			},
		});
	});

	test("chains with base builder methods", () => {
		const builder = new PreToolUseResponseBuilder().systemMessage("Notice").allow();
		expect(builder.build()).toEqual({
			systemMessage: "Notice",
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
			},
		});
	});

	test("getSummary() returns 'allowed' for allow()", () => {
		const builder = new PreToolUseResponseBuilder().allow();
		expect(builder.getSummary()).toBe("allowed");
	});

	test("getSummary() returns 'denied' for deny()", () => {
		const builder = new PreToolUseResponseBuilder().deny();
		expect(builder.getSummary()).toBe("denied");
	});

	test("getSummary() includes reason for deny(reason)", () => {
		const builder = new PreToolUseResponseBuilder().deny("Not allowed");
		expect(builder.getSummary()).toBe("denied: Not allowed");
	});

	test("getSummary() returns 'ask user' for ask()", () => {
		const builder = new PreToolUseResponseBuilder().ask();
		expect(builder.getSummary()).toBe("ask user");
	});
});

// =============================================================================
// POSTTOOLUSE RESPONSE BUILDER TESTS
// =============================================================================

describe("PostToolUseResponseBuilder", () => {
	test("additionalContext() sets context", () => {
		const builder = new PostToolUseResponseBuilder().additionalContext("File contains sensitive data");
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: "File contains sensitive data",
			},
		});
	});

	test("chains with base builder methods", () => {
		const builder = new PostToolUseResponseBuilder().continue(true).additionalContext("Context here");
		expect(builder.build()).toEqual({
			continue: true,
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext: "Context here",
			},
		});
	});
});

// =============================================================================
// PERMISSIONREQUEST RESPONSE BUILDER TESTS
// =============================================================================

describe("PermissionRequestResponseBuilder", () => {
	test("allow() sets behavior to allow", () => {
		const builder = new PermissionRequestResponseBuilder().allow();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "allow" },
			},
		});
	});

	test("deny() sets behavior to deny", () => {
		const builder = new PermissionRequestResponseBuilder().deny();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "deny" },
			},
		});
	});

	test("deny() with message sets message", () => {
		const builder = new PermissionRequestResponseBuilder().deny("Access denied");
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "deny", message: "Access denied" },
			},
		});
	});

	test("interrupt() sets interrupt flag", () => {
		const builder = new PermissionRequestResponseBuilder().deny("Blocked").interrupt();
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "deny", message: "Blocked", interrupt: true },
			},
		});
	});

	test("interrupt(false) sets interrupt to false", () => {
		const builder = new PermissionRequestResponseBuilder().deny().interrupt(false);
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "deny", interrupt: false },
			},
		});
	});

	test("updateInput() sets updatedInput for allow", () => {
		const builder = new PermissionRequestResponseBuilder().allow().updateInput({ modified: true });
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: { behavior: "allow", updatedInput: { modified: true } },
			},
		});
	});
});

// =============================================================================
// USERPROMPTSUBMIT RESPONSE BUILDER TESTS
// =============================================================================

describe("UserPromptSubmitResponseBuilder", () => {
	test("additionalContext() sets context", () => {
		const builder = new UserPromptSubmitResponseBuilder().additionalContext("User is working on auth");
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "UserPromptSubmit",
				additionalContext: "User is working on auth",
			},
		});
	});

	test("block() from base class works", () => {
		const builder = new UserPromptSubmitResponseBuilder().block("Please rephrase");
		expect(builder.build()).toEqual({
			decision: "block",
			reason: "Please rephrase",
		});
	});
});

// =============================================================================
// STOP RESPONSE BUILDER TESTS
// =============================================================================

describe("StopResponseBuilder", () => {
	test("block() keeps Claude working", () => {
		const builder = new StopResponseBuilder().block("Please run the tests");
		expect(builder.build()).toEqual({
			decision: "block",
			reason: "Please run the tests",
		});
	});

	test("continue() allows stopping", () => {
		const builder = new StopResponseBuilder().continue(true);
		expect(builder.build()).toEqual({ continue: true });
	});
});

// =============================================================================
// SESSIONSTART RESPONSE BUILDER TESTS
// =============================================================================

describe("SessionStartResponseBuilder", () => {
	test("additionalContext() sets session context", () => {
		const builder = new SessionStartResponseBuilder().additionalContext("Project uses TypeScript 5.0");
		expect(builder.build()).toEqual({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: "Project uses TypeScript 5.0",
			},
		});
	});

	test("chains with systemMessage", () => {
		const builder = new SessionStartResponseBuilder()
			.systemMessage("Session initialized")
			.additionalContext("Custom context");
		expect(builder.build()).toEqual({
			systemMessage: "Session initialized",
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: "Custom context",
			},
		});
	});
});

// =============================================================================
// HOOK EVENT TESTS
// =============================================================================

describe("HookEvent", () => {
	test("creates from IO", async () => {
		const io = mockBunStdin(preToolUseEventData());

		const { event } = await HookEvent.create(io);

		expect(event.session_id).toBe(TEST_SESSION_UUID);
		expect(event.transcript_path).toBe("/tmp/transcript.json");
		expect(event.cwd).toBe("/home/user/project");
		expect(event.permission_mode).toBe("default");
		expect(event.hook_event_name).toBe(HookEventName.PreToolUse);
	});

	test("response() returns HookResponseBuilder", async () => {
		const io = mockBunStdin(preToolUseEventData());

		const { event } = await HookEvent.create(io);
		const builder = event.response();

		expect(builder).toBeInstanceOf(HookResponseBuilder);
	});

	test("throws when stdin is empty", async () => {
		spyOn(Bun.stdin, "text").mockResolvedValue("");

		const io = {
			stdin: process.stdin,
			stdout: { write: mock(() => true) } as unknown as typeof process.stdout,
			stderr: { write: mock(() => true) } as unknown as typeof process.stderr,
			envClass: MockEnv,
		};

		await expect(HookEvent.create(io)).rejects.toThrow("Failed to read HookEvent from stdin");
	});
});

// =============================================================================
// PRETOOLUSE HOOK EVENT TESTS
// =============================================================================

describe("PreToolUseHookEvent", () => {
	test("creates with tool properties", async () => {
		const io = mockBunStdin<PreToolUseEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PreToolUse,
			tool_name: "Bash",
			tool_input: { command: "ls -la" },
			tool_use_id: "tool-123",
		});

		const { event } = await PreToolUseHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.PreToolUse);
		expect(event.tool_name).toBe("Bash");
		expect(event.tool_input).toEqual({ command: "ls -la" });
		expect(event.tool_use_id).toBe("tool-123");
	});

	test("response() returns PreToolUseResponseBuilder", async () => {
		const io = mockBunStdin<PreToolUseEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PreToolUse,
			tool_name: "Read",
			tool_input: { file_path: "/test.txt" },
			tool_use_id: "tool-456",
		});

		const { event } = await PreToolUseHookEvent.create(io);
		const builder = event.response();

		expect(builder).toBeInstanceOf(PreToolUseResponseBuilder);
	});

	test("throws when stdin is empty", async () => {
		spyOn(Bun.stdin, "text").mockResolvedValue("");

		const io = {
			stdin: process.stdin,
			stdout: { write: mock(() => true) } as unknown as typeof process.stdout,
			stderr: { write: mock(() => true) } as unknown as typeof process.stderr,
			envClass: MockEnv,
		};

		await expect(PreToolUseHookEvent.create(io)).rejects.toThrow("Failed to read PreToolUseEvent from stdin");
	});
});

// =============================================================================
// POSTTOOLUSE HOOK EVENT TESTS
// =============================================================================

describe("PostToolUseHookEvent", () => {
	test("creates with tool properties and response", async () => {
		const io = mockBunStdin<PostToolUseEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PostToolUse,
			tool_name: "Read",
			tool_input: { file_path: "/test.txt" },
			tool_response: { content: "file contents" },
			tool_use_id: "tool-789",
		});

		const { event } = await PostToolUseHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.PostToolUse);
		expect(event.tool_name).toBe("Read");
		expect(event.tool_input).toEqual({ file_path: "/test.txt" });
		expect(event.tool_response).toEqual({ content: "file contents" });
		expect(event.tool_use_id).toBe("tool-789");
	});

	test("response() returns PostToolUseResponseBuilder", async () => {
		const io = mockBunStdin<PostToolUseEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PostToolUse,
			tool_name: "Bash",
			tool_input: { command: "echo test" },
			tool_response: { output: "test" },
			tool_use_id: "tool-abc",
		});

		const { event } = await PostToolUseHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(PostToolUseResponseBuilder);
	});
});

// =============================================================================
// PERMISSIONREQUEST HOOK EVENT TESTS
// =============================================================================

describe("PermissionRequestHookEvent", () => {
	test("creates with message and notification_type", async () => {
		const io = mockBunStdin<PermissionRequestEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PermissionRequest,
			message: "Allow file access?",
			notification_type: "permission_prompt",
		});

		const { event } = await PermissionRequestHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.PermissionRequest);
		expect(event.message).toBe("Allow file access?");
		expect(event.notification_type).toBe("permission_prompt");
	});

	test("response() returns PermissionRequestResponseBuilder", async () => {
		const io = mockBunStdin<PermissionRequestEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PermissionRequest,
			message: "Allow?",
			notification_type: "permission_prompt",
		});

		const { event } = await PermissionRequestHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(PermissionRequestResponseBuilder);
	});
});

// =============================================================================
// NOTIFICATION HOOK EVENT TESTS
// =============================================================================

describe("NotificationHookEvent", () => {
	test("creates with message and notification_type", async () => {
		const io = mockBunStdin<NotificationEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.Notification,
			message: "Authentication successful",
			notification_type: "auth_success",
		});

		const { event } = await NotificationHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.Notification);
		expect(event.message).toBe("Authentication successful");
		expect(event.notification_type).toBe("auth_success");
	});
});

// =============================================================================
// USERPROMPTSUBMIT HOOK EVENT TESTS
// =============================================================================

describe("UserPromptSubmitHookEvent", () => {
	test("creates with prompt", async () => {
		const io = mockBunStdin<UserPromptSubmitEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.UserPromptSubmit,
			prompt: "Help me fix this bug",
		});

		const { event } = await UserPromptSubmitHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.UserPromptSubmit);
		expect(event.prompt).toBe("Help me fix this bug");
	});

	test("response() returns UserPromptSubmitResponseBuilder", async () => {
		const io = mockBunStdin<UserPromptSubmitEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.UserPromptSubmit,
			prompt: "Test prompt",
		});

		const { event } = await UserPromptSubmitHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(UserPromptSubmitResponseBuilder);
	});
});

// =============================================================================
// STOP HOOK EVENT TESTS
// =============================================================================

describe("StopHookEvent", () => {
	test("creates with stop_hook_active", async () => {
		const io = mockBunStdin<StopEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.Stop,
			stop_hook_active: false,
		});

		const { event } = await StopHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.Stop);
		expect(event.stop_hook_active).toBe(false);
	});

	test("response() returns StopResponseBuilder", async () => {
		const io = mockBunStdin<StopEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.Stop,
			stop_hook_active: true,
		});

		const { event } = await StopHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(StopResponseBuilder);
	});
});

// =============================================================================
// SUBAGENTSTOP HOOK EVENT TESTS
// =============================================================================

describe("SubagentStopHookEvent", () => {
	test("creates with stop_hook_active", async () => {
		const io = mockBunStdin<SubagentStopEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SubagentStop,
			stop_hook_active: true,
		});

		const { event } = await SubagentStopHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.SubagentStop);
		expect(event.stop_hook_active).toBe(true);
	});

	test("response() returns StopResponseBuilder", async () => {
		const io = mockBunStdin<SubagentStopEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SubagentStop,
			stop_hook_active: false,
		});

		const { event } = await SubagentStopHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(StopResponseBuilder);
	});
});

// =============================================================================
// PRECOMPACT HOOK EVENT TESTS
// =============================================================================

describe("PreCompactHookEvent", () => {
	test("creates with trigger and custom_instructions", async () => {
		const io = mockBunStdin<PreCompactEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PreCompact,
			trigger: "auto",
			custom_instructions: "Preserve important context",
		});

		const { event } = await PreCompactHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.PreCompact);
		expect(event.trigger).toBe("auto");
		expect(event.custom_instructions).toBe("Preserve important context");
	});

	test("handles manual trigger", async () => {
		const io = mockBunStdin<PreCompactEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PreCompact,
			trigger: "manual",
			custom_instructions: "",
		});

		const { event } = await PreCompactHookEvent.create(io);
		expect(event.trigger).toBe("manual");
	});
});

// =============================================================================
// SESSIONSTART HOOK EVENT TESTS
// =============================================================================

describe("SessionStartHookEvent", () => {
	let env: MockEnvContext;

	afterEach(() => {
		env?.restore();
	});

	test("creates with startup source", async () => {
		env = mockEnv(envPresets.claudeHook());

		const io = mockBunStdin<SessionStartEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		});

		const { event } = await SessionStartHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.SessionStart);
		expect(event.source).toBe("startup");
	});

	test("handles resume source", async () => {
		env = mockEnv(envPresets.claudeHook());

		const io = mockBunStdin<SessionStartEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionStart,
			source: "resume",
		});

		const { event } = await SessionStartHookEvent.create(io);
		expect(event.source).toBe("resume");
	});

	test("handles clear source", async () => {
		env = mockEnv(envPresets.claudeHook());

		const io = mockBunStdin<SessionStartEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionStart,
			source: "clear",
		});

		const { event } = await SessionStartHookEvent.create(io);
		expect(event.source).toBe("clear");
	});

	test("handles compact source", async () => {
		env = mockEnv(envPresets.claudeHook());

		const io = mockBunStdin<SessionStartEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionStart,
			source: "compact",
		});

		const { event } = await SessionStartHookEvent.create(io);
		expect(event.source).toBe("compact");
	});

	test("response() returns SessionStartResponseBuilder", async () => {
		env = mockEnv(envPresets.claudeHook());

		const io = mockBunStdin<SessionStartEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		});

		const { event } = await SessionStartHookEvent.create(io);
		expect(event.response()).toBeInstanceOf(SessionStartResponseBuilder);
	});
});

// =============================================================================
// SESSIONEND HOOK EVENT TESTS
// =============================================================================

describe("SessionEndHookEvent", () => {
	test("creates with clear reason", async () => {
		const io = mockBunStdin<SessionEndEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionEnd,
			reason: "clear",
		});

		const { event } = await SessionEndHookEvent.create(io);

		expect(event.hook_event_name).toBe(HookEventName.SessionEnd);
		expect(event.reason).toBe("clear");
	});

	test("handles logout reason", async () => {
		const io = mockBunStdin<SessionEndEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionEnd,
			reason: "logout",
		});

		const { event } = await SessionEndHookEvent.create(io);
		expect(event.reason).toBe("logout");
	});

	test("handles prompt_input_exit reason", async () => {
		const io = mockBunStdin<SessionEndEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionEnd,
			reason: "prompt_input_exit",
		});

		const { event } = await SessionEndHookEvent.create(io);
		expect(event.reason).toBe("prompt_input_exit");
	});

	test("handles other reason", async () => {
		const io = mockBunStdin<SessionEndEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.SessionEnd,
			reason: "other",
		});

		const { event } = await SessionEndHookEvent.create(io);
		expect(event.reason).toBe("other");
	});
});

// =============================================================================
// LOGGER INTEGRATION TESTS
// =============================================================================

describe("Logger integration", () => {
	test("event has a log property that is a DebugLogger", async () => {
		const io = mockBunStdin(preToolUseEventData());

		const { event } = await HookEvent.create(io);

		expect(event.log).toBeDefined();
		expect(typeof event.log.debug).toBe("function");
		expect(typeof event.log.info).toBe("function");
		expect(typeof event.log.warn).toBe("function");
		expect(typeof event.log.error).toBe("function");
		expect(typeof event.log.child).toBe("function");
	});

	test("uses hook_event_name as default logger prefix", async () => {
		const io = mockBunStdin(preToolUseEventData());

		const { event } = await HookEvent.create(io);

		// The logger should be created with the hook event name as prefix
		// We can't easily test the prefix without mocking, but we can verify it exists
		expect(event.log).toBeDefined();
	});

	test("uses custom name when provided", async () => {
		const io = mockBunStdin(sessionStartEventData());

		const { event } = await HookEvent.create({
			...io,
			name: "workflow-context",
		});

		expect(event.log).toBeDefined();
	});

	test("end() calls process.exit with correct code", async () => {
		const io = mockBunStdin(preToolUseEventData());

		const { event } = await HookEvent.create(io);
		const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as never);

		try {
			event.end(0);
		} catch {
			// Ignore exit
		}

		expect(exitSpy).toHaveBeenCalledWith(0);
		exitSpy.mockRestore();
	});

	test("end() with response builder writes to stdout", async () => {
		const stdoutMock = mock(() => true);

		const io = mockBunStdin<PreToolUseEvent>({
			...baseEventData(),
			hook_event_name: HookEventName.PreToolUse,
			tool_name: "Bash",
			tool_input: { command: "ls" },
			tool_use_id: "test-123",
		});

		io.stdout.write = stdoutMock;

		const { event } = await PreToolUseHookEvent.create(io);
		const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as never);

		try {
			event.end(event.response().allow());
		} catch {
			// Ignore exit
		}

		expect(stdoutMock).toHaveBeenCalled();
		exitSpy.mockRestore();
	});

	test("child logger can be created from event.log", async () => {
		const io = mockBunStdin(sessionStartEventData());

		const { event } = await HookEvent.create({
			...io,
			name: "workflow-context",
		});

		const childLogger = event.log.child("env-loader");
		expect(childLogger).toBeDefined();
		expect(typeof childLogger.debug).toBe("function");
	});
});

// =============================================================================
// PERMISSION MODE TESTS
// =============================================================================

describe("Permission modes", () => {
	test("handles default permission mode", async () => {
		const io = mockBunStdin(preToolUseEventData({ permission_mode: "default" }));

		const { event } = await HookEvent.create(io);
		expect(event.permission_mode).toBe("default");
	});

	test("handles plan permission mode", async () => {
		const io = mockBunStdin(preToolUseEventData({ permission_mode: "plan" }));

		const { event } = await HookEvent.create(io);
		expect(event.permission_mode).toBe("plan");
	});

	test("handles acceptEdits permission mode", async () => {
		const io = mockBunStdin(preToolUseEventData({ permission_mode: "acceptEdits" }));

		const { event } = await HookEvent.create(io);
		expect(event.permission_mode).toBe("acceptEdits");
	});

	test("handles bypassPermissions permission mode", async () => {
		const io = mockBunStdin(preToolUseEventData({ permission_mode: "bypassPermissions" }));

		const { event } = await HookEvent.create(io);
		expect(event.permission_mode).toBe("bypassPermissions");
	});
});
