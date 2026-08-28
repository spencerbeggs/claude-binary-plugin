import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionRecord, SessionRegistration } from "../services/SessionStore.js";
import { SessionStore } from "../services/SessionStore.js";

function getDbPath(): string {
	const homeDir = Bun.env.HOME || process.env.HOME;
	if (!homeDir) {
		throw new Error("HOME environment variable not set");
	}
	return join(homeDir, ".claude", "plugins", "sessions.db");
}

function initDb(db: Database): void {
	db.run("PRAGMA journal_mode = WAL");
	db.run(`
		CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			project_dir TEXT NOT NULL,
			session_env_dir TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_project_dir ON sessions(project_dir)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at)`);
}

export const SessionStoreLive: Layer.Layer<SessionStore, never, FileSystem.FileSystem> = Layer.scoped(
	SessionStore,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const db = yield* Effect.acquireRelease(
			Effect.gen(function* () {
				const dbPath = getDbPath();
				const dbDir = dirname(dbPath);
				const dirExists = yield* Effect.orDie(fs.exists(dbDir));
				if (!dirExists) {
					yield* Effect.orDie(fs.makeDirectory(dbDir, { recursive: true }));
				}
				const database = new Database(dbPath);
				initDb(database);
				return database;
			}),
			(database) => Effect.sync(() => database.close()),
		);

		return {
			lookup: (sessionId: string) =>
				Effect.try({
					try: () => {
						const result = db
							.query<{ session_env_dir: string }, [string]>("SELECT session_env_dir FROM sessions WHERE session_id = ?")
							.get(sessionId);
						if (!result) throw new Error("not found");
						return result.session_env_dir;
					},
					catch: () => new SessionLookupError({ sessionId, reason: "Session not found in registry" }),
				}),

			lookupByProject: (projectDir: string) =>
				Effect.try({
					try: () => {
						const result = db
							.query<{ session_env_dir: string }, [string]>(
								"SELECT session_env_dir FROM sessions WHERE project_dir = ? ORDER BY updated_at DESC LIMIT 1",
							)
							.get(projectDir);
						if (!result) throw new Error("not found");
						return result.session_env_dir;
					},
					catch: () => new SessionLookupError({ sessionId: projectDir, reason: "No session found for project" }),
				}),

			register: (params: SessionRegistration) =>
				Effect.sync(() => {
					const { sessionId, projectDir, sessionEnvDir } = params;
					if (!sessionId || !projectDir || !sessionEnvDir) return;
					const now = Math.floor(Date.now() / 1000);
					db.run(
						`INSERT INTO sessions (session_id, project_dir, session_env_dir, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?)
						 ON CONFLICT(session_id) DO UPDATE SET
							project_dir = excluded.project_dir,
							session_env_dir = excluded.session_env_dir,
							updated_at = excluded.updated_at`,
						[sessionId, projectDir, sessionEnvDir, now, now],
					);
					db.run(
						`UPDATE sessions SET session_env_dir = ?, updated_at = ?
						 WHERE project_dir = ? AND session_id != ?`,
						[sessionEnvDir, now, projectDir, sessionId],
					);
				}),

			getRecord: (sessionId: string) =>
				Effect.sync(() => {
					if (!sessionId) return undefined;
					return (
						db.query<SessionRecord, [string]>("SELECT * FROM sessions WHERE session_id = ?").get(sessionId) ?? undefined
					);
				}),

			remove: (sessionId: string) =>
				Effect.sync(() => {
					if (!sessionId) return;
					db.run("DELETE FROM sessions WHERE session_id = ?", [sessionId]);
				}),

			cleanup: (maxAgeSeconds = 7 * 24 * 60 * 60) =>
				Effect.sync(() => {
					const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
					const result = db.run("DELETE FROM sessions WHERE updated_at < ?", [cutoff]);
					return result.changes;
				}),

			get getAll() {
				return Effect.sync(() => db.query<SessionRecord, []>("SELECT * FROM sessions ORDER BY updated_at DESC").all());
			},

			get count() {
				return Effect.sync(() => {
					const result = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions").get();
					return result?.count ?? 0;
				});
			},
		};
	}),
);
