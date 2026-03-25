import { platform } from "node:os";
import { Effect, Layer } from "effect";
import { OtelConfig, OtelConfigData } from "../services/OtelConfig.js";

function parseHeaders(headersStr: string): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const pair of headersStr.split(",")) {
		const [key, ...valueParts] = pair.split("=");
		if (key && valueParts.length > 0) {
			headers[key.trim()] = valueParts.join("=").trim();
		}
	}
	return headers;
}

function isPlatformSupported(): boolean {
	const p = platform();
	return p === "darwin" || p === "linux";
}

export const OtelConfigLive = Layer.effect(
	OtelConfig,
	Effect.sync(() => {
		const telemetryEnv = Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY;
		const enabled = telemetryEnv === "1" && isPlatformSupported();

		const endpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined;

		const protocolRaw = Bun.env.OTEL_EXPORTER_OTLP_PROTOCOL;
		const protocol = protocolRaw === "http" || protocolRaw === "grpc" ? protocolRaw : undefined;

		const headersStr = Bun.env.OTEL_EXPORTER_OTLP_HEADERS;
		const headers = headersStr ? parseHeaders(headersStr) : undefined;

		const socketPath = Bun.env.OTEL_SIDECAR_SOCKET || undefined;

		return new OtelConfigData({
			enabled,
			endpoint,
			protocol,
			headers,
			socketPath,
		});
	}),
);
