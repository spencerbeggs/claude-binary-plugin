import { Schema } from "effect";

// =============================================================================
// EFFECT SCHEMA DEFINITIONS
// Schema.Class definitions for runtime validation, type-safe serialization,
// and TypeScript types (single source of truth).
// BigInt fields encode as strings for JSON wire format.
// =============================================================================

/**
 * Instrumentation scope metadata.
 * @public
 */
export class ScopeData extends Schema.Class<ScopeData>("ScopeData")({
	name: Schema.String,
	version: Schema.optional(Schema.String),
}) {}

/**
 * Schema for attribute maps (key-value pairs of primitive values).
 * @internal
 */
const AttributesSchema = Schema.optional(
	Schema.Record({ key: Schema.String, value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean) }),
);

/**
 * Standalone event data (not attached to a span).
 * BigInt timeNs encodes as string for JSON wire format.
 * @public
 */
export class EventData extends Schema.Class<EventData>("EventData")({
	name: Schema.String,
	timeNs: Schema.BigInt,
	severity: Schema.optional(Schema.Literal("trace", "debug", "info", "warn", "error", "fatal")),
	body: Schema.optional(Schema.String),
	attributes: AttributesSchema,
	scope: Schema.optional(ScopeData),
}) {}

/**
 * Span status.
 * @public
 */
export class SpanStatus extends Schema.Class<SpanStatus>("SpanStatus")({
	code: Schema.Literal("unset", "ok", "error"),
	message: Schema.optional(Schema.String),
}) {}

/**
 * An event within a span timeline.
 * BigInt timeNs encodes as string for JSON wire format.
 * @public
 */
export class SpanEvent extends Schema.Class<SpanEvent>("SpanEvent")({
	name: Schema.String,
	timeNs: Schema.BigInt,
	attributes: AttributesSchema,
}) {}

/**
 * Span data (a single unit of work in a distributed trace).
 * BigInt startTimeNs and endTimeNs encode as strings for JSON wire format.
 * @public
 */
export class SpanData extends Schema.Class<SpanData>("SpanData")({
	spanId: Schema.String,
	traceId: Schema.String,
	parentSpanId: Schema.optional(Schema.String),
	name: Schema.String,
	kind: Schema.Literal("client", "server", "producer", "consumer", "internal"),
	startTimeNs: Schema.BigInt,
	endTimeNs: Schema.optional(Schema.BigInt),
	attributes: AttributesSchema,
	status: Schema.optional(SpanStatus),
	events: Schema.optional(Schema.Array(SpanEvent)),
}) {}

/**
 * Metric type discriminated union variants.
 * Discriminated on the `kind` field.
 * @public
 */
export const MetricType = Schema.Union(
	Schema.Struct({ kind: Schema.Literal("counter"), value: Schema.Number, monotonic: Schema.optional(Schema.Boolean) }),
	Schema.Struct({ kind: Schema.Literal("gauge"), value: Schema.Number }),
	Schema.Struct({
		kind: Schema.Literal("histogram"),
		value: Schema.Number,
		buckets: Schema.optional(Schema.Array(Schema.Number)),
	}),
);

/**
 * Metric data point (counter, gauge, or histogram).
 * BigInt timeNs encodes as string for JSON wire format.
 * @public
 */
export class MetricData extends Schema.Class<MetricData>("MetricData")({
	name: Schema.String,
	description: Schema.optional(Schema.String),
	unit: Schema.optional(Schema.String),
	type: MetricType,
	attributes: AttributesSchema,
	timeNs: Schema.BigInt,
}) {}

/**
 * Ping message (sent at session start to establish connection).
 * The config field uses Schema.Unknown since OtelProtocolConfig is complex
 * and stays as a plain interface.
 * @public
 */
export class PingMessage extends Schema.Class<PingMessage>("PingMessage")({
	type: Schema.Literal("ping"),
	sessionId: Schema.String,
	config: Schema.Unknown,
}) {}

/**
 * Span message containing trace data.
 * @public
 */
export class SpanMessage extends Schema.Class<SpanMessage>("SpanMessage")({
	type: Schema.Literal("span"),
	sessionId: Schema.String,
	data: SpanData,
}) {}

/**
 * Event message containing log/event data.
 * @public
 */
export class EventMessage extends Schema.Class<EventMessage>("EventMessage")({
	type: Schema.Literal("event"),
	sessionId: Schema.String,
	data: EventData,
}) {}

/**
 * Metric message containing metric data.
 * @public
 */
export class MetricMessage extends Schema.Class<MetricMessage>("MetricMessage")({
	type: Schema.Literal("metric"),
	sessionId: Schema.String,
	data: MetricData,
}) {}

/**
 * Shutdown message (gracefully terminates the sidecar).
 * @public
 */
export class ShutdownMessage extends Schema.Class<ShutdownMessage>("ShutdownMessage")({
	type: Schema.Literal("shutdown"),
	sessionId: Schema.optional(Schema.String),
}) {}

/**
 * Discriminated union schema for all sidecar IPC message types.
 * Discriminated on the `type` literal field.
 * @public
 */
export const SidecarProtocolMessage = Schema.Union(
	PingMessage,
	SpanMessage,
	EventMessage,
	MetricMessage,
	ShutdownMessage,
);

/**
 * OTEL exporter configuration sent from hooks to sidecar.
 * The sidecar uses this to configure its OTEL providers.
 * @public
 */
export interface OtelProtocolConfig {
	/**
	 * OTLP endpoint URL (e.g., "http://localhost:4318")
	 * @defaultValue "http://localhost:4318"
	 */
	endpoint?: string | undefined;

	/**
	 * Protocol to use for export.
	 * HTTP is preferred for Bun compatibility (gRPC has issues).
	 * @defaultValue "http"
	 */
	protocol?: "http" | "grpc" | undefined;

	/**
	 * Service name for OTEL resource.
	 * @defaultValue "claude-code-plugin"
	 */
	serviceName?: string | undefined;

	/**
	 * Plugin name for resource attributes.
	 * Set via setPluginInfo() at startup.
	 */
	pluginName?: string | undefined;

	/**
	 * Marketplace name the plugin belongs to.
	 */
	marketplaceName?: string | undefined;

	/**
	 * Additional resource attributes to include with all telemetry.
	 */
	resourceAttributes?: Record<string, string | number | boolean> | undefined;

	/**
	 * Headers to include with OTLP requests (e.g., auth tokens).
	 */
	headers?: Record<string, string> | undefined;

	/**
	 * Export timeout in milliseconds.
	 * @defaultValue 30000
	 */
	exportTimeoutMs?: number | undefined;
}

/**
 * Response from sidecar to client.
 * @public
 */
export interface SidecarResponse {
	/** Whether the operation succeeded */
	ok: boolean;
	/** Error message if not ok */
	error?: string | undefined;
	/** Sidecar version for debugging */
	version?: string | undefined;
}
