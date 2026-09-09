import { describe, expect, test } from "bun:test";
import type { Meter, Tracer } from "@opentelemetry/api";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { Effect, Layer } from "effect";
import { MessageRouterLive } from "../../src/layers/MessageRouterLive.js";
import type { EventData, MetricData, SpanData } from "../../src/otel/protocol.js";
import { MessageRouter } from "../../src/services/MessageRouter.js";

// =============================================================================
// Service tag
// =============================================================================

describe("MessageRouter service tag", () => {
	test("is defined with correct tag key", () => {
		expect(MessageRouter.key).toBe("MessageRouter");
	});
});

// =============================================================================
// Layer construction
// =============================================================================

describe("MessageRouterLive", () => {
	test("is a Layer", () => {
		expect(typeof MessageRouterLive.pipe).toBe("function");
	});
});

// =============================================================================
// handleEvent (replaces EventHandler.handle)
// =============================================================================

const runWithRouter = <A>(effect: Effect.Effect<A, never, MessageRouter>) =>
	Effect.runPromise(Effect.provide(effect, MessageRouterLive));

describe("MessageRouter.handleEvent", () => {
	test("emits log record with correct severity and body", async () => {
		const emitted: unknown[] = [];
		const mockLogger: Logger = {
			emit: (record) => {
				emitted.push(record);
			},
		};

		const data: EventData = {
			name: "hook.execution",
			timeNs: BigInt(1_700_000_000_000_000_000),
			severity: "warn",
			body: "Something happened",
			attributes: { "hook.name": "pre-bash" },
		};

		await runWithRouter(
			Effect.gen(function* () {
				const router = yield* MessageRouter;
				yield* router.handleEvent(data, mockLogger);
			}),
		);

		expect(emitted).toHaveLength(1);
		const record = emitted[0] as Record<string, unknown>;
		expect(record.severityNumber).toBe(SeverityNumber.WARN);
		expect(record.severityText).toBe("WARN");
		expect(record.body).toBe("Something happened");
		expect((record.attributes as Record<string, unknown>)["event.name"]).toBe("hook.execution");
		expect((record.attributes as Record<string, unknown>)["hook.name"]).toBe("pre-bash");
	});

	test("defaults severity to info when not provided", async () => {
		const emitted: unknown[] = [];
		const mockLogger: Logger = {
			emit: (record) => {
				emitted.push(record);
			},
		};

		const data: EventData = {
			name: "test.event",
			timeNs: BigInt(1_000_000_000),
		};

		await runWithRouter(
			Effect.gen(function* () {
				const router = yield* MessageRouter;
				yield* router.handleEvent(data, mockLogger);
			}),
		);

		const record = emitted[0] as Record<string, unknown>;
		expect(record.severityNumber).toBe(SeverityNumber.INFO);
		expect(record.severityText).toBe("INFO");
		// Body falls back to name when not provided
		expect(record.body).toBe("test.event");
	});
});

// =============================================================================
// handleSpan (replaces SpanHandler.handle)
// =============================================================================

describe("MessageRouter.handleSpan", () => {
	test("creates and ends a span with correct attributes", async () => {
		const spans: Array<{
			name: string;
			options: Record<string, unknown>;
			events: Array<{ name: string; attributes?: unknown; time?: unknown }>;
			status?: { code: number; message?: string };
			endTime?: unknown;
		}> = [];

		const mockSpan = {
			addEvent: (name: string, attributes?: unknown, time?: unknown) => {
				spans[spans.length - 1].events.push({ name, attributes, time });
			},
			setStatus: (status: { code: number; message?: string }) => {
				spans[spans.length - 1].status = status;
			},
			recordException: (_err: Error) => {},
			end: (endTime?: unknown) => {
				spans[spans.length - 1].endTime = endTime;
			},
			setAttribute: () => mockSpan,
			setAttributes: () => mockSpan,
			isRecording: () => true,
			spanContext: () => ({
				traceId: "0",
				spanId: "0",
				traceFlags: 0,
			}),
			updateName: () => mockSpan,
		};

		const mockTracer: Tracer = {
			startSpan: (name: string, options?: Record<string, unknown>) => {
				spans.push({ name, options: options ?? {}, events: [] });
				return mockSpan as unknown as ReturnType<Tracer["startSpan"]>;
			},
			startActiveSpan: (() => {}) as Tracer["startActiveSpan"],
		};

		const data: SpanData = {
			spanId: "abc123",
			traceId: "def456",
			name: "hook.execute",
			kind: "internal",
			startTimeNs: BigInt(1_700_000_000_000_000_000),
			endTimeNs: BigInt(1_700_000_001_000_000_000),
			attributes: { "hook.name": "pre-bash" },
			status: { code: "ok" },
			events: [
				{
					name: "event1",
					timeNs: BigInt(1_700_000_000_500_000_000),
					attributes: { key: "value" },
				},
			],
		};

		await runWithRouter(
			Effect.gen(function* () {
				const router = yield* MessageRouter;
				yield* router.handleSpan(data, mockTracer);
			}),
		);

		expect(spans).toHaveLength(1);
		expect(spans[0].name).toBe("hook.execute");
		expect(spans[0].options.kind).toBe(SpanKind.INTERNAL);
		expect(spans[0].options.attributes).toEqual({ "hook.name": "pre-bash" });
		expect(spans[0].events).toHaveLength(1);
		expect(spans[0].events[0].name).toBe("event1");
		expect(spans[0].status).toEqual({ code: SpanStatusCode.OK });
		expect(spans[0].endTime).toBeDefined();
	});

	test("handles span without optional fields", async () => {
		const spans: Array<{ name: string }> = [];
		const mockSpan = {
			addEvent: () => {},
			setStatus: () => {},
			recordException: () => {},
			end: () => {},
			setAttribute: () => mockSpan,
			setAttributes: () => mockSpan,
			isRecording: () => true,
			spanContext: () => ({ traceId: "0", spanId: "0", traceFlags: 0 }),
			updateName: () => mockSpan,
		};

		const mockTracer: Tracer = {
			startSpan: (name: string) => {
				spans.push({ name });
				return mockSpan as unknown as ReturnType<Tracer["startSpan"]>;
			},
			startActiveSpan: (() => {}) as Tracer["startActiveSpan"],
		};

		const data: SpanData = {
			spanId: "abc",
			traceId: "def",
			name: "minimal.span",
			kind: "client",
			startTimeNs: BigInt(1_000_000_000),
		};

		await runWithRouter(
			Effect.gen(function* () {
				const router = yield* MessageRouter;
				yield* router.handleSpan(data, mockTracer);
			}),
		);

		expect(spans).toHaveLength(1);
		expect(spans[0].name).toBe("minimal.span");
	});
});

