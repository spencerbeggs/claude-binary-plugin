/**
 * SQLite-based session registry for Claude Code plugins.
 *
 * Provides efficient storage and lookup for session-to-env-dir mappings.
 * Consolidates the previous file-based approach into a single database.
 *
 * Database location: ~/.claude/plugins/sessions.db
 *
 * @example
 * ```typescript
 * import { SessionRegistry } from "@savvy-web/bun-hooks/session-registry";
 *
 * // Register a session during SessionStart
 * SessionRegistry.register({
 *   sessionId: "abc-123",
 *   projectDir: "/path/to/project",
 *   sessionEnvDir: "/Users/x/.claude/session-env/abc-123",
 * });
 *
 * // Look up by session ID
 * const dir = SessionRegistry.getBySessionId("abc-123");
 *
 * // Look up by project directory (for commands)
 * const dir = SessionRegistry.getByProjectDir("/path/to/project");
 * ```
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Session registration parameters
 */
export interface SessionRegistration {
	/** Session ID from Claude Code */
	sessionId: string;
	/** Absolute path to the project directory */
	projectDir: string;
	/** Absolute path to the session-env directory */
	sessionEnvDir: string;
}

/**
 * Session record stored in the database
 */
export interface SessionRecord {
	session_id: string;
	project_dir: string;
	session_env_dir: string;
	created_at: number;
	updated_at: number;
}

/**
 * Get the database path
 */
function getDbPath(): string {
	const homeDir = Bun.env.HOME || process.env.HOME;
	if (!homeDir) {
		throw new Error("HOME environment variable not set");
	}
	return join(homeDir, ".claude", "plugins", "sessions.db");
}

/**
 * Singleton database instance
 */
let db: Database | null = null;

/**
 * Get or create the database connection
 */
function getDb(): Database {
	if (db) return db;

	const dbPath = getDbPath();
	const dbDir = dirname(dbPath);

	// Ensure directory exists
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	db = new Database(dbPath);

	// Enable WAL mode for better concurrent access
	db.run("PRAGMA journal_mode = WAL");

	// Create tables if they don't exist
	db.run(`
		CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			project_dir TEXT NOT NULL,
			session_env_dir TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`);

	// Create index on project_dir for fast lookups
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_sessions_project_dir
		ON sessions(project_dir)
	`);

	// Create index on updated_at for cleanup queries
	db.run(`
		CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
		ON sessions(updated_at)
	`);

	return db;
}

/**
 * Close the database connection (for testing/cleanup)
 */
export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}

/**
 * SQLite-based session registry for efficient session lookups.
 *
 * Replaces the file-based session-env-mapping and project-session-mapping
 * with a single database for better performance and easier cleanup.
 */
export const SessionRegistry = {
	/**
	 * Register or update a session.
	 *
	 * Called during SessionStart to record the session mapping.
	 * Uses UPSERT to update existing sessions for the same project.
	 */
	register(params: SessionRegistration): void {
		const { sessionId, projectDir, sessionEnvDir } = params;
		if (!sessionId || !projectDir || !sessionEnvDir) {
			return;
		}

		try {
			const database = getDb();
			const now = Math.floor(Date.now() / 1000);

			// Upsert: insert or update if session_id exists
			database.run(
				`
				INSERT INTO sessions (session_id, project_dir, session_env_dir, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(session_id) DO UPDATE SET
					project_dir = excluded.project_dir,
					session_env_dir = excluded.session_env_dir,
					updated_at = excluded.updated_at
			`,
				[sessionId, projectDir, sessionEnvDir, now, now],
			);

			// Also update any existing sessions for this project to point to new env dir
			// This handles the case where a new session starts for the same project
			database.run(
				`
				UPDATE sessions
				SET session_env_dir = ?, updated_at = ?
				WHERE project_dir = ? AND session_id != ?
			`,
				[sessionEnvDir, now, projectDir, sessionId],
			);
		} catch {
			// Silently fail - don't break hooks if DB has issues
		}
	},

	/**
	 * Get session-env directory by session ID.
	 *
	 * @returns Session-env directory path, or undefined if not found
	 */
	getBySessionId(sessionId: string | undefined): string | undefined {
		if (!sessionId) return undefined;

		try {
			const database = getDb();
			const result = database
				.query<{ session_env_dir: string }, [string]>("SELECT session_env_dir FROM sessions WHERE session_id = ?")
				.get(sessionId);

			return result?.session_env_dir;
		} catch {
			return undefined;
		}
	},

	/**
	 * Get session-env directory by project directory.
	 *
	 * Returns the most recently updated session for the project.
	 * This is the primary lookup method for commands.
	 *
	 * @returns Session-env directory path, or undefined if not found
	 */
	getByProjectDir(projectDir: string | undefined): string | undefined {
		if (!projectDir) return undefined;

		try {
			const database = getDb();
			const result = database
				.query<{ session_env_dir: string }, [string]>(
					`SELECT session_env_dir FROM sessions
				 WHERE project_dir = ?
				 ORDER BY updated_at DESC
				 LIMIT 1`,
				)
				.get(projectDir);

			return result?.session_env_dir;
		} catch {
			return undefined;
		}
	},

	/**
	 * Get full session record by session ID.
	 *
	 * @returns Full session record, or undefined if not found
	 */
	getRecord(sessionId: string): SessionRecord | undefined {
		if (!sessionId) return undefined;

		try {
			const database = getDb();
			return (
				database.query<SessionRecord, [string]>("SELECT * FROM sessions WHERE session_id = ?").get(sessionId) ??
				undefined
			);
		} catch {
			return undefined;
		}
	},

	/**
	 * Delete a session by ID.
	 */
	delete(sessionId: string): void {
		if (!sessionId) return;

		try {
			const database = getDb();
			database.run("DELETE FROM sessions WHERE session_id = ?", [sessionId]);
		} catch {
			// Silently fail
		}
	},

	/**
	 * Delete sessions older than the specified age.
	 *
	 * @param maxAgeSeconds - Maximum age in seconds (default: 7 days)
	 * @returns Number of sessions deleted
	 */
	cleanup(maxAgeSeconds = 7 * 24 * 60 * 60): number {
		try {
			const database = getDb();
			const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;

			const result = database.run("DELETE FROM sessions WHERE updated_at < ?", [cutoff]);

			return result.changes;
		} catch {
			return 0;
		}
	},

	/**
	 * Get all sessions (for debugging/testing).
	 */
	getAll(): SessionRecord[] {
		try {
			const database = getDb();
			return database.query<SessionRecord, []>("SELECT * FROM sessions ORDER BY updated_at DESC").all();
		} catch {
			return [];
		}
	},

	/**
	 * Get count of sessions (for debugging/testing).
	 */
	count(): number {
		try {
			const database = getDb();
			const result = database.query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions").get();
			return result?.count ?? 0;
		} catch {
			return 0;
		}
	},
};
