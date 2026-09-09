import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { EventData, MetricData, SidecarProtocolMessage, SpanData } from "../../src/otel/protocol.js";

// =============================================================================
// EventData
// =============================================================================

describe("EventData roundtrip", () => {
	test("encodes bigint timeNs as string and decodes back to bigint", () => {
		const input = Schema.decodeUnknownSync(EventData)({
			name: "test.event",
			timeNs: "1700000000000000000",
			severity: "info",
			body: "Something happened",
			attributes: { "key.one": "value", count: 42 },
		});

		const encoded = Schema.encodeSync(EventData)(input);
		expect(typeof encoded.timeNs).toBe("string");
		expect(encoded.timeNs).toBe("1700000000000000000");

		const decoded = Schema.decodeUnknownSync(EventData)(encoded);
		expect(decoded.timeNs).toBe(1_700_000_000_000_000_000n);
		expect(decoded.name).toBe("test.event");
		expect(decoded.severity).toBe("info");
		expect(decoded.body).toBe("Something happened");
	});

	test("optional fields are omitted when absent", () => {
		const input = Schema.decodeUnknownSync(EventData)({
			name: "minimal.event",
			timeNs: "1",
		});

		const encoded = Schema.encodeSync(EventData)(input);
		expect(encoded.severity).toBeUndefined();
		expect(encoded.body).toBeUndefined();
		expect(encoded.scope).toBeUndefined();
	});

	test("scope field encodes and decodes correctly", () => {
		const input = Schema.decodeUnknownSync(EventData)({
			name: "scoped.event",
			timeNs: "999",
			scope: { name: "my.instrumentation", version: "1.0.0" },
		});

		const encoded = Schema.encodeSync(EventData)(input);
		const decoded = Schema.decodeUnknownSync(EventData)(encoded);
		expect(decoded.scope?.name).toBe("my.instrumentation");
		expect(decoded.scope?.version).toBe("1.0.0");
	});
});

// =============================================================================
// SpanData
// =============================================================================

describe("SpanData roundtrip", () => {
	test("encodes startTimeNs and endTimeNs as strings and decodes back to bigints", () => {
		const input = Schema.decodeUnknownSync(SpanData)({
			spanId: "abc123def456",
			traceId: "trace-id-hex-32-chars-long",
			name: "http.request",
			kind: "client",
			startTimeNs: "1700000000000000000",
			endTimeNs: "1700000000500000000",
		});

		const encoded = Schema.encodeSync(SpanData)(input);
		expect(typeof encoded.startTimeNs).toBe("string");
		expect(typeof encoded.endTimeNs).toBe("string");
		expect(encoded.startTimeNs).toBe("1700000000000000000");
		expect(encoded.endTimeNs).toBe("1700000000500000000");

		const decoded = Schema.decodeUnknownSync(SpanData)(encoded);
		expect(decoded.startTimeNs).toBe(1_700_000_000_000_000_000n);
		expect(decoded.endTimeNs).toBe(1_700_000_000_500_000_000n);
		expect(decoded.spanId).toBe("abc123def456");
		expect(decoded.kind).toBe("client");
	});

	test("optional endTimeNs is absent when not provided", () => {
		const input = Schema.decodeUnknownSync(SpanData)({
			spanId: "span-1",
			traceId: "trace-1",
			name: "in-progress",
			kind: "internal",
			startTimeNs: "100",
		});

		const encoded = Schema.encodeSync(SpanData)(input);
		expect(encoded.endTimeNs).toBeUndefined();
	});

	test("span events with bigint timeNs encode correctly", () => {
		const input = Schema.decodeUnknownSync(SpanData)({
			spanId: "span-2",
			traceId: "trace-2",
			name: "span.with.events",
			kind: "server",
			startTimeNs: "100",
			events: [{ name: "cache.hit", timeNs: "200", attributes: { key: "user:42" } }],
		});

		const encoded = Schema.encodeSync(SpanData)(input);
		const firstEvent = encoded.events?.[0];
		expect(firstEvent).toBeDefined();
		expect(typeof firstEvent?.timeNs).toBe("string");
		expect(firstEvent?.timeNs).toBe("200");

		const decoded = Schema.decodeUnknownSync(SpanData)(encoded);
		expect(decoded.events?.[0]?.timeNs).toBe(200n);
	});

	test("span status encodes correctly", () => {
		const input = Schema.decodeUnknownSync(SpanData)({
			spanId: "span-3",
			traceId: "trace-3",
			name: "failing.span",
			kind: "internal",
			startTimeNs: "1",
			status: { code: "error", message: "something went wrong" },
		});

		const encoded = Schema.encodeSync(SpanData)(input);
		const decoded = Schema.decodeUnknownSync(SpanData)(encoded);
		expect(decoded.status?.code).toBe("error");
		expect(decoded.status?.message).toBe("something went wrong");
	});
});

