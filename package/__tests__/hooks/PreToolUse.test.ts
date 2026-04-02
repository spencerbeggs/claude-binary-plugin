import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
	PreToolUseEvent,
	PreToolUseInput,
	PreToolUseOutputSchema,
	PreToolUseResponse,
	VALID_OUTCOME_TAGS,
	toPreToolUseResponse,
} from "../../src/hooks/PreToolUse.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const validSessionId = "550e8400-e29b-41d4-a716-446655440000";
const validToolUseId = "toolu_abc123def456";

const validWireInput = {
	session_id: validSessionId,
	transcript_path: "/tmp/transcript.json",
	cwd: "/home/user/project",
	permission_mode: "default" as const,
	hook_event_name: "PreToolUse" as const,
	agent_id: undefined,
	agent_type: undefined,
	tool_name: "Bash",
	tool_input: { command: "ls -la" },
	tool_use_id: validToolUseId,
};

function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
	return Schema.decodeUnknownSync(schema)(data);
}

// =============================================================================
// 1. PreToolUseInput — decodes valid wire format
// =============================================================================

describe("PreToolUseInput", () => {
	test("decodes valid wire format", () => {
		const result = decode(PreToolUseInput, validWireInput);
		expect(result.session_id).toBe(validSessionId);
		expect(result.hook_event_name).toBe("PreToolUse");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "ls -la" });
		expect(result.tool_use_id).toBe(validToolUseId);
	});

	test("decodes with optional fields omitted", () => {
		const minimal = {
			session_id: validSessionId,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Read",
			tool_input: { file_path: "/tmp/foo.txt" },
			tool_use_id: validToolUseId,
		};
		const result = decode(PreToolUseInput, minimal);
		expect(result.transcript_path).toBeUndefined();
		expect(result.cwd).toBeUndefined();
		expect(result.permission_mode).toBeUndefined();
		expect(result.agent_id).toBeUndefined();
		expect(result.agent_type).toBeUndefined();
	});

	test("rejects wrong hook_event_name", () => {
		const wrong = { ...validWireInput, hook_event_name: "PostToolUse" };
		expect(() => decode(PreToolUseInput, wrong)).toThrow();
	});

	test("rejects missing tool_name", () => {
		const { tool_name: _, ...missing } = validWireInput;
		expect(() => decode(PreToolUseInput, missing)).toThrow();
	});

	test("rejects missing tool_input", () => {
		const { tool_input: _, ...missing } = validWireInput;
		expect(() => decode(PreToolUseInput, missing)).toThrow();
	});

	test("rejects invalid session_id", () => {
		const invalid = { ...validWireInput, session_id: "not-a-uuid" };
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});

	test("rejects invalid permission_mode", () => {
		const invalid = { ...validWireInput, permission_mode: "invalid_mode" };
		expect(() => decode(PreToolUseInput, invalid)).toThrow();
	});
});

// =============================================================================
// 2. PreToolUseEvent.fromInput()
// =============================================================================

describe("PreToolUseEvent.fromInput()", () => {
	test("converts PreToolUseInput to PreToolUseEvent correctly", () => {
		const input = decode(PreToolUseInput, validWireInput);
		const event = PreToolUseEvent.fromInput(input);

		expect(event).toBeInstanceOf(PreToolUseEvent);
		expect(event.session_id).toBe(validSessionId);
		expect(event.hook_event_name).toBe("PreToolUse");
		expect(event.tool_name).toBe("Bash");
		expect(event.tool_input).toEqual({ command: "ls -la" });
		expect(event.tool_use_id).toBe(validToolUseId);
		expect(event.transcript_path).toBe("/tmp/transcript.json");
		expect(event.cwd).toBe("/home/user/project");
		expect(event.permission_mode).toBe("default");
	});

	test("preserves optional fields when present", () => {
		const inputWithAgent = {
			...validWireInput,
			agent_id: "agent-123",
			agent_type: "subagent",
		};
		const input = decode(PreToolUseInput, inputWithAgent);
		const event = PreToolUseEvent.fromInput(input);

		expect(event.agent_id).toBe("agent-123");
		expect(event.agent_type).toBe("subagent");
	});

	test("handles undefined optional fields", () => {
		const minimal = {
			session_id: validSessionId,
			hook_event_name: "PreToolUse" as const,
			tool_name: "Write",
			tool_input: { file_path: "/tmp/out.txt", content: "hello" },
			tool_use_id: validToolUseId,
		};
		const input = decode(PreToolUseInput, minimal);
		const event = PreToolUseEvent.fromInput(input);

		expect(event.transcript_path).toBeUndefined();
		expect(event.cwd).toBeUndefined();
		expect(event.permission_mode).toBeUndefined();
		expect(event.agent_id).toBeUndefined();
		expect(event.agent_type).toBeUndefined();
	});
});

// =============================================================================
// 3. PreToolUseOutputSchema
// =============================================================================

