/**
 * File-based debug logger for Claude Code plugins.
 *
 * Writes debug logs to `{pluginName}-debug.log` in the session-env directory,
 * avoiding stderr conflicts with hook JSON output while still providing
 * visibility via `tail -f ~/.claude/session-env/{session-id}/{pluginName}-debug.log`.
 *
 * When OTEL is enabled and session context is set, logs are also emitted
 * to the OTEL sidecar for centralized observability.
 *
 * @example
 * ```ts
 * import { DebugLogger } from "claude-binary-plugin";
 *
 * const log = new DebugLogger({ prefix: "my-hook" });
 * log.info("Starting hook execution");
 * log.debug("Tool input:", JSON.stringify(input));
 * log.warn("Large file detected");
 * log.error("Failed to process", error.message);
 * ```
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Log levels supported by DebugLogger
 *
 * @public
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "diag";

/**
 * A timing entry for tracking operation durations
 *
 * @public
 */
export interface TimingEntry {
	label: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	children: TimingEntry[];
	parent?: TimingEntry;
}

/**
 * Timer handle returned by `time()` for stopping measurements
 *
 * @public
 */
export interface Timer {
	/** Stop the timer and log the duration */
	stop(): number;
	/** Get elapsed time without stopping */
	elapsed(): number;
}

/**
 * Options for configuring the DebugLogger
 *
 * @public
 */
export interface DebugLoggerOptions {
	/** Prefix for log messages (e.g., "workflow-context", "code-check") */
	prefix?: string;
	/** Plugin name for per-plugin log files (e.g., "workflow" creates "workflow-debug.log") */
	pluginName?: string;
	/** Override the log file path (default: `pluginName-debug.log` in session-env directory) */
	logPath?: string;
	/** Force enable/disable logging (default: reads from CLAUDE_DEBUG env var) */
	enabled?: boolean;
	/** Session ID for OTEL correlation (enables dual-write to sidecar when OTEL is enabled) */
	sessionId?: string;
}

/**
 * Interface for file system operations (for testing)
 *
 * @public
 */
export interface FileSystem {
	existsSync(path: string): boolean;
	mkdirSync(path: string, options?: { recursive?: boolean }): void;
	appendFileSync(path: string, data: string): void;
}

/**
 * Default file system implementation using Node's fs module.
 * Uses appendFileSync for proper append semantics across processes.
 *
 * @public
 */
export const defaultFileSystem: FileSystem = {
	existsSync,
	mkdirSync,
	appendFileSync,
};

/**
 * Get the project directory from environment variables.
 * Priority: CLAUDE_PROJECT_DIR > cwd
 *
 * @public
 */
