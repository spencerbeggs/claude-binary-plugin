import type { Logger } from "@opentelemetry/api-logs";
import { SeverityNumber } from "@opentelemetry/api-logs";
import type { EventData } from "./protocol.js";

/**
 * Map from protocol severity to OTEL SeverityNumber.
 */
const SEVERITY_MAP: Record<NonNullable<EventData["severity"]>, SeverityNumber> = {
	trace: SeverityNumber.TRACE,
	debug: SeverityNumber.DEBUG,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL,
};

/**
 * Map from severity to text representation.
 */
const SEVERITY_TEXT_MAP: Record<NonNullable<EventData["severity"]>, string> = {
	trace: "TRACE",
	debug: "DEBUG",
	info: "INFO",
	warn: "WARN",
	error: "ERROR",
	fatal: "FATAL",
};

/**
 * Convert nanoseconds (BigInt) to milliseconds (number).
 */
const nsToMs = (ns: bigint): number => Number(ns / 1_000_000n);

/**
 * Handle an event message from a hook.
 *
 * Converts EventData from the IPC protocol into an OTEL log record
 * and emits it through the provided logger.
 *
 * @param data - Event data from the hook
 * @param logger - OTEL Logger instance to emit to
 *
 * @example
 * ```typescript
 * import { logs } from "@opentelemetry/api-logs";
 * EventHandler.handle({
 *   name: "hook.execution",
 *   timeNs: BigInt(Date.now() * 1_000_000),
 *   severity: "info",
 *   body: "Hook executed successfully",
 *   attributes: { "hook.name": "pre-bash" },
 * }, logs.getLogger("default"));
 * ```
 *
 * @public
 */
export const EventHandler = {
	handle(data: EventData, logger: Logger): void {
		const severity = data.severity ?? "info";

		logger.emit({
			severityNumber: SEVERITY_MAP[severity],
			severityText: SEVERITY_TEXT_MAP[severity],
			body: data.body ?? data.name,
			attributes: {
				"event.name": data.name,
				...data.attributes,
			},
			timestamp: nsToMs(data.timeNs),
		});
	},
};
