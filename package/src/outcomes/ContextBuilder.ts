/**
 * Base class for composing serializable additionalContext values.
 * Subclasses provide domain-specific builder methods.
 * The SDK calls toString() when serializing the outcome response.
 * @public
 */
export abstract class ContextBuilder {
	/**
	 * Render the context to a string for additionalContext.
	 */
	abstract toString(): string;

	/**
	 * Optional metrics for OTEL instrumentation.
	 * Override in subclasses to expose section/rule/tag counts.
	 */
	get metrics(): Record<string, number> {
		return {};
	}
}

/**
 * Markdown-based context builder for structured Claude instructions.
 *
 * @example
 * ```typescript
 * const ctx = new MarkdownContext()
 *   .heading(2, "Git Safety")
 *   .rule("Do not force push to main")
 *   .paragraph("Current branch: feat/foo");
 * ```
 *
 * @public
 */
export class MarkdownContext extends ContextBuilder {
	private parts: string[] = [];
	private sectionCount = 0;
	private ruleCount = 0;

	heading(level: number, text: string): this {
		this.parts.push(`${"#".repeat(level)} ${text}`);
		this.sectionCount++;
		return this;
	}

	paragraph(text: string): this {
		this.parts.push(text);
		return this;
	}

	list(items: string[]): this {
		this.parts.push(items.map((item) => `- ${item}`).join("\n"));
		return this;
	}

	codeBlock(code: string, lang?: string): this {
		this.parts.push(`\`\`\`${lang ?? ""}\n${code}\n\`\`\``);
		return this;
	}

	rule(text: string): this {
		this.parts.push(`- **Rule:** ${text}`);
		this.ruleCount++;
		return this;
	}

	toString(): string {
		return this.parts.join("\n\n");
	}

	override get metrics(): Record<string, number> {
		const rendered = this.toString();
		return {
			sections: this.sectionCount,
			rules: this.ruleCount,
			estimatedTokens: Math.ceil(rendered.length / 4),
		};
	}
}

/**
 * XML-based context builder for structured Claude instructions.
 *
 * @example
 * ```typescript
 * const ctx = new XmlContext()
 *   .tag("rule", "Do not force push", { severity: "error" });
 * ```
 *
 * @public
 */
export class XmlContext extends ContextBuilder {
	private parts: string[] = [];
	private tagCount = 0;

	tag(name: string, content: string | XmlContext, attrs?: Record<string, string>): this {
		const attrStr = attrs
			? ` ${Object.entries(attrs)
					.map(([k, v]) => `${k}="${v}"`)
					.join(" ")}`
			: "";
		const inner = typeof content === "string" ? content : content.toString();
		this.parts.push(`<${name}${attrStr}>${inner}</${name}>`);
		this.tagCount++;
		return this;
	}

	cdata(content: string): this {
		this.parts.push(`<![CDATA[${content}]]>`);
		return this;
	}

	toString(): string {
		return this.parts.join("\n");
	}

	override get metrics(): Record<string, number> {
		return {
			tags: this.tagCount,
			estimatedTokens: Math.ceil(this.toString().length / 4),
		};
	}
}
