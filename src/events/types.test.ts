import { describe, expect, test } from "bun:test";
import type { HookEventBase, IO } from "./types.js";

describe("types", () => {
	test("IO type is usable", () => {
		const io: IO = {
			stdin: process.stdin,
			stdout: process.stdout,
			stderr: process.stderr,
		};
		expect(io.stdin).toBeDefined();
	});

	test("HookEventBase type is usable", () => {
		const base: Partial<HookEventBase> = {
			session_id: "test-session-id",
		};
		expect(base.session_id).toBe("test-session-id");
	});
});
