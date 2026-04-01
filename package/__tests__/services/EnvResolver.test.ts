import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { EnvResolver } from "../../src/services/EnvResolver.js";
import { makeEnvResolverTest } from "../../src/layers/EnvResolverTest.js";

describe("EnvResolver (test layer)", () => {
	test("registerSession then getSessionEnvDir returns the dir", async () => {
		const { layer } = makeEnvResolverTest();
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* EnvResolver;
				yield* resolver.registerSession("sess-1", "/project", "/envdir/sess-1");
				return yield* resolver.getSessionEnvDir("sess-1");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBe("/envdir/sess-1");
	});

	test("getProjectSessionEnvDir returns dir for registered project", async () => {
		const { layer } = makeEnvResolverTest();
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* EnvResolver;
				yield* resolver.registerSession("sess-1", "/project", "/envdir/sess-1");
				return yield* resolver.getProjectSessionEnvDir("/project");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBe("/envdir/sess-1");
	});

	test("returns undefined for unknown session", async () => {
		const { layer } = makeEnvResolverTest();
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* EnvResolver;
				return yield* resolver.getSessionEnvDir("unknown");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBeUndefined();
	});
});
