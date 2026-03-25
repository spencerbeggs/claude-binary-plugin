import type { Tracer } from "@opentelemetry/api";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { SpanData } from "./protocol.js";

/**
 * Map from protocol span kinds to OTEL SpanKind.
 */
const SPAN_KIND_MAP: Record<SpanData["kind"], SpanKind> = {
	client: SpanKind.CLIENT,
	server: SpanKind.SERVER,
	producer: SpanKind.PRODUCER,
	consumer: SpanKind.CONSUMER,
	internal: SpanKind.INTERNAL,
};

/**
 * Map from protocol status codes to OTEL SpanStatusCode.
 */
const STATUS_CODE_MAP: Record<NonNullable<SpanData["status"]>["code"], SpanStatusCode> = {
	unset: SpanStatusCode.UNSET,
	ok: SpanStatusCode.OK,
	error: SpanStatusCode.ERROR,
};

/**
 * Convert nanoseconds (BigInt) to OTEL HrTime format.
 * HrTime is a tuple of [seconds, nanoseconds] where both are numbers.
 */
const nsToHrTime = (ns: bigint): [number, number] => {
	const NS_PER_SECOND = 1_000_000_000n;
	const seconds = Number(ns / NS_PER_SECOND);
	const nanos = Number(ns % NS_PER_SECOND);
	return [seconds, nanos];
};

/**
 * Handle a span message from a hook.
 *
 * Converts SpanData from the IPC protocol into an OTEL span with proper
 * timing, attributes, events, and status. The span is created and immediately
 * ended with the original timestamps preserved.
 *
 * @param data - Span data from the hook
 * @param tracer - OTEL Tracer instance to create spans with
 *
 * @example
 * ```typescript
 * import { trace } from "@opentelemetry/api";
 * SpanHandler.handle({
 *   spanId: "abc123",
 *   traceId: "def456",
 *   name: "hook.execute",
 *   kind: "internal",
 *   startTimeNs: BigInt(1700000000000000000),
 *   endTimeNs: BigInt(1700000001000000000),
 *   attributes: { "hook.name": "pre-bash" },
 *   status: { code: "ok" },
 * }, trace.getTracer("default"));
 * ```
 *
 * @public
 */
export const SpanHandler = {
	handle(data: SpanData, tracer: Tracer): void {
		// Convert BigInt nanoseconds to OTEL HrTime format [seconds, nanoseconds]
		const startTime = nsToHrTime(data.startTimeNs);

		// Create span with original timing
		const span = tracer.startSpan(
			data.name,
			{
				kind: SPAN_KIND_MAP[data.kind],
				...(data.attributes !== undefined && { attributes: data.attributes }),
				startTime,
			},
			// No parent context - spans from hooks are independent
		);

		// Add events if present
		if (data.events) {
			for (const event of data.events) {
				span.addEvent(event.name, event.attributes, nsToHrTime(event.timeNs));
			}
		}

		// Set status if provided
		if (data.status) {
			span.setStatus({
				code: STATUS_CODE_MAP[data.status.code],
				...(data.status.message !== undefined && { message: data.status.message }),
			});

			// Record exception for error status
			if (data.status.code === "error" && data.status.message) {
				span.recordException(new Error(data.status.message));
			}
		}

		// End span with original end time
		const endTime = data.endTimeNs ? nsToHrTime(data.endTimeNs) : undefined;
		span.end(endTime);
	},
};
