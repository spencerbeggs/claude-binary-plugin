import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { OTEL_DEFAULTS } from "./constants.js";
import type { OtelProtocolConfig } from "./protocol.js";

/**
 * Options for controlling which exporter implementations are used.
 */
export interface ExporterOptions {
	tracesExporter?: "otlp" | "console" | "none";
	metricsExporter?: "otlp" | "none";
	logsExporter?: "otlp" | "none";
}

/**
 * Create a trace exporter based on configuration.
 *
 * Creates an OTLP HTTP trace exporter by default. Returns a ConsoleSpanExporter
 * when tracesExporter is "console", or null when tracesExporter is "none".
 *
 * @param config - OTEL protocol configuration
 * @param options - Optional exporter selection options
 * @returns Trace exporter or null if disabled
 */
export function createTraceExporter(
	config: OtelProtocolConfig,
	options?: ExporterOptions,
): OTLPTraceExporter | ConsoleSpanExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check for console exporter (for debugging)
	if (options?.tracesExporter === "console") {
		return new ConsoleSpanExporter();
	}

	// Check if traces are disabled
	if (options?.tracesExporter === "none") {
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
 * metricsExporter is "none".
 *
 * @param config - OTEL protocol configuration
 * @param options - Optional exporter selection options
 * @returns Metrics exporter or null if disabled
 */
export function createMetricsExporter(
	config: OtelProtocolConfig,
	options?: ExporterOptions,
): OTLPMetricExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check if metrics are disabled
	if (options?.metricsExporter === "none") {
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
 * logsExporter is "none".
 *
 * @param config - OTEL protocol configuration
 * @param options - Optional exporter selection options
 * @returns Logs exporter or null if disabled
 */
export function createLogsExporter(config: OtelProtocolConfig, options?: ExporterOptions): OTLPLogExporter | null {
	const endpoint = config.endpoint ?? OTEL_DEFAULTS.ENDPOINT;

	// Check if logs are disabled
	if (options?.logsExporter === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPLogExporter({
		url: `${endpoint}/v1/logs`,
		...(config.headers !== undefined && { headers: config.headers }),
		timeoutMillis: config.exportTimeoutMs ?? OTEL_DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}
