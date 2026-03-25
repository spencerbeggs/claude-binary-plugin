import { Effect, Layer } from "effect";
import { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionId } from "../schemas/branded.js";
import { SessionStore } from "../services/SessionStore.js";

export const makeSessionStoreTest = () => {
	const store = new Map<string, string>();
	return {
		store,
		layer: Layer.succeed(SessionStore, {
			lookup: (sessionId: SessionId) => {
				const dir = store.get(sessionId);
				return dir ? Effect.succeed(dir) : Effect.fail(new SessionLookupError({ sessionId, reason: "not found" }));
			},
			register: (sessionId: SessionId, dir: string) =>
				Effect.sync(() => {
					store.set(sessionId, dir);
				}),
		}),
	};
};
