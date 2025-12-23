/**
 * Span message handler for OTEL sidecar.
 *
 * Creates OTEL spans from SpanData messages received from hooks.
 *
 * @module
 */

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { SpanData } from "../../protocol.js";
import { getTracer } from "../providers.js";

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
 * Handle a span message from a hook.
 *
 * Creates an OTEL span with the provided data and immediately ends it.
 * Spans are created with their original timestamps preserved.
 *
 * @param data - Span data from the hook
 */
export function handleSpan(data: SpanData): void {
	const tracer = getTracer();

	// Convert BigInt nanoseconds to OTEL HrTime format [seconds, nanoseconds]
	const startTime = nsToHrTime(data.startTimeNs);

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
			span.addEvent(event.name, event.attributes, nsToHrTime(event.timeNs));
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
	const endTime = data.endTimeNs ? nsToHrTime(data.endTimeNs) : undefined;
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
function nsToHrTime(ns: bigint): [number, number] {
	const NS_PER_SECOND = 1_000_000_000n;
	const seconds = Number(ns / NS_PER_SECOND);
	const nanos = Number(ns % NS_PER_SECOND);
	return [seconds, nanos];
}
