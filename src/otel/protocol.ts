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
 */
export interface OTELConfig {
	/**
	 * OTLP endpoint URL (e.g., "http://localhost:4318")
	 * @default "http://localhost:4318"
	 */
	endpoint?: string;

	/**
	 * Protocol to use for export.
	 * HTTP is preferred for Bun compatibility (gRPC has issues).
	 * @default "http"
	 */
	protocol?: "http" | "grpc";

	/**
	 * Service name for OTEL resource.
	 * @default "claude-code-plugin"
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
	 * @default 30000
	 */
	exportTimeoutMs?: number;
}

/**
 * Span data for tracing.
 * Represents a single unit of work in a distributed trace.
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
 */
export type MetricType =
	| { kind: "counter"; value: number; monotonic?: boolean }
	| { kind: "gauge"; value: number }
	| { kind: "histogram"; value: number; buckets?: number[] };

/**
 * Ping message to verify sidecar is alive and configure it.
 * Sent at session start to establish connection.
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
 */
export interface ShutdownMessage {
	type: "shutdown";
	/** Optional session ID if shutting down a specific session */
	sessionId?: string;
}

/**
 * Union of all sidecar message types.
 */
export type SidecarMessage = PingMessage | SpanMessage | EventMessage | MetricMessage | ShutdownMessage;

/**
 * Response from sidecar to client.
 */
export interface SidecarResponse {
	/** Whether the operation succeeded */
	ok: boolean;
	/** Error message if not ok */
	error?: string;
	/** Sidecar version for debugging */
	version?: string;
}

/**
 * Serialize a message to JSON Line format.
 * Uses a custom replacer to handle BigInt values.
 */
export function serializeMessage(message: SidecarMessage): string {
	return `${JSON.stringify(message, bigIntReplacer)}\n`;
}

/**
 * Parse a JSON Line message.
 * Returns null if parsing fails.
 */
export function parseMessage(line: string): SidecarMessage | null {
	try {
		const trimmed = line.trim();
		if (!trimmed) return null;
		return JSON.parse(trimmed, bigIntReviver) as SidecarMessage;
	} catch {
		return null;
	}
}

/**
 * JSON replacer for BigInt values.
 * Converts BigInt to string with "n" suffix.
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
	if (typeof value === "bigint") {
		return `${value.toString()}n`;
	}
	return value;
}

/**
 * JSON reviver for BigInt values.
 * Converts strings ending in "n" back to BigInt.
 */
function bigIntReviver(_key: string, value: unknown): unknown {
	if (typeof value === "string" && /^\d+n$/.test(value)) {
		return BigInt(value.slice(0, -1));
	}
	return value;
}
