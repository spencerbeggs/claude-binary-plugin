import type { Effect } from "effect";
import { Context } from "effect";
import type { EnvPersistError } from "../errors/EnvPersistError.js";

export interface PersistResult {
	persisted: boolean;
	path?: string;
	reason?: string;
}

export class EnvWriter extends Context.Tag("EnvWriter")<
	EnvWriter,
	{
		readonly persist: (vars: Record<string, string>) => Effect.Effect<PersistResult, EnvPersistError>;
	}
>() {}