// =============================================================================
// handleMetric (replaces MetricHandler.handle)
// =============================================================================

describe("MessageRouter.handleMetric", () => {
	test("records a counter metric", async () => {
		const recorded: Array<{ type: string; name: string; value: number }> = [];
		const mockCounter = {
			add: (value: number) => {
				recorded.push({ type: "counter", name: "hook.count", value });
			},
		};

		const mockMeter: Meter = {
			createCounter: (_name: string) => mockCounter as unknown as ReturnType<Meter["createCounter"]>,
			createUpDownCounter: () => ({}) as unknown as ReturnType<Meter["createUpDownCounter"]>,
			createHistogram: () => ({}) as unknown as ReturnType<Meter["createHistogram"]>,
			createGauge: () => ({}) as unknown as ReturnType<Meter["createGauge"]>,
			createObservableCounter: () => ({}) as unknown as ReturnType<Meter["createObservableCounter"]>,
			createObservableUpDownCounter: () => ({}) as unknown as ReturnType<Meter["createObservableUpDownCounter"]>,
			createObservableGauge: () => ({}) as unknown as ReturnType<Meter["createObservableGauge"]>,
			addBatchObservableCallback: () => {},
			removeBatchObservableCallback: () => {},
		};

		const data: MetricData = {
			name: "hook.count",
			type: { kind: "counter", value: 1 },
			timeNs: BigInt(Date.now()) * 1_000_000n,
		};

		// Use a fresh layer instance per test to avoid cache interference
		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}),
				MessageRouterLive,
			),
		);

		expect(recorded).toHaveLength(1);
		expect(recorded[0].value).toBe(1);
	});

	test("records a histogram metric", async () => {
		const recorded: Array<{ value: number }> = [];
		const mockHistogram = {
			record: (value: number) => {
				recorded.push({ value });
			},
		};

		const mockMeter: Meter = {
			createCounter: () => ({}) as unknown as ReturnType<Meter["createCounter"]>,
			createUpDownCounter: () => ({}) as unknown as ReturnType<Meter["createUpDownCounter"]>,
			createHistogram: () => mockHistogram as unknown as ReturnType<Meter["createHistogram"]>,
			createGauge: () => ({}) as unknown as ReturnType<Meter["createGauge"]>,
			createObservableCounter: () => ({}) as unknown as ReturnType<Meter["createObservableCounter"]>,
			createObservableUpDownCounter: () => ({}) as unknown as ReturnType<Meter["createObservableUpDownCounter"]>,
			createObservableGauge: () => ({}) as unknown as ReturnType<Meter["createObservableGauge"]>,
			addBatchObservableCallback: () => {},
			removeBatchObservableCallback: () => {},
		};

		const data: MetricData = {
			name: "hook.duration",
			unit: "ms",
			type: { kind: "histogram", value: 42.5 },
			timeNs: BigInt(Date.now()) * 1_000_000n,
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}),
				MessageRouterLive,
			),
		);

		expect(recorded).toHaveLength(1);
		expect(recorded[0].value).toBe(42.5);
	});

	test("records a non-monotonic counter as UpDownCounter", async () => {
		const recorded: Array<{ value: number }> = [];
		const mockUpDown = {
			add: (value: number) => {
				recorded.push({ value });
			},
		};

		const mockMeter: Meter = {
			createCounter: () => ({}) as unknown as ReturnType<Meter["createCounter"]>,
			createUpDownCounter: () => mockUpDown as unknown as ReturnType<Meter["createUpDownCounter"]>,
			createHistogram: () => ({}) as unknown as ReturnType<Meter["createHistogram"]>,
			createGauge: () => ({}) as unknown as ReturnType<Meter["createGauge"]>,
			createObservableCounter: () => ({}) as unknown as ReturnType<Meter["createObservableCounter"]>,
			createObservableUpDownCounter: () => ({}) as unknown as ReturnType<Meter["createObservableUpDownCounter"]>,
			createObservableGauge: () => ({}) as unknown as ReturnType<Meter["createObservableGauge"]>,
			addBatchObservableCallback: () => {},
			removeBatchObservableCallback: () => {},
		};

		const data: MetricData = {
			name: "hook.active",
			type: { kind: "counter", value: -1, monotonic: false },
			timeNs: BigInt(Date.now()) * 1_000_000n,
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const router = yield* MessageRouter;
					yield* router.handleMetric(data, mockMeter);
				}),
				MessageRouterLive,
			),
		);

		expect(recorded).toHaveLength(1);
		expect(recorded[0].value).toBe(-1);
	});
});
