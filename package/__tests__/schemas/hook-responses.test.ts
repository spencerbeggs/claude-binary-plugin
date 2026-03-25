import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import {
	PassthroughResponse,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
	toPassthroughResponse,
	toPermissionRequestResponse,
	toPostToolUseResponse,
	toPreToolUseResponse,
	toSessionStartResponse,
	toStopResponse,
	toUserPromptSubmitResponse,
} from "../../src/schemas/hook-responses.js";
import type {
	PassthroughPipelineOutput,
	PermissionRequestPipelineOutput,
	PostToolUsePipelineOutput,
	PreToolUsePipelineOutput,
	SessionStartPipelineOutput,
	StopPipelineOutput,
	UserPromptSubmitPipelineOutput,
} from "../../src/schemas/pipeline-outputs.js";

// =============================================================================
// PRETOOLUSE RESPONSE
// =============================================================================

describe("PreToolUseResponse", () => {
	test("accepts allow decision", () => {
		const data = { permissionDecision: "allow" };
		const result = Schema.decodeUnknownSync(PreToolUseResponse)(data);
		expect(result).toBeInstanceOf(PreToolUseResponse);
		expect(result.permissionDecision).toBe("allow");
	});

	test("accepts deny decision with reason", () => {
		const data = { permissionDecision: "deny", reason: "not allowed" };
		const result = Schema.decodeUnknownSync(PreToolUseResponse)(data);
		expect(result.permissionDecision).toBe("deny");
		expect(result.reason).toBe("not allowed");
	});

	test("accepts ask decision", () => {
		const data = { permissionDecision: "ask" };
		const result = Schema.decodeUnknownSync(PreToolUseResponse)(data);
		expect(result.permissionDecision).toBe("ask");
	});

	test("accepts updatedInput", () => {
		const data = {
			permissionDecision: "allow",
			updatedInput: { command: "ls" },
		};
		const result = Schema.decodeUnknownSync(PreToolUseResponse)(data);
		expect(result.updatedInput).toEqual({ command: "ls" });
	});

	test("rejects missing permissionDecision", () => {
		expect(() => Schema.decodeUnknownSync(PreToolUseResponse)({})).toThrow();
	});

	test("rejects invalid permissionDecision", () => {
		expect(() => Schema.decodeUnknownSync(PreToolUseResponse)({ permissionDecision: "block" })).toThrow();
	});
});

// =============================================================================
// POSTTOOLUSE RESPONSE
// =============================================================================

describe("PostToolUseResponse", () => {
	test("accepts empty object", () => {
		const result = Schema.decodeUnknownSync(PostToolUseResponse)({});
		expect(result).toBeInstanceOf(PostToolUseResponse);
	});

	test("accepts additionalContext", () => {
		const data = { additionalContext: "some context for Claude" };
		const result = Schema.decodeUnknownSync(PostToolUseResponse)(data);
		expect(result.additionalContext).toBe("some context for Claude");
	});

	test("accepts block decision with reason", () => {
		const data = { decision: "block", reason: "bad output" };
		const result = Schema.decodeUnknownSync(PostToolUseResponse)(data);
		expect(result.decision).toBe("block");
		expect(result.reason).toBe("bad output");
	});

	test("rejects invalid decision value", () => {
		expect(() => Schema.decodeUnknownSync(PostToolUseResponse)({ decision: "allow" })).toThrow();
	});
});

// =============================================================================
// SESSIONSTART RESPONSE
// =============================================================================

describe("SessionStartResponse", () => {
	test("accepts empty object", () => {
		const result = Schema.decodeUnknownSync(SessionStartResponse)({});
		expect(result).toBeInstanceOf(SessionStartResponse);
	});

	test("accepts additionalContext", () => {
		const data = { additionalContext: "session context" };
		const result = Schema.decodeUnknownSync(SessionStartResponse)(data);
		expect(result.additionalContext).toBe("session context");
	});
});

// =============================================================================
// STOP RESPONSE
// =============================================================================

describe("StopResponse", () => {
	test("accepts empty object", () => {
		const result = Schema.decodeUnknownSync(StopResponse)({});
		expect(result).toBeInstanceOf(StopResponse);
	});

	test("accepts block decision with reason", () => {
		const data = { decision: "block", reason: "not done yet" };
		const result = Schema.decodeUnknownSync(StopResponse)(data);
		expect(result.decision).toBe("block");
		expect(result.reason).toBe("not done yet");
	});

	test("rejects invalid decision value", () => {
		expect(() => Schema.decodeUnknownSync(StopResponse)({ decision: "continue" })).toThrow();
	});
});

// =============================================================================
// USERPROMPTSUBMIT RESPONSE
// =============================================================================

