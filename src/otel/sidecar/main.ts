/**
 * OTEL Sidecar main entry point.
 *
 * This is the entry point for the compiled sidecar binary. It:
 * 1. Validates the platform (macOS/Linux only)
 * 2. Reads configuration from environment variables
 * 3. Creates the Unix socket server
 * 4. Sets up idle timeout and signal handlers
 * 5. Processes incoming messages from hooks
 *
 * Environment variables:
 * - OTEL_SIDECAR_SOCKET: Path to the Unix socket (required)
 * - OTEL_SIDECAR_SESSION_ID: Session ID for logging (optional)
 * - OTEL_SIDECAR_IDLE_TIMEOUT_MS: Idle timeout in ms (default: 300000)
 *
 * @module
 */

import { Platform } from "../classes/Platform.js";
import { DEFAULTS, ENV_VARS } from "../constants.js";
import type { SidecarMessage, SidecarResponse } from "../protocol.js";
import { SidecarLifecycle } from "./classes/SidecarLifecycle.js";
import { SidecarLog } from "./classes/SidecarLog.js";
import { SidecarRouter } from "./classes/SidecarRouter.js";
import { SidecarServer } from "./classes/SidecarServer.js";

/**
 * Sidecar version - should match package version.
 */
const VERSION = "0.0.0";

/**
 * Handle incoming sidecar messages.
 *
 * Wraps the async handler to provide sync interface for server.
 *
 * @param message - The parsed message
 * @returns Response to send back, or undefined for fire-and-forget
 */
function handleMessage(message: SidecarMessage): SidecarResponse | undefined {
	// Log all incoming messages
	SidecarLog.write(`[recv] type=${message.type} session=${message.sessionId || "none"}`);
	if (message.type === "event") {
		SidecarLog.write(`[recv:event] name=${message.data.name} attrs=${JSON.stringify(message.data.attributes)}`);
	} else if (message.type === "span") {
		SidecarLog.write(`[recv:span] name=${message.data.name}`);
	} else if (message.type === "metric") {
		SidecarLog.write(
			`[recv:metric] name=${message.data.name} kind=${message.data.type.kind} value=${message.data.type.value}`,
		);
	}

	// Route message through async handler
	// For fire-and-forget messages (span, event, metric), the promise is ignored
	// For sync messages (ping, shutdown), we handle synchronously where possible
	const result = SidecarRouter.handleMessage(message);

	// Handle async responses for shutdown (which needs to flush)
	if (message.type === "shutdown" && !message.sessionId) {
		// Full shutdown - let the handler manage the async flush
		result.catch((err) => console.error("[sidecar] Shutdown error:", err));
		return { ok: true };
	}

	// For ping, we can return synchronously since init is sync
	if (message.type === "ping") {
		console.log(`[sidecar] Session ${message.sessionId} connected`);
		return { ok: true };
	}

	// For session disconnect
	if (message.type === "shutdown" && message.sessionId) {
		console.log(`[sidecar] Session ${message.sessionId} disconnected`);
		return { ok: true };
	}

	// Fire-and-forget for telemetry messages
	return undefined;
}

/**
 * Main entry point for the sidecar.
 * @public
 */
export function main(): void {
	// Enable file logging for sidecar process (not tests)
	SidecarLog.enable();

	// Validate platform support
	try {
		Platform.assertSupported();
	} catch (error) {
		console.error(`[sidecar] ${error instanceof Error ? error.message : "Platform not supported"}`);
		process.exit(1);
	}

	// Read configuration from environment
	const socketPath = Bun.env[ENV_VARS.OTEL_SIDECAR_SOCKET];
	const sessionId = Bun.env[ENV_VARS.OTEL_SIDECAR_SESSION_ID] ?? "unknown";
	const idleTimeoutMs = SidecarLifecycle.parseIdleTimeout(
		Bun.env[ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS],
		DEFAULTS.IDLE_TIMEOUT_MS,
	);

	if (!socketPath) {
		console.error(`[sidecar] Missing required environment variable: ${ENV_VARS.OTEL_SIDECAR_SOCKET}`);
		process.exit(1);
	}

	// Create the server
	let lifecycle: SidecarLifecycle;

	const server = new SidecarServer(socketPath, handleMessage, {
		version: VERSION,
		onActivity: () => lifecycle?.recordActivity(),
		onClose: () => {
			console.log("[sidecar] Server closed");
		},
	});

	// Set up lifecycle management
	lifecycle = new SidecarLifecycle(server, idleTimeoutMs, () => {
		console.log(`[sidecar] Uptime: ${lifecycle.uptime()}ms, sessions: ${SidecarRouter.getSessionCount()}`);
		process.exit(0);
	});

	// Log startup
	console.log(`[sidecar] Started on ${Platform.get()}`);
	console.log(`[sidecar] Socket: ${socketPath}`);
	console.log(`[sidecar] Session: ${sessionId}`);
	console.log(`[sidecar] Idle timeout: ${idleTimeoutMs}ms`);
	console.log(`[sidecar] Version: ${VERSION}`);
}

// Run if this is the main module
if (import.meta.main) {
	main();
}
