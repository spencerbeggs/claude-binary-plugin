/**
 * Event/log message handler for OTEL sidecar.
 *
 * Emits OTEL logs from EventData messages received from hooks.
 *
 * @module
 */

import { SeverityNumber } from "@opentelemetry/api-logs";
import type { EventData } from "../../protocol.js";
import { getLogger } from "../providers.js";

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
 * Handle an event message from a hook.
 *
 * Emits an OTEL log record with the provided data.
 *
 * @param data - Event data from the hook
 */
export function handleEvent(data: EventData): void {
	// Use scope from event data if provided, otherwise use default
	const scopeName = data.scope?.name ?? "default";
	const logger = data.scope ? getLogger(data.scope.name, data.scope.version) : getLogger();

	const severity = data.severity ?? "info";

	// Log to file for debugging
	const { sidecarLog } = require("../log.js") as { sidecarLog: (msg: string) => void };
	sidecarLog(`[emit:event] scope=${scopeName} name=${data.name} body=${data.body ?? data.name}`);

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
}

/**
 * Convert nanoseconds (BigInt) to milliseconds (number).
 *
 * @param ns - Nanoseconds as BigInt
 * @returns Milliseconds as number
 */
function nsToMs(ns: bigint): number {
	return Number(ns / 1_000_000n);
}
