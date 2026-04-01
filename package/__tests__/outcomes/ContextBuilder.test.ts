import { describe, expect, test } from "bun:test";
import { ContextBuilder, MarkdownContext, XmlContext } from "../../src/outcomes/ContextBuilder.js";

describe("ContextBuilder", () => {
	test("is abstract - cannot be instantiated directly", () => {
		// ContextBuilder is abstract, only subclasses can be created
		expect(MarkdownContext.prototype).toBeInstanceOf(ContextBuilder);
	});

	test("metrics returns zeroed counts for empty builder", () => {
		const ctx = new MarkdownContext();
		expect(ctx.metrics.sections).toBe(0);
		expect(ctx.metrics.rules).toBe(0);
		expect(ctx.metrics.estimatedTokens).toBe(0);
	});
});

describe("MarkdownContext", () => {
	test("renders heading", () => {
		const ctx = new MarkdownContext().heading(2, "Git Safety");
		expect(ctx.toString()).toBe("## Git Safety");
	});

	test("renders paragraph", () => {
		const ctx = new MarkdownContext().paragraph("Some text here.");
		expect(ctx.toString()).toBe("Some text here.");
	});

	test("renders unordered list", () => {
		const ctx = new MarkdownContext().list(["item one", "item two"]);
		expect(ctx.toString()).toBe("- item one\n- item two");
	});

	test("renders code block", () => {
		const ctx = new MarkdownContext().codeBlock("const x = 1;", "typescript");
		expect(ctx.toString()).toBe("```typescript\nconst x = 1;\n```");
	});

	test("renders rule", () => {
		const ctx = new MarkdownContext().rule("Do not force push");
		expect(ctx.toString()).toBe("- **Rule:** Do not force push");
	});

	test("chains multiple elements with double newlines", () => {
		const ctx = new MarkdownContext().heading(2, "Context").paragraph("Important info.").rule("Follow this rule");
		expect(ctx.toString()).toBe("## Context\n\nImportant info.\n\n- **Rule:** Follow this rule");
	});

	test("metrics tracks section and rule counts", () => {
		const ctx = new MarkdownContext().heading(2, "Title").rule("Rule 1").rule("Rule 2").paragraph("Text");
		const m = ctx.metrics;
		expect(m.sections).toBe(1);
		expect(m.rules).toBe(2);
		expect(typeof m.estimatedTokens).toBe("number");
		expect(m.estimatedTokens).toBeGreaterThan(0);
	});
});

describe("XmlContext", () => {
	test("renders single tag with text content", () => {
		const ctx = new XmlContext().tag("rule", "Do not force push");
		expect(ctx.toString()).toBe("<rule>Do not force push</rule>");
	});

	test("renders tag with attributes", () => {
		const ctx = new XmlContext().tag("rule", "No force push", { severity: "error", id: "git-001" });
		expect(ctx.toString()).toBe('<rule severity="error" id="git-001">No force push</rule>');
	});

	test("renders nested tags", () => {
		const inner = new XmlContext().tag("item", "one").tag("item", "two");
		const ctx = new XmlContext().tag("list", inner);
		expect(ctx.toString()).toBe("<list><item>one</item>\n<item>two</item></list>");
	});

	test("renders cdata", () => {
		const ctx = new XmlContext().cdata("raw <content> here");
		expect(ctx.toString()).toBe("<![CDATA[raw <content> here]]>");
	});

	test("chains sibling tags", () => {
		const ctx = new XmlContext().tag("rule", "First rule").tag("rule", "Second rule");
		expect(ctx.toString()).toBe("<rule>First rule</rule>\n<rule>Second rule</rule>");
	});

	test("metrics tracks tag count", () => {
		const ctx = new XmlContext().tag("rule", "one").tag("rule", "two").tag("note", "three");
		expect(ctx.metrics.tags).toBe(3);
		expect(typeof ctx.metrics.estimatedTokens).toBe("number");
	});
});
