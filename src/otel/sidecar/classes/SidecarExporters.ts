import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { OtelConfig } from "../../classes/OtelConfig.js";
import type { OtelProtocolConfig } from "../../protocol.js";

/**
 * Static factory class for creating OTEL exporters.
 *
 * Creates trace, metrics, and log exporters based on configuration.
 * HTTP exporters are used by default for Bun compatibility.
 *
 * @example
 * ```typescript
 * const traceExporter = SidecarExporters.createTraceExporter(config);
 * const metricsExporter = SidecarExporters.createMetricsExporter(config);
 * const logsExporter = SidecarExporters.createLogsExporter(config);
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Static class used as public API namespace
export class SidecarExporters {
	/**
	 * Create a trace exporter based on configuration.
	 *
	 * @param config - OTEL configuration
	 * @returns Trace exporter or null if disabled
	 */
	static createTraceExporter(config: OtelProtocolConfig): OTLPTraceExporter | ConsoleSpanExporter | null {
		const endpoint = config.endpoint ?? OtelConfig.DEFAULTS.ENDPOINT;

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
			timeoutMillis: config.exportTimeoutMs ?? OtelConfig.DEFAULTS.EXPORT_TIMEOUT_MS,
		});
	}

	/**
	 * Create a metrics exporter based on configuration.
	 *
	 * @param config - OTEL configuration
	 * @returns Metrics exporter or null if disabled
	 */
	static createMetricsExporter(config: OtelProtocolConfig): OTLPMetricExporter | null {
		const endpoint = config.endpoint ?? OtelConfig.DEFAULTS.ENDPOINT;

		// Check if metrics are disabled
		if (Bun.env.OTEL_METRICS_EXPORTER === "none") {
			return null;
		}

		// Default to OTLP HTTP
		return new OTLPMetricExporter({
			url: `${endpoint}/v1/metrics`,
			...(config.headers !== undefined && { headers: config.headers }),
			timeoutMillis: config.exportTimeoutMs ?? OtelConfig.DEFAULTS.EXPORT_TIMEOUT_MS,
		});
	}

	/**
	 * Create a logs exporter based on configuration.
	 *
	 * @param config - OTEL configuration
	 * @returns Logs exporter or null if disabled
	 */
	static createLogsExporter(config: OtelProtocolConfig): OTLPLogExporter | null {
		const endpoint = config.endpoint ?? OtelConfig.DEFAULTS.ENDPOINT;

		// Check if logs are disabled
		if (Bun.env.OTEL_LOGS_EXPORTER === "none") {
			return null;
		}

		// Default to OTLP HTTP
		return new OTLPLogExporter({
			url: `${endpoint}/v1/logs`,
			...(config.headers !== undefined && { headers: config.headers }),
			timeoutMillis: config.exportTimeoutMs ?? OtelConfig.DEFAULTS.EXPORT_TIMEOUT_MS,
		});
	}
}
