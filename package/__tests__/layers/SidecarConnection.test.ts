import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeSidecarConnectionTest } from "../../src/layers/SidecarConnectionTest.js";
import { SidecarConnection } from "../../src/services/SidecarConnection.js";

describe("SidecarConnection", () => {
	test("service tag is defined", () => {
		expect(SidecarConnection).toBeDefined();
	});
});

describe("makeSidecarConnectionTest", () => {
	test("captures emitted messages", async () => {
		const { messages, layer } = makeSidecarConnectionTest();
		const program = Effect.flatMap(SidecarConnection, (conn) => conn.emit({ type: "shutdown" }));
		await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(messages).toHaveLength(1);
		expect(messages[0]!.type).toBe("shutdown");
	});

	test("preconnect is a no-op", async () => {
		const { layer } = makeSidecarConnectionTest();
		const program = Effect.flatMap(SidecarConnection, (conn) => conn.preconnect);
		await Effect.runPromise(program.pipe(Effect.provide(layer)));
		// No error thrown = success
	});

	test("flush returns true", async () => {
		const { layer } = makeSidecarConnectionTest();
		const program = Effect.flatMap(SidecarConnection, (conn) => conn.flush(500));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe(true);
	});
});
