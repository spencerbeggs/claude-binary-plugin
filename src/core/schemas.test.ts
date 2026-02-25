import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { HookEventSchemas } from "./schemas.js";

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
// HOOK EVENT SCHEMAS NAMESPACE TESTS
// =============================================================================

describe("HookEventSchemas class", () => {
	test("exposes registry with metadata", () => {
		expect(HookEventSchemas.registry).toBeDefined();
		// Registry is a Zod registry containing schema metadata
		expect(typeof HookEventSchemas.registry.get).toBe("function");
	});

	test("PreToolUse schema has registry metadata", () => {
		const meta = HookEventSchemas.registry.get(HookEventSchemas.PreToolUse);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("tool");
		expect(meta?.capabilities).toContain("allow");
		expect(meta?.capabilities).toContain("deny");
		expect(meta?.capabilities).toContain("modify");
	});

	test("PostToolUse schema has registry metadata", () => {
		const meta = HookEventSchemas.registry.get(HookEventSchemas.PostToolUse);
		expect(meta).toBeDefined();
		expect(meta?.description).toContain("tool completes");
		expect(meta?.capabilities).toContain("context");
	});

	test("SessionStart schema has registry metadata", () => {
		const meta = HookEventSchemas.registry.get(HookEventSchemas.SessionStart);
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
			expect(HookEventSchemas.registry.has(schema)).toBe(true);
			const meta = HookEventSchemas.registry.get(schema);
			expect(meta?.description).toBeDefined();
		}
	});
});

// =============================================================================
// INDIVIDUAL SCHEMA TESTS
// =============================================================================

describe("HookEventSchemas.PreToolUse", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.PreToolUse.parse(validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls -la" });
	});

	test("rejects missing tool_name", () => {
		const invalid = { ...validPreToolUseEvent, tool_name: undefined };
		expect(() => HookEventSchemas.PreToolUse.parse(invalid)).toThrow(z.ZodError);
	});

	test("rejects invalid session_id format", () => {
		const invalid = { ...validPreToolUseEvent, session_id: "not-a-uuid" };
		expect(() => HookEventSchemas.PreToolUse.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.PostToolUse", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.PostToolUse.parse(validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("rejects missing tool_response", () => {
		const invalid = { ...validPostToolUseEvent, tool_response: undefined };
		expect(() => HookEventSchemas.PostToolUse.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.SessionStart", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.SessionStart.parse(validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
		expect(result.source).toBe("startup");
	});

	test("accepts all valid sources", () => {
		for (const source of ["startup", "resume", "clear", "compact"] as const) {
			const event = { ...validSessionStartEvent, source };
			expect(() => HookEventSchemas.SessionStart.parse(event)).not.toThrow();
		}
	});

	test("rejects invalid source", () => {
		const invalid = { ...validSessionStartEvent, source: "invalid" };
		expect(() => HookEventSchemas.SessionStart.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.SessionEnd", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.SessionEnd.parse(validSessionEndEvent);
		expect(result.hook_event_name).toBe("SessionEnd");
		expect(result.reason).toBe("clear");
	});

	test("accepts all valid reasons", () => {
		for (const reason of ["clear", "logout", "prompt_input_exit", "other"] as const) {
			const event = { ...validSessionEndEvent, reason };
			expect(() => HookEventSchemas.SessionEnd.parse(event)).not.toThrow();
		}
	});
});

describe("HookEventSchemas.UserPromptSubmit", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.UserPromptSubmit.parse(validUserPromptSubmitEvent);
		expect(result.hook_event_name).toBe("UserPromptSubmit");
		expect(result.prompt).toBe("Hello, Claude!");
	});
});

