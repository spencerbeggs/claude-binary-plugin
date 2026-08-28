import { describe, expect, test } from "bun:test";
import type { OtelProtocolConfig, SidecarProtocolMessage } from "../../src/otel/protocol.js";

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
		const message: typeof SidecarProtocolMessage.Type = {
			type: "ping",
			sessionId: "test-session",
			config: { endpoint: "http://localhost:4318" },
		};
		expect(message.type).toBe("ping");
	});

	test("shutdown message type is valid", () => {
		const message: typeof SidecarProtocolMessage.Type = {
			type: "shutdown",
		};
		expect(message.type).toBe("shutdown");
	});
});