export function getProjectDir(): string {
	return Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

/**
 * Tracks timing for operations with hierarchical support.
 * Used internally by DebugLogger for timing instrumentation.
 *
 * @public
 */
export class TimingTracker {
	private entries: TimingEntry[] = [];
	private entryMap: Map<string, TimingEntry> = new Map();
	private currentParent: TimingEntry | null = null;
	private enabled: boolean;
	private logger: DebugLogger;

	constructor(enabled: boolean, logger: DebugLogger) {
		this.enabled = enabled;
		this.logger = logger;
	}

	/**
	 * Start timing a labeled operation. Supports nesting.
	 */
	start(label: string): void {
		if (!this.enabled) return;
		const entry: TimingEntry = {
			label,
			startTime: performance.now(),
			children: [],
			parent: this.currentParent ?? undefined,
		};

		if (this.currentParent) {
			this.currentParent.children.push(entry);
		} else {
			this.entries.push(entry);
		}

		this.entryMap.set(label, entry);
		this.currentParent = entry;
	}

	/**
	 * End timing for a labeled operation.
	 * @returns Duration in milliseconds
	 */
	end(label: string): number {
		if (!this.enabled) return 0;
		const entry = this.entryMap.get(label);
		if (!entry) {
			this.logger.warn(`[timing] Warning: no timing entry for "${label}"`);
			return 0;
		}
		entry.endTime = performance.now();
		entry.duration = entry.endTime - entry.startTime;

		// Move current parent back up
		this.currentParent = entry.parent ?? null;
		return entry.duration;
	}

	/**
	 * Track a parallel operation - doesn't affect the parent stack.
	 * Use for Promise.all() operations where timing is independent.
	 */
	track(label: string, startTime: number, endTime: number): void {
		if (!this.enabled) return;
		const duration = endTime - startTime;
		this.logger.debug(`[timing] ${label}: ${duration.toFixed(2)}ms`);
	}

	/**
	 * Log a timing duration.
	 */
	log(label: string, duration: number): void {
		if (!this.enabled) return;
		this.logger.debug(`[timing] ${label}: ${duration.toFixed(2)}ms`);
	}

	/**
	 * Convenience: end timing and log the result.
	 */
	logStep(label: string): void {
		const duration = this.end(label);
		this.log(label, duration);
	}

	/**
	 * Get a formatted timing summary.
	 */
	getSummary(): string {
		if (!this.enabled || this.entries.length === 0) return "";

		const lines: string[] = ["", "=== Timing Summary ==="];
		const totalEntry = this.entries.find((e) => e.label === "total");
		const totalDuration = totalEntry?.duration || this.entries.reduce((sum, e) => sum + (e.duration || 0), 0);

		for (const entry of this.entries) {
			this.formatEntry(entry, lines, 0, totalDuration);
		}

		lines.push(`${"─".repeat(40)}`);
		lines.push(`Total: ${totalDuration.toFixed(2)}ms`);
		lines.push("");

		return lines.join("\n");
	}

	private formatEntry(entry: TimingEntry, lines: string[], depth: number, totalDuration: number): void {
		const indent = "  ".repeat(depth);
		const duration = entry.duration || 0;
		const percent = totalDuration > 0 ? ((duration / totalDuration) * 100).toFixed(1) : "0.0";
		const bar = this.makeBar(duration, totalDuration);

		lines.push(`${indent}${entry.label}: ${duration.toFixed(2)}ms (${percent}%) ${bar}`);

		if (entry.children.length > 0) {
			for (const child of entry.children) {
				this.formatEntry(child, lines, depth + 1, totalDuration);
			}
		}
	}

	private makeBar(duration: number, total: number): string {
		if (total === 0) return "";
		const percent = duration / total;
		const width = 20;
		const filled = Math.max(0, Math.min(width, Math.round(percent * width)));
		return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
	}
}

/**
 * File-based debug logger that writes to session-specific log files.
 *
 * Each plugin writes to its own file: `{pluginName}-debug.log`
 * This prevents race conditions when multiple plugins log concurrently.
 *
 * Usage:
 * ```bash
 * # In one terminal, tail the log file for a specific plugin
 * tail -f ~/.claude/session-env/{session-id}/workflow-debug.log
 *
 * # In another terminal, run Claude Code with debug enabled
 * CLAUDE_DEBUG=true claude
 * ```
 *
 * @public
 */
export class DebugLogger {
	private prefix: string;
	private pluginName: string | undefined;
	private explicitLogPath: string | undefined;
	private resolvedLogPath: string | undefined;
	private skipFileWrites = false;
	private explicitEnabled: boolean | undefined;
	private fs: FileSystem;
	private _timingTracker: TimingTracker | null = null;
	private sessionId: string | undefined;

	constructor(options: DebugLoggerOptions = {}, fs: FileSystem = defaultFileSystem) {
		this.prefix = options.prefix ?? "plugin";
		this.pluginName = options.pluginName;
		// Store explicit enabled state if provided, otherwise check env at write time
		this.explicitEnabled = options.enabled;
		this.fs = fs;
		// Store explicit log path if provided, otherwise resolve lazily at first write
		// This allows env vars (like CLAUDE_PROJECT_DIR) to be loaded before path resolution
		this.explicitLogPath = options.logPath;
		// Session ID for OTEL correlation
		this.sessionId = options.sessionId;
	}

	/**
	 * Set session context for OTEL correlation.
	 * Called automatically when logger is accessed via HookEvent.
	 *
	 * @param sessionId - The Claude Code session ID
	 */
	setSessionContext(sessionId: string): void {
		this.sessionId = sessionId;
	}

	/**
	 * Get the current session ID.
	 */
	getSessionId(): string | undefined {
		return this.sessionId;
	}

	/**
	 * Get the log path, resolving lazily if not explicitly set.
	 * This allows env vars to be loaded before we determine the path.
	 */
	private get logPath(): string {
		if (this.explicitLogPath) {
			return this.explicitLogPath;
		}
		if (!this.resolvedLogPath) {
			this.resolvedLogPath = this.getDefaultLogPath();
		}
		return this.resolvedLogPath;
	}

	/**
	 * Get the timing tracker for this logger.
	 * The tracker is lazily created and respects the logger's enabled state.
	 */
	get timing(): TimingTracker {
		if (!this._timingTracker) {
			this._timingTracker = new TimingTracker(this.isCurrentlyEnabled(), this);
		}
		return this._timingTracker;
	}

	/**
	 * Start a timer and return a handle to stop it.
	 * This is a convenience method for simple timing use cases.
	 *
	 * @example
	 * ```ts
	 * const timer = logger.time("fetchData");
	 * await fetchData();
	 * timer.stop(); // Logs: [timing] fetchData: 123.45ms
	 * ```
	 */
	time(label: string): Timer {
		const startTime = performance.now();
		const enabled = this.isCurrentlyEnabled();

		return {
			stop: (): number => {
				const duration = performance.now() - startTime;
				if (enabled) {
					this.debug(`[timing] ${label}: ${duration.toFixed(2)}ms`);
				}
				return duration;
			},
			elapsed: (): number => {
				return performance.now() - startTime;
			},
		};
	}

	/**
	 * Time an async function and log the result.
	 *
	 * @example
	 * ```ts
	 * const result = await logger.timeAsync("fetchData", async () => {
	 *   return await fetchData();
	 * });
	 * // Logs: [timing] fetchData: 123.45ms
	 * ```
	 */
	async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
		const timer = this.time(label);
		try {
			return await fn();
		} finally {
			timer.stop();
		}
	}

	/**
	 * Track parallel operations for timing.
	 * Use this wrapper for Promise.all() operations.
	 *
	 * @example
	 * ```ts
	 * const [a, b] = await Promise.all([
	 *   logger.trackParallel("fetchA", fetchA()),
	 *   logger.trackParallel("fetchB", fetchB()),
	 * ]);
	 * ```
	 */
	async trackParallel<T>(label: string, promise: Promise<T>): Promise<T> {
		const start = performance.now();
		try {
			return await promise;
		} finally {
			const end = performance.now();
			this.timing.track(label, start, end);
		}
	}

	/**
	 * Check if logging is currently enabled.
	 * Checks env var at call time to allow tests to disable logging dynamically.
	 *
	 * Checks in order:
	 * 1. explicitEnabled (constructor option)
	 * 2. CLAUDE_DEBUG env var ("1" or "true")
	 */
	private isCurrentlyEnabled(): boolean {
		// If explicitly set, use that value
		if (this.explicitEnabled !== undefined) {
			return this.explicitEnabled;
		}
		// Check CLAUDE_DEBUG (supports both "1" and "true")
		const debug = Bun.env.CLAUDE_DEBUG;
		return debug === "1" || debug === "true";
	}

	/**
	 * Get the log filename based on plugin name.
	 * Returns empty string if pluginName is not set (skips file writes to prevent races).
	 */
	private getLogFilename(): string {
		return this.pluginName ? `${this.pluginName}-debug.log` : "";
	}

	/**
	 * Get the default log path based on environment.
	 *
	 * Requirements:
	 * 1. pluginName must be set (no shared log file to prevent races)
	 * 2. Session env file must be available via one of:
	 *    - CLAUDE_ENV_FILE (set during SessionStart by Claude Code)
	 *    - `PREFIX`_SESSION_ENV_FILE (set after sourcing hook files)
	 *
	 * When either is missing, file writes are skipped.
	 */
	private getDefaultLogPath(): string {
		const filename = this.getLogFilename();

		// No pluginName means no unique filename - skip file writes to prevent races
		if (!filename) {
			this.skipFileWrites = true;
			return "";
		}

		// Check CLAUDE_ENV_FILE first (set during SessionStart by Claude Code)
		if (Bun.env.CLAUDE_ENV_FILE) {
			return join(dirname(Bun.env.CLAUDE_ENV_FILE), filename);
		}

		// Look for any *_PLUGIN_ENV_FILE env var (set after sourcing hook files)
		// e.g., SAVVY_WORKFLOW_PLUGIN_ENV_FILE, SAVVY_BUN_PLUGIN_BUILDER_PLUGIN_ENV_FILE
		for (const [key, value] of Object.entries(Bun.env)) {
			if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
				return join(dirname(value), filename);
			}
		}

		// No session env available - skip file writes
		// This happens during tests or when hooks run without proper session context
		this.skipFileWrites = true;
		return "";
	}

	/**
	 * Ensure the log directory exists
	 */
	private ensureDirectory(): void {
		const dir = dirname(this.logPath);
		if (!this.fs.existsSync(dir)) {
			this.fs.mkdirSync(dir, { recursive: true });
		}
	}

	/**
	 * Format and write a log entry.
	 * @param level - Log level (diag level always writes, others check isEnabled)
	 * @param message - Log message
	 * @param args - Additional arguments to append
	 */
	private write(level: LogLevel, message: string, ...args: unknown[]): void {
		// "diag" level always writes, other levels check isEnabled
		if (level !== "diag" && !this.isCurrentlyEnabled()) return;

		const timestamp = new Date().toISOString();
		const levelStr = level.toUpperCase().padEnd(5);
		const formattedArgs = args.length > 0 ? ` ${args.map((a) => String(a)).join(" ")}` : "";
		const logLine = `[${timestamp}] [${levelStr}] [${this.prefix}] ${message}${formattedArgs}\n`;

		// Write to file only if we have a valid session-env directory
		// Accessing logPath triggers lazy resolution which may set skipFileWrites
		const path = this.logPath;
		if (!this.skipFileWrites && path) {
			this.ensureDirectory();
			this.fs.appendFileSync(path, logLine);
		}

		// Note: Per-log-line OTEL emission was removed as too noisy.
		// Use instrumentHook() or emitHookExecution() for structured hook telemetry.
	}

	/**
	 * Log a debug message (lowest priority, most verbose)
	 */
	debug(message: string, ...args: unknown[]): void {
		this.write("debug", message, ...args);
	}

	/**
	 * Log an info message (general information).
	 * Multi-line messages are written as separate log entries for readability.
	 */
	info(message: string, ...args: unknown[]): void {
		// Combine message with args first
		const formattedArgs = args.length > 0 ? ` ${args.map((a) => String(a)).join(" ")}` : "";
		const fullMessage = `${message}${formattedArgs}`;

		// Check for multi-line content
		if (fullMessage.includes("\n")) {
			const lines = fullMessage.split("\n");
			for (const line of lines) {
				this.write("info", line);
			}
		} else {
			this.write("info", message, ...args);
		}
	}

	/**
	 * Log a warning message (potential issues)
	 */
	warn(message: string, ...args: unknown[]): void {
		this.write("warn", message, ...args);
	}

	/**
	 * Log an error message (errors that occurred)
	 */
	error(message: string, ...args: unknown[]): void {
		this.write("error", message, ...args);
	}

	/**
	 * Log a diagnostic message (ALWAYS writes, regardless of debug mode).
	 * Use sparingly for troubleshooting hook execution issues.
	 *
	 * @example
	 * ```ts
	 * // At the very start of a hook to confirm it's running
	 * logger.diag(`Hook started - CLAUDE_PROJECT_DIR=${Bun.env.CLAUDE_PROJECT_DIR}`);
	 * logger.diag(`SAVVY_WORKFLOW_DEBUG=${Bun.env.SAVVY_WORKFLOW_DEBUG}`);
	 * logger.diag(`CLAUDE_DEBUG=${Bun.env.CLAUDE_DEBUG}`);
	 * logger.diag(`Logger enabled: ${logger.isEnabled()}`);
	 * ```
	 */
	diag(message: string, ...args: unknown[]): void {
		this.write("diag", message, ...args);
	}

	/**
	 * Check if logging is enabled
	 */
	isEnabled(): boolean {
		return this.isCurrentlyEnabled();
	}

	/**
	 * Get the current log file path
	 */
	getLogPath(): string {
		return this.logPath;
	}

	/**
	 * Get a formatted timing summary from the timing tracker.
	 * Convenience method for `logger.timing.getSummary()`.
	 */
	getTimingSummary(): string {
		return this.timing.getSummary();
	}

	/**
	 * Create a child logger with a different prefix.
	 * The child inherits the parent's pluginName, logPath, enabled state, and session context.
	 */
	child(prefix: string): DebugLogger {
		return new DebugLogger(
			{
				prefix: `${this.prefix}:${prefix}`,
				pluginName: this.pluginName,
				logPath: this.logPath,
				enabled: this.explicitEnabled,
				sessionId: this.sessionId,
			},
			this.fs,
		);
	}

	/**
	 * Create a debug logger with the given prefix.
	 *
	 * @example
	 * ```ts
	 * const log = DebugLogger.create("workflow-context", { pluginName: "workflow" });
	 * log.info("Session started");
	 * ```
	 */
	static create(prefix: string, options?: Omit<DebugLoggerOptions, "prefix">): DebugLogger {
		return new DebugLogger({ ...options, prefix, pluginName: options?.pluginName });
	}
}
