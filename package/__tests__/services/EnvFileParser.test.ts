import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { EnvFileParserLive } from "../../src/layers/EnvFileParserLive.js";
import { EnvFileParser } from "../../src/services/EnvFileParser.js";

const run = <A, E>(effect: Effect.Effect<A, E, EnvFileParser>) =>
	Effect.runPromise(Effect.provide(effect, EnvFileParserLive));

describe("EnvFileParser", () => {
	describe("parse", () => {
		test("parses KEY=value lines", async () => {
			const parser = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.parse("FOO=bar\nBAZ=qux");
				}),
			);
			expect(parser).toEqual({ FOO: "bar", BAZ: "qux" });
		});

		test("parses export KEY=value lines", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.parse('export FOO="bar"');
				}),
			);
			expect(result).toEqual({ FOO: "bar" });
		});

		test("skips comments and empty lines", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.parse("# comment\n\nFOO=bar");
				}),
			);
			expect(result).toEqual({ FOO: "bar" });
		});

		test("handles single-quoted values", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.parse("FOO='bar baz'");
				}),
			);
			expect(result).toEqual({ FOO: "bar baz" });
		});

		test("handles escaped double quotes in values", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.parse('FOO="say \\"hello\\""');
				}),
			);
			expect(result).toEqual({ FOO: 'say "hello"' });
		});
	});

	describe("format", () => {
		test("formats vars as export lines", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.format({ FOO: "bar", BAZ: "qux" });
				}),
			);
			expect(result).toBe('export FOO="bar"\nexport BAZ="qux"\n');
		});

		test("escapes special characters in values", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.format({ FOO: 'say "hello"' });
				}),
			);
			expect(result).toBe('export FOO="say \\"hello\\""\n');
		});
	});

	describe("escapeForBash", () => {
		test("escapes backslashes, quotes, backticks, dollar signs", async () => {
			const result = await run(
				Effect.gen(function* () {
					const p = yield* EnvFileParser;
					return yield* p.escapeForBash('a\\b"c`d$e');
				}),
			);
			expect(result).toBe('a\\\\b\\"c\\`d\\$e');
		});
	});
});
