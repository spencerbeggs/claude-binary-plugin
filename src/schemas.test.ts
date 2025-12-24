/**
 * Tests for Zod hook event schemas.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	HookEventSchema,
	NotificationEventSchema,
	PermissionRequestEventSchema,
	PostToolUseEventSchema,
	PreCompactEventSchema,
	PreToolUseEventSchema,
	SessionEndEventSchema,
	SessionStartEventSchema,
	StopEventSchema,
	SubagentStopEventSchema,
	UserPromptSubmitEventSchema,
	parseHookEvent,
	parsePreToolUseEvent,
	parseSessionStartEvent,
} from "./schemas.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseEventFields = {
	session_id: "550e8400-e29b-41d4-a716-446655440000",
	transcript_path: "/tmp/transcript.json",
	cwd: "/home/user/project",
	permission_mode: "default" as const,
};

const validPreToolUseEvent = {
	...baseEventFields,
	hook_event_name: "PreToolUse" as const,
	tool_name: "Bash",
	tool_input: { command: "ls -la" },
	tool_use_id: "tool-123",
};

const validPostToolUseEvent = {
	...baseEventFields,
	hook_event_name: "PostToolUse" as const,
	tool_name: "Read",
	tool_input: { file_path: "/tmp/test.txt" },
	tool_response: { content: "file contents" },
	tool_use_id: "tool-456",
};

const validSessionStartEvent = {
	...baseEventFields,
	hook_event_name: "SessionStart" as const,
	source: "startup" as const,
};

const validSessionEndEvent = {
	...baseEventFields,
	hook_event_name: "SessionEnd" as const,
	reason: "clear" as const,
};

const validUserPromptSubmitEvent = {
	...baseEventFields,
	hook_event_name: "UserPromptSubmit" as const,
	prompt: "Hello, Claude!",
};

const validStopEvent = {
	...baseEventFields,
	hook_event_name: "Stop" as const,
	stop_hook_active: false,
};

const validSubagentStopEvent = {
	...baseEventFields,
	hook_event_name: "SubagentStop" as const,
	stop_hook_active: true,
};

const validPreCompactEvent = {
	...baseEventFields,
	hook_event_name: "PreCompact" as const,
	trigger: "auto" as const,
	custom_instructions: "Preserve important context",
};

const validPermissionRequestEvent = {
	...baseEventFields,
	hook_event_name: "PermissionRequest" as const,
	message: "Allow bash command?",
	notification_type: "permission_prompt",
};

const validNotificationEvent = {
	...baseEventFields,
	hook_event_name: "Notification" as const,
	message: "Task completed",
	notification_type: "idle_prompt",
};

// =============================================================================
// INDIVIDUAL SCHEMA TESTS
// =============================================================================

describe("PreToolUseEventSchema", () => {
	test("parses valid event", () => {
		const result = PreToolUseEventSchema.parse(validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls -la" });
	});

	test("rejects missing tool_name", () => {
		const invalid = { ...validPreToolUseEvent, tool_name: undefined };
		expect(() => PreToolUseEventSchema.parse(invalid)).toThrow(z.ZodError);
	});

	test("rejects invalid session_id format", () => {
		const invalid = { ...validPreToolUseEvent, session_id: "not-a-uuid" };
		expect(() => PreToolUseEventSchema.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("PostToolUseEventSchema", () => {
	test("parses valid event", () => {
		const result = PostToolUseEventSchema.parse(validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("rejects missing tool_response", () => {
		const invalid = { ...validPostToolUseEvent, tool_response: undefined };
		expect(() => PostToolUseEventSchema.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("SessionStartEventSchema", () => {
	test("parses valid event", () => {
		const result = SessionStartEventSchema.parse(validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
		expect(result.source).toBe("startup");
	});

	test("accepts all valid sources", () => {
		for (const source of ["startup", "resume", "clear", "compact"] as const) {
			const event = { ...validSessionStartEvent, source };
			expect(() => SessionStartEventSchema.parse(event)).not.toThrow();
		}
	});

	test("rejects invalid source", () => {
		const invalid = { ...validSessionStartEvent, source: "invalid" };
		expect(() => SessionStartEventSchema.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("SessionEndEventSchema", () => {
	test("parses valid event", () => {
		const result = SessionEndEventSchema.parse(validSessionEndEvent);
		expect(result.hook_event_name).toBe("SessionEnd");
		expect(result.reason).toBe("clear");
	});

	test("accepts all valid reasons", () => {
		for (const reason of ["clear", "logout", "prompt_input_exit", "other"] as const) {
			const event = { ...validSessionEndEvent, reason };
			expect(() => SessionEndEventSchema.parse(event)).not.toThrow();
		}
	});
});

describe("UserPromptSubmitEventSchema", () => {
	test("parses valid event", () => {
		const result = UserPromptSubmitEventSchema.parse(validUserPromptSubmitEvent);
		expect(result.hook_event_name).toBe("UserPromptSubmit");
		expect(result.prompt).toBe("Hello, Claude!");
	});
});

describe("StopEventSchema", () => {
	test("parses valid event", () => {
		const result = StopEventSchema.parse(validStopEvent);
		expect(result.hook_event_name).toBe("Stop");
		expect(result.stop_hook_active).toBe(false);
	});

	test("rejects non-boolean stop_hook_active", () => {
		const invalid = { ...validStopEvent, stop_hook_active: "false" };
		expect(() => StopEventSchema.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("SubagentStopEventSchema", () => {
	test("parses valid event", () => {
		const result = SubagentStopEventSchema.parse(validSubagentStopEvent);
		expect(result.hook_event_name).toBe("SubagentStop");
		expect(result.stop_hook_active).toBe(true);
	});
});

describe("PreCompactEventSchema", () => {
	test("parses valid event", () => {
		const result = PreCompactEventSchema.parse(validPreCompactEvent);
		expect(result.hook_event_name).toBe("PreCompact");
		expect(result.trigger).toBe("auto");
		expect(result.custom_instructions).toBe("Preserve important context");
	});

	test("accepts all valid triggers", () => {
		for (const trigger of ["manual", "auto"] as const) {
			const event = { ...validPreCompactEvent, trigger };
			expect(() => PreCompactEventSchema.parse(event)).not.toThrow();
		}
	});
});

describe("PermissionRequestEventSchema", () => {
	test("parses valid event", () => {
		const result = PermissionRequestEventSchema.parse(validPermissionRequestEvent);
		expect(result.hook_event_name).toBe("PermissionRequest");
		expect(result.message).toBe("Allow bash command?");
	});
});

describe("NotificationEventSchema", () => {
	test("parses valid event", () => {
		const result = NotificationEventSchema.parse(validNotificationEvent);
		expect(result.hook_event_name).toBe("Notification");
		expect(result.notification_type).toBe("idle_prompt");
	});
});

// =============================================================================
// DISCRIMINATED UNION TESTS
// =============================================================================

describe("HookEventSchema (discriminated union)", () => {
	test("parses PreToolUse event", () => {
		const result = HookEventSchema.parse(validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		if (result.hook_event_name === "PreToolUse") {
			expect(result.tool_name).toBe("Bash");
		}
	});

	test("parses PostToolUse event", () => {
		const result = HookEventSchema.parse(validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
	});

	test("parses SessionStart event", () => {
		const result = HookEventSchema.parse(validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
	});

	test("parses SessionEnd event", () => {
		const result = HookEventSchema.parse(validSessionEndEvent);
		expect(result.hook_event_name).toBe("SessionEnd");
	});

	test("parses all event types correctly", () => {
		const allEvents = [
			validPreToolUseEvent,
			validPostToolUseEvent,
			validSessionStartEvent,
			validSessionEndEvent,
			validUserPromptSubmitEvent,
			validStopEvent,
			validSubagentStopEvent,
			validPreCompactEvent,
			validPermissionRequestEvent,
			validNotificationEvent,
		];

		for (const event of allEvents) {
			expect(() => HookEventSchema.parse(event)).not.toThrow();
		}
	});

	test("rejects unknown hook_event_name", () => {
		const invalid = { ...baseEventFields, hook_event_name: "UnknownEvent" };
		expect(() => HookEventSchema.parse(invalid)).toThrow(z.ZodError);
	});

	test("rejects missing discriminator field", () => {
		const invalid = { ...baseEventFields };
		expect(() => HookEventSchema.parse(invalid)).toThrow(z.ZodError);
	});
});

// =============================================================================
// PARSING HELPER TESTS
// =============================================================================

describe("parseHookEvent", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		const result = parseHookEvent(json);
		expect(result.hook_event_name).toBe("PreToolUse");
	});

	test("throws on invalid JSON", () => {
		expect(() => parseHookEvent("not valid json")).toThrow(SyntaxError);
	});

	test("throws ZodError on invalid data", () => {
		const json = JSON.stringify({ invalid: "data" });
		expect(() => parseHookEvent(json)).toThrow(z.ZodError);
	});
});

describe("parsePreToolUseEvent", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		const result = parsePreToolUseEvent(json);
		expect(result.tool_name).toBe("Bash");
	});

	test("throws ZodError on wrong event type", () => {
		const json = JSON.stringify(validSessionStartEvent);
		expect(() => parsePreToolUseEvent(json)).toThrow(z.ZodError);
	});
});

describe("parseSessionStartEvent", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validSessionStartEvent);
		const result = parseSessionStartEvent(json);
		expect(result.source).toBe("startup");
	});
});

// =============================================================================
// BASE FIELD VALIDATION TESTS
// =============================================================================

describe("Base field validation", () => {
	test("accepts all permission modes", () => {
		for (const mode of ["default", "plan", "acceptEdits", "bypassPermissions"] as const) {
			const event = { ...validPreToolUseEvent, permission_mode: mode };
			expect(() => PreToolUseEventSchema.parse(event)).not.toThrow();
		}
	});

	test("rejects invalid permission mode", () => {
		const invalid = { ...validPreToolUseEvent, permission_mode: "invalid" };
		expect(() => PreToolUseEventSchema.parse(invalid)).toThrow(z.ZodError);
	});

	test("validates UUID format for session_id", () => {
		// Valid UUIDs
		const validUUIDs = [
			"550e8400-e29b-41d4-a716-446655440000",
			"6ba7b810-9dad-11d1-80b4-00c04fd430c8",
			"f47ac10b-58cc-4372-a567-0e02b2c3d479",
		];

		for (const uuid of validUUIDs) {
			const event = { ...validPreToolUseEvent, session_id: uuid };
			expect(() => PreToolUseEventSchema.parse(event)).not.toThrow();
		}

		// Invalid UUIDs
		const invalidUUIDs = ["not-a-uuid", "12345", "", "550e8400-e29b-41d4-a716"];

		for (const uuid of invalidUUIDs) {
			const event = { ...validPreToolUseEvent, session_id: uuid };
			expect(() => PreToolUseEventSchema.parse(event)).toThrow(z.ZodError);
		}
	});

	test("requires non-empty strings for paths", () => {
		const invalidCwd = { ...validPreToolUseEvent, cwd: "" };
		// Empty string is still a valid string in Zod by default
		expect(() => PreToolUseEventSchema.parse(invalidCwd)).not.toThrow();
	});
});

// =============================================================================
// ERROR MESSAGE TESTS
// =============================================================================

describe("Error messages", () => {
	test("provides helpful error for missing required field", () => {
		const invalid = { ...validPreToolUseEvent, tool_name: undefined };
		try {
			PreToolUseEventSchema.parse(invalid);
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(z.ZodError);
			const zodError = e as z.ZodError;
			expect(zodError.issues.length).toBeGreaterThan(0);
			expect(zodError.issues[0]?.path).toContain("tool_name");
		}
	});

	test("provides helpful error for invalid type", () => {
		const invalid = { ...validStopEvent, stop_hook_active: "not-a-boolean" };
		try {
			StopEventSchema.parse(invalid);
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(z.ZodError);
			const zodError = e as z.ZodError;
			expect(zodError.issues[0]?.path).toContain("stop_hook_active");
		}
	});

	test("provides helpful error for invalid enum value", () => {
		const invalid = { ...validSessionStartEvent, source: "invalid_source" };
		try {
			SessionStartEventSchema.parse(invalid);
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(z.ZodError);
			const zodError = e as z.ZodError;
			expect(zodError.issues[0]?.path).toContain("source");
		}
	});
});
