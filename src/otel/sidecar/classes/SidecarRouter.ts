/**
 * Message router for OTEL sidecar.
 *
 * Routes incoming IPC messages to appropriate handlers.
 *
 * @module
 */

import type { OTELConfig, SidecarMessage, SidecarResponse } from "../../protocol.js";
import { EventHandler } from "./EventHandler.js";
import { MetricHandler } from "./MetricHandler.js";
import { SidecarLog } from "./SidecarLog.js";
import { SidecarProviders } from "./SidecarProviders.js";
import type { ResourceConfig } from "./SidecarResource.js";
import { SpanHandler } from "./SpanHandler.js";

/**
 * Static class for routing sidecar messages to handlers.
 *
 * Maintains per-session configuration and routes messages to the
 * appropriate handler based on message type.
 *
 * @example
 * ```typescript
 * // Handle incoming message
 * const response = await SidecarRouter.handleMessage(message);
 *
 * // Get session count
 * const count = SidecarRouter.getSessionCount();
 * ```
 *
 * @public
 */
export class SidecarRouter {
	/**
	 * Per-session configuration storage.
	 */
	private static sessionConfigs = new Map<string, OTELConfig>();

	/**
	 * Handle an incoming sidecar message.
	 *
	 * Routes the message to the appropriate handler based on type.
	 *
	 * @param message - The parsed message from a hook
	 * @returns Response to send back, or undefined for fire-and-forget
	 */
	static async handleMessage(message: SidecarMessage): Promise<SidecarResponse | undefined> {
		switch (message.type) {
			case "ping": {
				// Store session configuration
				SidecarRouter.sessionConfigs.set(message.sessionId, message.config);

				// Initialize or reinitialize providers if config changed
				const resourceConfig: ResourceConfig = {
					...message.config,
				};

				const wasInitialized = SidecarProviders.isInitialized();
				const didInit = await SidecarProviders.init(resourceConfig);

				if (didInit) {
					// Log initialization details
					const action = wasInitialized ? "reinit" : "init";
					SidecarLog.write(`[${action}] service_name=${resourceConfig.serviceName ?? "claude-code"}`);
					SidecarLog.write(`[${action}] endpoint=${resourceConfig.endpoint ?? "none"}`);
					SidecarLog.write(`[${action}] protocol=${resourceConfig.protocol ?? "http"}`);
					// Note: plugin.name is NOT logged here because it varies per event
					// and should not be in the resource (which is shared by all plugins)
				}

				return { ok: true, version: "0.0.0" };
			}

			case "span": {
				SpanHandler.handle(message.data);
				return undefined; // Fire-and-forget
			}

			case "event": {
				EventHandler.handle(message.data);
				return undefined; // Fire-and-forget
			}

			case "metric": {
				MetricHandler.handle(message.data);
				return undefined; // Fire-and-forget
			}

			case "shutdown": {
				if (message.sessionId) {
					// Remove session-specific config
					SidecarRouter.sessionConfigs.delete(message.sessionId);
				} else {
					// Full shutdown requested - flush and shutdown providers
					await SidecarProviders.shutdown();
					// Defer process exit to allow response to be sent
					setTimeout(() => process.exit(0), 100);
				}
				return { ok: true };
			}

			default: {
				// TypeScript exhaustiveness check
				const _exhaustive: never = message;
				return {
					ok: false,
					error: `Unknown message type: ${(_exhaustive as SidecarMessage).type}`,
				};
			}
		}
	}

	/**
	 * Get the number of active sessions.
	 */
	static getSessionCount(): number {
		return SidecarRouter.sessionConfigs.size;
	}

	/**
	 * Clear all session configurations.
	 * Primarily for testing purposes.
	 * @internal
	 */
	static clearSessions(): void {
		SidecarRouter.sessionConfigs.clear();
	}
}
