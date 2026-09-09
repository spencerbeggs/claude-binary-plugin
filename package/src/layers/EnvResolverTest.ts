import { Effect, Layer, Ref } from "effect";
import { EnvResolver } from "../services/EnvResolver.js";

interface SessionEntry {
	sessionId: string;
	projectDir: string;
	sessionEnvDir: string;
}

export const makeEnvResolverTest = () => {
	const ref = Ref.unsafeMake<SessionEntry[]>([]);

	const layer = Layer.succeed(EnvResolver, {
		getSessionEnvDir: (sessionId: string | undefined) =>
			Ref.get(ref).pipe(Effect.map((entries) => entries.find((e) => e.sessionId === sessionId)?.sessionEnvDir)),

		getProjectSessionEnvDir: (projectDir: string) =>
			Ref.get(ref).pipe(Effect.map((entries) => entries.find((e) => e.projectDir === projectDir)?.sessionEnvDir)),

		registerSession: (sessionId: string, projectDir: string, sessionEnvDir: string) =>
			Ref.update(ref, (entries) => [...entries, { sessionId, projectDir, sessionEnvDir }]),
	});

	return { layer, ref };
};
