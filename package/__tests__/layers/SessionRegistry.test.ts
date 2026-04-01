import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { closeDb, getByProjectDir, getBySessionId, registerSession } from "../../src/layers/SessionRegistry.js";

describe("SessionRegistry facade", () => {
	const testDbPath = join(Bun.env.HOME || "", ".claude", "plugins", "sessions.db");

	beforeEach(() => {
		closeDb();
		for (const suffix of ["", "-wal", "-shm"]) {
			const p = `${testDbPath}${suffix}`;
			if (existsSync(p)) rmSync(p, { force: true });
		}
	});

	afterEach(() => {
		closeDb();
	});

	describe("registerSession", () => {
		test("registers a new session", () => {
			registerSession({
				sessionId: "test-1",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/test-1",
			});
			expect(getBySessionId("test-1")).toBe("/home/user/.claude/session-env/test-1");
		});

		test("updates existing session", () => {
			registerSession({ sessionId: "test-1", projectDir: "/test/project", sessionEnvDir: "/old/dir" });
			registerSession({ sessionId: "test-1", projectDir: "/test/project", sessionEnvDir: "/new/dir" });
			expect(getBySessionId("test-1")).toBe("/new/dir");
		});

		test("handles empty sessionId gracefully", () => {
			registerSession({ sessionId: "", projectDir: "/test/project", sessionEnvDir: "/test/env" });
		});
	});

	describe("getBySessionId", () => {
		test("returns undefined for unknown session", () => {
			expect(getBySessionId("unknown")).toBeUndefined();
		});

		test("returns undefined for undefined input", () => {
			expect(getBySessionId(undefined)).toBeUndefined();
		});

		test("finds registered session", () => {
			registerSession({
				sessionId: "test-2",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/test-2",
			});
			expect(getBySessionId("test-2")).toBe("/home/user/.claude/session-env/test-2");
		});
	});

	describe("getByProjectDir", () => {
		test("returns undefined for unknown project", () => {
			expect(getByProjectDir("/unknown")).toBeUndefined();
		});

		test("returns undefined for undefined input", () => {
			expect(getByProjectDir(undefined)).toBeUndefined();
		});

		test("finds session by project directory", () => {
			registerSession({
				sessionId: "test-3",
				projectDir: "/test/project-3",
				sessionEnvDir: "/home/user/.claude/session-env/test-3",
			});
			expect(getByProjectDir("/test/project-3")).toBe("/home/user/.claude/session-env/test-3");
		});

		test("returns most recent for multiple sessions", () => {
			registerSession({
				sessionId: "old",
				projectDir: "/test/shared",
				sessionEnvDir: "/home/user/.claude/session-env/old",
			});
			const start = Date.now();
			while (Date.now() - start < 10) {}
			registerSession({
				sessionId: "new",
				projectDir: "/test/shared",
				sessionEnvDir: "/home/user/.claude/session-env/new",
			});
			expect(getByProjectDir("/test/shared")).toBe("/home/user/.claude/session-env/new");
		});
	});

	describe("closeDb", () => {
		test("closes and allows reopening", () => {
			registerSession({
				sessionId: "close-test",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/close-test",
			});
			closeDb();
			expect(getBySessionId("close-test")).toBe("/home/user/.claude/session-env/close-test");
		});
	});
});
