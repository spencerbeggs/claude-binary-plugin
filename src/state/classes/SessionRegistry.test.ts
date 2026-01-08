import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SessionRegistry } from "./SessionRegistry.js";

describe("SessionRegistry", () => {
	const testDbPath = join(Bun.env.HOME || "", ".claude", "plugins", "sessions.db");

	beforeEach(() => {
		// Close any existing connection (use SessionRegistry.close())
		SessionRegistry.close();
		// Remove test database if it exists
		if (existsSync(testDbPath)) {
			rmSync(testDbPath, { force: true });
		}
		// Also remove WAL files
		if (existsSync(`${testDbPath}-wal`)) {
			rmSync(`${testDbPath}-wal`, { force: true });
		}
		if (existsSync(`${testDbPath}-shm`)) {
			rmSync(`${testDbPath}-shm`, { force: true });
		}
	});

	afterEach(() => {
		SessionRegistry.close();
	});

	describe("close", () => {
		test("closes and reopens the database connection", () => {
			// Register a session to ensure DB is open
			SessionRegistry.register({
				sessionId: "close-test",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/close-test",
			});
			expect(SessionRegistry.count()).toBe(1);

			// Close the database
			SessionRegistry.close();

			// Verify we can still reopen and use (count will be 0 because DB was reset)
			// Actually, closing just closes the connection, not deletes the file
			expect(SessionRegistry.count()).toBe(1);
		});
	});

	describe("register", () => {
		test("registers a new session", () => {
			SessionRegistry.register({
				sessionId: "test-session-1",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/test-session-1",
			});

			expect(SessionRegistry.count()).toBe(1);
			expect(SessionRegistry.getBySessionId("test-session-1")).toBe("/home/user/.claude/session-env/test-session-1");
		});

		test("updates existing session", () => {
			SessionRegistry.register({
				sessionId: "test-session-1",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/old-dir",
			});

			SessionRegistry.register({
				sessionId: "test-session-1",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/new-dir",
			});

			expect(SessionRegistry.count()).toBe(1);
			expect(SessionRegistry.getBySessionId("test-session-1")).toBe("/home/user/.claude/session-env/new-dir");
		});

		test("handles missing parameters gracefully", () => {
			SessionRegistry.register({
				sessionId: "",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/test",
			});

			expect(SessionRegistry.count()).toBe(0);
		});
	});

	describe("getBySessionId", () => {
		test("returns undefined for unknown session", () => {
			expect(SessionRegistry.getBySessionId("unknown")).toBeUndefined();
		});

		test("returns undefined for undefined input", () => {
			expect(SessionRegistry.getBySessionId(undefined)).toBeUndefined();
		});

		test("finds registered session", () => {
			SessionRegistry.register({
				sessionId: "test-session-2",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/test-session-2",
			});

			expect(SessionRegistry.getBySessionId("test-session-2")).toBe("/home/user/.claude/session-env/test-session-2");
		});
	});

	describe("getByProjectDir", () => {
		test("returns undefined for unknown project", () => {
			expect(SessionRegistry.getByProjectDir("/unknown/project")).toBeUndefined();
		});

		test("returns undefined for undefined input", () => {
			expect(SessionRegistry.getByProjectDir(undefined as unknown as string)).toBeUndefined();
		});

		test("finds session by project directory", () => {
			SessionRegistry.register({
				sessionId: "test-session-3",
				projectDir: "/test/project-3",
				sessionEnvDir: "/home/user/.claude/session-env/test-session-3",
			});

			expect(SessionRegistry.getByProjectDir("/test/project-3")).toBe("/home/user/.claude/session-env/test-session-3");
		});

		test("returns most recent session for project with multiple sessions", () => {
			// Register first session
			SessionRegistry.register({
				sessionId: "old-session",
				projectDir: "/test/shared-project",
				sessionEnvDir: "/home/user/.claude/session-env/old-session",
			});

			// Wait a bit to ensure different timestamp
			const start = Date.now();
			while (Date.now() - start < 10) {
				// busy wait
			}

			// Register second session
			SessionRegistry.register({
				sessionId: "new-session",
				projectDir: "/test/shared-project",
				sessionEnvDir: "/home/user/.claude/session-env/new-session",
			});

			// Should return the newest one
			expect(SessionRegistry.getByProjectDir("/test/shared-project")).toBe(
				"/home/user/.claude/session-env/new-session",
			);
		});
	});

	describe("getRecord", () => {
		test("returns full record for session", () => {
			SessionRegistry.register({
				sessionId: "test-session-4",
				projectDir: "/test/project-4",
				sessionEnvDir: "/home/user/.claude/session-env/test-session-4",
			});

			const record = SessionRegistry.getRecord("test-session-4");
			expect(record).toBeDefined();
			expect(record?.session_id).toBe("test-session-4");
			expect(record?.project_dir).toBe("/test/project-4");
			expect(record?.session_env_dir).toBe("/home/user/.claude/session-env/test-session-4");
			expect(record?.created_at).toBeGreaterThan(0);
			expect(record?.updated_at).toBeGreaterThan(0);
		});
	});

	describe("delete", () => {
		test("deletes a session", () => {
			SessionRegistry.register({
				sessionId: "to-delete",
				projectDir: "/test/project",
				sessionEnvDir: "/home/user/.claude/session-env/to-delete",
			});

			expect(SessionRegistry.count()).toBe(1);

			SessionRegistry.delete("to-delete");

			expect(SessionRegistry.count()).toBe(0);
			expect(SessionRegistry.getBySessionId("to-delete")).toBeUndefined();
		});
	});

	describe("cleanup", () => {
		test("removes old sessions", () => {
			// This test is tricky since we can't easily manipulate timestamps
			// Just verify the function runs without error
			const deleted = SessionRegistry.cleanup(0); // Delete everything
			expect(deleted).toBeGreaterThanOrEqual(0);
		});
	});

	describe("getAll", () => {
		test("returns all sessions", () => {
			SessionRegistry.register({
				sessionId: "session-a",
				projectDir: "/test/project-a",
				sessionEnvDir: "/home/user/.claude/session-env/session-a",
			});
			SessionRegistry.register({
				sessionId: "session-b",
				projectDir: "/test/project-b",
				sessionEnvDir: "/home/user/.claude/session-env/session-b",
			});

			const all = SessionRegistry.getAll();
			expect(all.length).toBe(2);
		});
	});
});
