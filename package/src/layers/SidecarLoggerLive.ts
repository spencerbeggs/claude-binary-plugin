/**
 * Sidecar Logger Layer using PlatformLogger.toFile.
 *
 * @remarks
 * Provides an Effect-native file logger for the sidecar process.
 * Uses `PlatformLogger.toFile` with `BunFileSystem` for managed file lifecycle.
 * Replaces the imperative `SidecarLog.ts` with a declarative Effect layer.
 *
 * @see https://effect.website/docs/observability/logging/
 */
import path from "node:path";
import { PlatformLogger } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Layer, Logger } from "effect";

/**
 * Create a sidecar logger layer that writes structured JSON logs to a file.
 *
 * @param logPath - Absolute path to the log file.
 * @returns A scoped Layer that replaces the default logger with a file logger.
 *
 * @example
 * ```typescript
 * import { makeSidecarLoggerLive, resolveSidecarLogPath } from "./SidecarLoggerLive.js";
 *
 * const logPath = resolveSidecarLogPath();
 * const program = myEffect.pipe(Effect.provide(makeSidecarLoggerLive(logPath)));
 * ```
 */
export const makeSidecarLoggerLive = (logPath: string): Layer.Layer<never> =>
	Logger.replaceScoped(
		Logger.defaultLogger,
		Logger.structuredLogger.pipe(
			Logger.map((entry) => JSON.stringify(entry)),
			PlatformLogger.toFile(logPath),
		),
	).pipe(Layer.provide(BunFileSystem.layer), Layer.orDie);

/**
 * Resolve the sidecar log file path.
 *
 * Uses the session env directory when `CLAUDE_ENV_FILE` is set,
 * otherwise falls back to `/tmp`.
 *
 * @returns Absolute path to `claude-otel-sidecar.log`.
 *
 * @example
 * ```typescript
 * const logPath = resolveSidecarLogPath();
 * // With CLAUDE_ENV_FILE=/sessions/abc/hook.sh → /sessions/abc/claude-otel-sidecar.log
 * // Without CLAUDE_ENV_FILE → /tmp/claude-otel-sidecar.log
 * ```
 */
export const resolveSidecarLogPath = (): string => {
	const sessionDir = Bun.env.CLAUDE_ENV_FILE ? path.dirname(Bun.env.CLAUDE_ENV_FILE) : "/tmp";
	return path.join(sessionDir, "claude-otel-sidecar.log");
};
