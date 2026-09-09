import type { Effect } from "effect";
import { Context } from "effect";
import type { StdinError } from "../errors/StdinError.js";

export class StdinReader extends Context.Tag("StdinReader")<
	StdinReader,
	{
		readonly read: () => Effect.Effect<string, StdinError>;
	}
>() {}
