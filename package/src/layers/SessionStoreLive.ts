import { Effect, Layer } from "effect";
import { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionId } from "../schemas/branded.js";
import { SessionStore } from "../services/SessionStore.js";

export const SessionStoreLive = Layer.succeed(SessionStore, {
	lookup: (sessionId: SessionId) =>
		Effect.try({
			try: () => {
				// Lazy import to avoid circular dependencies during migration
				const { SessionRegistry } =
					require("../layers/SessionRegistry.js") as typeof import("../layers/SessionRegistry.js");
				const dir = SessionRegistry.getBySessionId(sessionId);
				if (!dir) throw new Error("not found");
				return dir;
			},
			catch: () => new SessionLookupError({ sessionId, reason: "Session not found in registry" }),
		}),

	register: (sessionId: SessionId, dir: string) =>
		Effect.sync(() => {
			const { SessionRegistry } =
				require("../layers/SessionRegistry.js") as typeof import("../layers/SessionRegistry.js");
			SessionRegistry.register({ sessionId, projectDir: dir, sessionEnvDir: dir });
		}),
});
