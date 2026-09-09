import { Schema } from "effect";
import { JsonObjectSchema } from "../schemas/json.js";
import { Outcome } from "./Outcome.js";

/**
 * Modify outcome — changes the tool input before execution.
 *
 * Valid for: PreToolUse only
 *
 * @example
 * ```typescript
 * return new Modify({
 *   summary: "biome formatted",
 *   updatedInput: { file_path: path, content: formattedCode },
 * });
 * ```
 *
 * @public
 */
export class Modify extends Schema.Class<Modify>("Modify")({
	summary: Schema.String,
	updatedInput: JsonObjectSchema,
	reason: Schema.optional(Schema.String),
}) {
	static readonly _tag = "Modify" as const;

	toResponse(): Record<string, unknown> {
		return { permissionDecision: "allow", updatedInput: this.updatedInput };
	}

	toTelemetry() {
		return {
			outcome: "modified" as const,
			summary: this.summary,
			success: true,
			metrics: this._extractDomainMetrics(),
		};
	}

	protected _extractDomainMetrics(): Record<string, string | number | boolean> | undefined {
		const baseKeys = new Set(["summary", "reason", "updatedInput"]);
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

Object.setPrototypeOf(Modify.prototype, Outcome.prototype);
(Modify.prototype as any)[Symbol.for("claude-binary-plugin/Outcome")] = true;