describe("PreToolUseOutputSchema", () => {
	test("accepts valid executed output with allow action", () => {
		const output = {
			status: "executed" as const,
			action: "allow" as const,
			summary: "Tool allowed",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("executed");
		expect((result as typeof output).action).toBe("allow");
	});

	test("accepts executed output with deny action", () => {
		const output = {
			status: "executed" as const,
			action: "deny" as const,
			summary: "Tool denied",
			reason: "Dangerous command",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("executed");
	});

	test("accepts executed output with ask action", () => {
		const output = {
			status: "executed" as const,
			action: "ask" as const,
			summary: "Asking user",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("executed");
	});

	test("accepts executed output with modify action and updatedInput", () => {
		const output = {
			status: "executed" as const,
			action: "modify" as const,
			summary: "Modified input",
			updatedInput: { command: "ls -la --safe" },
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("executed");
	});

	test("accepts skipped output", () => {
		const output = {
			status: "skipped" as const,
			summary: "Tool filter mismatch",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("skipped");
	});

	test("accepts skipped output with reason", () => {
		const output = {
			status: "skipped" as const,
			summary: "Not applicable",
			reason: "Only applies to Bash",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("skipped");
	});

	test("accepts disabled output", () => {
		const output = {
			status: "disabled" as const,
			summary: "Hook disabled",
			reason: "Missing configuration",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("disabled");
	});

	test("accepts cached output", () => {
		const output = {
			status: "cached" as const,
			summary: "Used cached result",
			action: "allow" as const,
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("cached");
	});

	test("accepts error output", () => {
		const output = {
			status: "error" as const,
			summary: "Hook threw exception",
			reason: "Unhandled error in handler",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("error");
	});

	test("accepts timeout output", () => {
		const output = {
			status: "timeout" as const,
			summary: "Hook timed out",
			reason: "Exceeded 30s limit",
		};
		const result = decode(PreToolUseOutputSchema, output);
		expect(result.status).toBe("timeout");
	});

	test("rejects executed output with invalid action", () => {
		const invalid = {
			status: "executed" as const,
			action: "block", // not valid for PreToolUse
			summary: "Invalid",
		};
		expect(() => decode(PreToolUseOutputSchema, invalid)).toThrow();
	});

	test("rejects unknown status", () => {
		const invalid = { status: "pending", summary: "Unknown" };
		expect(() => decode(PreToolUseOutputSchema, invalid)).toThrow();
	});
});

// =============================================================================
// 4. toPreToolUseResponse
// =============================================================================

describe("toPreToolUseResponse", () => {
	test("maps allow action to permissionDecision: allow", () => {
		const output = {
			status: "executed" as const,
			action: "allow" as const,
			summary: "Allowed",
		};
		const response = toPreToolUseResponse(output);
		expect(response).toBeInstanceOf(PreToolUseResponse);
		expect(response.permissionDecision).toBe("allow");
		expect(response.reason).toBeUndefined();
	});

	test("maps deny action to permissionDecision: deny", () => {
		const output = {
			status: "executed" as const,
			action: "deny" as const,
			summary: "Denied",
			reason: "Dangerous",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("deny");
		expect(response.reason).toBe("Dangerous");
	});

	test("maps ask action to permissionDecision: ask", () => {
		const output = {
			status: "executed" as const,
			action: "ask" as const,
			summary: "Asking user",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("ask");
	});

	test("maps modify action to permissionDecision: allow (default)", () => {
		const output = {
			status: "executed" as const,
			action: "modify" as const,
			summary: "Modified",
			updatedInput: { command: "safe-command" },
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("allow");
		expect(response.updatedInput).toEqual({ command: "safe-command" });
	});

	test("maps skipped output to permissionDecision: allow (default)", () => {
		const output = {
			status: "skipped" as const,
			summary: "Skipped",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("allow");
		expect(response.reason).toBeUndefined();
	});

	test("maps error output to permissionDecision: allow (default)", () => {
		const output = {
			status: "error" as const,
			summary: "Error",
			reason: "Handler crashed",
		};
		const response = toPreToolUseResponse(output);
		// Error state falls through to allow (no blocking on error)
		expect(response.permissionDecision).toBe("allow");
	});

	test("preserves reason when present", () => {
		const output = {
			status: "executed" as const,
			action: "deny" as const,
			summary: "Denied with reason",
			reason: "Command writes to /etc",
		};
		const response = toPreToolUseResponse(output);
		expect(response.reason).toBe("Command writes to /etc");
	});
});

// =============================================================================
// 5. VALID_OUTCOME_TAGS
// =============================================================================

describe("VALID_OUTCOME_TAGS", () => {
	test("contains Allow", () => {
		expect(VALID_OUTCOME_TAGS.has("Allow")).toBe(true);
	});

	test("contains Deny", () => {
		expect(VALID_OUTCOME_TAGS.has("Deny")).toBe(true);
	});

	test("contains Ask", () => {
		expect(VALID_OUTCOME_TAGS.has("Ask")).toBe(true);
	});

	test("contains Modify", () => {
		expect(VALID_OUTCOME_TAGS.has("Modify")).toBe(true);
	});

	test("contains Skip", () => {
		expect(VALID_OUTCOME_TAGS.has("Skip")).toBe(true);
	});

	test("has exactly 5 tags", () => {
		expect(VALID_OUTCOME_TAGS.size).toBe(5);
	});

	test("does not contain invalid tags", () => {
		expect(VALID_OUTCOME_TAGS.has("Block")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("Continue")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("AddContext")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("NoAction")).toBe(false);
	});
});
