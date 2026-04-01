import type { Effect } from "effect";
import { Context } from "effect";

export class EnvFileParser extends Context.Tag("EnvFileParser")<
	EnvFileParser,
	{
		readonly parse: (content: string) => Effect.Effect<Record<string, string>>;
		readonly format: (vars: Record<string, string>) => Effect.Effect<string>;
		readonly escapeForBash: (value: string) => Effect.Effect<string>;
	}
>() {}
