/**
 * Simple file logger for sidecar debugging.
 *
 * Writes to /tmp/claude-otel-sidecar.log for troubleshooting.
 * Only logs when running as an actual sidecar process (not in tests).
 *
 * @module
 */

import { appendFileSync } from "node:fs";

/**
 * Log file path for sidecar debugging.
 */
const LOG_FILE = "/tmp/claude-otel-sidecar.log";

/**
 * Flag to enable logging. Set by sidecar main when running as actual sidecar.
 */
let loggingEnabled = false;

/**
 * Enable sidecar logging. Called by sidecar main.ts on startup.
 */
export function enableSidecarLogging(): void {
	loggingEnabled = true;
}

/**
 * Write a log message to the sidecar log file.
 * Only logs when running as an actual sidecar process.
 */
export function sidecarLog(message: string): void {
	if (!loggingEnabled) return;

	const timestamp = new Date().toISOString();
	const line = `[${timestamp}] ${message}\n`;
	try {
		appendFileSync(LOG_FILE, line);
	} catch {
		// Ignore write errors
	}
}
