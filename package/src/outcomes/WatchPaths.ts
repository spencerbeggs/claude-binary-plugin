import { Schema } from "effect";
import { Outcome } from "./Outcome.js";

/**
 * WatchPaths outcome for CwdChanged and FileChanged hooks.
 *
 * @remarks
 * Returns path patterns for Claude Code to watch.
 * Wire format: `{ watchPaths: [...] }`
 *
 * @public
 */
export class WatchPaths extends Schema.Class<WatchPaths>("WatchPaths")({
	paths: Schema.Array(Schema.String),
}) {
	static readonly _tag = "WatchPaths" as const;

	toResponse(): { watchPaths: readonly string[] } {
		return { watchPaths: this.paths };
	}

	toTelemetry(): Record<string, unknown> {
		return {
			outcome: "watchPaths",
			pathCount: this.paths.length,
		};
	}
}

Object.setPrototypeOf(WatchPaths.prototype, Outcome.prototype);
(WatchPaths.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
