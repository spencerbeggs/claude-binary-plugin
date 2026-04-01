import { Effect, Layer } from "effect";
import { OtelConfig, OtelConfigData } from "../services/OtelConfig.js";
import { PlatformInfo } from "../services/PlatformInfo.js";

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

function parseResourceAttributes(attrs?: string): Record<string, string> | undefined {
	if (!attrs) return undefined;
	const result: Record<string, string> = {};
	for (const pair of attrs.split(",")) {
		const eqIndex = pair.indexOf("=");
		if (eqIndex > 0) {
			const key = pair.slice(0, eqIndex).trim();
			const value = pair.slice(eqIndex + 1).trim();
			if (key && value) result[key] = value;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

export const OtelConfigLive: Layer.Layer<OtelConfig, never, PlatformInfo> = Layer.effect(
	OtelConfig,
	Effect.gen(function* () {
		const platformInfo = yield* PlatformInfo;

		const telemetryEnv = Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY;
		const enabled = telemetryEnv === "1" && platformInfo.isSupported;

		const endpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined;

		const protocolRaw = Bun.env.OTEL_EXPORTER_OTLP_PROTOCOL;
		const protocol = protocolRaw === "http" || protocolRaw === "grpc" ? protocolRaw : undefined;

		const headersStr = Bun.env.OTEL_EXPORTER_OTLP_HEADERS;
		const headers = headersStr ? parseHeaders(headersStr) : undefined;

		const socketPath = Bun.env.OTEL_SIDECAR_SOCKET || undefined;

		const tracesRaw = Bun.env.OTEL_TRACES_EXPORTER;
		const tracesExporter =
			tracesRaw === "otlp" || tracesRaw === "console" || tracesRaw === "none" ? tracesRaw : undefined;

		const metricsRaw = Bun.env.OTEL_METRICS_EXPORTER;
		const metricsExporter = metricsRaw === "otlp" || metricsRaw === "none" ? metricsRaw : undefined;

		const logsRaw = Bun.env.OTEL_LOGS_EXPORTER;
		const logsExporter = logsRaw === "otlp" || logsRaw === "none" ? logsRaw : undefined;

		const resourceAttributes = parseResourceAttributes(Bun.env.OTEL_RESOURCE_ATTRIBUTES);

		const deploymentEnv = Bun.env.DEPLOYMENT_ENV ?? Bun.env.NODE_ENV ?? undefined;

		return new OtelConfigData({
			enabled,
			endpoint,
			protocol,
			headers,
			socketPath,
			tracesExporter,
			metricsExporter,
			logsExporter,
			resourceAttributes,
			deploymentEnv,
		});
	}),
);
