/**
 * Effect-based sidecar entry point program.
 *
 * @remarks
 * Provides the main Effect program for the sidecar process. The program:
 * 1. Reads idle timeout from environment (default 300000ms = 5 minutes)
 * 2. Creates a shared `Ref<number>` for last-activity tracking
 * 3. Builds the transport layer with `makeSidecarTransportLive(lastActivity)`
 * 4. Runs an idle timeout checker on a schedule
 * 5. Handles SIGTERM/SIGINT via fiber interruption
 *
 * When either the idle checker or signal handler triggers interruption,
 * the scope closes and all layer finalizers run (transport shutdown,
 * provider flush+shutdown, log file close).
 */
import { BunFileSystem } from "@effect/platform-bun";
import { Duration, Effect, Layer, Ref, Schedule } from "effect";
import { GitInfoLive } from "../layers/GitInfoLive.js";
import { MessageRouterLive } from "../layers/MessageRouterLive.js";
import { OtelConfigLive } from "../layers/OtelConfigLive.js";
import { OtelProvidersLive } from "../layers/OtelProvidersLive.js";
import { PlatformInfoLive } from "../layers/PlatformInfoLive.js";
import { ShellExecutorLive } from "../layers/ShellExecutorLive.js";
import { makeSidecarTransportLive } from "../layers/SidecarTransportLive.js";

/**
 * Default idle timeout in milliseconds (5 minutes).
 */
const DEFAULT_IDLE_TIMEOUT_MS = 300000;

/**
 * Read the idle timeout from the `CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS` env var.
 *
 * @returns The timeout in milliseconds, or 300000 if not set / invalid.
 *
 * @public
 */
export const readIdleTimeout = (): number => {
	const envVal = Bun.env.CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS;
	if (!envVal) return DEFAULT_IDLE_TIMEOUT_MS;
	const parsed = Number.parseInt(envVal, 10);
	return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_IDLE_TIMEOUT_MS : parsed;
};

/**
 * Create the main sidecar Effect program.
 *
 * @remarks
 * The returned Effect builds the full sidecar layer stack (transport + providers),
 * then races an idle-timeout checker against a signal handler. Whichever fires
 * first interrupts the fiber, causing scope unwinding and orderly shutdown.
 *
 * The transport server's lifecycle is managed by its layer scope — it runs as
 * long as the scope is open.
 *
 * @returns An Effect that runs the sidecar until idle timeout or signal.
 *
 * @public
 */
export const makeSidecarProgram = () =>
	Effect.gen(function* () {
		const idleTimeoutMs = readIdleTimeout();
		const lastActivity = yield* Ref.make(Date.now());

		// Signal handler — bridges SIGTERM/SIGINT to fiber interruption
		const signalHandler = Effect.async<never, never, never>((resume) => {
			const handler = () => resume(Effect.interrupt);
			process.on("SIGTERM", handler);
			process.on("SIGINT", handler);
			return Effect.sync(() => {
				process.off("SIGTERM", handler);
				process.off("SIGINT", handler);
			});
		});

		// Idle timeout checker — polls every 5 seconds
		const idleCheck = Effect.repeat(
			Effect.gen(function* () {
				const last = yield* Ref.get(lastActivity);
				if (Date.now() - last >= idleTimeoutMs) {
					yield* Effect.logInfo("Idle timeout reached, shutting down");
					yield* Effect.interrupt;
				}
			}),
			Schedule.spaced(Duration.seconds(5)),
		);

		// Compose supporting layers with their own dependencies
		const PlatformInfoWithDeps = PlatformInfoLive.pipe(
			Layer.provide(Layer.merge(ShellExecutorLive, BunFileSystem.layer)),
		);
		const OtelConfigWithDeps = OtelConfigLive.pipe(Layer.provide(PlatformInfoWithDeps));

		// Build the sidecar layer stack
		const SidecarLive = makeSidecarTransportLive(lastActivity).pipe(
			Layer.provide(OtelProvidersLive),
			Layer.provide(MessageRouterLive),
			Layer.provide(GitInfoLive),
			Layer.provide(ShellExecutorLive),
			Layer.provide(OtelConfigWithDeps),
			Layer.provide(BunFileSystem.layer),
		);

		// Race idle checker against signal handler
		// Either one interrupting triggers scope unwinding
		yield* Effect.race(idleCheck, signalHandler).pipe(Effect.provide(SidecarLive));
	});
