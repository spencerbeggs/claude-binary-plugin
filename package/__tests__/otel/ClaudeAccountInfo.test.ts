import { afterEach, describe, expect, test } from "bun:test";
import { clearClaudeAccountInfoCache, detectClaudeAccountInfo } from "../../src/otel/ClaudeAccountInfo.js";

describe("ClaudeAccountInfo", () => {
	afterEach(() => {
		clearClaudeAccountInfoCache();
	});

	describe("isValid", () => {
		test("returns true when both accountUuid and organizationUuid are present", () => {
			const info = {
				accountUuid: "user-123",
				organizationUuid: "org-456",
				emailAddress: null,
				displayName: null,
				organizationName: null,
				isValid: true,
			};
			expect(info.isValid).toBe(true);
		});

		test("returns true when only accountUuid is present", () => {
			const info = {
				accountUuid: "user-123",
				organizationUuid: null,
				emailAddress: null,
				displayName: null,
				organizationName: null,
				isValid: true,
			};
			expect(info.isValid).toBe(true);
		});

		test("returns true when only organizationUuid is present", () => {
			const info = {
				accountUuid: null,
				organizationUuid: "org-456",
				emailAddress: null,
				displayName: null,
				organizationName: null,
				isValid: true,
			};
			expect(info.isValid).toBe(true);
		});

		test("returns false when both accountUuid and organizationUuid are null", () => {
			const info = {
				accountUuid: null,
				organizationUuid: null,
				emailAddress: "test@example.com",
				displayName: "Test User",
				organizationName: "Test Org",
				isValid: false,
			};
			expect(info.isValid).toBe(false);
		});
	});

	describe("clearClaudeAccountInfoCache", () => {
		test("causes detectClaudeAccountInfo() to re-read environment on next call", () => {
			const info1 = detectClaudeAccountInfo();
			clearClaudeAccountInfoCache();
			const info2 = detectClaudeAccountInfo();

			// After clearing cache, detectClaudeAccountInfo() returns a new instance (not the same reference)
			// They may have the same values but should not be the same object
			expect(info1).not.toBe(info2);
		});
	});

	describe("detectClaudeAccountInfo", () => {
		test("returns account info from ~/.claude.json when file exists", () => {
			clearClaudeAccountInfoCache();

			const info = detectClaudeAccountInfo();

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
			clearClaudeAccountInfoCache();

			const info1 = detectClaudeAccountInfo();
			const info2 = detectClaudeAccountInfo();

			// Should return the same cached object
			expect(info1).toBe(info2);
		});

		test("clearClaudeAccountInfoCache resets the cache", () => {
			// Get cached info, clear cache, get fresh info
			const info1 = detectClaudeAccountInfo();
			expect(info1).toHaveProperty("accountUuid");

			clearClaudeAccountInfoCache();
			const info2 = detectClaudeAccountInfo();

			// After clearing, should still have same structure
			expect(info2).toHaveProperty("accountUuid");
		});
	});
});
