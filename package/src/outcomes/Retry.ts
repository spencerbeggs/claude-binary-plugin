import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * Retry outcome for PermissionRequest hooks.
 *
 * @remarks
 * Tells Claude Code the model may retry the denied tool call.
 * Wire format: `{ hookSpecificOutput: { retry: true } }`
 *
 * @public
 */
export class Retry extends Schema.Class<Retry>("Retry")({}) {
	static readonly _tag = "Retry" as const;

	toResponse(): { hookSpecificOutput: { retry: boolean } } {
		return { hookSpecificOutput: { retry: true } };
	}

	toTelemetry(): Record<string, unknown> {
		return { outcome: "retry" };
	}
}

Object.setPrototypeOf(Retry.prototype, Outcome.prototype);
(Retry.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