// =============================================================================
// MetricData
// =============================================================================

describe("MetricData with counter type", () => {
	test("decodes counter discriminated union variant", () => {
		const input = Schema.decodeUnknownSync(MetricData)({
			name: "requests.total",
			description: "Total HTTP requests",
			unit: "1",
			type: { kind: "counter", value: 42, monotonic: true },
			timeNs: "1000000",
		});

		const encoded = Schema.encodeSync(MetricData)(input);
		expect(encoded.type.kind).toBe("counter");

		const decoded = Schema.decodeUnknownSync(MetricData)(encoded);
		expect(decoded.type.kind).toBe("counter");
		if (decoded.type.kind === "counter") {
			expect(decoded.type.value).toBe(42);
			expect(decoded.type.monotonic).toBe(true);
		}
		expect(decoded.timeNs).toBe(1_000_000n);
	});

	test("counter without monotonic field", () => {
		const input = Schema.decodeUnknownSync(MetricData)({
			name: "events.count",
			type: { kind: "counter", value: 7 },
			timeNs: "1",
		});

		const encoded = Schema.encodeSync(MetricData)(input);
		const decoded = Schema.decodeUnknownSync(MetricData)(encoded);
		expect(decoded.type.kind).toBe("counter");
		if (decoded.type.kind === "counter") {
			expect(decoded.type.monotonic).toBeUndefined();
		}
	});
});

describe("MetricData with gauge type", () => {
	test("decodes gauge discriminated union variant", () => {
		const input = Schema.decodeUnknownSync(MetricData)({
			name: "memory.usage",
			unit: "bytes",
			type: { kind: "gauge", value: 1_048_576 },
			timeNs: "2000000",
		});

		const encoded = Schema.encodeSync(MetricData)(input);
		expect(encoded.type.kind).toBe("gauge");

		const decoded = Schema.decodeUnknownSync(MetricData)(encoded);
		expect(decoded.type.kind).toBe("gauge");
		if (decoded.type.kind === "gauge") {
			expect(decoded.type.value).toBe(1_048_576);
		}
		expect(decoded.timeNs).toBe(2_000_000n);
	});
});

describe("MetricData with histogram type", () => {
	test("decodes histogram discriminated union variant", () => {
		const input = Schema.decodeUnknownSync(MetricData)({
			name: "request.duration",
			unit: "ms",
			type: { kind: "histogram", value: 123.4, buckets: [10, 50, 100, 500, 1000] },
			timeNs: "3000000",
		});

		const encoded = Schema.encodeSync(MetricData)(input);
		expect(encoded.type.kind).toBe("histogram");

		const decoded = Schema.decodeUnknownSync(MetricData)(encoded);
		expect(decoded.type.kind).toBe("histogram");
		if (decoded.type.kind === "histogram") {
			expect(decoded.type.value).toBe(123.4);
			expect(decoded.type.buckets).toEqual([10, 50, 100, 500, 1000]);
		}
	});
});

// =============================================================================
// SidecarProtocolMessage
// =============================================================================

describe("SidecarProtocolMessage decoding", () => {
	test("decodes event message JSON with type discrimination", () => {
		const raw = {
			type: "event",
			sessionId: "session-abc",
			data: {
				name: "tool.executed",
				timeNs: "1700000000000000000",
				severity: "info",
			},
		};

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("event");
		if (decoded.type === "event") {
			expect(decoded.sessionId).toBe("session-abc");
			expect(decoded.data.timeNs).toBe(1_700_000_000_000_000_000n);
			expect(decoded.data.name).toBe("tool.executed");
		}
	});

	test("decodes span message JSON", () => {
		const raw = {
			type: "span",
			sessionId: "session-span",
			data: {
				spanId: "span-id-123",
				traceId: "trace-id-456",
				name: "hook.pre_tool_use",
				kind: "internal",
				startTimeNs: "100000000",
				endTimeNs: "200000000",
			},
		};

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("span");
		if (decoded.type === "span") {
			expect(decoded.data.startTimeNs).toBe(100_000_000n);
			expect(decoded.data.endTimeNs).toBe(200_000_000n);
		}
	});

	test("decodes metric message JSON", () => {
		const raw = {
			type: "metric",
			sessionId: "session-metric",
			data: {
				name: "hook.count",
				type: { kind: "counter", value: 5 },
				timeNs: "9000000",
			},
		};

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("metric");
		if (decoded.type === "metric") {
			expect(decoded.data.timeNs).toBe(9_000_000n);
			expect(decoded.data.type.kind).toBe("counter");
		}
	});
});

