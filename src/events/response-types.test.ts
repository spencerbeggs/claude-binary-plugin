import { describe, expect, test } from "bun:test";
import type { BlockDecision, HookResponseData } from "./response-types.js";

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
