import { describe, expect, test } from "bun:test";
import { Effect, Layer, Queue } from "effect";
import { makeOtelConfigTest } from "../../src/layers/OtelConfigTest.js";
import { SidecarConnection } from "../../src/services/SidecarConnection.js";

describe("SidecarConnectionLive", () => {
	describe("disabled config", () => {
		test("emit is a no-op when disabled", async () => {
			const { layer: configLayer } = makeOtelConfigTest({ enabled: false });
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				yield* conn.emit({ type: "shutdown" });
				// Should not throw — no-op
			});

			await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
		});

		test("flush returns true when disabled", async () => {
			const { layer: configLayer } = makeOtelConfigTest({ enabled: false });
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				return yield* conn.flush(500);
			});

			const result = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
			expect(result).toBe(true);
		});

		test("preconnect is a no-op when disabled", async () => {
			const { layer: configLayer } = makeOtelConfigTest({ enabled: false });
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				yield* conn.preconnect;
			});

			await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
		});
	});

	describe("enabled config", () => {
		test("creates service successfully with enabled config", async () => {
			const { layer: configLayer } = makeOtelConfigTest({
				enabled: true,
				socketPath: "/tmp/test-otel-nonexistent.sock",
			});
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				// Service should be created even if socket doesn't exist
				expect(conn.emit).toBeDefined();
				expect(conn.preconnect).toBeDefined();
				expect(conn.flush).toBeDefined();
			});

			await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
		});

		test("emit buffers message to queue when no socket connected", async () => {
			const { layer: configLayer } = makeOtelConfigTest({
				enabled: true,
				socketPath: "/tmp/test-otel-nonexistent.sock",
			});
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				// Emit should not throw even with no socket
				yield* conn.emit({
					type: "event",
					sessionId: "test-session",
					data: {
						name: "test.event",
						timeNs: BigInt(Date.now()) * 1000000n,
					},
				});
			});

			await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
		});

		test("flush returns false when messages are queued but no socket", async () => {
			const { layer: configLayer } = makeOtelConfigTest({
				enabled: true,
				socketPath: "/tmp/test-otel-nonexistent.sock",
			});
			const { SidecarConnectionLive } = await import("../../src/layers/SidecarConnectionLive.js");

			const layer = SidecarConnectionLive.pipe(Layer.provide(configLayer));

			const program = Effect.gen(function* () {
				const conn = yield* SidecarConnection;
				// Emit a message (will be queued)
				yield* conn.emit({ type: "shutdown" });
				// Flush with short timeout — should return false since no socket
				const result = yield* conn.flush(50);
				return result;
			});

			const result = await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));
			expect(result).toBe(false);
		});
	});

	describe("queue sliding semantics", () => {
		test("queue drops oldest messages when full", async () => {
			// This tests the Queue.sliding behavior directly
			const program = Effect.gen(function* () {
				const queue = yield* Queue.sliding<string>(3);
				// Fill queue
				yield* Queue.offer(queue, "a");
				yield* Queue.offer(queue, "b");
				yield* Queue.offer(queue, "c");
				// Offer one more — should drop "a" (oldest)
				yield* Queue.offer(queue, "d");
				const size = yield* Queue.size(queue);
				expect(size).toBe(3);
				// Take all — should be b, c, d (a was dropped)
				const first = yield* Queue.take(queue);
				const second = yield* Queue.take(queue);
				const third = yield* Queue.take(queue);
				expect(first).toBe("b");
				expect(second).toBe("c");
				expect(third).toBe("d");
			});

			await Effect.runPromise(program);
		});
	});
});
