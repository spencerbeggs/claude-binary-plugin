/**
 * IPC Protocol types for communication between hooks and OTEL sidecar.
 *
 * Messages are sent as JSON Lines (newline-delimited JSON) over Unix sockets.
 * This format is simple, debuggable, and efficient for the expected message sizes.
 *
 * @module
 */

/**
 * OTEL exporter configuration sent from hooks to sidecar.
 * The sidecar uses this to configure its OTEL providers.
 * @public
 */
export interface OTELConfig {
	/**
	 * OTLP endpoint URL (e.g., "http://localhost:4318")
	 * @defaultValue "http://localhost:4318"
	 */
	endpoint?: string;

	/**
	 * Protocol to use for export.
	 * HTTP is preferred for Bun compatibility (gRPC has issues).
	 * @defaultValue "http"
	 */
	protocol?: "http" | "grpc";

	/**
	 * Service name for OTEL resource.
	 * @defaultValue "claude-code-plugin"
	 */
	serviceName?: string;

	/**
	 * Plugin name for resource attributes.
	 * Set via setPluginInfo() at startup.
	 */
	pluginName?: string;

	/**
	 * Marketplace name the plugin belongs to.
	 */
	marketplaceName?: string;

	/**
	 * Additional resource attributes to include with all telemetry.
	 */
	resourceAttributes?: Record<string, string | number | boolean>;

	/**
	 * Headers to include with OTLP requests (e.g., auth tokens).
	 */
	headers?: Record<string, string>;

	/**
	 * Export timeout in milliseconds.
	 * @defaultValue 30000
	 */
	exportTimeoutMs?: number;
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
	parentSpanId?: string;

	/** Human-readable name for this span */
	name: string;

	/** Span kind (client, server, producer, consumer, internal) */
	kind: "client" | "server" | "producer" | "consumer" | "internal";

	/** Start time in Unix nanoseconds */
	startTimeNs: bigint;

	/** End time in Unix nanoseconds (if span is complete) */
	endTimeNs?: bigint;

	/** Span attributes (key-value pairs) */
	attributes?: Record<string, string | number | boolean>;

	/** Span status */
	status?: {
		code: "unset" | "ok" | "error";
		message?: string;
	};

	/** Events attached to this span */
	events?: SpanEvent[];
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
	attributes?: Record<string, string | number | boolean>;
}

/**
 * Instrumentation scope for telemetry.
 * @public
 */
export interface ScopeData {
	/** Scope name (e.g., "systems.savvyweb.claude_code.events") */
	name: string;
	/** Scope version (e.g., plugin version) */
	version?: string;
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
	attributes?: Record<string, string | number | boolean>;

	/** Severity level */
	severity?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

	/** Human-readable message */
	body?: string;

	/** Instrumentation scope metadata */
	scope?: ScopeData;
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
	description?: string;

	/** Metric unit (e.g., "ms", "bytes", "1") */
	unit?: string;

	/** Metric type and value */
	type: MetricType;

	/** Metric attributes (dimensions) */
	attributes?: Record<string, string | number | boolean>;

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
	config: OTELConfig;
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
	sessionId?: string;
}

/**
 * Union of all sidecar message types.
 * @public
 */
export type SidecarMessage = PingMessage | SpanMessage | EventMessage | MetricMessage | ShutdownMessage;

/**
 * Response from sidecar to client.
 * @public
 */
export interface SidecarResponse {
	/** Whether the operation succeeded */
	ok: boolean;
	/** Error message if not ok */
	error?: string;
	/** Sidecar version for debugging */
	version?: string;
}

// Note: serializeMessage and parseMessage functions have been moved to the
// SidecarMessage class in ./classes/SidecarMessage.ts
// Use SidecarMessage.serialize() and SidecarMessage.parse() instead.
