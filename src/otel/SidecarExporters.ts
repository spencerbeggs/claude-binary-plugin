import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { OTEL_DEFAULTS } from "./constants.js";
import type { OtelProtocolConfig } from "./protocol.js";

/**
 * Create a trace exporter based on configuration.
 *
 * Creates an OTLP HTTP trace exporter by default. Returns a ConsoleSpanExporter
 * when OTEL_TRACES_EXPORTER=console, or null when OTEL_TRACES_EXPORTER=none.
 *
 * @param config - OTEL protocol configuration
 * @returns Trace exporter or null if disabled
 */
export function createTraceExporter(config: OtelProtocolConfig): OTLPTraceExporter | ConsoleSpanExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check for console exporter (for debugging)
	if (Bun.env.OTEL_TRACES_EXPORTER === "console") {
		return new ConsoleSpanExporter();
	}

	// Check if traces are disabled
	if (Bun.env.OTEL_TRACES_EXPORTER === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPTraceExporter({
		url: `${endpoint}/v1/traces`,
		...(config.headers !== undefined && { headers: config.headers }),
		timeoutMillis: config.exportTimeoutMs ?? OTEL_DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}

/**
 * Create a metrics exporter based on configuration.
 *
 * Creates an OTLP HTTP metrics exporter by default. Returns null when
 * OTEL_METRICS_EXPORTER=none.
 *
 * @param config - OTEL protocol configuration
 * @returns Metrics exporter or null if disabled
 */
export function createMetricsExporter(config: OtelProtocolConfig): OTLPMetricExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check if metrics are disabled
	if (Bun.env.OTEL_METRICS_EXPORTER === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPMetricExporter({
		url: `${endpoint}/v1/metrics`,
		...(config.headers !== undefined && { headers: config.headers }),
		timeoutMillis: config.exportTimeoutMs ?? OTEL_DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}

/**
 * Create a logs exporter based on configuration.
 *
 * Creates an OTLP HTTP logs exporter by default. Returns null when
 * OTEL_LOGS_EXPORTER=none.
 *
 * @param config - OTEL protocol configuration
 * @returns Logs exporter or null if disabled
 */
export function createLogsExporter(config: OtelProtocolConfig): OTLPLogExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check if logs are disabled
	if (Bun.env.OTEL_LOGS_EXPORTER === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPLogExporter({
		url: `${endpoint}/v1/logs`,
		...(config.headers !== undefined && { headers: config.headers }),
		timeoutMillis: config.exportTimeoutMs ?? OTEL_DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}
