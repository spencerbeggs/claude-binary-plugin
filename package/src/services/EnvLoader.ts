import type { Effect } from "effect";
import { Context } from "effect";
import type { EnvLoadError } from "../errors/EnvLoadError.js";

export class EnvLoader extends Context.Tag("EnvLoader")<
	EnvLoader,
	{
		readonly loadUserEnvFiles: (projectRoot: string) => Effect.Effect<string[], EnvLoadError>;
		readonly loadSessionEnvFiles: (sessionEnvDir: string) => Effect.Effect<number, EnvLoadError>;
		readonly loadFromVarsFile: (filePath: string) => Effect.Effect<void, EnvLoadError>;
	}
>() {}
