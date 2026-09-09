import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Meter, Tracer } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import { Effect } from "effect";
import { MessageRouterLive } from "../../src/layers/MessageRouterLive.js";
import { makeMessageRouterTest } from "../../src/layers/MessageRouterTest.js";
import type { EventData, MetricData, SpanData } from "../../src/otel/protocol.js";
import { MessageRouter } from "../../src/services/MessageRouter.js";

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

interface MockSpanOps {
	addEvent: Array<{ name: string; attributes?: Record<string, string | number | boolean>; time?: unknown }>;
	setStatus: Array<{ code: number; message?: string }>;
	recordException: Array<{ message: string }>;
	endTime: unknown;
}

function makeTracerMock(): { mockTracer: Tracer; spanOps: MockSpanOps } {
	const spanOps: MockSpanOps = {
		addEvent: [],
		setStatus: [],
		recordException: [],
		endTime: undefined,
	};

	const mockSpan = {
		addEvent: mock((name: string, attributes?: Record<string, string | number | boolean>, time?: unknown) => {
			spanOps.addEvent.push({
				name,
				...(attributes !== undefined && { attributes }),
				...(time !== undefined && { time }),
			});
		}),
		setStatus: mock((status: { code: number; message?: string }) => {
			spanOps.setStatus.push(status);
		}),
		recordException: mock((error: Error) => {
			spanOps.recordException.push({ message: error.message });
		}),
		end: mock((endTime?: unknown) => {
			spanOps.endTime = endTime;
		}),
	};

	const mockTracer = {
		startSpan: mock(() => mockSpan),
		startActiveSpan: mock(() => {}),
	} as unknown as Tracer;

	return { mockTracer, spanOps };
}

interface MockLoggerOps {
	emitCalls: Array<Record<string, unknown>>;
}

function makeLoggerMock(): { mockLogger: Logger; logOps: MockLoggerOps } {
	const logOps: MockLoggerOps = { emitCalls: [] };
	const mockLogger = {
		emit: mock((record: Record<string, unknown>) => {
			logOps.emitCalls.push(record);
		}),
	} as unknown as Logger;
	return { mockLogger, logOps };
}

