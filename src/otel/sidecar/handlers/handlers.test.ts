import { afterEach, describe, expect, test } from "bun:test";
import type { EventData, MetricData, PingMessage, ShutdownMessage, SpanData } from "../../protocol.js";
import { resetProviders } from "../providers.js";
import { clearSessions, getSessionCount, handleMessage } from "./index.js";
import { clearMetricCaches } from "./metric.js";

describe("handlers", () => {
	afterEach(async () => {
		// Clean up after tests - reset providers to avoid polluting real sidecar
		clearSessions();
		clearMetricCaches();
		await resetProviders();
	});

	describe("handleMessage - ping", () => {
		test("stores session config and returns ok", async () => {
			const message: PingMessage = {
				type: "ping",
				sessionId: "test-session-123",
				config: {
					serviceName: "test-service",
				},
			};

			const response = await handleMessage(message);

			expect(response).toEqual({ ok: true, version: "0.0.0" });
			expect(getSessionCount()).toBe(1);
		});

		test("handles multiple sessions", async () => {
			const message1: PingMessage = {
				type: "ping",
				sessionId: "session-1",
				config: {},
			};
			const message2: PingMessage = {
				type: "ping",
				sessionId: "session-2",
				config: {},
			};

			await handleMessage(message1);
			await handleMessage(message2);

			expect(getSessionCount()).toBe(2);
		});

		test("does not reinitialize providers when config unchanged", async () => {
			const config = { endpoint: "http://localhost:4318", serviceName: "test" };

			// First ping initializes
			await handleMessage({
				type: "ping",
				sessionId: "session-1",
				config,
			});

			// Second ping with same config should not reinitialize
			const response = await handleMessage({
				type: "ping",
				sessionId: "session-2",
				config,
			});

			expect(response).toEqual({ ok: true, version: "0.0.0" });
		});

		test("reinitializes providers when config changes", async () => {
			// First ping with initial config
			await handleMessage({
				type: "ping",
				sessionId: "session-1",
				config: { endpoint: "http://localhost:4318" },
			});

			// Second ping with different endpoint should reinitialize
			const response = await handleMessage({
				type: "ping",
				sessionId: "session-1",
				config: { endpoint: "http://different-host:4318" },
			});

			expect(response).toEqual({ ok: true, version: "0.0.0" });
		});
	});

	describe("handleMessage - shutdown", () => {
		test("removes session on session-specific shutdown", async () => {
			// First add a session
			await handleMessage({
				type: "ping",
				sessionId: "test-session",
				config: {},
			});
			expect(getSessionCount()).toBe(1);

			// Then shut down that session
			const message: ShutdownMessage = {
				type: "shutdown",
				sessionId: "test-session",
			};

			const response = await handleMessage(message);

			expect(response).toEqual({ ok: true });
			expect(getSessionCount()).toBe(0);
		});
	});

	describe("handleMessage - span", () => {
		test("returns undefined for fire-and-forget", async () => {
			// Initialize providers first
			await handleMessage({
				type: "ping",
				sessionId: "test-session",
				config: {},
			});

			const spanData: SpanData = {
				spanId: "abc123",
				traceId: "def456",
				name: "test-span",
				kind: "internal",
				startTimeNs: BigInt(Date.now() * 1_000_000),
				endTimeNs: BigInt(Date.now() * 1_000_000 + 100_000_000),
			};

			const response = await handleMessage({
				type: "span",
				sessionId: "test-session",
				data: spanData,
			});

			expect(response).toBeUndefined();
		});
	});

	describe("handleMessage - event", () => {
		test("returns undefined for fire-and-forget", async () => {
			// Initialize providers first
			await handleMessage({
				type: "ping",
				sessionId: "test-session",
				config: {},
			});

			const eventData: EventData = {
				name: "test-event",
				timeNs: BigInt(Date.now() * 1_000_000),
				severity: "info",
				body: "Test event body",
			};

			const response = await handleMessage({
				type: "event",
				sessionId: "test-session",
				data: eventData,
			});

			expect(response).toBeUndefined();
		});
	});

	describe("handleMessage - metric", () => {
		test("returns undefined for fire-and-forget", async () => {
			// Initialize providers first
			await handleMessage({
				type: "ping",
				sessionId: "test-session",
				config: {},
			});

			const metricData: MetricData = {
				name: "test.counter",
				type: { kind: "counter", value: 1 },
				timeNs: BigInt(Date.now() * 1_000_000),
			};

			const response = await handleMessage({
				type: "metric",
				sessionId: "test-session",
				data: metricData,
			});

			expect(response).toBeUndefined();
		});
	});
});
