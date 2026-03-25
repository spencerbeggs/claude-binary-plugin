import type { Effect } from "effect";
import { Context } from "effect";
import type { SidecarProtocolMessage } from "../otel/protocol.js";

export class SidecarConnection extends Context.Tag("SidecarConnection")<
	SidecarConnection,
	{
		readonly emit: (message: typeof SidecarProtocolMessage.Type) => Effect.Effect<void>;
		readonly preconnect: Effect.Effect<void>;
		readonly flush: (timeoutMs?: number) => Effect.Effect<boolean>;
	}
>() {}
