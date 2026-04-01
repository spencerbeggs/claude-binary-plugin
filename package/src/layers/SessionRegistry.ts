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

	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	db = new Database(dbPath);

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
 * Get session-env directory by session ID.
 *
 * @param sessionId - The Claude Code session UUID, or undefined
 * @returns Session-env directory path, or `undefined` if not found
 * @public
 */
export function getBySessionId(sessionId: string | undefined): string | undefined {
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
 * @param projectDir - Absolute path to the project directory, or undefined
 * @returns Session-env directory path, or `undefined` if not found
 * @public
 */
export function getByProjectDir(projectDir: string | undefined): string | undefined {
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
 * Register or update a session mapping.
 *
 * @param params - Session registration parameters
 * @public
 */
export function registerSession(params: SessionRegistration): void {
	const { sessionId, projectDir, sessionEnvDir } = params;
	if (!sessionId || !projectDir || !sessionEnvDir) {
		return;
	}

	try {
		const database = getDb();
		const now = Math.floor(Date.now() / 1000);

		database.run(
			`INSERT INTO sessions (session_id, project_dir, session_env_dir, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET
				project_dir = excluded.project_dir,
				session_env_dir = excluded.session_env_dir,
				updated_at = excluded.updated_at`,
			[sessionId, projectDir, sessionEnvDir, now, now],
		);

		database.run(
			`UPDATE sessions
			SET session_env_dir = ?, updated_at = ?
			WHERE project_dir = ? AND session_id != ?`,
			[sessionEnvDir, now, projectDir, sessionId],
		);
	} catch {
		// Silently fail - don't break hooks if DB has issues
	}
}
