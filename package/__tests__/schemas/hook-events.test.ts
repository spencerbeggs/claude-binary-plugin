import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
	HookEventSchemas,
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
} from "../../src/schemas/hook-events.js";
import {
	NotificationInput,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopInput,
	SubagentStopInput,
	UserPromptSubmitInput,
} from "../../src/schemas/hook-inputs.js";

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

// Helper to decode with a schema directly (replaces schema.parse())
function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
	return Schema.decodeUnknownSync(schema)(data);
}

// =============================================================================
// HOOK EVENT SCHEMAS NAMESPACE TESTS
// =============================================================================

describe("HookEventSchemas class", () => {
	test("exposes getMetadata helper", () => {
		expect(HookEventSchemas.getMetadata).toBeDefined();
		expect(typeof HookEventSchemas.getMetadata).toBe("function");
	});

	test("PreToolUse schema has annotation metadata", () => {
		const meta = HookEventSchemas.getMetadata(HookEventSchemas.PreToolUse);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("tool");
		expect(meta?.capabilities).toContain("allow");
		expect(meta?.capabilities).toContain("deny");
		expect(meta?.capabilities).toContain("modify");
	});

	test("PostToolUse schema has annotation metadata", () => {
		const meta = HookEventSchemas.getMetadata(HookEventSchemas.PostToolUse);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("tool completes");
		expect(meta?.capabilities).toContain("context");
	});

	test("SessionStart schema has annotation metadata", () => {
		const meta = HookEventSchemas.getMetadata(HookEventSchemas.SessionStart);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("session");
		expect(meta?.capabilities).toContain("context");
	});

	test("all event schemas have metadata", () => {
		const schemas = [
			HookEventSchemas.PreToolUse,
			HookEventSchemas.PostToolUse,
			HookEventSchemas.PermissionRequest,
			HookEventSchemas.Notification,
			HookEventSchemas.UserPromptSubmit,
			HookEventSchemas.Stop,
			HookEventSchemas.SubagentStop,
			HookEventSchemas.PreCompact,
			HookEventSchemas.SessionStart,
			HookEventSchemas.SessionEnd,
		];

		for (const schema of schemas) {
			const meta = HookEventSchemas.getMetadata(schema);
			expect(meta).toBeDefined();
			expect(meta?.description).toBeDefined();
		}
	});
});

// =============================================================================
// INDIVIDUAL SCHEMA TESTS
// =============================================================================

describe("HookEventSchemas.PreToolUse", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.PreToolUse, validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls -la" });
	});

	test("rejects missing tool_name", () => {
		const invalid = { ...validPreToolUseEvent, tool_name: undefined };
		expect(() => decode(HookEventSchemas.PreToolUse, invalid)).toThrow();
	});

	test("rejects invalid session_id format", () => {
		const invalid = { ...validPreToolUseEvent, session_id: "not-a-uuid" };
		expect(() => decode(HookEventSchemas.PreToolUse, invalid)).toThrow();
	});
});

describe("HookEventSchemas.PostToolUse", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.PostToolUse, validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("rejects missing tool_response", () => {
		const invalid = { ...validPostToolUseEvent, tool_response: undefined };
		expect(() => decode(HookEventSchemas.PostToolUse, invalid)).toThrow();
	});
});

describe("HookEventSchemas.SessionStart", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.SessionStart, validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
		expect(result.source).toBe("startup");
	});

	test("accepts all valid sources", () => {
		for (const source of ["startup", "resume", "clear", "compact"] as const) {
			const event = { ...validSessionStartEvent, source };
			expect(() => decode(HookEventSchemas.SessionStart, event)).not.toThrow();
		}
	});

	test("rejects invalid source", () => {
		const invalid = { ...validSessionStartEvent, source: "invalid" };
		expect(() => decode(HookEventSchemas.SessionStart, invalid)).toThrow();
	});
});

describe("HookEventSchemas.SessionEnd", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.SessionEnd, validSessionEndEvent);
		expect(result.hook_event_name).toBe("SessionEnd");
		expect(result.reason).toBe("clear");
	});

	test("accepts all valid reasons", () => {
		for (const reason of ["clear", "logout", "prompt_input_exit", "other"] as const) {
			const event = { ...validSessionEndEvent, reason };
			expect(() => decode(HookEventSchemas.SessionEnd, event)).not.toThrow();
		}
	});
});

describe("HookEventSchemas.UserPromptSubmit", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.UserPromptSubmit, validUserPromptSubmitEvent);
		expect(result.hook_event_name).toBe("UserPromptSubmit");
		expect(result.prompt).toBe("Hello, Claude!");
	});
});

