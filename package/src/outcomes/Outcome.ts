import type { ContextBuilder } from "./ContextBuilder.js";

/**
 * Telemetry outcome label for OTEL span attributes.
 * @public
 */
export type HookOutcomeLabel =
	| "allowed"
	| "denied"
	| "asked"
	| "modified"
	| "blocked"
	| "continued"
	| "context_added"
	| "noAction"
	| "skipped"
	| "passthrough"
	| "error";

/**
 * Telemetry data extracted from an outcome.
 * @public
 */
export interface OutcomeTelemetry {
	/** Semantic outcome label for OTEL */
	outcome: HookOutcomeLabel;
	/** Human-readable summary for logs */
	summary: string;
	/** Whether execution was successful */
	success: boolean;
	/** Domain-specific metrics from extended outcome fields */
	metrics?: Record<string, string | number | boolean>;
}

/**
 * Context value: either a raw string or a ContextBuilder instance.
 * @public
 */
export type ContextValue = string | ContextBuilder;

/** Symbol used to identify Outcome instances */
const OUTCOME_BRAND = Symbol.for("claude-binary-plugin/Outcome");

/**
 * Abstract base class for all hook outcomes.
 *
 * Every concrete outcome (Allow, Deny, Skip, etc.) extends this class.
 * The SDK calls toResponse() to produce the Claude Code wire format
 * and toTelemetry() to extract OTEL span attributes.
 *
 * @public
 */
export abstract class Outcome {
	/** Brand for instanceof-like checks across module boundaries */
	readonly [OUTCOME_BRAND] = true;

	/** Human-readable summary for logs and telemetry */
	abstract readonly summary: string;

	/**
	 * Convert this outcome to the Claude Code wire response format.
	 * The returned object is JSON-serialized and written to stdout.
	 */
	abstract toResponse(): Record<string, unknown>;

	/**
	 * Extract telemetry data for OTEL emission.
	 */
	abstract toTelemetry(): OutcomeTelemetry;

	/**
	 * Type guard: check if a value is an Outcome instance.
	 */
	static isOutcome(value: unknown): value is Outcome {
		return (
			value !== null &&
			value !== undefined &&
			typeof value === "object" &&
			OUTCOME_BRAND in value &&
			(value as Record<symbol, unknown>)[OUTCOME_BRAND] === true
		);
	}

	/**
	 * Resolve a context value to a string.
	 * If it's a ContextBuilder, calls toString().
	 * If it's a string, returns as-is.
	 * If undefined, returns undefined.
	 */
	static resolveContext(value: ContextValue | undefined): string | undefined {
		if (value === undefined) return undefined;
		if (typeof value === "string") return value;
		return value.toString();
	}
}
