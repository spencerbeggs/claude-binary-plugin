import type { Effect } from "effect";
import { Context } from "effect";
import type { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionRegistration } from "../layers/SessionRegistry.js";

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

export type { SessionRegistration };

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
