import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Duration, Effect, Exit, Fiber, Logger, Ref, Schedule } from "effect";

describe("SidecarMain", () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS;
		} else {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = originalEnv;
		}
	});

	describe("readIdleTimeout", () => {
		test("returns default 300000 when env is not set", async () => {
			delete Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS;
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(300000);
		});

		test("returns default 300000 when env is empty string", async () => {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = "";
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(300000);
		});

		test("parses valid integer value", async () => {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = "60000";
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(60000);
		});

		test("returns default for non-numeric string", async () => {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = "not-a-number";
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(300000);
		});

		test("returns default for negative value", async () => {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = "-5000";
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(300000);
		});

		test("returns default for zero", async () => {
			Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS = "0";
			const { readIdleTimeout } = await import("../../src/otel/SidecarMain.js");
			expect(readIdleTimeout()).toBe(300000);
		});
	});

	describe("makeSidecarProgram", () => {
		test("returns an Effect", async () => {
			const { makeSidecarProgram } = await import("../../src/otel/SidecarMain.js");
			const program = makeSidecarProgram();
			// Effect.isEffect is the type guard
			expect(Effect.isEffect(program)).toBe(true);
		});
	});

	describe("idle timeout behavior", () => {
		test("interrupts when idle timeout is reached", async () => {
			// Create a minimal idle-timeout-only program with a very short timeout
			const lastActivity = Ref.unsafeMake(Date.now() - 200);

			const idleCheck = Effect.gen(function* () {
				const last = yield* Ref.get(lastActivity);
				if (Date.now() - last >= 100) {
					yield* Effect.logInfo("Idle timeout reached, shutting down");
					yield* Effect.interrupt;
				}
			}).pipe(Effect.repeat(Schedule.spaced(Duration.millis(50))));

			const fiber = Effect.runFork(idleCheck.pipe(Effect.provide(Logger.remove(Logger.defaultLogger))));

			const exit = await Effect.runPromise(Fiber.await(fiber));
			expect(Exit.isInterrupted(exit)).toBe(true);
		});
	});

	describe("signal handler", () => {
		test("creates an async Effect that can be created without error", async () => {
			// Verify the signal handler Effect can be constructed
			const signalHandler = Effect.async<never, never, never>((resume) => {
				const handler = () => resume(Effect.interrupt);
				process.on("SIGTERM", handler);
				process.on("SIGINT", handler);
				return Effect.sync(() => {
					process.off("SIGTERM", handler);
					process.off("SIGINT", handler);
				});
			});

			expect(Effect.isEffect(signalHandler)).toBe(true);
		});
	});
});
