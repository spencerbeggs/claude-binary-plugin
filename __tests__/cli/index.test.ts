import { describe, expect, test } from "bun:test";

describe("CLI", () => {
	test("cli module exists", async () => {
		// Dynamic import to verify module structure without executing CLI
		const module = await import("../../src/cli/index.js");
		expect(module).toBeDefined();
	});
});
