import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Modify } from "../../src/outcomes/Modify.js";
import { Outcome } from "../../src/outcomes/Outcome.js";

describe("Modify", () => {
	test("constructs with summary and updatedInput", () => {
		const m = new Modify({
			summary: "formatted code",
			updatedInput: { file_path: "test.ts", content: "fixed" },
		});
		expect(m.summary).toBe("formatted code");
		expect(m.updatedInput).toEqual({ file_path: "test.ts", content: "fixed" });
	});

	test("toResponse produces permissionDecision: allow with updatedInput", () => {
		const m = new Modify({
			summary: "formatted",
			updatedInput: { file_path: "x.ts", content: "new" },
		});
		expect(m.toResponse()).toEqual({
			permissionDecision: "allow",
			updatedInput: { file_path: "x.ts", content: "new" },
		});
	});

	test("toTelemetry returns modified outcome", () => {
		const m = new Modify({
			summary: "formatted",
			updatedInput: { file_path: "x.ts", content: "new" },
		});
		expect(m.toTelemetry().outcome).toBe("modified");
	});

	test("can be extended with domain fields", () => {
		class BiomeFormatted extends Modify.extend<BiomeFormatted>("BiomeFormatted")({
			linter: Schema.Literal("biome", "markdownlint", "prettier"),
			fixedCount: Schema.Number,
		}) {}

		const m = new BiomeFormatted({
			summary: "biome formatted",
			updatedInput: { file_path: "x.ts", content: "fixed" },
			linter: "biome",
			fixedCount: 3,
		});

		expect(m).toBeInstanceOf(Modify);
		expect(m).toBeInstanceOf(Outcome);
		expect(m.toTelemetry().metrics).toEqual({ linter: "biome", fixedCount: 3 });
	});
});
