/**
 * Tests for hook response builders.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - HookResponse base class fluent API
 * - PreToolUseResponse (allow, deny, ask, modify)
 * - PostToolUseResponse (additionalContext, block)
 * - SessionStartResponse (additionalContext)
 * - StopResponse (block, continue)
 * - UserPromptSubmitResponse (block, continue, additionalContext)
 * - PermissionRequestResponse (allow, deny)
 * - Chaining patterns
 * - toJSON() serialization
 */

import { describe, expect, test } from "bun:test";
import {
	HookResponse,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
} from "./response-builders.js";

describe("HookResponse", () => {
	test("HookResponse is exported", () => {
		expect(HookResponse).toBeDefined();
		expect(typeof HookResponse).toBe("function");
	});
});

describe("PreToolUseResponse", () => {
	test("PreToolUseResponse is exported", () => {
		expect(PreToolUseResponse).toBeDefined();
		expect(typeof PreToolUseResponse).toBe("function");
	});
});

describe("PostToolUseResponse", () => {
	test("PostToolUseResponse is exported", () => {
		expect(PostToolUseResponse).toBeDefined();
		expect(typeof PostToolUseResponse).toBe("function");
	});
});

describe("SessionStartResponse", () => {
	test("SessionStartResponse is exported", () => {
		expect(SessionStartResponse).toBeDefined();
		expect(typeof SessionStartResponse).toBe("function");
	});
});

describe("StopResponse", () => {
	test("StopResponse is exported", () => {
		expect(StopResponse).toBeDefined();
		expect(typeof StopResponse).toBe("function");
	});
});

describe("UserPromptSubmitResponse", () => {
	test("UserPromptSubmitResponse is exported", () => {
		expect(UserPromptSubmitResponse).toBeDefined();
		expect(typeof UserPromptSubmitResponse).toBe("function");
	});
});

describe("PermissionRequestResponse", () => {
	test("PermissionRequestResponse is exported", () => {
		expect(PermissionRequestResponse).toBeDefined();
		expect(typeof PermissionRequestResponse).toBe("function");
	});
});
