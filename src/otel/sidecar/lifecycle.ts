/**
 * Sidecar lifecycle management.
 *
 * Handles idle timeout, signal handlers, and graceful shutdown for the
 * OTEL sidecar process.
 *
 * @module
 */

import { DEFAULTS } from "../constants.js";
import type { SidecarServer } from "./server.js";

/**
 * Lifecycle manager state.
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
 * Lifecycle manager for sidecar process.
 */
export interface LifecycleManager {
	/** Current state */
	readonly state: LifecycleState;
	/** Record activity (resets idle timer) */
	recordActivity(): void;
	/** Initiate graceful shutdown */
	shutdown(): void;
	/** Get uptime in milliseconds */
	uptime(): number;
}

/**
 * Create a lifecycle manager for the sidecar.
 *
 * @param server - The sidecar server instance
 * @param idleTimeoutMs - Idle timeout in milliseconds (default: 5 minutes)
 * @param onShutdown - Optional callback when shutdown completes
 * @returns The lifecycle manager
 */
export function createLifecycleManager(
	server: SidecarServer,
	idleTimeoutMs: number = DEFAULTS.IDLE_TIMEOUT_MS,
	onShutdown?: () => void,
): LifecycleManager {
	const state: LifecycleState = {
		idleTimer: null,
		shuttingDown: false,
		lastActivity: Date.now(),
		startTime: Date.now(),
	};

	/**
	 * Perform graceful shutdown.
	 */
	function performShutdown(): void {
		if (state.shuttingDown) return;
		state.shuttingDown = true;

		// Clear idle timer
		if (state.idleTimer) {
			clearTimeout(state.idleTimer);
			state.idleTimer = null;
		}

		// Stop the server
		server.stop();

		// Call shutdown callback
		onShutdown?.();
	}

	/**
	 * Reset the idle timer.
	 */
	function resetIdleTimer(): void {
		if (state.shuttingDown) return;

		// Clear existing timer
		if (state.idleTimer) {
			clearTimeout(state.idleTimer);
		}

		// Set new timer
		state.idleTimer = setTimeout(() => {
			console.log(`[sidecar] Idle timeout reached (${idleTimeoutMs}ms), shutting down`);
			performShutdown();
		}, idleTimeoutMs);
	}

	/**
	 * Handle SIGTERM signal.
	 */
	function handleSigterm(): void {
		console.log("[sidecar] Received SIGTERM, shutting down");
		performShutdown();
	}

	/**
	 * Handle SIGINT signal.
	 */
	function handleSigint(): void {
		console.log("[sidecar] Received SIGINT, shutting down");
		performShutdown();
	}

	// Register signal handlers
	process.on("SIGTERM", handleSigterm);
	process.on("SIGINT", handleSigint);

	// Start the initial idle timer
	resetIdleTimer();

	return {
		state,

		recordActivity(): void {
			state.lastActivity = Date.now();
			resetIdleTimer();
		},

		shutdown(): void {
			performShutdown();
		},

		uptime(): number {
			return Date.now() - state.startTime;
		},
	};
}

/**
 * Parse idle timeout from environment variable.
 *
 * @param envValue - The environment variable value
 * @param defaultMs - Default value if not set or invalid
 * @returns The timeout in milliseconds
 */
export function parseIdleTimeout(envValue: string | undefined, defaultMs: number = DEFAULTS.IDLE_TIMEOUT_MS): number {
	if (!envValue) return defaultMs;

	const parsed = Number.parseInt(envValue, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		console.warn(`[sidecar] Invalid idle timeout "${envValue}", using default ${defaultMs}ms`);
		return defaultMs;
	}

	return parsed;
}
