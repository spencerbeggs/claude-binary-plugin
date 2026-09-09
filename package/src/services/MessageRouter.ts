import type { Meter, Tracer } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import type { Effect } from "effect";
import { Context } from "effect";
import type { EventData, MetricData, SpanData } from "../otel/protocol.js";

/**
 * MessageRouter routes incoming IPC messages to the appropriate OTEL handler.
 *
 * A leaf service with no Effect dependencies. Absorbs the logic from
 * SpanHandler, EventHandler, and MetricHandler with Ref-based instrument caching.
 *
 * @public
 */
export class MessageRouter extends Context.Tag("MessageRouter")<
	MessageRouter,
	{
		readonly handleSpan: (data: SpanData, tracer: Tracer) => Effect.Effect<void>;
		readonly handleEvent: (data: EventData, logger: Logger) => Effect.Effect<void>;
		readonly handleMetric: (data: MetricData, meter: Meter) => Effect.Effect<void>;
		readonly clearCaches: Effect.Effect<void>;
	}
>() {}
