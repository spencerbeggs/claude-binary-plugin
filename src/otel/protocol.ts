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
 * Span data for tracing.
 * Represents a single unit of work in a distributed trace.
 * @public
 */
export interface SpanData {
	/** Unique identifier for this span (hex-encoded 16 bytes) */
	spanId: string;

	/** Trace ID this span belongs to (hex-encoded 32 bytes) */
	traceId: string;

	/** Parent span ID, if this span has a parent */
	parentSpanId?: string | undefined;

	/** Human-readable name for this span */
	name: string;

	/** Span kind (client, server, producer, consumer, internal) */
	kind: "client" | "server" | "producer" | "consumer" | "internal";

	/** Start time in Unix nanoseconds */
	startTimeNs: bigint;

	/** End time in Unix nanoseconds (if span is complete) */
	endTimeNs?: bigint | undefined;

	/** Span attributes (key-value pairs) */
	attributes?: Record<string, string | number | boolean> | undefined;

	/** Span status */
	status?:
		| {
				code: "unset" | "ok" | "error";
				message?: string | undefined;
		  }
		| undefined;

	/** Events attached to this span */
	events?: SpanEvent[] | undefined;
}

/**
 * An event within a span timeline.
 * @public
 */
export interface SpanEvent {
	/** Event name */
	name: string;

	/** Event time in Unix nanoseconds */
	timeNs: bigint;

	/** Event attributes */
	attributes?: Record<string, string | number | boolean> | undefined;
}

/**
 * Instrumentation scope for telemetry.
 * @public
 */
export interface ScopeData {
	/** Scope name (e.g., "systems.savvyweb.claude_code.events") */
	name: string;
	/** Scope version (e.g., plugin version) */
	version?: string | undefined;
}

/**
 * Standalone event data (not attached to a span).
 * Used for logging notable occurrences.
 * @public
 */
export interface EventData {
	/** Event name */
	name: string;

	/** Event time in Unix nanoseconds */
	timeNs: bigint;

	/** Event attributes */
	attributes?: Record<string, string | number | boolean> | undefined;

	/** Severity level */
	severity?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | undefined;

	/** Human-readable message */
	body?: string | undefined;

	/** Instrumentation scope metadata */
	scope?: ScopeData | undefined;
}

/**
 * Metric data point.
 * Supports counters, gauges, and histograms.
 * @public
 */
export interface MetricData {
	/** Metric name */
	name: string;

	/** Metric description */
	description?: string | undefined;

	/** Metric unit (e.g., "ms", "bytes", "1") */
	unit?: string | undefined;

	/** Metric type and value */
	type: MetricType;

	/** Metric attributes (dimensions) */
	attributes?: Record<string, string | number | boolean> | undefined;

	/** Timestamp in Unix nanoseconds */
	timeNs: bigint;
}

/**
 * Metric type discriminated union.
 * @public
 */
export type MetricType =
	| { kind: "counter"; value: number; monotonic?: boolean }
	| { kind: "gauge"; value: number }
	| { kind: "histogram"; value: number; buckets?: number[] };

/**
 * Ping message to verify sidecar is alive and configure it.
 * Sent at session start to establish connection.
 * @public
 */
export interface PingMessage {
	type: "ping";
	/** Session ID for correlation */
	sessionId: string;
	/** OTEL configuration for this session */
	config: OtelProtocolConfig;
}

/**
 * Span message containing trace data.
 * @public
 */
export interface SpanMessage {
	type: "span";
	/** Session ID for correlation */
	sessionId: string;
	/** Span data to export */
	data: SpanData;
}

/**
 * Event message containing log/event data.
 * @public
 */
export interface EventMessage {
	type: "event";
	/** Session ID for correlation */
	sessionId: string;
	/** Event data to export */
	data: EventData;
}

/**
 * Metric message containing metric data.
 * @public
 */
export interface MetricMessage {
	type: "metric";
	/** Session ID for correlation */
	sessionId: string;
	/** Metric data to export */
	data: MetricData;
}

/**
 * Shutdown message to gracefully terminate the sidecar.
 * @public
 */
export interface ShutdownMessage {
	type: "shutdown";
	/** Optional session ID if shutting down a specific session */
	sessionId?: string | undefined;
}

/**
 * Union of all sidecar message types.
 * @public
 */
export type SidecarProtocolMessage = PingMessage | SpanMessage | EventMessage | MetricMessage | ShutdownMessage;

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
