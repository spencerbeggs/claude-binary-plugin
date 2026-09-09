/**
 * In-memory test logger for plugin testing.
 *
 * @remarks
 * Captures log entries in an array for assertion in tests.
 * Annotations are flattened to top-level fields on each entry.
 *
 * @example
 * ```typescript
 * import { makePluginLoggerTest } from "./PluginLoggerTest.js";
 *
 * const { layer, getLogs, clear } = makePluginLoggerTest();
 * // Provide `layer` to your Effect program, then inspect `getLogs()`.
 * ```
 */
import { Logger } from "effect";

/**
 * Create an in-memory test logger that captures log entries for assertions.
 *
 * @returns An object with `layer`, `getLogs()`, and `clear()`.
 */
export const makePluginLoggerTest = () => {
	const logs: Array<{ level: string; message: string; [key: string]: unknown }> = [];

	const logger = Logger.make(({ message, date, logLevel, annotations }) => {
		logs.push({
			timestamp: date.toISOString(),
			level: logLevel._tag,
			message: typeof message === "string" ? message : String(message),
			...Object.fromEntries(annotations),
		});
	});

	const layer = Logger.replace(Logger.defaultLogger, logger);

	const getLogs = () => [...logs];

	const clear = () => {
		logs.length = 0;
	};

	return { layer, getLogs, clear };
};
