import { appendFileSync } from "node:fs";

/**
 * Log file path for sidecar debugging.
 */
const LOG_FILE = "/tmp/claude-otel-sidecar.log";

/**
 * Static class for sidecar file logging.
 *
 * Provides simple file-based logging for debugging the sidecar process.
 * Logging is disabled by default and must be explicitly enabled.
 *
 * @example
 * ```typescript
 * // Enable logging at sidecar startup
 * SidecarLog.enable();
 *
 * // Log messages
 * SidecarLog.write("[recv] type=ping session=abc123");
 * ```
 *
 * @public
 */
export class SidecarLog {
	/**
	 * Flag to enable logging. Set by sidecar main when running as actual sidecar.
	 */
	private static enabled = false;

	/**
	 * Enable sidecar logging. Called by sidecar main.ts on startup.
	 */
	static enable(): void {
		SidecarLog.enabled = true;
	}

	/**
	 * Disable sidecar logging.
	 */
	static disable(): void {
		SidecarLog.enabled = false;
	}

	/**
	 * Check if logging is enabled.
	 */
	static isEnabled(): boolean {
		return SidecarLog.enabled;
	}

	/**
	 * Write a log message to the sidecar log file.
	 * Only logs when running as an actual sidecar process.
	 *
	 * @param message - The message to log
	 */
	static write(message: string): void {
		if (!SidecarLog.enabled) return;

		const timestamp = new Date().toISOString();
		const line = `[${timestamp}] ${message}\n`;
		try {
			appendFileSync(LOG_FILE, line);
		} catch {
			// Ignore write errors
		}
	}

	/**
	 * Get the log file path.
	 */
	static getLogFile(): string {
		return LOG_FILE;
	}
}
