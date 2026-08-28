import type { Meter, Tracer } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import type { Effect } from "effect";
import { Context } from "effect";

/**
 * Configuration for initializing OTEL providers.
 *
 * Matches what the sidecar needs to configure its trace, metric, and log providers.
 * @public
 */
export interface ResourceConfig {
	endpoint?: string;
	protocol?: "http" | "grpc";
	serviceName?: string;
	pluginName?: string;
	marketplaceName?: string;
	resourceAttributes?: Record<string, string | number | boolean>;
	headers?: Record<string, string>;
	exportTimeoutMs?: number;
	/** Plugin version for resource attributes */
	pluginVersion?: string;
	/** Marketplace version */
	marketplaceVersion?: string;
}

/**
 * OtelProviders wraps the three OTEL SDK providers (NodeTracerProvider,
 * MeterProvider, LoggerProvider) with Effect lifecycle management.
 *
 * Before `reinit` is called, getters return no-op instances from the global
 * OTEL API. After `reinit`, they return instrumented instances backed by
 * real exporters.
 *
 * @public
 */
export class OtelProviders extends Context.Tag("OtelProviders")<
	OtelProviders,
	{
		readonly getTracer: (name: string, version?: string) => Tracer;
		readonly getMeter: (name: string, version?: string) => Meter;
		readonly getLogger: (name: string, version?: string) => Logger;
		readonly reinit: (config: ResourceConfig) => Effect.Effect<boolean>;
	}
>() {}