describe("SidecarProtocolMessage with ping", () => {
	test("decodes ping message with config as unknown", () => {
		const raw = {
			type: "ping",
			sessionId: "session-ping",
			config: {
				endpoint: "http://localhost:4318",
				serviceName: "my-plugin",
				headers: { Authorization: "Bearer token" },
				unknownFutureField: 42,
			},
		};

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("ping");
		if (decoded.type === "ping") {
			expect(decoded.sessionId).toBe("session-ping");
			// config is Schema.Unknown — passes through as-is
			expect((decoded.config as { endpoint: string }).endpoint).toBe("http://localhost:4318");
		}
	});
});

describe("SidecarProtocolMessage with shutdown", () => {
	test("decodes shutdown message without sessionId", () => {
		const raw = { type: "shutdown" };

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("shutdown");
		if (decoded.type === "shutdown") {
			expect(decoded.sessionId).toBeUndefined();
		}
	});

	test("decodes shutdown message with sessionId", () => {
		const raw = { type: "shutdown", sessionId: "session-xyz" };

		const decoded = Schema.decodeUnknownSync(SidecarProtocolMessage)(raw);
		expect(decoded.type).toBe("shutdown");
		if (decoded.type === "shutdown") {
			expect(decoded.sessionId).toBe("session-xyz");
		}
	});
});

describe("Invalid message fails decode", () => {
	test("unknown type field produces a ParseError", () => {
		const raw = { type: "unknown_type", sessionId: "session-bad" };

		expect(() => Schema.decodeUnknownSync(SidecarProtocolMessage)(raw)).toThrow();
	});

	test("missing required type field produces a ParseError", () => {
		const raw = { sessionId: "session-no-type" };

		expect(() => Schema.decodeUnknownSync(SidecarProtocolMessage)(raw)).toThrow();
	});

	test("event message missing data field produces a ParseError", () => {
		const raw = { type: "event", sessionId: "session-no-data" };

		expect(() => Schema.decodeUnknownSync(SidecarProtocolMessage)(raw)).toThrow();
	});
});

describe("BigInt encodes as string", () => {
	test("EventData timeNs encodes to string for JSON wire format", () => {
		const event = Schema.decodeUnknownSync(EventData)({ name: "test", timeNs: "12345678901234567890" });
		const encoded = Schema.encodeSync(EventData)(event);
		expect(typeof encoded.timeNs).toBe("string");
		// Verify it's JSON-serializable (no BigInt serialization error)
		const json = JSON.stringify(encoded);
		const reparsed = JSON.parse(json);
		expect(reparsed.timeNs).toBe("12345678901234567890");
	});

	test("SpanData startTimeNs and endTimeNs encode to strings", () => {
		const span = Schema.decodeUnknownSync(SpanData)({
			spanId: "s1",
			traceId: "t1",
			name: "test.span",
			kind: "internal",
			startTimeNs: "111",
			endTimeNs: "999",
		});
		const encoded = Schema.encodeSync(SpanData)(span);
		expect(typeof encoded.startTimeNs).toBe("string");
		expect(typeof encoded.endTimeNs).toBe("string");
		expect(encoded.startTimeNs).toBe("111");
		expect(encoded.endTimeNs).toBe("999");
	});

	test("MetricData timeNs encodes to string", () => {
		const metric = Schema.decodeUnknownSync(MetricData)({
			name: "test.metric",
			type: { kind: "gauge", value: 1.5 },
			timeNs: "777",
		});
		const encoded = Schema.encodeSync(MetricData)(metric);
		expect(typeof encoded.timeNs).toBe("string");
		expect(encoded.timeNs).toBe("777");
	});
});
