/**
 * Plugin Logger Layer using PlatformLogger.toFile with custom NDJSON format.
 *
 * @remarks
 * Provides an Effect-native file logger for plugin processes.
 * Uses `Logger.make` for controlled NDJSON field names, piped through
 * `PlatformLogger.toFile` with `BunFileSystem` for managed file lifecycle.
 *
 * When `CLAUDE_DEBUG` is unset, returns `Logger.none` (no logging).
 * On file open failure, falls back to `Logger.none`.
 *
 * @see https://effect.website/docs/observability/logging/
 */
import path from "node:path";
import { PlatformLogger } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import type { HashMap } from "effect";
import { FiberId, Layer, LogLevel, Logger } from "effect";

/**
 * Resolve a log level from a string option or the CLAUDE_DEBUG env var.
 *
 * @param option - Explicit level string. Falls back to CLAUDE_DEBUG env var.
 * @returns Parsed LogLevel, or undefined if logging should be disabled.
 */
export function resolveLogLevel(option?: string): LogLevel.LogLevel | undefined {
	const raw = option ?? Bun.env.CLAUDE_DEBUG;
	if (!raw || raw === "0") return undefined;
	if (raw === "1" || raw === "true") return LogLevel.Debug;

	const aliases: Record<string, string> = {
		debug: "Debug",
		info: "Info",
		warn: "Warning",
		warning: "Warning",
		error: "Error",
		trace: "Trace",
		fatal: "Fatal",
		none: "None",
		all: "All",
	};

	const normalized = aliases[raw.toLowerCase()] ?? raw;
	return LogLevel.fromLiteral(normalized as LogLevel.Literal);
}

/**
 * Resolve the plugin log file path.
 *
 * Uses the session env directory when `CLAUDE_ENV_FILE` is set,
 * otherwise falls back to `/tmp`.
 *
 * @param pluginName - Plugin name used as the log file basename.
 * @returns Absolute path to `{pluginName}.log`.
 */
const resolvePluginLogPath = (pluginName: string): string => {
	const sessionDir = Bun.env.CLAUDE_ENV_FILE ? path.dirname(Bun.env.CLAUDE_ENV_FILE) : "/tmp";
	return path.join(sessionDir, `${pluginName}.log`);
};

/**
 * Flatten annotations HashMap to a plain object.
 */
const flattenAnnotations = (annotations: HashMap.HashMap<string, unknown>): Record<string, unknown> => {
	const result: Record<string, unknown> = {};
	for (const [key, value] of annotations) {
		result[key] = value;
	}
	return result;
};

/**
 * Create a plugin logger layer that writes NDJSON logs to a file.
 *
 * @param pluginName - Name of the plugin (appears in every log entry).
 * @param logLevel - Optional explicit log level. Falls back to `resolveLogLevel()`.
 * @returns A Layer that configures the Effect logger.
 *
 * @example
 * ```typescript
 * import { makePluginLoggerLive } from "./PluginLoggerLive.js";
 *
 * const program = myEffect.pipe(Effect.provide(makePluginLoggerLive("my-plugin")));
 * ```
 */
export const makePluginLoggerLive = (pluginName: string, logLevel?: LogLevel.LogLevel): Layer.Layer<never> => {
	const level = logLevel ?? resolveLogLevel();

	if (!level || level._tag === "None") {
		return Logger.replace(Logger.defaultLogger, Logger.none);
	}

	const logFilePath = resolvePluginLogPath(pluginName);

	const ndjsonLogger = Logger.make(({ message, date, logLevel: lvl, fiberId, annotations }) => {
		const flat = flattenAnnotations(annotations);
		const channel = (flat.channel as string) ?? "general";
		// Remove channel from flat so it doesn't appear twice
		delete flat.channel;

		const entry = JSON.stringify({
			timestamp: date.toISOString(),
			level: lvl._tag,
			message: typeof message === "string" ? message : String(message),
			fiber: FiberId.threadName(fiberId),
			channel,
			pluginName,
			...flat,
		});
		return entry;
	});

	const fileLoggerLayer = Logger.replaceScoped(
		Logger.defaultLogger,
		ndjsonLogger.pipe(PlatformLogger.toFile(logFilePath)),
	).pipe(
		Layer.provide(BunFileSystem.layer),
		Layer.catchAll(() => Logger.replace(Logger.defaultLogger, Logger.none)),
	);

	const stderrEnabled = Bun.env.CLAUDE_LOG_STDERR === "1";

	if (stderrEnabled) {
		const combinedLoggerLayer = Logger.replaceScoped(
			Logger.defaultLogger,
			Logger.zip(ndjsonLogger, Logger.prettyLogger()).pipe(
				Logger.map(([fileEntry]) => fileEntry),
				PlatformLogger.toFile(logFilePath),
			),
		).pipe(
			Layer.provide(BunFileSystem.layer),
			Layer.catchAll(() => Logger.replace(Logger.defaultLogger, Logger.none)),
		);

		return Layer.merge(combinedLoggerLayer, Logger.minimumLogLevel(level));
	}

	return Layer.merge(fileLoggerLayer, Logger.minimumLogLevel(level));
};
