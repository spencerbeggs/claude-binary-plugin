import type { Counter, Histogram, UpDownCounter } from "@opentelemetry/api";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { Effect, Layer, Ref } from "effect";
import type { EventData, SpanData } from "../otel/protocol.js";
import { MessageRouter } from "../services/MessageRouter.js";

/**
 * Convert nanoseconds (BigInt) to OTEL HrTime format [seconds, nanoseconds].
 */
const nsToHrTime = (ns: bigint): [number, number] => {
	const NS_PER_SECOND = 1_000_000_000n;
	const seconds = Number(ns / NS_PER_SECOND);
	const nanos = Number(ns % NS_PER_SECOND);
	return [seconds, nanos];
};

/**
 * Convert nanoseconds (BigInt) to milliseconds (number).
 */
const nsToMs = (ns: bigint): number => Number(ns / 1_000_000n);

const SPAN_KIND_MAP: Record<SpanData["kind"], SpanKind> = {
	client: SpanKind.CLIENT,
	server: SpanKind.SERVER,
	producer: SpanKind.PRODUCER,
	consumer: SpanKind.CONSUMER,
	internal: SpanKind.INTERNAL,
};

const STATUS_CODE_MAP: Record<NonNullable<SpanData["status"]>["code"], SpanStatusCode> = {
	unset: SpanStatusCode.UNSET,
	ok: SpanStatusCode.OK,
	error: SpanStatusCode.ERROR,
};

const SEVERITY_MAP: Record<NonNullable<EventData["severity"]>, SeverityNumber> = {
	trace: SeverityNumber.TRACE,
	debug: SeverityNumber.DEBUG,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL,
};

const SEVERITY_TEXT_MAP: Record<NonNullable<EventData["severity"]>, string> = {
	trace: "TRACE",
	debug: "DEBUG",
	info: "INFO",
	warn: "WARN",
	error: "ERROR",
	fatal: "FATAL",
};

/**
 * MessageRouterLive provides the live implementation of the MessageRouter service.
 *
 * Uses Ref-based caches for metric instruments to avoid recreating them
 * on every metric message. Caches are keyed by instrument name.
 */
export const MessageRouterLive: Layer.Layer<MessageRouter> = Layer.effect(
	MessageRouter,
	Effect.gen(function* () {
		const countersRef = yield* Ref.make(new Map<string, Counter>());
		const upDownCountersRef = yield* Ref.make(new Map<string, UpDownCounter>());
		const histogramsRef = yield* Ref.make(new Map<string, Histogram>());

		return {
			handleSpan: (data, tracer) =>
				Effect.sync(() => {
					const startTime = nsToHrTime(data.startTimeNs);

					const span = tracer.startSpan(data.name, {
						kind: SPAN_KIND_MAP[data.kind],
						...(data.attributes !== undefined && { attributes: data.attributes }),
						startTime,
					});

					if (data.events) {
						for (const event of data.events) {
							span.addEvent(event.name, event.attributes, nsToHrTime(event.timeNs));
						}
					}

					if (data.status) {
						span.setStatus({
							code: STATUS_CODE_MAP[data.status.code],
							...(data.status.message !== undefined && { message: data.status.message }),
						});

						if (data.status.code === "error" && data.status.message) {
							span.recordException(new Error(data.status.message));
						}
					}

					const endTime = data.endTimeNs ? nsToHrTime(data.endTimeNs) : undefined;
					span.end(endTime);
				}),

			handleEvent: (data, logger) =>
				Effect.sync(() => {
					const severity = data.severity ?? "info";

					logger.emit({
						severityNumber: SEVERITY_MAP[severity],
						severityText: SEVERITY_TEXT_MAP[severity],
						body: data.body ?? data.name,
						attributes: {
							"event.name": data.name,
							...data.attributes,
						},
						timestamp: nsToMs(data.timeNs),
					});
				}),

			handleMetric: (data, meter) =>
				Effect.gen(function* () {
					switch (data.type.kind) {
						case "counter": {
							const isMonotonic = data.type.monotonic !== false;
							if (isMonotonic) {
								const counters = yield* Ref.get(countersRef);
								const existing = counters.get(data.name);
								const counter =
									existing ??
									meter.createCounter(data.name, {
										...(data.description !== undefined && { description: data.description }),
										...(data.unit !== undefined && { unit: data.unit }),
									});
								if (!existing) {
									yield* Ref.update(countersRef, (m) => new Map(m).set(data.name, counter));
								}
								counter.add(data.type.value, data.attributes);
							} else {
								const upDownCounters = yield* Ref.get(upDownCountersRef);
								const existing = upDownCounters.get(data.name);
								const upDownCounter =
									existing ??
									meter.createUpDownCounter(data.name, {
										...(data.description !== undefined && { description: data.description }),
										...(data.unit !== undefined && { unit: data.unit }),
									});
								if (!existing) {
									yield* Ref.update(upDownCountersRef, (m) => new Map(m).set(data.name, upDownCounter));
								}
								upDownCounter.add(data.type.value, data.attributes);
							}
							break;
						}

						case "gauge": {
							const upDownCounters = yield* Ref.get(upDownCountersRef);
							const existing = upDownCounters.get(data.name);
							const gauge =
								existing ??
								meter.createUpDownCounter(data.name, {
									...(data.description !== undefined && { description: data.description }),
									...(data.unit !== undefined && { unit: data.unit }),
								});
							if (!existing) {
								yield* Ref.update(upDownCountersRef, (m) => new Map(m).set(data.name, gauge));
							}
							gauge.add(data.type.value, data.attributes);
							break;
						}

						case "histogram": {
							const histograms = yield* Ref.get(histogramsRef);
							const existing = histograms.get(data.name);
							const histogram =
								existing ??
								meter.createHistogram(data.name, {
									...(data.description !== undefined && { description: data.description }),
									...(data.unit !== undefined && { unit: data.unit }),
								});
							if (!existing) {
								yield* Ref.update(histogramsRef, (m) => new Map(m).set(data.name, histogram));
							}
							histogram.record(data.type.value, data.attributes);
							break;
						}
					}
				}),

			clearCaches: Effect.gen(function* () {
				yield* Ref.set(countersRef, new Map());
				yield* Ref.set(upDownCountersRef, new Map());
				yield* Ref.set(histogramsRef, new Map());
			}),
		} satisfies MessageRouter["Type"];
	}),
);
