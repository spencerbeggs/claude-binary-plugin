import { describe, expect, test } from "bun:test";
import { Pipeline } from "../../src/types/pipeline.js";

describe("Pipeline", () => {
	test("can be instantiated", () => {
		// @ts-expect-error: Private constructor - testing for coverage
		const instance = new Pipeline();
		expect(instance).toBeInstanceOf(Pipeline);
	});

	describe("isOutput", () => {
		test("returns true for valid pipeline output", () => {
			const output = { status: "executed", summary: "Did something" };
			expect(Pipeline.isOutput(output)).toBe(true);
		});

		test("returns false for null", () => {
			expect(Pipeline.isOutput(null)).toBe(false);
		});

		test("returns false for undefined", () => {
			expect(Pipeline.isOutput(undefined)).toBe(false);
		});

		test("returns false for primitive", () => {
			expect(Pipeline.isOutput("string")).toBe(false);
		});

		test("returns false for object missing status", () => {
			expect(Pipeline.isOutput({ summary: "text" })).toBe(false);
		});

		test("returns false for object missing summary", () => {
			expect(Pipeline.isOutput({ status: "executed" })).toBe(false);
		});
	});

	describe("isPipelineHook", () => {
		test("returns true for pipeline hook definition", () => {
			const hook = { pipeline: () => ({ status: "executed", summary: "ok" }) };
			expect(Pipeline.isPipelineHook(hook as never)).toBe(true);
		});

		test("returns false for raw hook definition", () => {
			const hook = { handler: () => {} };
			expect(Pipeline.isPipelineHook(hook as never)).toBe(false);
		});

		test("returns false for hook with pipeline set to undefined", () => {
			const hook = { pipeline: undefined };
			expect(Pipeline.isPipelineHook(hook as never)).toBe(false);
		});
	});

	describe("isRawHook", () => {
		test("returns true for raw hook definition", () => {
			const hook = { handler: () => {} };
			expect(Pipeline.isRawHook(hook as never)).toBe(true);
		});

		test("returns false for pipeline hook definition", () => {
			const hook = { pipeline: () => ({ status: "executed", summary: "ok" }) };
			expect(Pipeline.isRawHook(hook as never)).toBe(false);
		});

		test("returns false for hook with handler set to undefined", () => {
			const hook = { handler: undefined };
			expect(Pipeline.isRawHook(hook as never)).toBe(false);
		});
	});

	describe("Metrics", () => {
		test("exposes estimateTokens function", () => {
			expect(typeof Pipeline.Metrics.estimateTokens).toBe("function");
		});

		test("exposes detectContentType function", () => {
			expect(typeof Pipeline.Metrics.detectContentType).toBe("function");
		});

		test("exposes extractTokens function", () => {
			expect(typeof Pipeline.Metrics.extractTokens).toBe("function");
		});

		test("exposes extractToolTokens function", () => {
			expect(typeof Pipeline.Metrics.extractToolTokens).toBe("function");
		});

		test("exposes extractAuto function", () => {
			expect(typeof Pipeline.Metrics.extractAuto).toBe("function");
		});

		test("exposes createSessionState function", () => {
			expect(typeof Pipeline.Metrics.createSessionState).toBe("function");
		});

		test("exposes updateSession function", () => {
			expect(typeof Pipeline.Metrics.updateSession).toBe("function");
		});

		test("exposes getSessionAttributes function", () => {
			expect(typeof Pipeline.Metrics.getSessionAttributes).toBe("function");
		});

		test("exposes DEFAULT_BUDGET", () => {
			expect(Pipeline.Metrics.DEFAULT_BUDGET).toBeDefined();
		});

		test("exposes checkBudget function", () => {
			expect(typeof Pipeline.Metrics.checkBudget).toBe("function");
		});

		test("estimateTokens returns a number", () => {
			const tokens = Pipeline.Metrics.estimateTokens("hello world", "prose");
			expect(typeof tokens).toBe("number");
			expect(tokens).toBeGreaterThan(0);
		});

		test("detectContentType returns a string", () => {
			const type = Pipeline.Metrics.detectContentType({ content: "const x = 1;" });
			expect(typeof type).toBe("string");
		});
	});
});
