/**
 * SQLite-based session registry for Claude Code plugins.
 *
 * @remarks
 * This module provides persistent storage for session-to-env-dir mappings,
 * enabling hooks and commands to locate persisted environment variables.
 *
 * The registry solves a key problem: Claude Code's `CLAUDE_ENV_FILE` is only
 * available during SessionStart, but subsequent hooks and commands need to
 * find the persisted state. The registry stores mappings in SQLite for
 * reliable lookups.
 *
 * **Database location:** `~/.claude/plugins/sessions.db`
 *
 * **Lookup strategies:**
 * - **By session ID** - Used by hooks with `CLAUDE_SESSION_ID`
 * - **By project directory** - Used by commands that only know the cwd
 *
 * **Cleanup:**
 * Sessions older than 7 days are automatically cleaned up.
 * Use `SessionRegistry.cleanup()` to trigger cleanup manually.
 *
 * @example
 * ```typescript
 * import { SessionRegistry } from "claude-binary-plugin";
 *
 * // Register a session during SessionStart
 * SessionRegistry.register({
 *   sessionId: "abc-123",
 *   projectDir: "/path/to/project",
 *   sessionEnvDir: "/Users/x/.claude/session-env/abc-123",
 * });
 *
 * // Look up by session ID (hooks)
 * const dir = SessionRegistry.getBySessionId("abc-123");
 *
 * // Look up by project directory (commands)
 * const dir = SessionRegistry.getByProjectDir("/path/to/project");
 * ```
 *
 * @see {@link PluginEnv} - Uses registry for state lookups
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Session registration parameters for storing session-to-env-dir mappings.
 *
 * @remarks
 * These parameters are provided during `SessionStart` when the plugin
 * registers a session with the registry. All paths should be absolute.
 *
 * @see {@link SessionRegistry.register} - Uses this interface
 * @public
 */
export interface SessionRegistration {
	/** Session ID from Claude Code (UUID format) */
	sessionId: string;
	/** Absolute path to the project directory (user's working directory) */
	projectDir: string;
	/** Absolute path to the session-env directory where hook-*.sh files are stored */
	sessionEnvDir: string;
}

/**
 * Session record as stored in the SQLite database.
 *
 * @remarks
 * This interface represents the raw database row structure. Column names
 * use snake_case to match SQLite conventions. Timestamps are Unix epoch
 * seconds (not milliseconds).
 *
 * @see {@link SessionRegistry.getRecord} - Returns full session records
 * @see {@link SessionRegistry.getAll} - Returns all session records
 * @public
 */
export interface SessionRecord {
	/** Session ID (primary key) */
	session_id: string;
	/** Absolute path to the project directory */
	project_dir: string;
	/** Absolute path to the session-env directory */
	session_env_dir: string;
	/** Unix timestamp (seconds) when the session was first registered */
	created_at: number;
	/** Unix timestamp (seconds) when the session was last updated */
	updated_at: number;
}

/**
 * Get the database path.
 * @internal
 */
function getDbPath(): string {
	const homeDir = Bun.env.HOME || process.env.HOME;
	if (!homeDir) {
		throw new Error("HOME environment variable not set");
	}
	return join(homeDir, ".claude", "plugins", "sessions.db");
}

/**
 * Singleton database instance.
 * @internal
 */
let db: Database | null = null;

/**
 * Get or create the database connection.
 * @internal
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
 * Closes the database connection.
 *
 * @remarks
 * Primarily used in tests to reset database state between test runs.
 *
 * @public
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
 * @remarks
 * The registry provides persistent storage for session-to-env-dir mappings,
 * replacing file-based mappings with a single SQLite database. This enables
 * fast lookups and automatic cleanup of stale sessions.
 *
 * **Database features:**
 * - WAL mode for concurrent read/write access
 * - Indexes on `project_dir` and `updated_at` for fast queries
 * - Automatic session expiration (default: 7 days)
 *
 * **Thread safety:**
 * SQLite with WAL mode supports concurrent readers and a single writer.
 * Each hook process gets its own connection, and writes are serialized.
 *
 * @example
 * ```typescript
 * import { SessionRegistry } from "claude-binary-plugin";
 *
 * // Register during SessionStart
 * SessionRegistry.register({
 *   sessionId: "abc-123",
 *   projectDir: "/path/to/project",
 *   sessionEnvDir: "/Users/x/.claude/session-env/abc-123",
 * });
 *
 * // Look up by session ID (hooks)
 * const dir = SessionRegistry.getBySessionId("abc-123");
 *
 * // Look up by project directory (commands)
 * const dir = SessionRegistry.getByProjectDir("/path/to/project");
 *
 * // Clean up old sessions
 * const deleted = SessionRegistry.cleanup();
 * ```
 *
 * @see {@link SessionRegistration} - Registration parameters
 * @see {@link SessionRecord} - Database record structure
 * @see {@link PluginEnv} - Uses registry for state lookups
 * @public
 */
export class SessionRegistry {
	private constructor() {}

