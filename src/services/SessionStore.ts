import type { Effect } from "effect";
import { Context } from "effect";
import type { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionId } from "../schemas/branded.js";

export class SessionStore extends Context.Tag("SessionStore")<
	SessionStore,
	{
		readonly lookup: (sessionId: SessionId) => Effect.Effect<string, SessionLookupError>;
		readonly register: (sessionId: SessionId, dir: string) => Effect.Effect<void>;
	}
>() {}
