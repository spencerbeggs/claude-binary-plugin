import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Skip outcome — hook didn't apply to this event.
 *
 * Valid for: PreToolUse, PostToolUse, Stop, SubagentStop, UserPromptSubmit
 *
 * @public
 */
export class Skip extends Schema.Class<Skip>("Skip")({
	summary: Schema.String,
	reason: Schema.optional(Schema.String),
}) {
	static readonly _tag = "Skip" as const;

	toResponse(): Record<string, unknown> {
		return {};
	}

	toTelemetry() {
		return { outcome: "skipped" as const, summary: this.summary, success: true };
	}
}

Object.setPrototypeOf(Skip.prototype, Outcome.prototype);
(Skip.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
