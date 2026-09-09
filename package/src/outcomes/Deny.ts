import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Deny outcome — rejects the tool/action with a reason.
 *
 * Valid for: PreToolUse, PermissionRequest
 *
 * @example
 * ```typescript
 * return new Deny({
 *   summary: "dangerous command",
 *   reason: "rm -rf is not allowed",
 * });
 * ```
 *
 * @public
 */
export class Deny extends Schema.Class<Deny>("Deny")({
	summary: Schema.String,
	reason: Schema.String,
}) {
	static readonly _tag = "Deny" as const;

	toResponse(): Record<string, unknown> {
		return { permissionDecision: "deny", reason: this.reason };
	}

	toTelemetry() {
		return {
			outcome: "denied" as const,
			summary: this.summary,
			success: true,
			metrics: this._extractDomainMetrics(),
		};
	}

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

Object.setPrototypeOf(Deny.prototype, Outcome.prototype);
(Deny.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
