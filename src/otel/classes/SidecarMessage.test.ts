import { describe, expect, test } from "bun:test";
import type { EventMessage, MetricMessage, PingMessage, ShutdownMessage, SpanMessage } from "../protocol.js";
import { SidecarMessage } from "./SidecarMessage.js";

describe("SidecarMessage", () => {
	describe("serialize", () => {
		test("serializes ping message", () => {
			const message: PingMessage = {
				type: "ping",
				sessionId: "test-session-123",
				config: {
					endpoint: "http://localhost:4318",
					serviceName: "test-plugin",
				},
			};

			const serialized = SidecarMessage.serialize(message);

			expect(serialized).toEndWith("\n");
			expect(JSON.parse(serialized.trim())).toEqual(message);
		});

		test("serializes shutdown message", () => {
			const message: ShutdownMessage = {
				type: "shutdown",
				sessionId: "test-session-123",
			};

			const serialized = SidecarMessage.serialize(message);

			expect(serialized).toEndWith("\n");
			expect(JSON.parse(serialized.trim())).toEqual(message);
		});

		test("serializes span message with BigInt timestamps", () => {
			const message: SpanMessage = {
				type: "span",
				sessionId: "test-session-123",
				data: {
					spanId: "abc123",
					traceId: "def456",
					name: "test-span",
					kind: "internal",
					startTimeNs: BigInt("1700000000000000000"),
					endTimeNs: BigInt("1700000001000000000"),
					attributes: { "test.attr": "value" },
				},
			};

			const serialized = SidecarMessage.serialize(message);

			// BigInt should be serialized as string with "n" suffix
			expect(serialized).toContain('"1700000000000000000n"');
			expect(serialized).toContain('"1700000001000000000n"');
		});

		test("serializes event message", () => {
			const message: EventMessage = {
				type: "event",
				sessionId: "test-session-123",
				data: {
					name: "test-event",
					timeNs: BigInt("1700000000000000000"),
					severity: "info",
					body: "Test event occurred",
				},
			};

			const serialized = SidecarMessage.serialize(message);

			expect(serialized).toEndWith("\n");
			expect(serialized).toContain('"type":"event"');
		});

		test("serializes metric message", () => {
			const message: MetricMessage = {
				type: "metric",
				sessionId: "test-session-123",
				data: {
					name: "hook.duration",
					unit: "ms",
					type: { kind: "histogram", value: 42.5 },
					timeNs: BigInt("1700000000000000000"),
				},
			};

			const serialized = SidecarMessage.serialize(message);

			expect(serialized).toEndWith("\n");
			expect(serialized).toContain('"type":"metric"');
		});
	});

	describe("parse", () => {
		test("parses ping message", () => {
			const line = '{"type":"ping","sessionId":"test-123","config":{"endpoint":"http://localhost:4318"}}';

			const message = SidecarMessage.parse(line);

			expect(message).not.toBeNull();
			expect(message?.type).toBe("ping");
			if (message?.type === "ping") {
				expect(message.sessionId).toBe("test-123");
				expect(message.config.endpoint).toBe("http://localhost:4318");
			}
		});

		test("parses shutdown message", () => {
			const line = '{"type":"shutdown"}';

			const message = SidecarMessage.parse(line);

			expect(message).not.toBeNull();
			expect(message?.type).toBe("shutdown");
		});

		test("parses span message with BigInt timestamps", () => {
			const line =
				'{"type":"span","sessionId":"test-123","data":{"spanId":"abc","traceId":"def","name":"test","kind":"internal","startTimeNs":"1700000000000000000n"}}';

			const message = SidecarMessage.parse(line);

			expect(message).not.toBeNull();
			expect(message?.type).toBe("span");
			if (message?.type === "span") {
				expect(message.data.startTimeNs).toBe(BigInt("1700000000000000000"));
			}
		});

		test("returns null for invalid JSON", () => {
			const message = SidecarMessage.parse("not valid json");

			expect(message).toBeNull();
		});

		test("returns null for empty line", () => {
			const message = SidecarMessage.parse("");

			expect(message).toBeNull();
		});

		test("returns null for whitespace-only line", () => {
			const message = SidecarMessage.parse("   \t   ");

			expect(message).toBeNull();
		});

		test("trims whitespace before parsing", () => {
			const line = '  {"type":"shutdown"}  \n';

			const message = SidecarMessage.parse(line);

			expect(message).not.toBeNull();
			expect(message?.type).toBe("shutdown");
		});
	});

	describe("roundtrip", () => {
		test("ping message survives serialization roundtrip", () => {
			const original: PingMessage = {
				type: "ping",
				sessionId: "roundtrip-test",
				config: {
					endpoint: "http://localhost:4318",
					protocol: "http",
					serviceName: "test-service",
					headers: { Authorization: "Bearer token" },
				},
			};

			const serialized = SidecarMessage.serialize(original);
			const parsed = SidecarMessage.parse(serialized);

			expect(parsed).toEqual(original);
		});

		test("span message with BigInt survives roundtrip", () => {
			const original: SpanMessage = {
				type: "span",
				sessionId: "roundtrip-test",
				data: {
					spanId: "span123",
					traceId: "trace456",
					name: "test-operation",
					kind: "client",
					startTimeNs: BigInt("1700000000000000000"),
					endTimeNs: BigInt("1700000001000000000"),
					status: { code: "ok" },
					events: [
						{
							name: "event1",
							timeNs: BigInt("1700000000500000000"),
							attributes: { key: "value" },
						},
					],
				},
			};

			const serialized = SidecarMessage.serialize(original);
			const parsed = SidecarMessage.parse(serialized);

			expect(parsed).toEqual(original);
		});
	});
});
