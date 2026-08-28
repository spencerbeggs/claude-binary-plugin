import { Effect, Layer } from "effect";
import { EnvResolver } from "../services/EnvResolver.js";
import { SessionStore } from "../services/SessionStore.js";

export const EnvResolverLive: Layer.Layer<EnvResolver, never, SessionStore> = Layer.effect(
	EnvResolver,
	Effect.gen(function* () {
		const store = yield* SessionStore;
		return {
			getSessionEnvDir: (sessionId: string | undefined) => {
				if (!sessionId) return Effect.succeed(undefined as string | undefined);
				return store.lookup(sessionId).pipe(
					Effect.map((dir) => dir as string | undefined),
					Effect.catchAll(() => Effect.succeed(undefined as string | undefined)),
				);
			},
			getProjectSessionEnvDir: (projectDir: string) =>
				store.lookupByProject(projectDir).pipe(
					Effect.map((dir) => dir as string | undefined),
					Effect.catchAll(() => Effect.succeed(undefined as string | undefined)),
				),
			registerSession: (sessionId: string, projectDir: string, sessionEnvDir: string) =>
				store.register({ sessionId, projectDir, sessionEnvDir }),
		};
	}),
);
