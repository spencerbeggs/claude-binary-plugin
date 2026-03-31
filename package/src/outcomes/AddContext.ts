import { Schema } from "effect";
import type { ContextBuilder } from "./ContextBuilder.js";
import type { ContextValue } from "./Outcome.js";
import { Outcome } from "./Outcome.js";

/**
 * AddContext outcome — provides additionalContext for Claude.
 *
 * Accepts either a raw string or a ContextBuilder instance.
 * ContextBuilder is rendered to string at response time.
 *
 * Valid for: SessionStart, PostToolUse, UserPromptSubmit
 *
 * @example
 * ```typescript
 * const md = new MarkdownContext().heading(2, "Rules").rule("No force push");
 * return new AddContext({ summary: "added git context", context: md });
 * ```
 *
 * @public
 */
export class AddContext extends Schema.Class<AddContext>("AddContext")({
	summary: Schema.String,
	// Schema field is Any — ContextBuilder is resolved before encode
	context: Schema.Any,
}) {
	static readonly _tag = "AddContext" as const;

	toResponse(): Record<string, unknown> {
		const resolved = Outcome.resolveContext(this.context as ContextValue);
		return resolved ? { additionalContext: resolved } : {};
	}

	toTelemetry() {
		const contextValue = this.context as ContextValue;
		// If context is a ContextBuilder, include its metrics
		const builderMetrics =
			typeof contextValue !== "string" && contextValue && "metrics" in contextValue
				? (contextValue as ContextBuilder).metrics
				: undefined;

		return {
			outcome: "context_added" as const,
			summary: this.summary,
			success: true,
			metrics: builderMetrics,
		};
	}
}

Object.setPrototypeOf(AddContext.prototype, Outcome.prototype);
(AddContext.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
