import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

const AskFields = {
	summary: Schema.String,
	reason: Schema.optional(Schema.String),
};

/**
 * Ask outcome — defers the decision to the user.
 *
 * Valid for: PreToolUse only
 *
 * @public
 */
export class Ask extends Schema.Class<Ask>("Ask")(AskFields) {
	static readonly _tag = "Ask" as const;

	toResponse(): Record<string, unknown> {
		const res: Record<string, unknown> = { permissionDecision: "ask" };
		if (this.reason !== undefined) res.reason = this.reason;
		return res;
	}

	toTelemetry() {
		return { outcome: "asked" as const, summary: this.summary, success: true };
	}
}

Object.setPrototypeOf(Ask.prototype, Outcome.prototype);
(Ask.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
