/**
 * Tests for IPC protocol types.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - OtelProtocolConfig interface
 * - SidecarProtocolMessage union types
 * - PingMessage structure
 * - EventMessage structure
 * - MetricMessage structure
 * - SpanMessage structure
 * - ShutdownMessage structure
 * - SidecarResponse types
 */

import { describe, expect, test } from "bun:test";
import type { OtelProtocolConfig, SidecarProtocolMessage } from "./protocol.js";

describe("OtelProtocolConfig", () => {
	test("type is usable with minimal config", () => {
		const config: OtelProtocolConfig = {
			endpoint: "http://localhost:4318",
		};
		expect(config.endpoint).toBe("http://localhost:4318");
	});

	test("type accepts full config", () => {
		const config: OtelProtocolConfig = {
			endpoint: "https://otel.example.com",
			protocol: "http",
			serviceName: "claude-code-plugin",
			pluginName: "my-plugin",
			headers: { Authorization: "Bearer token" },
		};
		expect(config.protocol).toBe("http");
		expect(config.pluginName).toBe("my-plugin");
	});
});

describe("SidecarProtocolMessage", () => {
	test("ping message type is valid", () => {
		const message: SidecarProtocolMessage = {
			type: "ping",
			sessionId: "test-session",
			config: { endpoint: "http://localhost:4318" },
		};
		expect(message.type).toBe("ping");
	});

	test("shutdown message type is valid", () => {
		const message: SidecarProtocolMessage = {
			type: "shutdown",
		};
		expect(message.type).toBe("shutdown");
	});
});
