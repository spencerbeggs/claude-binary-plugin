import { Effect, Layer } from "effect";
import { SessionLookupError } from "../errors/SessionLookupError.js";
import type { SessionRecord, SessionRegistration } from "../services/SessionStore.js";
import { SessionStore } from "../services/SessionStore.js";

export const makeSessionStoreTest = () => {
	const store = new Map<string, SessionRegistration>();

	return {
		store,
		layer: Layer.succeed(SessionStore, {
			lookup: (sessionId: string) => {
				const entry = store.get(sessionId);
				return entry
					? Effect.succeed(entry.sessionEnvDir)
					: Effect.fail(new SessionLookupError({ sessionId, reason: "not found" }));
			},

			lookupByProject: (projectDir: string) => {
				for (const entry of store.values()) {
					if (entry.projectDir === projectDir) {
						return Effect.succeed(entry.sessionEnvDir);
					}
				}
				return Effect.fail(new SessionLookupError({ sessionId: projectDir, reason: "No session found for project" }));
			},

			register: (params: SessionRegistration) =>
				Effect.sync(() => {
					store.set(params.sessionId, params);
				}),

			getRecord: (sessionId: string) =>
				Effect.sync(() => {
					const entry = store.get(sessionId);
					if (!entry) return undefined;
					const now = Math.floor(Date.now() / 1000);
					return {
						session_id: entry.sessionId,
						project_dir: entry.projectDir,
						session_env_dir: entry.sessionEnvDir,
						created_at: now,
						updated_at: now,
					} satisfies SessionRecord;
				}),

			remove: (sessionId: string) =>
				Effect.sync(() => {
					store.delete(sessionId);
				}),

			cleanup: (_maxAgeSeconds?: number) => Effect.succeed(0),

			getAll: Effect.sync(() => [] as SessionRecord[]),

			count: Effect.sync(() => store.size),
		}),
	};
};
