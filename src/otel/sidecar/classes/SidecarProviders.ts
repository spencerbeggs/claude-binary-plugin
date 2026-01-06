/**
 * OTEL Provider management for the sidecar.
 *
 * This class manages the OTEL SDK with trace, metric, and log providers.
 * Providers are initialized lazily on first ping message and are singletons.
 *
 * @module
 */

import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { GitInfo } from "../../classes/GitInfo.js";
import { SCOPE } from "../../constants.js";
import { SidecarExporters } from "./SidecarExporters.js";
import type { ResourceConfig } from "./SidecarResource.js";
import { SidecarResource } from "./SidecarResource.js";

/**
 * Static class for managing OTEL providers in the sidecar.
 *
 * Providers are initialized lazily on first ping and are singletons.
 * The class handles initialization, shutdown, and config change detection.
 *
 * @example
 * ```typescript
 * // Initialize providers with config
 * await SidecarProviders.init(config);
 *
 * // Get instrumentation instances
 * const tracer = SidecarProviders.getTracer();
 * const meter = SidecarProviders.getMeter();
 * const logger = SidecarProviders.getLogger();
 *
 * // Shutdown before exit
 * await SidecarProviders.shutdown();
 * ```
 *
 * @public
 */
export class SidecarProviders {
	/**
	 * Module-level state for providers.
	 */
	private static tracerProvider: NodeTracerProvider | null = null;
	private static meterProvider: MeterProvider | null = null;
	private static loggerProvider: LoggerProvider | null = null;
	private static initialized = false;

	/**
	 * Hash of the current config for change detection.
	 */
	private static currentConfigHash: string | null = null;

	/**
	 * Compute a hash of the OTEL-relevant config fields for change detection.
	 * Only includes fields that affect how providers export data.
	 */
	private static computeConfigHash(config: ResourceConfig): string {
		const relevantFields = {
			endpoint: config.endpoint,
			protocol: config.protocol,
			serviceName: config.serviceName,
			headers: config.headers,
		};
		return JSON.stringify(relevantFields);
	}

	/**
	 * Initialize OTEL providers with configuration.
	 *
	 * If providers are already initialized with the same config, this is a no-op.
	 * If the config has changed, providers are shutdown and reinitialized.
	 *
	 * @param config - OTEL configuration from ping message
	 * @returns true if providers were (re)initialized, false if unchanged
	 */
	static async init(config: ResourceConfig): Promise<boolean> {
		const newHash = SidecarProviders.computeConfigHash(config);

		// If already initialized with same config, no-op
		if (SidecarProviders.initialized && SidecarProviders.currentConfigHash === newHash) {
			return false;
		}

		// If config changed, shutdown existing providers first
		if (SidecarProviders.initialized && SidecarProviders.currentConfigHash !== newHash) {
			await SidecarProviders.shutdown();
		}

		// Detect git info and add to resource attributes
		const gitInfo = await GitInfo.detect();
		const gitAttrs = gitInfo.toAttributes();

		// Merge git attributes into config's resource attributes
		const configWithGit: ResourceConfig = {
			...config,
			resourceAttributes: {
				...config.resourceAttributes,
				...gitAttrs,
			},
		};

		const resource = SidecarResource.create(configWithGit);

		// Initialize Tracer Provider with span processors in constructor
		const traceExporter = SidecarExporters.createTraceExporter(config);
		const spanProcessors = traceExporter ? [new BatchSpanProcessor(traceExporter)] : [];

		SidecarProviders.tracerProvider = new NodeTracerProvider({
			resource,
			spanProcessors,
		});
		SidecarProviders.tracerProvider.register();

		// Initialize Meter Provider with readers in constructor
		const metricsExporter = SidecarExporters.createMetricsExporter(config);
		const readers = metricsExporter
			? [
					new PeriodicExportingMetricReader({
						exporter: metricsExporter,
						exportIntervalMillis: 60000, // 1 minute
					}),
				]
			: [];

		SidecarProviders.meterProvider = new MeterProvider({
			resource,
			readers,
		});
		metrics.setGlobalMeterProvider(SidecarProviders.meterProvider);

		// Initialize Logger Provider with processors in constructor
		const logsExporter = SidecarExporters.createLogsExporter(config);
		const processors = logsExporter
			? [
					new BatchLogRecordProcessor(logsExporter, {
						scheduledDelayMillis: 5000, // 5 seconds
					}),
				]
			: [];

		SidecarProviders.loggerProvider = new LoggerProvider({
			resource,
			processors,
		});
		logs.setGlobalLoggerProvider(SidecarProviders.loggerProvider);

		SidecarProviders.initialized = true;
		SidecarProviders.currentConfigHash = newHash;

		return true;
	}

	/**
	 * Shutdown all OTEL providers.
	 *
	 * Flushes any pending telemetry and releases resources.
	 * Should be called before process exit.
	 */
	static async shutdown(): Promise<void> {
		const shutdowns: Promise<void>[] = [];

		// Capture references to avoid null checks in async callbacks
		const tracer = SidecarProviders.tracerProvider;
		const meter = SidecarProviders.meterProvider;
		const logger = SidecarProviders.loggerProvider;

		if (tracer) {
			shutdowns.push(
				tracer
					.forceFlush()
					.then(() => tracer.shutdown())
					.catch((err) => console.error("[otel] Tracer shutdown error:", err)),
			);
		}

		if (meter) {
			shutdowns.push(
				meter
					.forceFlush()
					.then(() => meter.shutdown())
					.catch((err) => console.error("[otel] Meter shutdown error:", err)),
			);
		}

		if (logger) {
			shutdowns.push(
				logger
					.forceFlush()
					.then(() => logger.shutdown())
					.catch((err) => console.error("[otel] Logger shutdown error:", err)),
			);
		}

		await Promise.all(shutdowns);

		// Reset state
		SidecarProviders.tracerProvider = null;
		SidecarProviders.meterProvider = null;
		SidecarProviders.loggerProvider = null;
		SidecarProviders.initialized = false;
		SidecarProviders.currentConfigHash = null;
	}

	/**
	 * Get a tracer for creating spans.
	 *
	 * @param name - Tracer name (defaults to SCOPE.NAME)
	 * @param version - Tracer version
	 * @returns Tracer instance
	 */
	static getTracer(name: string = SCOPE.NAME, version?: string) {
		return trace.getTracer(name, version);
	}

	/**
	 * Get a meter for recording metrics.
	 *
	 * @param name - Meter name (defaults to SCOPE.NAME)
	 * @param version - Meter version
	 * @returns Meter instance
	 */
	static getMeter(name: string = SCOPE.NAME, version?: string) {
		return metrics.getMeter(name, version);
	}

	/**
	 * Get a logger for emitting logs.
	 *
	 * @param name - Logger name (defaults to SCOPE.NAME)
	 * @param version - Logger version
	 * @returns Logger instance
	 */
	static getLogger(name: string = SCOPE.NAME, version?: string) {
		return logs.getLogger(name, version);
	}

	/**
	 * Check if providers have been initialized.
	 */
	static isInitialized(): boolean {
		return SidecarProviders.initialized;
	}

	/**
	 * Reset providers for testing.
	 * @internal
	 */
	static async reset(): Promise<void> {
		await SidecarProviders.shutdown();
	}
}
