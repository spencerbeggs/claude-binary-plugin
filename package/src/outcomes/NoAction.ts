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
	summary: Schema.optionalWith(Schema.String, { default: () => "" }),
	implicit: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {
	static readonly _tag = "NoAction" as const;

	/**
	 * Create a NoAction outcome that signals the handler returned implicitly
	 * (undefined/void). Used by the pipeline to wrap missing handler returns.
	 * Shows up in OTEL telemetry so developers can spot unhandled code paths.
	 */
	static implicit(): NoAction {
		return new NoAction({ implicit: true });
	}

	toResponse(): Record<string, unknown> {
		return {};
	}

	toTelemetry() {
		return { outcome: "noAction" as const, summary: this.summary, success: true, implicit: this.implicit };
	}
}

Object.setPrototypeOf(NoAction.prototype, Outcome.prototype);
(NoAction.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
