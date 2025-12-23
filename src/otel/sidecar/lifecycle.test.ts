import { describe, expect, mock, test } from "bun:test";
import { parseIdleTimeout } from "./lifecycle.js";

describe("lifecycle", () => {
	describe("parseIdleTimeout", () => {
		test("returns default when env value is undefined", () => {
			const result = parseIdleTimeout(undefined, 300000);

			expect(result).toBe(300000);
		});

		test("returns default when env value is empty string", () => {
			const result = parseIdleTimeout("", 300000);

			expect(result).toBe(300000);
		});

		test("parses valid integer value", () => {
			const result = parseIdleTimeout("60000", 300000);

			expect(result).toBe(60000);
		});

		test("returns default for invalid number", () => {
			// Mock console.warn to suppress output
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("not-a-number", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("returns default for zero", () => {
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("0", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("returns default for negative number", () => {
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("-1000", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("uses provided default value", () => {
			const result = parseIdleTimeout(undefined, 120000);

			expect(result).toBe(120000);
		});

		test("uses DEFAULTS.IDLE_TIMEOUT_MS when no default provided", () => {
			const result = parseIdleTimeout(undefined);

			// DEFAULTS.IDLE_TIMEOUT_MS is 5 * 60 * 1000 = 300000
			expect(result).toBe(300000);
		});
	});
});

describe("createLifecycleManager", () => {
	// Note: Full integration tests for createLifecycleManager would require
	// mocking the server and signal handlers, which is complex.
	// The key functionality is tested through parseIdleTimeout and
	// integration tests in server.test.ts
});