describe("HookEventSchemas.Stop", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.Stop, validStopEvent);
		expect(result.hook_event_name).toBe("Stop");
		expect(result.stop_hook_active).toBe(false);
	});

	test("rejects non-boolean stop_hook_active", () => {
		const invalid = { ...validStopEvent, stop_hook_active: "false" };
		expect(() => decode(HookEventSchemas.Stop, invalid)).toThrow();
	});
});

describe("HookEventSchemas.SubagentStop", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.SubagentStop, validSubagentStopEvent);
		expect(result.hook_event_name).toBe("SubagentStop");
		expect(result.stop_hook_active).toBe(true);
	});
});

describe("HookEventSchemas.PreCompact", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.PreCompact, validPreCompactEvent);
		expect(result.hook_event_name).toBe("PreCompact");
		expect(result.trigger).toBe("auto");
		expect(result.custom_instructions).toBe("Preserve important context");
	});

	test("accepts all valid triggers", () => {
		for (const trigger of ["manual", "auto"] as const) {
			const event = { ...validPreCompactEvent, trigger };
			expect(() => decode(HookEventSchemas.PreCompact, event)).not.toThrow();
		}
	});
});

describe("HookEventSchemas.PermissionRequest", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.PermissionRequest, validPermissionRequestEvent);
		expect(result.hook_event_name).toBe("PermissionRequest");
		expect(result.message).toBe("Allow bash command?");
	});
});

describe("HookEventSchemas.Notification", () => {
	test("parses valid event", () => {
		const result = decode(HookEventSchemas.Notification, validNotificationEvent);
		expect(result.hook_event_name).toBe("Notification");
		expect(result.notification_type).toBe("idle_prompt");
	});
});

// =============================================================================
// DISCRIMINATED UNION TESTS
// =============================================================================

describe("HookEventSchemas.Any (discriminated union)", () => {
	test("parses PreToolUse event", () => {
		const result = decode(HookEventSchemas.Any, validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		if (result.hook_event_name === "PreToolUse") {
			expect(result.tool_name).toBe("Bash");
		}
	});

	test("parses PostToolUse event", () => {
		const result = decode(HookEventSchemas.Any, validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
	});

	test("parses SessionStart event", () => {
		const result = decode(HookEventSchemas.Any, validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
	});

	test("parses SessionEnd event", () => {
		const result = decode(HookEventSchemas.Any, validSessionEndEvent);
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
			expect(() => decode(HookEventSchemas.Any, event)).not.toThrow();
		}
	});

	test("rejects unknown hook_event_name", () => {
		const invalid = { ...baseEventFields, hook_event_name: "UnknownEvent" };
		expect(() => decode(HookEventSchemas.Any, invalid)).toThrow();
	});

	test("rejects missing discriminator field", () => {
		const invalid = { ...baseEventFields };
		expect(() => decode(HookEventSchemas.Any, invalid)).toThrow();
	});
});

// =============================================================================
// PARSING HELPER TESTS
// =============================================================================

describe("HookEventSchemas.parse", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		const result = HookEventSchemas.parse(json);
		expect(result.hook_event_name).toBe("PreToolUse");
	});

	test("throws on invalid JSON", () => {
		expect(() => HookEventSchemas.parse("not valid json")).toThrow(SyntaxError);
	});

	test("throws on invalid data", () => {
		const json = JSON.stringify({ invalid: "data" });
		expect(() => HookEventSchemas.parse(json)).toThrow();
	});
});

describe("HookEventSchemas.parsePreToolUse", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		const result = HookEventSchemas.parsePreToolUse(json);
		expect(result.tool_name).toBe("Bash");
	});

	test("throws on wrong event type", () => {
		const json = JSON.stringify(validSessionStartEvent);
		expect(() => HookEventSchemas.parsePreToolUse(json)).toThrow();
	});
});

describe("HookEventSchemas.parsePostToolUse", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPostToolUseEvent);
		const result = HookEventSchemas.parsePostToolUse(json);
		expect(result.tool_name).toBe("Read");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("throws on wrong event type", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		expect(() => HookEventSchemas.parsePostToolUse(json)).toThrow();
	});
});

describe("HookEventSchemas.parseSessionStart", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validSessionStartEvent);
		const result = HookEventSchemas.parseSessionStart(json);
		expect(result.source).toBe("startup");
	});
});

describe("HookEventSchemas.parseSessionEnd", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validSessionEndEvent);
		const result = HookEventSchemas.parseSessionEnd(json);
		expect(result.reason).toBe("clear");
	});
});

describe("HookEventSchemas.parseUserPromptSubmit", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validUserPromptSubmitEvent);
		const result = HookEventSchemas.parseUserPromptSubmit(json);
		expect(result.prompt).toBe("Hello, Claude!");
	});
});

