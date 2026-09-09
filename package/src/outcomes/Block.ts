import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Block outcome — prevents the agent from stopping or continuing.
 *
 * Valid for: Stop, SubagentStop, PostToolUse, UserPromptSubmit
 *
 * @public
 */
export class Block extends Schema.Class<Block>("Block")({
	summary: Schema.String,
	reason: Schema.String,
}) {
	static readonly _tag = "Block" as const;

	toResponse(): Record<string, unknown> {
		return { decision: "block", reason: this.reason };
	}

	toTelemetry() {
		return {
			outcome: "blocked" as const,
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

Object.setPrototypeOf(Block.prototype, Outcome.prototype);
(Block.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
