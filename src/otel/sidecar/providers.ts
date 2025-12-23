/**
 * OTEL Provider initialization for the sidecar.
 *
 * This module initializes the OTEL SDK with trace, metric, and log providers.
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
import { SCOPE } from "../constants.js";
import { detectGitInfo, gitInfoToAttributes } from "../git-info.js";
import { createLogsExporter, createMetricsExporter, createTraceExporter } from "./exporters.js";
import type { ResourceConfig } from "./resource.js";
import { createResource } from "./resource.js";

/**
 * Module-level state for providers.
 */
let tracerProvider: NodeTracerProvider | null = null;
let meterProvider: MeterProvider | null = null;
let loggerProvider: LoggerProvider | null = null;
let initialized = false;

/**
 * Hash of the current config for change detection.
 */
let currentConfigHash: string | null = null;

/**
 * Compute a hash of the OTEL-relevant config fields for change detection.
 * Only includes fields that affect how providers export data.
 */
function computeConfigHash(config: ResourceConfig): string {
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
export async function initProviders(config: ResourceConfig): Promise<boolean> {
	const newHash = computeConfigHash(config);

	// If already initialized with same config, no-op
	if (initialized && currentConfigHash === newHash) {
		return false;
	}

	// If config changed, shutdown existing providers first
	if (initialized && currentConfigHash !== newHash) {
		await shutdownProviders();
	}

	// Detect git info and add to resource attributes
	const gitInfo = await detectGitInfo();
	const gitAttrs = gitInfoToAttributes(gitInfo);

	// Merge git attributes into config's resource attributes
	const configWithGit: ResourceConfig = {
		...config,
		resourceAttributes: {
			...config.resourceAttributes,
			...gitAttrs,
		},
	};

	const resource = createResource(configWithGit);

	// Initialize Tracer Provider with span processors in constructor
	const traceExporter = createTraceExporter(config);
	const spanProcessors = traceExporter ? [new BatchSpanProcessor(traceExporter)] : [];

	tracerProvider = new NodeTracerProvider({
		resource,
		spanProcessors,
	});
	tracerProvider.register();

	// Initialize Meter Provider with readers in constructor
	const metricsExporter = createMetricsExporter(config);
	const readers = metricsExporter
		? [
				new PeriodicExportingMetricReader({
					exporter: metricsExporter,
					exportIntervalMillis: 60000, // 1 minute
				}),
			]
		: [];

	meterProvider = new MeterProvider({
		resource,
		readers,
	});
	metrics.setGlobalMeterProvider(meterProvider);

	// Initialize Logger Provider with processors in constructor
	const logsExporter = createLogsExporter(config);
	const processors = logsExporter
		? [
				new BatchLogRecordProcessor(logsExporter, {
					scheduledDelayMillis: 5000, // 5 seconds
				}),
			]
		: [];

	loggerProvider = new LoggerProvider({
		resource,
		processors,
	});
	logs.setGlobalLoggerProvider(loggerProvider);

	initialized = true;
	currentConfigHash = newHash;

	return true;
}

/**
 * Shutdown all OTEL providers.
 *
 * Flushes any pending telemetry and releases resources.
 * Should be called before process exit.
 */
export async function shutdownProviders(): Promise<void> {
	const shutdowns: Promise<void>[] = [];

	// Capture references to avoid null checks in async callbacks
	const tracer = tracerProvider;
	const meter = meterProvider;
	const logger = loggerProvider;

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
	tracerProvider = null;
	meterProvider = null;
	loggerProvider = null;
	initialized = false;
	currentConfigHash = null;
}

/**
 * Get a tracer for creating spans.
 *
 * @param name - Tracer name (defaults to SCOPE.NAME)
 * @param version - Tracer version
 * @returns Tracer instance
 */
export function getTracer(name: string = SCOPE.NAME, version?: string) {
	return trace.getTracer(name, version);
}

/**
 * Get a meter for recording metrics.
 *
 * @param name - Meter name (defaults to SCOPE.NAME)
 * @param version - Meter version
 * @returns Meter instance
 */
export function getMeter(name: string = SCOPE.NAME, version?: string) {
	return metrics.getMeter(name, version);
}

/**
 * Get a logger for emitting logs.
 *
 * @param name - Logger name (defaults to SCOPE.NAME)
 * @param version - Logger version
 * @returns Logger instance
 */
export function getLogger(name: string = SCOPE.NAME, version?: string) {
	return logs.getLogger(name, version);
}

/**
 * Check if providers have been initialized.
 */
export function isInitialized(): boolean {
	return initialized;
}

/**
 * Reset providers for testing.
 * @internal
 */
export async function resetProviders(): Promise<void> {
	await shutdownProviders();
}