	/**
	 * Register or update a session mapping.
	 *
	 * @remarks
	 * Called during `SessionStart` to record the session-to-env-dir mapping.
	 * Uses SQLite UPSERT to insert new sessions or update existing ones.
	 *
	 * When a new session starts for the same project, all existing sessions
	 * for that project are updated to point to the new env directory. This
	 * ensures commands always find the most recent state.
	 *
	 * @param params - Session registration parameters
	 *
	 * @example
	 * ```typescript
	 * SessionRegistry.register({
	 *   sessionId: event.session_id,
	 *   projectDir: event.cwd,
	 *   sessionEnvDir: envDir,
	 * });
	 * ```
	 */
	static register(params: SessionRegistration): void {
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
	}

	/**
	 * Get session-env directory by session ID.
	 *
	 * @remarks
	 * Primary lookup method for hooks that have access to `CLAUDE_SESSION_ID`.
	 * Returns the directory where hook-*.sh files are stored for this session.
	 *
	 * @param sessionId - The Claude Code session UUID
	 * @returns Session-env directory path, or `undefined` if not found
	 *
	 * @example
	 * ```typescript
	 * const envDir = SessionRegistry.getBySessionId(event.session_id);
	 * if (envDir) {
	 *   const state = await loadStateFromDir(envDir);
	 * }
	 * ```
	 */
	static getBySessionId(sessionId: string | undefined): string | undefined {
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
	}

	/**
	 * Get session-env directory by project directory.
	 *
	 * @remarks
	 * Primary lookup method for commands that don't have access to session ID.
	 * Returns the most recently updated session for the given project directory.
	 *
	 * This enables commands invoked via `--cmd=name` to find persisted state
	 * even though they run outside of the hook context.
	 *
	 * @param projectDir - Absolute path to the project directory
	 * @returns Session-env directory path, or `undefined` if not found
	 *
	 * @example
	 * ```typescript
	 * const envDir = SessionRegistry.getByProjectDir(process.cwd());
	 * if (envDir) {
	 *   const state = await loadStateFromDir(envDir);
	 * }
	 * ```
	 */
	static getByProjectDir(projectDir: string | undefined): string | undefined {
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
	}

	/**
	 * Get full session record by session ID.
	 *
	 * @remarks
	 * Returns the complete database record including timestamps.
	 * Useful for debugging or when you need metadata about the session.
	 *
	 * @param sessionId - The Claude Code session UUID
	 * @returns Full {@link SessionRecord}, or `undefined` if not found
	 */
	static getRecord(sessionId: string): SessionRecord | undefined {
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
	}

	/**
	 * Delete a session by ID.
	 *
	 * @remarks
	 * Removes a single session from the registry. Typically called during
	 * `SessionEnd` or when cleaning up after errors. Silently ignores
	 * non-existent sessions.
	 *
	 * @param sessionId - The Claude Code session UUID to delete
	 */
	static delete(sessionId: string): void {
		if (!sessionId) return;

		try {
			const database = getDb();
			database.run("DELETE FROM sessions WHERE session_id = ?", [sessionId]);
		} catch {
			// Silently fail
		}
	}

	/**
	 * Delete sessions older than the specified age.
	 *
	 * @remarks
	 * Removes stale sessions based on their `updated_at` timestamp.
	 * Sessions are considered stale if they haven't been updated within
	 * the retention period (default: 7 days).
	 *
	 * Call this periodically to prevent unbounded database growth.
	 * The SDK automatically runs cleanup during `SessionStart`.
	 *
	 * @param maxAgeSeconds - Maximum age in seconds (default: 604800 = 7 days)
	 * @returns Number of sessions deleted
	 *
	 * @example
	 * ```typescript
	 * // Delete sessions older than 24 hours
	 * const deleted = SessionRegistry.cleanup(24 * 60 * 60);
	 * console.log(`Cleaned up ${deleted} stale sessions`);
	 * ```
	 */
	static cleanup(maxAgeSeconds = 7 * 24 * 60 * 60): number {
		try {
			const database = getDb();
			const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;

			const result = database.run("DELETE FROM sessions WHERE updated_at < ?", [cutoff]);

			return result.changes;
		} catch {
			return 0;
		}
	}

	/**
	 * Get all sessions from the registry.
	 *
	 * @remarks
	 * Returns all session records ordered by `updated_at` descending
	 * (most recent first). Primarily used for debugging and testing.
	 *
	 * @returns Array of all {@link SessionRecord} entries
	 */
	static getAll(): SessionRecord[] {
		try {
			const database = getDb();
			return database.query<SessionRecord, []>("SELECT * FROM sessions ORDER BY updated_at DESC").all();
		} catch {
			return [];
		}
	}

	/**
	 * Get count of sessions in the registry.
	 *
	 * @remarks
	 * Returns the total number of registered sessions.
	 * Primarily used for debugging, testing, and monitoring.
	 *
	 * @returns Total number of session records
	 */
	static count(): number {
		try {
			const database = getDb();
			const result = database.query<{ count: number }, []>("SELECT COUNT(*) as count FROM sessions").get();
			return result?.count ?? 0;
		} catch {
			return 0;
		}
	}

	/**
	 * Close the database connection.
	 *
	 * @remarks
	 * Primarily used in tests to reset database state between test runs.
	 * In production, the database connection persists for the process lifetime.
	 *
	 * @example
	 * ```typescript
	 * import { SessionRegistry } from "claude-binary-plugin";
	 *
	 * // In tests, close between test runs
	 * afterEach(() => {
	 *   SessionRegistry.close();
	 * });
	 * ```
	 */
	static close(): void {
		closeDb();
	}
}
