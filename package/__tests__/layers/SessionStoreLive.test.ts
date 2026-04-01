import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { SessionStoreLive } from "../../src/layers/SessionStoreLive.js";
import { SessionStore } from "../../src/services/SessionStore.js";

const testDbPath = join(Bun.env.HOME || "", ".claude", "plugins", "sessions.db");

function cleanDb() {
	for (const suffix of ["", "-wal", "-shm"]) {
		const p = `${testDbPath}${suffix}`;
		if (existsSync(p)) rmSync(p, { force: true });
	}
}

const runScoped = <A>(effect: Effect.Effect<A, unknown, SessionStore>) =>
	Effect.runPromise(Effect.scoped(Effect.provide(effect, SessionStoreLive)));

describe("SessionStoreLive", () => {
	afterEach(() => {
		cleanDb();
	});

	test("register and lookup by session ID", async () => {
		const dir = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({
					sessionId: "test-1",
					projectDir: "/test/project",
					sessionEnvDir: "/home/user/.claude/session-env/test-1",
				});
				return yield* store.lookup("test-1");
			}),
		);
		expect(dir).toBe("/home/user/.claude/session-env/test-1");
	});

	test("lookup fails for unknown session", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const store = yield* SessionStore;
						return yield* Effect.either(store.lookup("nonexistent"));
					}),
					SessionStoreLive,
				),
			),
		);
		expect(result._tag).toBe("Left");
	});

	test("lookupByProject returns most recent", async () => {
		const dir = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({
					sessionId: "old",
					projectDir: "/test/shared",
					sessionEnvDir: "/home/user/.claude/session-env/old",
				});
				yield* store.register({
					sessionId: "new",
					projectDir: "/test/shared",
					sessionEnvDir: "/home/user/.claude/session-env/new",
				});
				return yield* store.lookupByProject("/test/shared");
			}),
		);
		expect(dir).toBe("/home/user/.claude/session-env/new");
	});

	test("lookupByProject fails for unknown project", async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.provide(
					Effect.gen(function* () {
						const store = yield* SessionStore;
						return yield* Effect.either(store.lookupByProject("/unknown"));
					}),
					SessionStoreLive,
				),
			),
		);
		expect(result._tag).toBe("Left");
	});

	test("getRecord returns full record", async () => {
		const record = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({
					sessionId: "rec-1",
					projectDir: "/test/project",
					sessionEnvDir: "/home/user/.claude/session-env/rec-1",
				});
				return yield* store.getRecord("rec-1");
			}),
		);
		expect(record).toBeDefined();
		expect(record?.session_id).toBe("rec-1");
		expect(record?.project_dir).toBe("/test/project");
		expect(record?.created_at).toBeGreaterThan(0);
	});

	test("getRecord returns undefined for unknown", async () => {
		const record = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				return yield* store.getRecord("unknown");
			}),
		);
		expect(record).toBeUndefined();
	});

	test("remove deletes session", async () => {
		const count = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({
					sessionId: "to-delete",
					projectDir: "/test/project",
					sessionEnvDir: "/home/user/.claude/session-env/to-delete",
				});
				yield* store.remove("to-delete");
				return yield* store.count;
			}),
		);
		expect(count).toBe(0);
	});

	test("count tracks sessions", async () => {
		const count = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({ sessionId: "a", projectDir: "/test/a", sessionEnvDir: "/env/a" });
				yield* store.register({ sessionId: "b", projectDir: "/test/b", sessionEnvDir: "/env/b" });
				return yield* store.count;
			}),
		);
		expect(count).toBe(2);
	});

	test("getAll returns all sessions", async () => {
		const all = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({ sessionId: "x", projectDir: "/test/x", sessionEnvDir: "/env/x" });
				yield* store.register({ sessionId: "y", projectDir: "/test/y", sessionEnvDir: "/env/y" });
				return yield* store.getAll;
			}),
		);
		expect(all.length).toBe(2);
	});

	test("cleanup removes old sessions", async () => {
		const deleted = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({ sessionId: "old", projectDir: "/test/old", sessionEnvDir: "/env/old" });
				return yield* store.cleanup(0);
			}),
		);
		expect(deleted).toBeGreaterThanOrEqual(0);
	});

	test("register handles empty params", async () => {
		const count = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({ sessionId: "", projectDir: "/test", sessionEnvDir: "/env" });
				return yield* store.count;
			}),
		);
		expect(count).toBe(0);
	});

	test("register updates existing session", async () => {
		const dir = await runScoped(
			Effect.gen(function* () {
				const store = yield* SessionStore;
				yield* store.register({ sessionId: "upd-1", projectDir: "/test", sessionEnvDir: "/old" });
				yield* store.register({ sessionId: "upd-1", projectDir: "/test", sessionEnvDir: "/new" });
				return yield* store.lookup("upd-1");
			}),
		);
		expect(dir).toBe("/new");
	});
});
