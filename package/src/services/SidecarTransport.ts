import type { Effect } from "effect";
import { Context } from "effect";

/**
 * SidecarTransport manages the Unix socket server in the sidecar process.
 *
 * It listens for IPC messages from hook processes and routes them to the
 * appropriate OTEL handler (spans, events, metrics). The `lastActivity` Ref
 * (provided externally) is updated on every message receipt, enabling idle
 * timeout coordination with SidecarMain.
 *
 * @public
 */
export class SidecarTransport extends Context.Tag("SidecarTransport")<
	SidecarTransport,
	{
		/** Number of currently connected clients. */
		readonly clientCount: Effect.Effect<number>;
	}
>() {}
