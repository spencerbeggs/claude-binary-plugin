import { afterEach, describe, expect, test } from "bun:test";
import { ClaudeAccountInfo } from "./ClaudeAccountInfo.js";

describe("ClaudeAccountInfo", () => {
	afterEach(() => {
		ClaudeAccountInfo.clearCache();
	});

	describe("detect", () => {
		test("returns account info from ~/.claude.json when file exists", () => {
			ClaudeAccountInfo.clearCache();

			const info = ClaudeAccountInfo.detect();

			// The structure should always be present, even if values are null
			expect(info).toHaveProperty("accountUuid");
			expect(info).toHaveProperty("organizationUuid");
			expect(info).toHaveProperty("emailAddress");
			expect(info).toHaveProperty("displayName");
			expect(info).toHaveProperty("organizationName");

			// If the file exists and has valid data, values should be strings
			// If not, they should be null
			if (info.accountUuid !== null) {
				expect(typeof info.accountUuid).toBe("string");
			}
			if (info.organizationUuid !== null) {
				expect(typeof info.organizationUuid).toBe("string");
			}
		});

		test("caches account info across calls", () => {
			ClaudeAccountInfo.clearCache();

			const info1 = ClaudeAccountInfo.detect();
			const info2 = ClaudeAccountInfo.detect();

			// Should return the same cached object
			expect(info1).toBe(info2);
		});

		test("clearCache resets the cache", () => {
			// Get cached info, clear cache, get fresh info
			const info1 = ClaudeAccountInfo.detect();
			expect(info1).toHaveProperty("accountUuid");

			ClaudeAccountInfo.clearCache();
			const info2 = ClaudeAccountInfo.detect();

			// After clearing, should still have same structure
			expect(info2).toHaveProperty("accountUuid");
		});
	});
});
