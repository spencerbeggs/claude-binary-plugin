import type { Effect } from "effect";
import { Context } from "effect";

export class EnvBridge extends Context.Tag("EnvBridge")<
	EnvBridge,
	{
		readonly write: (vars: Record<string, string>) => Effect.Effect<void>;
		readonly read: (keys: string[]) => Effect.Effect<Record<string, string | undefined>>;
		readonly readAll: () => Effect.Effect<Record<string, string | undefined>>;
	}
>() {}
