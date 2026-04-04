import type { Effect } from "effect";
import { Context } from "effect";
import type { SessionLookupError } from "../errors/SessionLookupError.js";

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
 * Session record as stored in the SQLite database.
 * @public
 */
export interface SessionRecord {
	session_id: string;
	project_dir: string;
	session_env_dir: string;
	created_at: number;
	updated_at: number;
}

/**
 * Effect service for session-to-env-dir mappings.
 * The Live layer uses acquireRelease for DB lifecycle management.
 * @public
 */
export class SessionStore extends Context.Tag("SessionStore")<
	SessionStore,
	{
		readonly lookup: (sessionId: string) => Effect.Effect<string, SessionLookupError>;
		readonly lookupByProject: (projectDir: string) => Effect.Effect<string, SessionLookupError>;
		readonly register: (params: SessionRegistration) => Effect.Effect<void>;
		readonly getRecord: (sessionId: string) => Effect.Effect<SessionRecord | undefined>;
		readonly remove: (sessionId: string) => Effect.Effect<void>;
		readonly cleanup: (maxAgeSeconds?: number) => Effect.Effect<number>;
		readonly getAll: Effect.Effect<SessionRecord[]>;
		readonly count: Effect.Effect<number>;
	}
>() {}
