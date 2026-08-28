import { Effect } from "effect";
import { makeSidecarLoggerLive, resolveSidecarLogPath } from "../layers/SidecarLoggerLive.js";
import { makeSidecarProgram } from "./SidecarMain.js";

/**
 * Sidecar process entry point.
 *
 * @remarks
 * Provides the main entry point for running the OTEL sidecar process.
 * This class is used internally by generated plugin entrypoint code.
 *
 * The Effect program handles all setup through layers and finalizers:
 * - Transport server lifecycle via `SidecarTransportLive`
 * - Provider initialization/shutdown via `OtelProvidersLive`
 * - File logging via `SidecarLoggerLive`
 * - Idle timeout and signal handling via `SidecarMain`
 *
 * @example
 * ```typescript
 * // Called by generated entrypoint when --sidecar flag is passed
 * Sidecar.main();
 * ```
 *
 * @public
 */
export class Sidecar {
	/**
	 * Run the sidecar process.
	 *
	 * @remarks
	 * Builds and forks the Effect sidecar program with file logging.
	 * The program runs until idle timeout or SIGTERM/SIGINT signal.
	 *
	 * @public
	 */
	static main(): void {
		const program = makeSidecarProgram().pipe(Effect.provide(makeSidecarLoggerLive(resolveSidecarLogPath())));
		Effect.runFork(program);
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
