import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
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

const baseInputFields = {
	session_id: "550e8400-e29b-41d4-a716-446655440000",
	transcript_path: "/tmp/transcript.json",
	cwd: "/home/user/project",
	permission_mode: "default" as const,
};

// Helper to decode with a schema directly
function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
	return Schema.decodeUnknownSync(schema)(data);
}

// =============================================================================
// SHARED BASE FIELD TESTS
// =============================================================================

describe("HookInputBase shared fields", () => {
	test("optional fields can be omitted", () => {
		const minimal = {
			session_id: "550e8400-e29b-41d4-a716-446655440000",
			hook_event_name: "SessionStart" as const,
			source: "startup" as const,
		};
		const result = decode(SessionStartInput, minimal);
		expect(result.session_id).toBeDefined();
		expect(result.transcript_path).toBeUndefined();
		expect(result.cwd).toBeUndefined();
		expect(result.permission_mode).toBeUndefined();
	});

	test("rejects invalid session_id format", () => {
		const invalid = {
			...baseInputFields,
			session_id: "not-a-uuid",
			hook_event_name: "SessionStart" as const,
			source: "startup" as const,
		};
		expect(() => decode(SessionStartInput, invalid)).toThrow();
	});

	test("rejects invalid permission_mode", () => {
		const invalid = {
			...baseInputFields,
			permission_mode: "invalid_mode",
			hook_event_name: "SessionStart" as const,
			source: "startup" as const,
		};
		expect(() => decode(SessionStartInput, invalid)).toThrow();
	});
});

// =============================================================================
// PreToolUseInput
// =============================================================================

describe("PreToolUseInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "PreToolUse" as const,
		tool_name: "Bash",
		tool_input: { command: "ls -la" },
		tool_use_id: "tool-123",
	};

	test("decodes valid input", () => {
		const result = decode(PreToolUseInput, validData);
		expect(result.hook_event_name).toBe("PreToolUse");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls -la" });
		expect(result.tool_use_id).toBe("tool-123");
	});

	test("result is instanceof PreToolUseInput", () => {
		const result = decode(PreToolUseInput, validData);
		expect(result).toBeInstanceOf(PreToolUseInput);
	});

	test("rejects missing tool_name", () => {
		const { tool_name: _, ...invalid } = validData;
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});

	test("rejects missing tool_input", () => {
		const { tool_input: _, ...invalid } = validData;
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});

	test("rejects missing tool_use_id", () => {
		const { tool_use_id: _, ...invalid } = validData;
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});

	test("rejects wrong hook_event_name", () => {
		const invalid = { ...validData, hook_event_name: "PostToolUse" };
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});
});

// =============================================================================
// PostToolUseInput
// =============================================================================

describe("PostToolUseInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "PostToolUse" as const,
		tool_name: "Read",
		tool_input: { file_path: "/tmp/test.txt" },
		tool_response: { content: "file contents" },
		tool_use_id: "tool-456",
	};

	test("decodes valid input", () => {
		const result = decode(PostToolUseInput, validData);
		expect(result.hook_event_name).toBe("PostToolUse");
		expect(result.tool_name).toBe("Read");
		expect(result.tool_response).toEqual({ content: "file contents" });
	});

	test("result is instanceof PostToolUseInput", () => {
		const result = decode(PostToolUseInput, validData);
		expect(result).toBeInstanceOf(PostToolUseInput);
	});

	test("rejects missing tool_response", () => {
		const { tool_response: _, ...invalid } = validData;
		expect(() => decode(PostToolUseInput, invalid)).toThrow();
	});
});

// =============================================================================
// PermissionRequestInput
// =============================================================================

describe("PermissionRequestInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "PermissionRequest" as const,
		message: "Allow bash command?",
		notification_type: "permission_prompt",
	};

	test("decodes valid input", () => {
		const result = decode(PermissionRequestInput, validData);
		expect(result.hook_event_name).toBe("PermissionRequest");
		expect(result.message).toBe("Allow bash command?");
		expect(result.notification_type).toBe("permission_prompt");
	});

	test("result is instanceof PermissionRequestInput", () => {
		const result = decode(PermissionRequestInput, validData);
		expect(result).toBeInstanceOf(PermissionRequestInput);
	});

	test("rejects missing message", () => {
		const { message: _, ...invalid } = validData;
		expect(() => decode(PermissionRequestInput, invalid)).toThrow();
	});
});

// =============================================================================
// NotificationInput
// =============================================================================

describe("NotificationInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "Notification" as const,
		message: "Task completed",
		notification_type: "idle_prompt",
	};

	test("decodes valid input", () => {
		const result = decode(NotificationInput, validData);
		expect(result.hook_event_name).toBe("Notification");
		expect(result.message).toBe("Task completed");
		expect(result.notification_type).toBe("idle_prompt");
	});

	test("result is instanceof NotificationInput", () => {
		const result = decode(NotificationInput, validData);
		expect(result).toBeInstanceOf(NotificationInput);
	});
});

// =============================================================================
// UserPromptSubmitInput
// =============================================================================