describe("HookEventSchemas.Stop", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.Stop.parse(validStopEvent);
		expect(result.hook_event_name).toBe("Stop");
		expect(result.stop_hook_active).toBe(false);
	});

	test("rejects non-boolean stop_hook_active", () => {
		const invalid = { ...validStopEvent, stop_hook_active: "false" };
		expect(() => HookEventSchemas.Stop.parse(invalid)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.SubagentStop", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.SubagentStop.parse(validSubagentStopEvent);
		expect(result.hook_event_name).toBe("SubagentStop");
		expect(result.stop_hook_active).toBe(true);
	});
});

describe("HookEventSchemas.PreCompact", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.PreCompact.parse(validPreCompactEvent);
		expect(result.hook_event_name).toBe("PreCompact");
		expect(result.trigger).toBe("auto");
		expect(result.custom_instructions).toBe("Preserve important context");
	});

	test("accepts all valid triggers", () => {
		for (const trigger of ["manual", "auto"] as const) {
			const event = { ...validPreCompactEvent, trigger };
			expect(() => HookEventSchemas.PreCompact.parse(event)).not.toThrow();
		}
	});
});

describe("HookEventSchemas.PermissionRequest", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.PermissionRequest.parse(validPermissionRequestEvent);
		expect(result.hook_event_name).toBe("PermissionRequest");
		expect(result.message).toBe("Allow bash command?");
	});
});

describe("HookEventSchemas.Notification", () => {
	test("parses valid event", () => {
		const result = HookEventSchemas.Notification.parse(validNotificationEvent);
		expect(result.hook_event_name).toBe("Notification");
		expect(result.notification_type).toBe("idle_prompt");
	});
});

// =============================================================================
// DISCRIMINATED UNION TESTS
// =============================================================================

describe("HookEventSchemas.Any (discriminated union)", () => {
	test("parses PreToolUse event", () => {
		const result = HookEventSchemas.Any.parse(validPreToolUseEvent);
		expect(result.hook_event_name).toBe("PreToolUse");
		if (result.hook_event_name === "PreToolUse") {
			expect(result.tool_name).toBe("Bash");
		}
	});

	test("parses PostToolUse event", () => {
		const result = HookEventSchemas.Any.parse(validPostToolUseEvent);
		expect(result.hook_event_name).toBe("PostToolUse");
	});

	test("parses SessionStart event", () => {
		const result = HookEventSchemas.Any.parse(validSessionStartEvent);
		expect(result.hook_event_name).toBe("SessionStart");
	});

	test("parses SessionEnd event", () => {
		const result = HookEventSchemas.Any.parse(validSessionEndEvent);
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
			expect(() => HookEventSchemas.Any.parse(event)).not.toThrow();
		}
	});

	test("rejects unknown hook_event_name", () => {
		const invalid = { ...baseEventFields, hook_event_name: "UnknownEvent" };
		expect(() => HookEventSchemas.Any.parse(invalid)).toThrow(z.ZodError);
	});

	test("rejects missing discriminator field", () => {
		const invalid = { ...baseEventFields };
		expect(() => HookEventSchemas.Any.parse(invalid)).toThrow(z.ZodError);
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

	test("throws ZodError on invalid data", () => {
		const json = JSON.stringify({ invalid: "data" });
		expect(() => HookEventSchemas.parse(json)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.parsePreToolUse", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		const result = HookEventSchemas.parsePreToolUse(json);
		expect(result.tool_name).toBe("Bash");
	});

	test("throws ZodError on wrong event type", () => {
		const json = JSON.stringify(validSessionStartEvent);
		expect(() => HookEventSchemas.parsePreToolUse(json)).toThrow(z.ZodError);
	});
});

describe("HookEventSchemas.parsePostToolUse", () => {
	test("parses valid JSON string", () => {
		const json = JSON.stringify(validPostToolUseEvent);
		const result = HookEventSchemas.parsePostToolUse(json);
		expect(result.tool_name).toBe("Read");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("throws ZodError on wrong event type", () => {
		const json = JSON.stringify(validPreToolUseEvent);
		expect(() => HookEventSchemas.parsePostToolUse(json)).toThrow(z.ZodError);
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
