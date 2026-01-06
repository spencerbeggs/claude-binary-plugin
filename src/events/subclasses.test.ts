/**
 * Tests for HookEvent subclasses.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - PreToolUseEvent creation and properties
 * - PostToolUseEvent creation and properties
 * - SessionStartEvent creation and properties
 * - SessionEndEvent creation and properties
 * - StopEvent and SubagentStopEvent
 * - UserPromptSubmitEvent
 * - PermissionRequestEvent
 * - NotificationEvent
 * - PreCompactEvent
 */

import { describe, expect, test } from "bun:test";
import {
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
} from "./subclasses.js";

describe("HookEvent subclasses", () => {
	test("PreToolUseEvent is exported", () => {
		expect(PreToolUseEvent).toBeDefined();
		expect(typeof PreToolUseEvent).toBe("function");
	});

	test("PostToolUseEvent is exported", () => {
		expect(PostToolUseEvent).toBeDefined();
		expect(typeof PostToolUseEvent).toBe("function");
	});

	test("SessionStartEvent is exported", () => {
		expect(SessionStartEvent).toBeDefined();
		expect(typeof SessionStartEvent).toBe("function");
	});

	test("SessionEndEvent is exported", () => {
		expect(SessionEndEvent).toBeDefined();
		expect(typeof SessionEndEvent).toBe("function");
	});

	test("StopEvent is exported", () => {
		expect(StopEvent).toBeDefined();
		expect(typeof StopEvent).toBe("function");
	});

	test("SubagentStopEvent is exported", () => {
		expect(SubagentStopEvent).toBeDefined();
		expect(typeof SubagentStopEvent).toBe("function");
	});

	test("UserPromptSubmitEvent is exported", () => {
		expect(UserPromptSubmitEvent).toBeDefined();
		expect(typeof UserPromptSubmitEvent).toBe("function");
	});

	test("PermissionRequestEvent is exported", () => {
		expect(PermissionRequestEvent).toBeDefined();
		expect(typeof PermissionRequestEvent).toBe("function");
	});

	test("NotificationEvent is exported", () => {
		expect(NotificationEvent).toBeDefined();
		expect(typeof NotificationEvent).toBe("function");
	});

	test("PreCompactEvent is exported", () => {
		expect(PreCompactEvent).toBeDefined();
		expect(typeof PreCompactEvent).toBe("function");
	});
});