describe("UserPromptSubmitInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "UserPromptSubmit" as const,
		prompt: "Hello, Claude!",
	};

	test("decodes valid input", () => {
		const result = decode(UserPromptSubmitInput, validData);
		expect(result.hook_event_name).toBe("UserPromptSubmit");
		expect(result.prompt).toBe("Hello, Claude!");
	});

	test("result is instanceof UserPromptSubmitInput", () => {
		const result = decode(UserPromptSubmitInput, validData);
		expect(result).toBeInstanceOf(UserPromptSubmitInput);
	});

	test("rejects missing prompt", () => {
		const { prompt: _, ...invalid } = validData;
		expect(() => decode(UserPromptSubmitInput, invalid)).toThrow();
	});
});

// =============================================================================
// StopInput
// =============================================================================

describe("StopInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "Stop" as const,
		stop_hook_active: false,
	};

	test("decodes valid input", () => {
		const result = decode(StopInput, validData);
		expect(result.hook_event_name).toBe("Stop");
		expect(result.stop_hook_active).toBe(false);
	});

	test("result is instanceof StopInput", () => {
		const result = decode(StopInput, validData);
		expect(result).toBeInstanceOf(StopInput);
	});

	test("rejects non-boolean stop_hook_active", () => {
		const invalid = { ...validData, stop_hook_active: "false" };
		expect(() => decode(StopInput, invalid)).toThrow();
	});
});

// =============================================================================
// SubagentStopInput
// =============================================================================

describe("SubagentStopInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "SubagentStop" as const,
		stop_hook_active: true,
	};

	test("decodes valid input", () => {
		const result = decode(SubagentStopInput, validData);
		expect(result.hook_event_name).toBe("SubagentStop");
		expect(result.stop_hook_active).toBe(true);
	});

	test("result is instanceof SubagentStopInput", () => {
		const result = decode(SubagentStopInput, validData);
		expect(result).toBeInstanceOf(SubagentStopInput);
	});
});

// =============================================================================
// PreCompactInput
// =============================================================================

describe("PreCompactInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "PreCompact" as const,
		trigger: "auto" as const,
		custom_instructions: "Preserve important context",
	};

	test("decodes valid input", () => {
		const result = decode(PreCompactInput, validData);
		expect(result.hook_event_name).toBe("PreCompact");
		expect(result.trigger).toBe("auto");
		expect(result.custom_instructions).toBe("Preserve important context");
	});

	test("result is instanceof PreCompactInput", () => {
		const result = decode(PreCompactInput, validData);
		expect(result).toBeInstanceOf(PreCompactInput);
	});

	test("accepts all valid triggers", () => {
		for (const trigger of ["manual", "auto"] as const) {
			const data = { ...validData, trigger };
			expect(() => decode(PreCompactInput, data)).not.toThrow();
		}
	});

	test("rejects invalid trigger", () => {
		const invalid = { ...validData, trigger: "invalid" };
		expect(() => decode(PreCompactInput, invalid)).toThrow();
	});
});

// =============================================================================
// SessionStartInput
// =============================================================================

describe("SessionStartInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "SessionStart" as const,
		source: "startup" as const,
	};

	test("decodes valid input", () => {
		const result = decode(SessionStartInput, validData);
		expect(result.hook_event_name).toBe("SessionStart");
		expect(result.source).toBe("startup");
	});

	test("result is instanceof SessionStartInput", () => {
		const result = decode(SessionStartInput, validData);
		expect(result).toBeInstanceOf(SessionStartInput);
	});

	test("accepts all valid sources", () => {
		for (const source of ["startup", "resume", "clear", "compact"] as const) {
			const data = { ...validData, source };
			expect(() => decode(SessionStartInput, data)).not.toThrow();
		}
	});

	test("rejects invalid source", () => {
		const invalid = { ...validData, source: "invalid" };
		expect(() => decode(SessionStartInput, invalid)).toThrow();
	});
});

// =============================================================================
// SessionEndInput
// =============================================================================

describe("SessionEndInput", () => {
	const validData = {
		...baseInputFields,
		hook_event_name: "SessionEnd" as const,
		reason: "clear" as const,
	};

	test("decodes valid input", () => {
		const result = decode(SessionEndInput, validData);
		expect(result.hook_event_name).toBe("SessionEnd");
		expect(result.reason).toBe("clear");
	});

	test("result is instanceof SessionEndInput", () => {
		const result = decode(SessionEndInput, validData);
		expect(result).toBeInstanceOf(SessionEndInput);
	});

	test("accepts all valid reasons", () => {
		for (const reason of ["clear", "logout", "prompt_input_exit", "other"] as const) {
			const data = { ...validData, reason };
			expect(() => decode(SessionEndInput, data)).not.toThrow();
		}
	});

	test("rejects invalid reason", () => {
		const invalid = { ...validData, reason: "invalid" };
		expect(() => decode(SessionEndInput, invalid)).toThrow();
	});
});

// =============================================================================
// INVALID INPUT TESTS
// =============================================================================

describe("Invalid inputs", () => {
	test("invalid hook_event_name value fails decode", () => {
		const invalid = {
			...baseInputFields,
			hook_event_name: "UnknownEvent",
			tool_name: "Bash",
			tool_input: {},
			tool_use_id: "tool-123",
		};
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});

	test("completely invalid object fails decode", () => {
		expect(() => decode(PreToolUseInput, { foo: "bar" })).toThrow();
	});

	test("null fails decode", () => {
		expect(() => decode(PreToolUseInput, null)).toThrow();
	});

	test("string fails decode", () => {
		expect(() => decode(PreToolUseInput, "not an object")).toThrow();
	});
});
