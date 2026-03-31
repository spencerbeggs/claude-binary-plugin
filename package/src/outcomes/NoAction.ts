import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * NoAction outcome — hook analyzed but took no action.
 *
 * Valid for: all hook types
 *
 * @public
 */
export class NoAction extends Schema.Class<NoAction>("NoAction")({
	summary: Schema.String,
}) {
	static readonly _tag = "NoAction" as const;

	toResponse(): Record<string, unknown> {
		return {};
	}

	toTelemetry() {
		return { outcome: "no_action" as const, summary: this.summary, success: true };
	}
}

Object.setPrototypeOf(NoAction.prototype, Outcome.prototype);
(NoAction.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
