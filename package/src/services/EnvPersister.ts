import type { Effect } from "effect";
import { Context } from "effect";
import type { EnvPersistError } from "../errors/EnvPersistError.js";

export class EnvPersister extends Context.Tag("EnvPersister")<
	EnvPersister,
	{
		readonly persist: (vars: Record<string, string>, path: string) => Effect.Effect<void, EnvPersistError>;
	}
>() {}
