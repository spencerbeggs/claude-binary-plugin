/**
 * Sidecar lifecycle management.
 *
 * Handles idle timeout, signal handlers, and graceful shutdown for the
 * OTEL sidecar process.
 *
 * @module
 */

import { DEFAULTS } from "../../constants.js";
import type { SidecarServer } from "./SidecarServer.js";

/**
 * Lifecycle state for tracking sidecar status.
 * @public
 */
export interface LifecycleState {
	/** Current idle timeout timer */
	idleTimer: ReturnType<typeof setTimeout> | null;
	/** Whether shutdown has been initiated */
	shuttingDown: boolean;
	/** Time of last activity (Unix ms) */
	lastActivity: number;
	/** Startup time (Unix ms) */
	startTime: number;
}

/**
 * Class for managing sidecar process lifecycle.
 *
 * Handles idle timeout (auto-shutdown after inactivity), signal handlers
 * (SIGTERM, SIGINT), and graceful shutdown with provider flushing.
 *
 * @example
 * ```typescript
 * const lifecycle = new SidecarLifecycle(server, 300000, () => {
 *   console.log("Shutting down...");
 *   process.exit(0);
 * });
 *
 * // Record activity to reset idle timer
 * lifecycle.recordActivity();
 *
 * // Get uptime
 * console.log(`Uptime: ${lifecycle.uptime()}ms`);
 * ```
 *
 * @public
 */
export class SidecarLifecycle {
	/**
	 * Current lifecycle state.
	 */
	readonly state: LifecycleState;

	/**
	 * The sidecar server instance.
	 */
	private server: SidecarServer;

	/**
	 * Idle timeout in milliseconds.
	 */
	private idleTimeoutMs: number;

	/**
	 * Callback when shutdown completes.
	 */
	private onShutdown?: () => void;

	/**
	 * Create a lifecycle manager for the sidecar.
	 *
	 * @param server - The sidecar server instance
	 * @param idleTimeoutMs - Idle timeout in milliseconds (default: 5 minutes)
	 * @param onShutdown - Optional callback when shutdown completes
	 */
	constructor(server: SidecarServer, idleTimeoutMs: number = DEFAULTS.IDLE_TIMEOUT_MS, onShutdown?: () => void) {
		this.server = server;
		this.idleTimeoutMs = idleTimeoutMs;
		this.onShutdown = onShutdown;

		this.state = {
			idleTimer: null,
			shuttingDown: false,
			lastActivity: Date.now(),
			startTime: Date.now(),
		};

		// Register signal handlers
		process.on("SIGTERM", this.handleSigterm.bind(this));
		process.on("SIGINT", this.handleSigint.bind(this));

		// Start the initial idle timer
		this.resetIdleTimer();
	}

	/**
	 * Record activity (resets idle timer).
	 */
	recordActivity(): void {
		this.state.lastActivity = Date.now();
		this.resetIdleTimer();
	}

	/**
	 * Initiate graceful shutdown.
	 */
	shutdown(): void {
		this.performShutdown();
	}

	/**
	 * Get uptime in milliseconds.
	 */
	uptime(): number {
		return Date.now() - this.state.startTime;
	}

	/**
	 * Perform graceful shutdown.
	 */
	private performShutdown(): void {
		if (this.state.shuttingDown) return;
		this.state.shuttingDown = true;

		// Clear idle timer
		if (this.state.idleTimer) {
			clearTimeout(this.state.idleTimer);
			this.state.idleTimer = null;
		}

		// Stop the server
		this.server.stop();

		// Call shutdown callback
		this.onShutdown?.();
	}

	/**
	 * Reset the idle timer.
	 */
	private resetIdleTimer(): void {
		if (this.state.shuttingDown) return;

		// Clear existing timer
		if (this.state.idleTimer) {
			clearTimeout(this.state.idleTimer);
		}

		// Set new timer
		this.state.idleTimer = setTimeout(() => {
			console.log(`[sidecar] Idle timeout reached (${this.idleTimeoutMs}ms), shutting down`);
			this.performShutdown();
		}, this.idleTimeoutMs);
	}

	/**
	 * Handle SIGTERM signal.
	 */
	private handleSigterm(): void {
		console.log("[sidecar] Received SIGTERM, shutting down");
		this.performShutdown();
	}

	/**
	 * Handle SIGINT signal.
	 */
	private handleSigint(): void {
		console.log("[sidecar] Received SIGINT, shutting down");
		this.performShutdown();
	}

	/**
	 * Parse idle timeout from environment variable.
	 *
	 * @param envValue - The environment variable value
	 * @param defaultMs - Default value if not set or invalid
	 * @returns The timeout in milliseconds
	 */
	static parseIdleTimeout(envValue: string | undefined, defaultMs: number = DEFAULTS.IDLE_TIMEOUT_MS): number {
		if (!envValue) return defaultMs;

		const parsed = Number.parseInt(envValue, 10);
		if (Number.isNaN(parsed) || parsed <= 0) {
			console.warn(`[sidecar] Invalid idle timeout "${envValue}", using default ${defaultMs}ms`);
			return defaultMs;
		}

		return parsed;
	}
}
