import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Allow outcome — permits the tool/action to proceed.
 *
 * Valid for: PreToolUse, PermissionRequest
 *
 * @example
 * ```typescript
 * return new Allow({ summary: "tool is safe" });
 * ```
 *
 * Extend with domain fields for telemetry:
 * ```typescript
 * class SecurityAllow extends Allow.extend<SecurityAllow>("SecurityAllow")({
 *   riskLevel: Schema.Literal("none", "low"),
 *   scannedPatterns: Schema.Number,
 * }) {}
 * ```
 *
 * @public
 */
export class Allow extends Schema.Class<Allow>("Allow")({
	summary: Schema.String,
	reason: Schema.optional(Schema.String),
}) {
	static readonly _tag = "Allow" as const;

	toResponse(): Record<string, unknown> {
		return { permissionDecision: "allow" };
	}

	toTelemetry() {
		return {
			outcome: "allowed" as const,
			summary: this.summary,
			success: true,
			metrics: this._extractDomainMetrics(),
		};
	}

	/**
	 * Extract domain-specific fields (from extended subclasses) as telemetry metrics.
	 * Base fields (summary, reason) are excluded — only user-added fields are metrics.
	 * @internal
	 */
	protected _extractDomainMetrics(): Record<string, string | number | boolean> | undefined {
		const baseKeys = new Set(["summary", "reason"]);
		const metrics: Record<string, string | number | boolean> = {};
		for (const [key, value] of Object.entries(this)) {
			if (baseKeys.has(key)) continue;
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				metrics[key] = value;
			}
		}
		return Object.keys(metrics).length > 0 ? metrics : undefined;
	}
}

Object.setPrototypeOf(Allow.prototype, Outcome.prototype);
(Allow.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