describe("HookEventSchemas.parseStop", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validStopEvent);
		const result = HookEventSchemas.parseStop(json);
		expect(result.stop_hook_active).toBe(false);
	});
});

describe("HookEventSchemas.parseSubagentStop", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validSubagentStopEvent);
		const result = HookEventSchemas.parseSubagentStop(json);
		expect(result.stop_hook_active).toBe(true);
	});
});

describe("HookEventSchemas.parsePreCompact", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreCompactEvent);
		const result = HookEventSchemas.parsePreCompact(json);
		expect(result.trigger).toBe("auto");
	});
});

describe("HookEventSchemas.parsePermissionRequest", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPermissionRequestEvent);
		const result = HookEventSchemas.parsePermissionRequest(json);
		expect(result.message).toBe("Allow bash command?");
	});
});

describe("HookEventSchemas.parseNotification", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validNotificationEvent);
		const result = HookEventSchemas.parseNotification(json);
		expect(result.notification_type).toBe("idle_prompt");
	});
});

// =============================================================================
// fromInput() TESTS
// =============================================================================

describe("PreToolUseEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(PreToolUseInput)(validPreToolUseEvent);
		const event = PreToolUseEvent.fromInput(input);
		expect(event).toBeInstanceOf(PreToolUseEvent);
		expect(event.hook_event_name).toBe("PreToolUse");
		expect(event.tool_name).toBe("Bash");
		expect(event.tool_input).toEqual({ command: "ls -la" });
		expect(event.tool_use_id).toBe("tool-123");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("PostToolUseEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(PostToolUseInput)(validPostToolUseEvent);
		const event = PostToolUseEvent.fromInput(input);
		expect(event).toBeInstanceOf(PostToolUseEvent);
		expect(event.hook_event_name).toBe("PostToolUse");
		expect(event.tool_name).toBe("Read");
		expect(event.tool_input).toEqual({ file_path: "/tmp/test.txt" });
		expect(event.tool_response).toEqual({ content: "file contents" });
		expect(event.tool_use_id).toBe("tool-456");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("PermissionRequestEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(PermissionRequestInput)(validPermissionRequestEvent);
		const event = PermissionRequestEvent.fromInput(input);
		expect(event).toBeInstanceOf(PermissionRequestEvent);
		expect(event.hook_event_name).toBe("PermissionRequest");
		expect(event.message).toBe("Allow bash command?");
		expect(event.notification_type).toBe("permission_prompt");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("NotificationEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(NotificationInput)(validNotificationEvent);
		const event = NotificationEvent.fromInput(input);
		expect(event).toBeInstanceOf(NotificationEvent);
		expect(event.hook_event_name).toBe("Notification");
		expect(event.message).toBe("Task completed");
		expect(event.notification_type).toBe("idle_prompt");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("UserPromptSubmitEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(UserPromptSubmitInput)(validUserPromptSubmitEvent);
		const event = UserPromptSubmitEvent.fromInput(input);
		expect(event).toBeInstanceOf(UserPromptSubmitEvent);
		expect(event.hook_event_name).toBe("UserPromptSubmit");
		expect(event.prompt).toBe("Hello, Claude!");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("StopEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(StopInput)(validStopEvent);
		const event = StopEvent.fromInput(input);
		expect(event).toBeInstanceOf(StopEvent);
		expect(event.hook_event_name).toBe("Stop");
		expect(event.stop_hook_active).toBe(false);
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("SubagentStopEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(SubagentStopInput)(validSubagentStopEvent);
		const event = SubagentStopEvent.fromInput(input);
		expect(event).toBeInstanceOf(SubagentStopEvent);
		expect(event.hook_event_name).toBe("SubagentStop");
		expect(event.stop_hook_active).toBe(true);
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("PreCompactEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(PreCompactInput)(validPreCompactEvent);
		const event = PreCompactEvent.fromInput(input);
		expect(event).toBeInstanceOf(PreCompactEvent);
		expect(event.hook_event_name).toBe("PreCompact");
		expect(event.trigger).toBe("auto");
		expect(event.custom_instructions).toBe("Preserve important context");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("SessionStartEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(SessionStartInput)(validSessionStartEvent);
		const event = SessionStartEvent.fromInput(input);
		expect(event).toBeInstanceOf(SessionStartEvent);
		expect(event.hook_event_name).toBe("SessionStart");
		expect(event.source).toBe("startup");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

describe("SessionEndEvent.fromInput", () => {
	test("creates event from input", () => {
		const input = Schema.decodeUnknownSync(SessionEndInput)(validSessionEndEvent);
		const event = SessionEndEvent.fromInput(input);
		expect(event).toBeInstanceOf(SessionEndEvent);
		expect(event.hook_event_name).toBe("SessionEnd");
		expect(event.reason).toBe("clear");
		expect(event.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});
