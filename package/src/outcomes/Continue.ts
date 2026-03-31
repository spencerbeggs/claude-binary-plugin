import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Continue outcome — allows the agent to proceed normally.
 *
 * Valid for: Stop, SubagentStop, PostToolUse, UserPromptSubmit
 *
 * @public
 */
export class Continue extends Schema.Class<Continue>("Continue")({
	summary: Schema.String,
	reason: Schema.optional(Schema.String),
}) {
	static readonly _tag = "Continue" as const;

	toResponse(): Record<string, unknown> {
		return {};
	}

	toTelemetry() {
		return { outcome: "continued" as const, summary: this.summary, success: true };
	}
}

Object.setPrototypeOf(Continue.prototype, Outcome.prototype);
(Continue.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