describe("UserPromptSubmitResponse", () => {
	test("accepts empty object", () => {
		const result = Schema.decodeUnknownSync(UserPromptSubmitResponse)({});
		expect(result).toBeInstanceOf(UserPromptSubmitResponse);
	});

	test("accepts additionalContext", () => {
		const data = { additionalContext: "prompt context" };
		const result = Schema.decodeUnknownSync(UserPromptSubmitResponse)(data);
		expect(result.additionalContext).toBe("prompt context");
	});

	test("accepts block decision with reason", () => {
		const data = { decision: "block", reason: "blocked prompt" };
		const result = Schema.decodeUnknownSync(UserPromptSubmitResponse)(data);
		expect(result.decision).toBe("block");
		expect(result.reason).toBe("blocked prompt");
	});
});

// =============================================================================
// PERMISSIONREQUEST RESPONSE
// =============================================================================

describe("PermissionRequestResponse", () => {
	test("accepts allow behavior", () => {
		const data = { behavior: "allow" };
		const result = Schema.decodeUnknownSync(PermissionRequestResponse)(data);
		expect(result).toBeInstanceOf(PermissionRequestResponse);
		expect(result.behavior).toBe("allow");
	});

	test("accepts deny behavior with message", () => {
		const data = { behavior: "deny", message: "not permitted" };
		const result = Schema.decodeUnknownSync(PermissionRequestResponse)(data);
		expect(result.behavior).toBe("deny");
		expect(result.message).toBe("not permitted");
	});

	test("accepts interrupt flag", () => {
		const data = { behavior: "allow", interrupt: true };
		const result = Schema.decodeUnknownSync(PermissionRequestResponse)(data);
		expect(result.interrupt).toBe(true);
	});

	test("accepts updatedInput", () => {
		const data = { behavior: "allow", updatedInput: { key: "value" } };
		const result = Schema.decodeUnknownSync(PermissionRequestResponse)(data);
		expect(result.updatedInput).toEqual({ key: "value" });
	});

	test("rejects missing behavior", () => {
		expect(() => Schema.decodeUnknownSync(PermissionRequestResponse)({})).toThrow();
	});

	test("rejects invalid behavior", () => {
		expect(() => Schema.decodeUnknownSync(PermissionRequestResponse)({ behavior: "ask" })).toThrow();
	});
});

// =============================================================================
// PASSTHROUGH RESPONSE
// =============================================================================

describe("PassthroughResponse", () => {
	test("accepts empty object", () => {
		const result = Schema.decodeUnknownSync(PassthroughResponse)({});
		expect(result).toBeInstanceOf(PassthroughResponse);
	});
});

// =============================================================================
// toPreToolUseResponse
// =============================================================================

describe("toPreToolUseResponse", () => {
	test("maps allow action to allow permissionDecision", () => {
		const output: PreToolUsePipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		const response = toPreToolUseResponse(output);
		expect(response).toBeInstanceOf(PreToolUseResponse);
		expect(response.permissionDecision).toBe("allow");
	});

	test("maps deny action to deny permissionDecision with reason", () => {
		const output: PreToolUsePipelineOutput = {
			status: "executed",
			action: "deny",
			summary: "denied",
			reason: "dangerous command",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("deny");
		expect(response.reason).toBe("dangerous command");
	});

	test("maps ask action to ask permissionDecision", () => {
		const output: PreToolUsePipelineOutput = {
			status: "executed",
			action: "ask",
			summary: "asking user",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("ask");
	});

	test("maps modify action with updatedInput", () => {
		const output: PreToolUsePipelineOutput = {
			status: "executed",
			action: "modify",
			summary: "modified input",
			updatedInput: { command: "ls -la" },
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("allow");
		expect(response.updatedInput).toEqual({ command: "ls -la" });
	});

	test("defaults to allow for skipped status", () => {
		const output: PreToolUsePipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("allow");
	});

	test("defaults to allow for error status", () => {
		const output: PreToolUsePipelineOutput = {
			status: "error",
			summary: "error",
			reason: "something broke",
		};
		const response = toPreToolUseResponse(output);
		expect(response.permissionDecision).toBe("allow");
		expect(response.reason).toBe("something broke");
	});
});

// =============================================================================
// toPostToolUseResponse
// =============================================================================

describe("toPostToolUseResponse", () => {
	test("maps block action with reason", () => {
		const output: PostToolUsePipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked",
			reason: "bad output",
		};
		const response = toPostToolUseResponse(output);
		expect(response).toBeInstanceOf(PostToolUseResponse);
		expect(response.decision).toBe("block");
		expect(response.reason).toBe("bad output");
	});

	test("maps context action with claudeContext", () => {
		const output: PostToolUsePipelineOutput = {
			status: "executed",
			action: "context",
			summary: "added context",
			claudeContext: "important info",
		};
		const response = toPostToolUseResponse(output);
		expect(response.additionalContext).toBe("important info");
		expect(response.decision).toBeUndefined();
	});

	test("returns empty for none action", () => {
		const output: PostToolUsePipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		const response = toPostToolUseResponse(output);
		expect(response.additionalContext).toBeUndefined();
		expect(response.decision).toBeUndefined();
	});

	test("returns empty for skipped status", () => {
		const output: PostToolUsePipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		const response = toPostToolUseResponse(output);
		expect(response.additionalContext).toBeUndefined();
		expect(response.decision).toBeUndefined();
	});

	test("returns empty for block without reason", () => {
		const output: PostToolUsePipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked but no reason",
		};
		const response = toPostToolUseResponse(output);
		expect(response.decision).toBeUndefined();
	});
});

// =============================================================================
// toSessionStartResponse
// =============================================================================

describe("toSessionStartResponse", () => {
	test("maps claudeContext to additionalContext", () => {
		const output: SessionStartPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "session started",
			claudeContext: "session info",
		};
		const response = toSessionStartResponse(output);
		expect(response).toBeInstanceOf(SessionStartResponse);
		expect(response.additionalContext).toBe("session info");
	});

	test("returns empty for none action", () => {
		const output: SessionStartPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no context",
		};
		const response = toSessionStartResponse(output);
		expect(response.additionalContext).toBeUndefined();
	});

	test("returns empty for error status", () => {
		const output: SessionStartPipelineOutput = {
			status: "error",
			summary: "error",
			reason: "failed",
		};
		const response = toSessionStartResponse(output);
		expect(response.additionalContext).toBeUndefined();
	});
});