function makeMeterMock() {
	const mockCounter = { add: mock(() => {}) };
	const mockUpDownCounter = { add: mock(() => {}) };
	const mockHistogram = { record: mock(() => {}) };

	const mockMeter = {
		createCounter: mock(() => mockCounter),
		createUpDownCounter: mock(() => mockUpDownCounter),
		createHistogram: mock(() => mockHistogram),
		createGauge: mock(() => ({})),
		createObservableCounter: mock(() => ({})),
		createObservableUpDownCounter: mock(() => ({})),
		createObservableGauge: mock(() => ({})),
		addBatchObservableCallback: mock(() => {}),
		removeBatchObservableCallback: mock(() => {}),
	} as unknown as Meter;

	return { mockMeter, mockCounter, mockUpDownCounter, mockHistogram };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageRouter service", () => {
	describe("handleSpan", () => {
		test("creates and ends span with correct timing", async () => {
			const { mockTracer, spanOps } = makeTracerMock();

			const data: SpanData = {
				spanId: "abc123",
				traceId: "def456",
				name: "hook.execute",
				kind: "internal",
				startTimeNs: 1700000000000000000n,
				endTimeNs: 1700000001000000000n,
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleSpan(data, mockTracer);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(mockTracer.startSpan as ReturnType<typeof mock>).toHaveBeenCalled();
			expect(spanOps.endTime).toBeDefined();
		});

		test("adds events to span", async () => {
			const { mockTracer, spanOps } = makeTracerMock();

			const data: SpanData = {
				spanId: "abc123",
				traceId: "def456",
				name: "hook.execute",
				kind: "internal",
				startTimeNs: 1700000000000000000n,
				endTimeNs: 1700000001000000000n,
				events: [
					{ name: "validation.start", timeNs: 1700000000100000000n, attributes: { "validation.type": "schema" } },
					{ name: "validation.end", timeNs: 1700000000500000000n },
				],
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleSpan(data, mockTracer);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(spanOps.addEvent).toHaveLength(2);
			expect(spanOps.addEvent[0]?.name).toBe("validation.start");
			expect(spanOps.addEvent[0]?.attributes).toEqual({ "validation.type": "schema" });
			expect(spanOps.addEvent[1]?.name).toBe("validation.end");
		});

		test("records exception for error status with message", async () => {
			const { mockTracer, spanOps } = makeTracerMock();

			const data: SpanData = {
				spanId: "abc123",
				traceId: "def456",
				name: "hook.execute",
				kind: "internal",
				startTimeNs: 1700000000000000000n,
				status: { code: "error", message: "Validation failed" },
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleSpan(data, mockTracer);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			// SpanStatusCode.ERROR = 2
			expect(spanOps.setStatus[0]?.code).toBe(2);
			expect(spanOps.setStatus[0]?.message).toBe("Validation failed");
			expect(spanOps.recordException).toHaveLength(1);
			expect(spanOps.recordException[0]?.message).toBe("Validation failed");
		});
	});

	describe("handleEvent", () => {
		test("emits log record with correct severity for error", async () => {
			const { mockLogger, logOps } = makeLoggerMock();

			const data: EventData = {
				name: "hook.error",
				timeNs: 1700000000000000000n,
				severity: "error",
				body: "Something failed",
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleEvent(data, mockLogger);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(logOps.emitCalls).toHaveLength(1);
			// SeverityNumber.ERROR = 17
			expect(logOps.emitCalls[0]?.severityNumber).toBe(17);
			expect(logOps.emitCalls[0]?.severityText).toBe("ERROR");
		});

		test("defaults to info severity (9) when severity not provided", async () => {
			const { mockLogger, logOps } = makeLoggerMock();

			const data: EventData = {
				name: "hook.execution",
				timeNs: 1700000000000000000n,
				body: "Hook executed successfully",
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleEvent(data, mockLogger);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			// SeverityNumber.INFO = 9
			expect(logOps.emitCalls[0]?.severityNumber).toBe(9);
			expect(logOps.emitCalls[0]?.severityText).toBe("INFO");
		});

		test("uses event name as body when body not provided", async () => {
			const { mockLogger, logOps } = makeLoggerMock();

			const data: EventData = {
				name: "hook.start",
				timeNs: 1700000000000000000n,
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleEvent(data, mockLogger);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(logOps.emitCalls[0]?.body).toBe("hook.start");
		});
	});

	describe("handleMetric", () => {
		let mocks: ReturnType<typeof makeMeterMock>;

		beforeEach(() => {
			mocks = makeMeterMock();
		});

		test("creates monotonic counter with createCounter, calls add", async () => {
			const { mockMeter, mockCounter } = mocks;

			const data: MetricData = {
				name: "test.counter",
				description: "Test counter",
				unit: "1",
				type: { kind: "counter", value: 5 },
				attributes: { key: "value" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(mockMeter.createCounter as ReturnType<typeof mock>).toHaveBeenCalledWith("test.counter", {
				description: "Test counter",
				unit: "1",
			});
			expect(mockCounter.add).toHaveBeenCalledWith(5, { key: "value" });
		});

		test("creates non-monotonic counter as UpDownCounter", async () => {
			const { mockMeter, mockUpDownCounter } = mocks;

			const data: MetricData = {
				name: "test.updown",
				description: "Test up-down counter",
				unit: "items",
				type: { kind: "counter", value: -3, monotonic: false },
				attributes: { env: "test" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(mockMeter.createUpDownCounter as ReturnType<typeof mock>).toHaveBeenCalledWith("test.updown", {
				description: "Test up-down counter",
				unit: "items",
			});
			expect(mockUpDownCounter.add).toHaveBeenCalledWith(-3, { env: "test" });
			expect(mockMeter.createCounter as ReturnType<typeof mock>).not.toHaveBeenCalled();
		});

		test("creates histogram and calls record", async () => {
			const { mockMeter, mockHistogram } = mocks;

			const data: MetricData = {
				name: "test.histogram",
				description: "Test histogram",
				unit: "ms",
				type: { kind: "histogram", value: 150.5 },
				attributes: { operation: "read" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(mockMeter.createHistogram as ReturnType<typeof mock>).toHaveBeenCalledWith("test.histogram", {
				description: "Test histogram",
				unit: "ms",
			});
			expect(mockHistogram.record).toHaveBeenCalledWith(150.5, { operation: "read" });
		});

		test("caches instruments — createCounter called once for two handle calls", async () => {
			const { mockMeter, mockCounter } = mocks;

			const data: MetricData = {
				name: "test.counter.cached",
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
					yield* router.handleMetric({ ...data, type: { kind: "counter", value: 2 } }, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			// Instrument created only once, but add called twice
			expect(mockMeter.createCounter as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
			expect(mockCounter.add).toHaveBeenCalledTimes(2);
		});

		test("creates gauge as UpDownCounter", async () => {
			const { mockMeter, mockUpDownCounter } = mocks;

			const data: MetricData = {
				name: "test.gauge",
				description: "Test gauge",
				unit: "percent",
				type: { kind: "gauge", value: 75.5 },
				attributes: { host: "localhost" },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			expect(mockMeter.createUpDownCounter as ReturnType<typeof mock>).toHaveBeenCalledWith("test.gauge", {
				description: "Test gauge",
				unit: "percent",
			});
			expect(mockUpDownCounter.add).toHaveBeenCalledWith(75.5, { host: "localhost" });
			expect(mockMeter.createCounter as ReturnType<typeof mock>).not.toHaveBeenCalled();
		});

		test("clearCaches resets — createCounter called twice when cache cleared between", async () => {
			const { mockMeter } = mocks;

			const data: MetricData = {
				name: "cached.counter",
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
					yield* router.clearCaches;
					yield* router.handleMetric(data, mockMeter);
				}).pipe(Effect.provide(MessageRouterLive)),
			);

			// Counter created twice because cache was cleared between calls
			expect(mockMeter.createCounter as ReturnType<typeof mock>).toHaveBeenCalledTimes(2);
		});
	});

	describe("makeMessageRouterTest", () => {
		test("provides a no-op layer for all handlers", async () => {
			const layer = makeMessageRouterTest();
			const { mockTracer } = makeTracerMock();
			const { mockLogger } = makeLoggerMock();
			const { mockMeter } = makeMeterMock();

			// Should not throw — all handlers are Effect.void
			await Effect.runPromise(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleSpan(
						{
							spanId: "x",
							traceId: "y",
							name: "test",
							kind: "internal",
							startTimeNs: 0n,
						},
						mockTracer,
					);
					yield* router.handleEvent({ name: "test", timeNs: 0n }, mockLogger);
					yield* router.handleMetric(
						{
							name: "test",
							type: { kind: "counter", value: 1 },
							timeNs: 0n,
						},
						mockMeter,
					);
					yield* router.clearCaches;
				}).pipe(Effect.provide(layer)),
			);

			// No instruments created — test layer is all no-ops
			expect(mockMeter.createCounter as ReturnType<typeof mock>).not.toHaveBeenCalled();
		});
	});
});
