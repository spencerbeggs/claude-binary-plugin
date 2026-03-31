import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Allow } from "../../src/outcomes/Allow.js";
import { Deny } from "../../src/outcomes/Deny.js";
import { Ask } from "../../src/outcomes/Ask.js";
import { Modify } from "../../src/outcomes/Modify.js";
import { Block } from "../../src/outcomes/Block.js";
import { Continue } from "../../src/outcomes/Continue.js";
import { AddContext } from "../../src/outcomes/AddContext.js";
import { NoAction } from "../../src/outcomes/NoAction.js";
import { Skip } from "../../src/outcomes/Skip.js";
import { isValidOutcomeForHook } from "../../src/outcomes/types.js";

describe("outcome type unions", () => {
	test("PreToolUse accepts Allow, Deny, Ask, Modify, Skip", () => {
		expect(isValidOutcomeForHook("PreToolUse", new Allow({ summary: "ok" }))).toBe(true);
		expect(isValidOutcomeForHook("PreToolUse", new Deny({ summary: "no", reason: "bad" }))).toBe(true);
		expect(isValidOutcomeForHook("PreToolUse", new Ask({ summary: "check" }))).toBe(true);
		expect(isValidOutcomeForHook("PreToolUse", new Modify({ summary: "fmt", updatedInput: { x: 1 } }))).toBe(true);
		expect(isValidOutcomeForHook("PreToolUse", new Skip({ summary: "skip" }))).toBe(true);
	});

	test("PreToolUse rejects Block, Continue, AddContext", () => {
		expect(isValidOutcomeForHook("PreToolUse", new Block({ summary: "b", reason: "r" }))).toBe(false);
		expect(isValidOutcomeForHook("PreToolUse", new Continue({ summary: "c" }))).toBe(false);
		expect(isValidOutcomeForHook("PreToolUse", new AddContext({ summary: "a", context: "c" }))).toBe(false);
	});

	test("PostToolUse accepts Block, Continue, AddContext, NoAction, Skip", () => {
		expect(isValidOutcomeForHook("PostToolUse", new Block({ summary: "b", reason: "r" }))).toBe(true);
		expect(isValidOutcomeForHook("PostToolUse", new Continue({ summary: "c" }))).toBe(true);
		expect(isValidOutcomeForHook("PostToolUse", new AddContext({ summary: "a", context: "c" }))).toBe(true);
		expect(isValidOutcomeForHook("PostToolUse", new NoAction({ summary: "n" }))).toBe(true);
		expect(isValidOutcomeForHook("PostToolUse", new Skip({ summary: "s" }))).toBe(true);
	});

	test("SessionStart accepts AddContext, NoAction", () => {
		expect(isValidOutcomeForHook("SessionStart", new AddContext({ summary: "a", context: "c" }))).toBe(true);
		expect(isValidOutcomeForHook("SessionStart", new NoAction({ summary: "n" }))).toBe(true);
	});

	test("SessionStart rejects Allow, Deny, Block", () => {
		expect(isValidOutcomeForHook("SessionStart", new Allow({ summary: "a" }))).toBe(false);
		expect(isValidOutcomeForHook("SessionStart", new Deny({ summary: "d", reason: "r" }))).toBe(false);
		expect(isValidOutcomeForHook("SessionStart", new Block({ summary: "b", reason: "r" }))).toBe(false);
	});

	test("Stop accepts Block, Continue, Skip", () => {
		expect(isValidOutcomeForHook("Stop", new Block({ summary: "b", reason: "r" }))).toBe(true);
		expect(isValidOutcomeForHook("Stop", new Continue({ summary: "c" }))).toBe(true);
		expect(isValidOutcomeForHook("Stop", new Skip({ summary: "s" }))).toBe(true);
	});

	test("PermissionRequest accepts Allow, Deny", () => {
		expect(isValidOutcomeForHook("PermissionRequest", new Allow({ summary: "a" }))).toBe(true);
		expect(isValidOutcomeForHook("PermissionRequest", new Deny({ summary: "d", reason: "r" }))).toBe(true);
	});

	test("Passthrough hooks accept NoAction only", () => {
		expect(isValidOutcomeForHook("SessionEnd", new NoAction({ summary: "n" }))).toBe(true);
		expect(isValidOutcomeForHook("PreCompact", new NoAction({ summary: "n" }))).toBe(true);
		expect(isValidOutcomeForHook("Notification", new NoAction({ summary: "n" }))).toBe(true);
	});

	test("new hook types: TaskCreated accepts Block, Continue, Skip", () => {
		expect(isValidOutcomeForHook("TaskCreated", new Block({ summary: "b", reason: "r" }))).toBe(true);
		expect(isValidOutcomeForHook("TaskCreated", new Continue({ summary: "c" }))).toBe(true);
		expect(isValidOutcomeForHook("TaskCreated", new Skip({ summary: "s" }))).toBe(true);
		expect(isValidOutcomeForHook("TaskCreated", new Allow({ summary: "a" }))).toBe(false);
	});

	test("new hook types: SubagentStop accepts Block, Continue, Skip", () => {
		expect(isValidOutcomeForHook("SubagentStop", new Block({ summary: "b", reason: "r" }))).toBe(true);
		expect(isValidOutcomeForHook("SubagentStop", new Continue({ summary: "c" }))).toBe(true);
	});

	test("extended outcomes inherit validity from base class", () => {
		class SecurityAllow extends Allow.extend<SecurityAllow>("SecurityAllow")({
			riskLevel: Schema.Literal("none", "low"),
		}) {}

		const a = new SecurityAllow({ summary: "ok", riskLevel: "none" });
		// SecurityAllow is valid for PreToolUse because it extends Allow
		expect(isValidOutcomeForHook("PreToolUse", a)).toBe(true);
		// But not valid for Stop
		expect(isValidOutcomeForHook("Stop", a)).toBe(false);
	});
});
