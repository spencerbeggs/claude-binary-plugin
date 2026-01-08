import { describe, expect, test } from "bun:test";
import type { HookPermissionsMode } from "./enums.js";
import { HookType } from "./enums.js";

describe("HookType", () => {
	test("exports all hook type constants", () => {
		expect(HookType).toBeDefined();
		expect(HookType.PreToolUse).toBe(HookType.PreToolUse);
		expect(HookType.PostToolUse).toBe(HookType.PostToolUse);
		expect(HookType.SessionStart).toBe(HookType.SessionStart);
		expect(HookType.SessionEnd).toBe(HookType.SessionEnd);
	});

	test("enum values match expected strings", () => {
		expect(String(HookType.PreToolUse)).toBe("PreToolUse");
		expect(String(HookType.SessionStart)).toBe("SessionStart");
	});
});

describe("HookPermissionsMode", () => {
	test("type is exported", () => {
		const mode: HookPermissionsMode = "default";
		expect(mode).toBe("default");
	});
});
