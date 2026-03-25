import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Effect, Layer, Ref } from "effect";
import { detectGitInfo, gitInfoToAttributes } from "../otel/GitInfo.js";
import { createLogsExporter, createMetricsExporter, createTraceExporter } from "../otel/SidecarExporters.js";
import { createOtelResource } from "../otel/SidecarResource.js";
import type { ResourceConfig } from "../services/OtelProviders.js";
import { OtelProviders } from "../services/OtelProviders.js";

/**
 * Compute a hash of the OTEL-relevant config fields for change detection.
 * Only includes fields that affect how providers export data.
 */
const computeConfigHash = (config: ResourceConfig): string => {
	const relevantFields = {
		endpoint: config.endpoint,
		protocol: config.protocol,
		serviceName: config.serviceName,
		headers: config.headers,
	};
	return JSON.stringify(relevantFields);
};

/**
 * Shut down a single provider: forceFlush then shutdown.
 * Errors are logged and ignored.
 */
const shutdownProvider = (
	name: string,
	provider: { forceFlush: () => Promise<void>; shutdown: () => Promise<void> } | null,
): Effect.Effect<void> => {
	if (!provider) return Effect.void;
	return Effect.tryPromise({
		try: () => provider.forceFlush().then(() => provider.shutdown()),
		catch: (err) => new Error(`[otel] ${name} shutdown error: ${String(err)}`),
	}).pipe(Effect.ignoreLogged);
};

/**
 * OtelProvidersLive is a scoped layer that manages the lifecycle of the three
 * OTEL SDK providers (tracer, meter, logger).
 *
 * Providers start uninitialized (null). Before `reinit` is called, `getTracer`,
 * `getMeter`, and `getLogger` return no-op instances from the global OTEL API.
 * After `reinit`, they return real instrumented instances.
 *
 * The finalizer flushes and shuts down all providers concurrently on scope close.
 */
export const OtelProvidersLive: Layer.Layer<OtelProviders> = Layer.scoped(
	OtelProviders,
	Effect.gen(function* () {
		const tracerProviderRef = yield* Ref.make<NodeTracerProvider | null>(null);
		const meterProviderRef = yield* Ref.make<MeterProvider | null>(null);
		const loggerProviderRef = yield* Ref.make<LoggerProvider | null>(null);
		const configHashRef = yield* Ref.make<string | null>(null);

		// Register finalizer to flush and shutdown all providers on scope close
		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				const tracer = yield* Ref.get(tracerProviderRef);
				const meter = yield* Ref.get(meterProviderRef);
				const logger = yield* Ref.get(loggerProviderRef);

				yield* Effect.all(
					[shutdownProvider("Tracer", tracer), shutdownProvider("Meter", meter), shutdownProvider("Logger", logger)],
					{ concurrency: "unbounded" },
				);

				yield* Ref.set(tracerProviderRef, null);
				yield* Ref.set(meterProviderRef, null);
				yield* Ref.set(loggerProviderRef, null);
				yield* Ref.set(configHashRef, null);
			}),
		);

		const getTracer = (name: string, version?: string) => trace.getTracer(name, version);

		const getMeter = (name: string, version?: string) => metrics.getMeter(name, version);

		const getLogger = (name: string, version?: string) => logs.getLogger(name, version);

		const reinit = (config: ResourceConfig): Effect.Effect<boolean> =>
			Effect.gen(function* () {
				const newHash = computeConfigHash(config);
				const currentHash = yield* Ref.get(configHashRef);

				// If hash matches current, no-op
				if (currentHash === newHash) {
					return false;
				}

				// Shut down existing providers if any
				const existingTracer = yield* Ref.get(tracerProviderRef);
				const existingMeter = yield* Ref.get(meterProviderRef);
				const existingLogger = yield* Ref.get(loggerProviderRef);

				yield* Effect.all(
					[
						shutdownProvider("Tracer", existingTracer),
						shutdownProvider("Meter", existingMeter),
						shutdownProvider("Logger", existingLogger),
					],
					{ concurrency: "unbounded" },
				);

				// Detect git info for resource attributes
				const gitInfo = yield* Effect.promise(() => detectGitInfo());
				const gitAttrs = gitInfoToAttributes(gitInfo);

				// Merge git attributes into config
				const configWithGit: ResourceConfig = {
					...config,
					resourceAttributes: {
						...config.resourceAttributes,
						...gitAttrs,
					},
				};

				const resource = createOtelResource(configWithGit);

				// Create Tracer Provider
				const traceExporter = createTraceExporter(config);
				const spanProcessors = traceExporter ? [new BatchSpanProcessor(traceExporter)] : [];

				const newTracerProvider = new NodeTracerProvider({
					resource,
					spanProcessors,
				});
				newTracerProvider.register();

				// Create Meter Provider
				const metricsExporter = createMetricsExporter(config);
				const readers = metricsExporter
					? [
							new PeriodicExportingMetricReader({
								exporter: metricsExporter,
								exportIntervalMillis: 60000,
							}),
						]
					: [];

				const newMeterProvider = new MeterProvider({
					resource,
					readers,
				});
				metrics.setGlobalMeterProvider(newMeterProvider);

				// Create Logger Provider
				const logsExporter = createLogsExporter(config);
				const processors = logsExporter
					? [
							new BatchLogRecordProcessor(logsExporter, {
								scheduledDelayMillis: 5000,
							}),
						]
					: [];

				const newLoggerProvider = new LoggerProvider({
					resource,
					processors,
				});
				logs.setGlobalLoggerProvider(newLoggerProvider);

				// Store in refs
				yield* Ref.set(tracerProviderRef, newTracerProvider);
				yield* Ref.set(meterProviderRef, newMeterProvider);
				yield* Ref.set(loggerProviderRef, newLoggerProvider);
				yield* Ref.set(configHashRef, newHash);

				return true;
			});

		return { getTracer, getMeter, getLogger, reinit } satisfies OtelProviders["Type"];
	}),
);
