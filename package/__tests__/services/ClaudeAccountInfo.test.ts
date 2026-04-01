import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { ClaudeAccountInfoLive } from "../../src/layers/ClaudeAccountInfoLive.js";
import { makeClaudeAccountInfoTest } from "../../src/layers/ClaudeAccountInfoTest.js";
import { ClaudeAccountInfo } from "../../src/services/ClaudeAccountInfo.js";

describe("ClaudeAccountInfo service", () => {
	describe("detect", () => {
		test("returns data with all 6 expected fields", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const result = await Effect.runPromise(Effect.provide(program, ClaudeAccountInfoLive));

			expect(result).toHaveProperty("accountUuid");
			expect(result).toHaveProperty("organizationUuid");
			expect(result).toHaveProperty("emailAddress");
			expect(result).toHaveProperty("displayName");
			expect(result).toHaveProperty("organizationName");
			expect(result).toHaveProperty("isValid");
		});

		test("accountUuid is a string or null", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const result = await Effect.runPromise(Effect.provide(program, ClaudeAccountInfoLive));

			expect(result.accountUuid === null || typeof result.accountUuid === "string").toBe(true);
		});

		test("organizationUuid is a string or null", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const result = await Effect.runPromise(Effect.provide(program, ClaudeAccountInfoLive));

			expect(result.organizationUuid === null || typeof result.organizationUuid === "string").toBe(true);
		});

		test("isValid is a boolean", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const result = await Effect.runPromise(Effect.provide(program, ClaudeAccountInfoLive));

			expect(typeof result.isValid).toBe("boolean");
		});

		test("caches result on second call (same reference)", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				const first = yield* service.detect;
				const second = yield* service.detect;
				return { first, second };
			});

			const { first, second } = await Effect.runPromise(Effect.provide(program, ClaudeAccountInfoLive));

			expect(first).toBe(second);
		});

		test("isValid is false when no UUIDs are present", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const layer = makeClaudeAccountInfoTest({
				accountUuid: null,
				organizationUuid: null,
			});

			const result = await Effect.runPromise(Effect.provide(program, layer));

			expect(result.isValid).toBe(false);
		});

		test("test factory returns provided overrides", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const layer = makeClaudeAccountInfoTest({
				accountUuid: "test-account-uuid",
				organizationUuid: "test-org-uuid",
				emailAddress: "user@example.com",
				displayName: "Test User",
				organizationName: "Test Org",
				isValid: true,
			});

			const result = await Effect.runPromise(Effect.provide(program, layer));

			expect(result.accountUuid).toBe("test-account-uuid");
			expect(result.organizationUuid).toBe("test-org-uuid");
			expect(result.emailAddress).toBe("user@example.com");
			expect(result.displayName).toBe("Test User");
			expect(result.organizationName).toBe("Test Org");
			expect(result.isValid).toBe(true);
		});

		test("test factory with no overrides returns all-null defaults", async () => {
			const program = Effect.gen(function* () {
				const service = yield* ClaudeAccountInfo;
				return yield* service.detect;
			});

			const layer = makeClaudeAccountInfoTest();
			const result = await Effect.runPromise(Effect.provide(program, layer));

			expect(result.accountUuid).toBeNull();
			expect(result.organizationUuid).toBeNull();
			expect(result.emailAddress).toBeNull();
			expect(result.displayName).toBeNull();
			expect(result.organizationName).toBeNull();
			expect(result.isValid).toBe(false);
		});
	});
});
