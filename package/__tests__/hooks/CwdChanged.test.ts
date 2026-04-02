import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
	CwdChangedEvent,
	CwdChangedInput,
	CwdChangedOutputSchema,
	CwdChangedResponse,
	VALID_OUTCOME_TAGS,
	toCwdChangedResponse,
} from "../../src/hooks/CwdChanged.js";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const validSessionId = "550e8400-e29b-41d4-a716-446655440000";

const validWireInput = {
	session_id: validSessionId,
	hook_event_name: "CwdChanged" as const,
	old_cwd: "/home/user/project",
	new_cwd: "/home/user/other",
};

function decode<A, I>(schema: Schema.Schema<A, I>, data: unknown): A {
	return Schema.decodeUnknownSync(schema)(data);
}

// =============================================================================
// 1. CwdChangedInput
// =============================================================================

describe("CwdChangedInput", () => {
	test("decodes valid wire format", () => {
		const result = decode(CwdChangedInput, validWireInput);
		expect(result.session_id).toBe(validSessionId);
		expect(result.hook_event_name).toBe("CwdChanged");
		expect(result.old_cwd).toBe("/home/user/project");
		expect(result.new_cwd).toBe("/home/user/other");
	});

	test("decodes with optional fields omitted", () => {
		const result = decode(CwdChangedInput, validWireInput);
		expect(result.transcript_path).toBeUndefined();
		expect(result.cwd).toBeUndefined();
		expect(result.permission_mode).toBeUndefined();
		expect(result.agent_id).toBeUndefined();
		expect(result.agent_type).toBeUndefined();
	});

	test("rejects wrong hook_event_name", () => {
		const wrong = { ...validWireInput, hook_event_name: "FileChanged" };
		expect(() => decode(CwdChangedInput, wrong)).toThrow();
	});

	test("rejects missing old_cwd", () => {
		const { old_cwd: _, ...missing } = validWireInput;
		expect(() => decode(CwdChangedInput, missing)).toThrow();
	});

	test("rejects missing new_cwd", () => {
		const { new_cwd: _, ...missing } = validWireInput;
		expect(() => decode(CwdChangedInput, missing)).toThrow();
	});
});

// =============================================================================
// 2. CwdChangedEvent.fromInput()
// =============================================================================

describe("CwdChangedEvent.fromInput()", () => {
	test("converts CwdChangedInput to CwdChangedEvent correctly", () => {
		const input = decode(CwdChangedInput, validWireInput);
		const event = CwdChangedEvent.fromInput(input);

		expect(event).toBeInstanceOf(CwdChangedEvent);
		expect(event.session_id).toBe(validSessionId);
		expect(event.hook_event_name).toBe("CwdChanged");
		expect(event.old_cwd).toBe("/home/user/project");
		expect(event.new_cwd).toBe("/home/user/other");
	});
});

// =============================================================================
// 3. CwdChangedOutputSchema
// =============================================================================

describe("CwdChangedOutputSchema", () => {
	test("accepts valid executed output with none action", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Directory changed",
		};
		const result = decode(CwdChangedOutputSchema, output);
		expect(result.status).toBe("executed");
	});

	test("accepts executed output with watchPaths", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Watching new paths",
			watchPaths: ["/home/user/other/**/*.ts"],
		};
		const result = decode(CwdChangedOutputSchema, output);
		expect(result.status).toBe("executed");
		expect((result as typeof output).watchPaths).toEqual(["/home/user/other/**/*.ts"]);
	});

	test("accepts skipped output", () => {
		const output = {
			status: "skipped" as const,
			summary: "Not applicable",
		};
		const result = decode(CwdChangedOutputSchema, output);
		expect(result.status).toBe("skipped");
	});

	test("accepts disabled output", () => {
		const output = {
			status: "disabled" as const,
			summary: "Hook disabled",
		};
		const result = decode(CwdChangedOutputSchema, output);
		expect(result.status).toBe("disabled");
	});

	test("accepts error output", () => {
		const output = {
			status: "error" as const,
			summary: "Error",
			reason: "Handler crashed",
		};
		const result = decode(CwdChangedOutputSchema, output);
		expect(result.status).toBe("error");
	});
});

// =============================================================================
// 4. toCwdChangedResponse
// =============================================================================

describe("toCwdChangedResponse", () => {
	test("returns empty response when no watchPaths", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "No paths to watch",
		};
		const response = toCwdChangedResponse(output);
		expect(response).toBeInstanceOf(CwdChangedResponse);
		expect(response.watchPaths).toBeUndefined();
	});

	test("returns watchPaths when present", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "Watching paths",
			watchPaths: ["src/**/*.ts", "tests/**/*.ts"],
		};
		const response = toCwdChangedResponse(output);
		expect(response).toBeInstanceOf(CwdChangedResponse);
		expect(response.watchPaths).toEqual(["src/**/*.ts", "tests/**/*.ts"]);
	});

	test("returns empty response for skipped output", () => {
		const output = {
			status: "skipped" as const,
			summary: "Skipped",
		};
		const response = toCwdChangedResponse(output);
		expect(response.watchPaths).toBeUndefined();
	});

	test("returns empty response for error output", () => {
		const output = {
			status: "error" as const,
			summary: "Error",
			reason: "Failed",
		};
		const response = toCwdChangedResponse(output);
		expect(response.watchPaths).toBeUndefined();
	});
});

// =============================================================================
// 5. VALID_OUTCOME_TAGS
// =============================================================================

describe("VALID_OUTCOME_TAGS", () => {
	test("contains WatchPaths", () => {
		expect(VALID_OUTCOME_TAGS.has("WatchPaths")).toBe(true);
	});

	test("contains NoAction", () => {
		expect(VALID_OUTCOME_TAGS.has("NoAction")).toBe(true);
	});

	test("has exactly 2 tags", () => {
		expect(VALID_OUTCOME_TAGS.size).toBe(2);
	});

	test("does not contain invalid tags", () => {
		expect(VALID_OUTCOME_TAGS.has("Block")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("Allow")).toBe(false);
		expect(VALID_OUTCOME_TAGS.has("Continue")).toBe(false);
	});
});
