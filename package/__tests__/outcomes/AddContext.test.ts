import { describe, expect, test } from "bun:test";
import { AddContext } from "../../src/outcomes/AddContext.js";
import { MarkdownContext } from "../../src/outcomes/ContextBuilder.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("AddContext", () => {
	test("constructs with string context", () => {
		const a = new AddContext({ summary: "added context", context: "important info" });
		expect(a.context).toBe("important info");
	});

	test("toResponse produces additionalContext from string", () => {
		const a = new AddContext({ summary: "ctx", context: "hello claude" });
		expect(a.toResponse()).toEqual({ additionalContext: "hello claude" });
	});

	test("toResponse renders ContextBuilder to string", () => {
		const md = new MarkdownContext().heading(2, "Rules").rule("No force push");
		const a = new AddContext({ summary: "ctx", context: md });
		expect(a.toResponse()).toEqual({
			additionalContext: "## Rules\n\n- **Rule:** No force push",
		});
	});

	test("toTelemetry returns context_added outcome", () => {
		const a = new AddContext({ summary: "ctx", context: "hi" });
		expect(a.toTelemetry().outcome).toBe("context_added");
	});

	test("toTelemetry includes ContextBuilder metrics", () => {
		const md = new MarkdownContext().heading(2, "T").rule("R1").rule("R2");
		const a = new AddContext({ summary: "ctx", context: md });
		const t = a.toTelemetry();
		expect(t.metrics?.sections).toBe(1);
		expect(t.metrics?.rules).toBe(2);
	});

	test("is an Outcome", () => {
		expect(new AddContext({ summary: "t", context: "c" })).toBeInstanceOf(Outcome);
	});
});
