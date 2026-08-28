import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
	PermissionDeniedEvent,
	PermissionDeniedInput,
	PermissionDeniedOutputSchema,
	PermissionDeniedResponse,
	VALID_OUTCOME_TAGS,
	toPermissionDeniedResponse,
} from "../../src/hooks/PermissionDenied.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const validSessionId = "550e8400-e29b-41d4-a716-446655440000";
const validToolUseId = "toolu_abc123def456";

const validWireInput = {
	session_id: validSessionId,
	hook_event_name: "PermissionDenied" as const,
	tool_name: "Bash",
	tool_input: { command: "rm -rf /" },
	tool_use_id: validToolUseId,
};

function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
	return Schema.decodeUnknownSync(schema)(data);
}

// =============================================================================
// 1. PermissionDeniedInput
// =============================================================================

describe("PermissionDeniedInput", () => {
	test("decodes valid wire format", () => {
		const result = decode(PermissionDeniedInput, validWireInput);
		expect(result.session_id).toBe(validSessionId);
		expect(result.hook_event_name).toBe("PermissionDenied");
		expect(result.tool_name).toBe("Bash");
		expect(result.tool_input).toEqual({ command: "rm -rf /" });
		expect(result.tool_use_id).toBe(validToolUseId);
	});

	test("decodes with denial_reason", () => {
		const withReason = {
			...validWireInput,
			denial_reason: "Permission denied by policy",
		};
		const result = decode(PermissionDeniedInput, withReason);
		expect(result.denial_reason).toBe("Permission denied by policy");
	});

	test("decodes with optional fields omitted", () => {
		const result = decode(PermissionDeniedInput, validWireInput);
		expect(result.transcript_path).toBeUndefined();
		expect(result.cwd).toBeUndefined();
		expect(result.permission_mode).toBeUndefined();
		expect(result.agent_id).toBeUndefined();
		expect(result.agent_type).toBeUndefined();
		expect(result.denial_reason).toBeUndefined();
	});

	test("rejects wrong hook_event_name", () => {
		const wrong = { ...validWireInput, hook_event_name: "PermissionRequest" };
		expect(() => decode(PermissionDeniedInput, wrong)).toThrow();
	});

	test("rejects missing tool_name", () => {
		const { tool_name: _, ...missing } = validWireInput;
		expect(() => decode(PermissionDeniedInput, missing)).toThrow();
	});

	test("rejects missing tool_input", () => {
		const { tool_input: _, ...missing } = validWireInput;
		expect(() => decode(PermissionDeniedInput, missing)).toThrow();
	});
});

// =============================================================================
// 2. PermissionDeniedEvent.fromInput()
// =============================================================================

describe("PermissionDeniedEvent.fromInput()", () => {
	test("converts PermissionDeniedInput to PermissionDeniedEvent", () => {
		const input = decode(PermissionDeniedInput, validWireInput);
		const event = PermissionDeniedEvent.fromInput(input);

		expect(event).toBeInstanceOf(PermissionDeniedEvent);
		expect(event.session_id).toBe(validSessionId);
		expect(event.hook_event_name).toBe("PermissionDenied");
		expect(event.tool_name).toBe("Bash");
		expect(event.tool_use_id).toBe(validToolUseId);
	});

	test("preserves denial_reason when present", () => {
		const input = decode(PermissionDeniedInput, {
			...validWireInput,
			denial_reason: "Policy blocked",
		});
		const event = PermissionDeniedEvent.fromInput(input);
		expect(event.denial_reason).toBe("Policy blocked");
	});
});

// =============================================================================
// 3. PermissionDeniedOutputSchema
// =============================================================================

describe("PermissionDeniedOutputSchema", () => {
	test("accepts valid executed output with none action", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Permission denied, no retry",
		};
		const result = decode(PermissionDeniedOutputSchema, output);
		expect(result.status).toBe("executed");
	});

	test("accepts executed output with retry: true", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Permission denied, retry allowed",
			retry: true,
		};
		const result = decode(PermissionDeniedOutputSchema, output);
		expect(result.status).toBe("executed");
		expect((result as typeof output).retry).toBe(true);
	});

	test("accepts skipped output", () => {
		const output = {
			status: "skipped" as const,
			summary: "Skipped",
		};
		const result = decode(PermissionDeniedOutputSchema, output);
		expect(result.status).toBe("skipped");
	});

	test("accepts error output", () => {
		const output = {
			status: "error" as const,
			summary: "Error",
			reason: "Handler failed",
		};
		const result = decode(PermissionDeniedOutputSchema, output);
		expect(result.status).toBe("error");
	});
});

// =============================================================================
// 4. toPermissionDeniedResponse
// =============================================================================

describe("toPermissionDeniedResponse", () => {
	test("returns empty response when retry is not set", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "No retry",
		};
		const response = toPermissionDeniedResponse(output);
		expect(response).toBeInstanceOf(PermissionDeniedResponse);
		expect(response.hookSpecificOutput).toBeUndefined();
	});

	test("returns retry: true when retry is set", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Retry allowed",
			retry: true,
		};
		const response = toPermissionDeniedResponse(output);
		expect(response).toBeInstanceOf(PermissionDeniedResponse);
		expect(response.hookSpecificOutput).toEqual({ retry: true });
	});

	test("returns empty response for skipped output", () => {
		const output = {
			status: "skipped" as const,
			summary: "Skipped",
		};
		const response = toPermissionDeniedResponse(output);
		expect(response.hookSpecificOutput).toBeUndefined();
	});

	test("returns empty response for error output", () => {
		const output = {
			status: "error" as const,
			summary: "Error",
			reason: "Failed",
		};
		const response = toPermissionDeniedResponse(output);
		expect(response.hookSpecificOutput).toBeUndefined();
	});
});

// =============================================================================
// 5. VALID_OUTCOME_TAGS
// =============================================================================

describe("VALID_OUTCOME_TAGS", () => {
	test("contains Retry", () => {
		expect(VALID_OUTCOME_TAGS.has("Retry")).toBe(true);
	});

	test("contains NoAction", () => {
		expect(VALID_OUTCOME_TAGS.has("NoAction")).toBe(true);
	});

	test("has exactly 2 tags", () => {
		expect(VALID_OUTCOME_TAGS.size).toBe(2);
	});

	test("does not contain invalid tags", () => {
		expect(VALID_OUTCOME_TAGS.has("Allow")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("Deny")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("Block")).toBe(false);
	});
});
