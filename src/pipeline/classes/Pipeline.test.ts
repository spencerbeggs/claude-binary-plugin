import { describe, expect, test } from "bun:test";
import { Pipeline } from "./Pipeline.js";

describe("Pipeline", () => {
	test("Pipeline class is exported", () => {
		expect(Pipeline).toBeDefined();
	});

	test("Pipeline.isOutput is a function", () => {
		expect(typeof Pipeline.isOutput).toBe("function");
	});

	test("Pipeline.isPipelineHook is a function", () => {
		expect(typeof Pipeline.isPipelineHook).toBe("function");
	});

	test("Pipeline.isRawHook is a function", () => {
		expect(typeof Pipeline.isRawHook).toBe("function");
	});

	test("Pipeline.Metrics is available", () => {
		expect(Pipeline.Metrics).toBeDefined();
	});
});
