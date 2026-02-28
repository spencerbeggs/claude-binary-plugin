import { SeverityNumber } from "@opentelemetry/api-logs";
import type { EventData } from "../../protocol.js";
import { SidecarLog } from "./SidecarLog.js";
import { SidecarProviders } from "./SidecarProviders.js";

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
 * Static class for handling event messages from hooks.
 *
 * Converts EventData from the IPC protocol into OTEL log records
 * and emits them through the logger provider.
 *
 * @example
 * ```typescript
 * EventHandler.handle({
 *   name: "hook.execution",
 *   timeNs: BigInt(Date.now() * 1_000_000),
 *   severity: "info",
 *   body: "Hook executed successfully",
 *   attributes: { "hook.name": "pre-bash" },
 * });
 * ```
 *
 * @public
 */
export class EventHandler {
	// Private constructor prevents instantiation
	private constructor() {}

	/**
	 * Handle an event message from a hook.
	 *
	 * Emits an OTEL log record with the provided data.
	 *
	 * @param data - Event data from the hook
	 */
	static handle(data: EventData): void {
		// Use scope from event data if provided, otherwise use default
		const scopeName = data.scope?.name ?? "default";
		const logger = data.scope
			? SidecarProviders.getLogger(data.scope.name, data.scope.version)
			: SidecarProviders.getLogger();

		const severity = data.severity ?? "info";

		// Log to file for debugging
		SidecarLog.write(`[emit:event] scope=${scopeName} name=${data.name} body=${data.body ?? data.name}`);

		logger.emit({
			severityNumber: SEVERITY_MAP[severity],
			severityText: SEVERITY_TEXT_MAP[severity],
			body: data.body ?? data.name,
			attributes: {
				"event.name": data.name,
				...data.attributes,
			},
			timestamp: EventHandler.nsToMs(data.timeNs),
		});
	}

	/**
	 * Convert nanoseconds (BigInt) to milliseconds (number).
	 *
	 * @param ns - Nanoseconds as BigInt
	 * @returns Milliseconds as number
	 */
	private static nsToMs(ns: bigint): number {
		return Number(ns / 1_000_000n);
	}
}