// =============================================================================
// toStopResponse
// =============================================================================

describe("toStopResponse", () => {
	test("maps block action with reason", () => {
		const output: StopPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked stop",
			reason: "not finished",
		};
		const response = toStopResponse(output);
		expect(response).toBeInstanceOf(StopResponse);
		expect(response.decision).toBe("block");
		expect(response.reason).toBe("not finished");
	});

	test("returns empty for continue action", () => {
		const output: StopPipelineOutput = {
			status: "executed",
			action: "continue",
			summary: "continuing",
		};
		const response = toStopResponse(output);
		expect(response.decision).toBeUndefined();
	});

	test("returns empty for skipped status", () => {
		const output: StopPipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		const response = toStopResponse(output);
		expect(response.decision).toBeUndefined();
	});
});

// =============================================================================
// toUserPromptSubmitResponse
// =============================================================================

describe("toUserPromptSubmitResponse", () => {
	test("maps block action with reason", () => {
		const output: UserPromptSubmitPipelineOutput = {
			status: "executed",
			action: "block",
			summary: "blocked prompt",
			reason: "inappropriate",
		};
		const response = toUserPromptSubmitResponse(output);
		expect(response).toBeInstanceOf(UserPromptSubmitResponse);
		expect(response.decision).toBe("block");
		expect(response.reason).toBe("inappropriate");
	});

	test("maps context action with claudeContext", () => {
		const output: UserPromptSubmitPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "added context",
			claudeContext: "extra info",
		};
		const response = toUserPromptSubmitResponse(output);
		expect(response.additionalContext).toBe("extra info");
		expect(response.decision).toBeUndefined();
	});

	test("returns empty for none action", () => {
		const output: UserPromptSubmitPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "no action",
		};
		const response = toUserPromptSubmitResponse(output);
		expect(response.additionalContext).toBeUndefined();
		expect(response.decision).toBeUndefined();
	});
});

// =============================================================================
// toPermissionRequestResponse
// =============================================================================

describe("toPermissionRequestResponse", () => {
	test("maps deny action to deny behavior", () => {
		const output: PermissionRequestPipelineOutput = {
			status: "executed",
			action: "deny",
			summary: "denied",
			reason: "not allowed",
		};
		const response = toPermissionRequestResponse(output);
		expect(response).toBeInstanceOf(PermissionRequestResponse);
		expect(response.behavior).toBe("deny");
		expect(response.message).toBe("not allowed");
	});

	test("maps allow action to allow behavior", () => {
		const output: PermissionRequestPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed",
		};
		const response = toPermissionRequestResponse(output);
		expect(response.behavior).toBe("allow");
	});

	test("maps interrupt and updatedInput", () => {
		const output: PermissionRequestPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed with modifications",
			interrupt: true,
			updatedInput: { tool: "modified" },
		};
		const response = toPermissionRequestResponse(output);
		expect(response.interrupt).toBe(true);
		expect(response.updatedInput).toEqual({ tool: "modified" });
	});

	test("defaults to allow for skipped status", () => {
		const output: PermissionRequestPipelineOutput = {
			status: "skipped",
			summary: "skipped",
		};
		const response = toPermissionRequestResponse(output);
		expect(response.behavior).toBe("allow");
	});
});

// =============================================================================
// toPassthroughResponse
// =============================================================================

describe("toPassthroughResponse", () => {
	test("returns empty PassthroughResponse", () => {
		const output: PassthroughPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "done",
		};
		const response = toPassthroughResponse(output);
		expect(response).toBeInstanceOf(PassthroughResponse);
	});

	test("ignores output fields", () => {
		const output: PassthroughPipelineOutput = {
			status: "error",
			summary: "error",
			reason: "failed",
		};
		const response = toPassthroughResponse(output);
		expect(response).toBeInstanceOf(PassthroughResponse);
	});
});
