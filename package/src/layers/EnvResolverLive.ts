import { Effect, Layer } from "effect";
import { EnvResolver } from "../services/EnvResolver.js";
import { getByProjectDir, getBySessionId, registerSession } from "./SessionRegistry.js";

export const EnvResolverLive = Layer.succeed(EnvResolver, {
	getSessionEnvDir: (sessionId: string | undefined) => Effect.sync(() => getBySessionId(sessionId)),

	getProjectSessionEnvDir: (projectDir: string) => Effect.sync(() => getByProjectDir(projectDir)),

	registerSession: (sessionId: string, projectDir: string, sessionEnvDir: string) =>
		Effect.sync(() => registerSession({ sessionId, projectDir, sessionEnvDir })),
});
