/**
 * OTEL Exporter factory functions.
 *
 * Creates exporters for traces, metrics, and logs based on configuration.
 * HTTP exporters are preferred over gRPC for Bun compatibility.
 *
 * @module
 */

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { DEFAULTS } from "../constants.js";
import type { OTELConfig } from "../protocol.js";

/**
 * Create a trace exporter based on configuration.
 *
 * @param config - OTEL configuration
 * @returns Trace exporter or null if disabled
 */
export function createTraceExporter(config: OTELConfig): OTLPTraceExporter | ConsoleSpanExporter | null {
	const endpoint = config.endpoint ?? DEFAULTS.ENDPOINT;

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
		headers: config.headers,
		timeoutMillis: config.exportTimeoutMs ?? DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}

/**
 * Create a metrics exporter based on configuration.
 *
 * @param config - OTEL configuration
 * @returns Metrics exporter or null if disabled
 */
export function createMetricsExporter(config: OTELConfig): OTLPMetricExporter | null {
	const endpoint = config.endpoint ?? DEFAULTS.ENDPOINT;

	// Check if metrics are disabled
	if (Bun.env.OTEL_METRICS_EXPORTER === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPMetricExporter({
		url: `${endpoint}/v1/metrics`,
		headers: config.headers,
		timeoutMillis: config.exportTimeoutMs ?? DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}

/**
 * Create a logs exporter based on configuration.
 *
 * @param config - OTEL configuration
 * @returns Logs exporter or null if disabled
 */
export function createLogsExporter(config: OTELConfig): OTLPLogExporter | null {
	const endpoint = config.endpoint ?? DEFAULTS.ENDPOINT;

	// Check if logs are disabled
	if (Bun.env.OTEL_LOGS_EXPORTER === "none") {
		return null;
	}

	// Default to OTLP HTTP
	return new OTLPLogExporter({
		url: `${endpoint}/v1/logs`,
		headers: config.headers,
		timeoutMillis: config.exportTimeoutMs ?? DEFAULTS.EXPORT_TIMEOUT_MS,
	});
}
