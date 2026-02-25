import type { SidecarProtocolMessage, SidecarResponse } from "../protocol.js";
import { SidecarLifecycle } from "../sidecar/classes/SidecarLifecycle.js";
import { SidecarLog } from "../sidecar/classes/SidecarLog.js";
import { SidecarRouter } from "../sidecar/classes/SidecarRouter.js";
import { SidecarServer } from "../sidecar/classes/SidecarServer.js";
import { OtelConfig } from "./OtelConfig.js";
import { Platform } from "./Platform.js";

/**
 * Sidecar process entry point.
 *
 * @remarks
 * Provides the main entry point for running the OTEL sidecar process.
 * This class is used internally by generated plugin entrypoint code.
 *
 * @example
 * ```typescript
 * // Called by generated entrypoint when --sidecar flag is passed
 * Sidecar.main();
 * ```
 *
 * @public
 */
export class Sidecar {
	/**
	 * Sidecar version - should match package version.
	 * @internal
	 */
	private static readonly VERSION = "0.0.0";

	/**
	 * Run the sidecar process.
	 *
	 * @remarks
	 * This is the main entry point for the sidecar. It:
	 * 1. Validates the platform (macOS/Linux only)
	 * 2. Reads configuration from environment variables
	 * 3. Creates the Unix socket server
	 * 4. Sets up idle timeout and signal handlers
	 * 5. Processes incoming messages from hooks
	 *
	 * Environment variables:
	 * - `CLAUDE_CODE_OTEL_SIDECAR_SOCKET`: Path to the Unix socket (required)
	 * - `CLAUDE_CODE_OTEL_SIDECAR_SESSION_ID`: Session ID for logging (optional)
	 * - `CLAUDE_CODE_OTEL_SIDECAR_IDLE_TIMEOUT_MS`: Idle timeout in ms (default: 300000)
	 *
	 * @public
	 */
	static main(): void {
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
		const socketPath = Bun.env[OtelConfig.ENV_VARS.OTEL_SIDECAR_SOCKET];
		const sessionId = Bun.env[OtelConfig.ENV_VARS.OTEL_SIDECAR_SESSION_ID] ?? "unknown";
		const idleTimeoutMs = SidecarLifecycle.parseIdleTimeout(
			Bun.env[OtelConfig.ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS],
			OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS,
		);

		if (!socketPath) {
			console.error(`[sidecar] Missing required environment variable: ${OtelConfig.ENV_VARS.OTEL_SIDECAR_SOCKET}`);
			process.exit(1);
		}

		// Create the server
		let lifecycle: SidecarLifecycle;

		const server = new SidecarServer(socketPath, Sidecar.handleMessage, {
			version: Sidecar.VERSION,
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
		console.log(`[sidecar] Version: ${Sidecar.VERSION}`);
	}

	/**
	 * Handle incoming sidecar messages.
	 *
	 * Wraps the async handler to provide sync interface for server.
	 *
	 * @param message - The parsed message
	 * @returns Response to send back, or undefined for fire-and-forget
	 * @internal
	 */
	private static handleMessage(message: SidecarProtocolMessage): SidecarResponse | undefined {
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

	// Private constructor prevents instantiation
	private constructor() {}
}
