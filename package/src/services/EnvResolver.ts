import type { Effect } from "effect";
import { Context } from "effect";

export class EnvResolver extends Context.Tag("EnvResolver")<
	EnvResolver,
	{
		readonly getSessionEnvDir: (sessionId: string | undefined) => Effect.Effect<string | undefined>;
		readonly getProjectSessionEnvDir: (projectDir: string) => Effect.Effect<string | undefined>;
		readonly registerSession: (
			sessionId: string,
			projectDir: string,
			sessionEnvDir: string,
		) => Effect.Effect<void>;
	}
>() {}
