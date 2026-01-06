/**
 * Tests for hook response types and utilities.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - BlockDecision type
 * - HookResponseData interface
 * - estimateTokenCount() function
 */

import { describe, expect, test } from "bun:test";
import type { BlockDecision, HookResponseData } from "./response-types.js";
import { estimateTokenCount } from "./response-types.js";

describe("estimateTokenCount", () => {
	test("estimates tokens for empty string", () => {
		expect(estimateTokenCount("")).toBe(0);
	});

	test("estimates tokens for short string", () => {
		// ~4 chars per token
		expect(estimateTokenCount("hello")).toBe(2);
	});

	test("estimates tokens for longer string", () => {
		const text = "This is a longer string that should have more tokens";
		const estimate = estimateTokenCount(text);
		expect(estimate).toBeGreaterThan(10);
	});
});

describe("HookResponseData", () => {
	test("type structure is correct", () => {
		const response: HookResponseData = {
			continue: true,
			suppressOutput: false,
		};
		expect(response.continue).toBe(true);
	});
});

describe("BlockDecision", () => {
	test("type accepts valid values", () => {
		const block: BlockDecision = "block";
		const none: BlockDecision = undefined;
		expect(block).toBe("block");
		expect(none).toBeUndefined();
	});
});
