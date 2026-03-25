import type { Effect } from "effect";
import { Context } from "effect";
import type { EnvLoadError } from "../errors/EnvLoadError.js";

export class EnvLoader extends Context.Tag("EnvLoader")<
	EnvLoader,
	{
		readonly loadUserEnv: (projectRoot: string) => Effect.Effect<void, EnvLoadError>;
		readonly loadHookFiles: (dir: string) => Effect.Effect<void, EnvLoadError>;
		readonly loadSessionEnv: (prefix: string) => Effect.Effect<void, EnvLoadError>;
	}
>() {}
