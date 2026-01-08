/**
 * Span message handler for OTEL sidecar.
 *
 * Creates OTEL spans from SpanData messages received from hooks.
 *
 */

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { SpanData } from "../../protocol.js";
import { SidecarProviders } from "./SidecarProviders.js";

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
 * Static class for handling span messages from hooks.
 *
 * Converts SpanData from the IPC protocol into OTEL spans
 * with proper timing, attributes, events, and status.
 *
 * @example
 * ```typescript
 * SpanHandler.handle({
 *   spanId: "abc123",
 *   traceId: "def456",
 *   name: "hook.execute",
 *   kind: "internal",
 *   startTimeNs: BigInt(1700000000000000000),
 *   endTimeNs: BigInt(1700000001000000000),
 *   attributes: { "hook.name": "pre-bash" },
 *   status: { code: "ok" },
 * });
 * ```
 *
 * @public
 */
export class SpanHandler {
	/**
	 * Handle a span message from a hook.
	 *
	 * Creates an OTEL span with the provided data and immediately ends it.
	 * Spans are created with their original timestamps preserved.
	 *
	 * @param data - Span data from the hook
	 */
	static handle(data: SpanData): void {
		const tracer = SidecarProviders.getTracer();

		// Convert BigInt nanoseconds to OTEL HrTime format [seconds, nanoseconds]
		const startTime = SpanHandler.nsToHrTime(data.startTimeNs);

		// Create span with original timing
		const span = tracer.startSpan(
			data.name,
			{
				kind: SPAN_KIND_MAP[data.kind],
				attributes: data.attributes,
				startTime,
			},
			// No parent context - spans from hooks are independent
		);

		// Add events if present
		if (data.events) {
			for (const event of data.events) {
				span.addEvent(event.name, event.attributes, SpanHandler.nsToHrTime(event.timeNs));
			}
		}

		// Set status if provided
		if (data.status) {
			span.setStatus({
				code: STATUS_CODE_MAP[data.status.code],
				message: data.status.message,
			});

			// Record exception for error status
			if (data.status.code === "error" && data.status.message) {
				span.recordException(new Error(data.status.message));
			}
		}

		// End span with original end time
		const endTime = data.endTimeNs ? SpanHandler.nsToHrTime(data.endTimeNs) : undefined;
		span.end(endTime);
	}

	/**
	 * Convert nanoseconds (BigInt) to OTEL HrTime format.
	 *
	 * HrTime is a tuple of [seconds, nanoseconds] where both are numbers.
	 *
	 * @param ns - Nanoseconds as BigInt
	 * @returns HrTime tuple
	 */
	private static nsToHrTime(ns: bigint): [number, number] {
		const NS_PER_SECOND = 1_000_000_000n;
		const seconds = Number(ns / NS_PER_SECOND);
		const nanos = Number(ns % NS_PER_SECOND);
		return [seconds, nanos];
	}
}
