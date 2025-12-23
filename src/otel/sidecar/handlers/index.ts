/**
 * Message router for OTEL sidecar.
 *
 * Routes incoming IPC messages to appropriate handlers.
 *
 * @module
 */

import type { OTELConfig, SidecarMessage, SidecarResponse } from "../../protocol.js";
import { initProviders, isInitialized, shutdownProviders } from "../providers.js";
import type { ResourceConfig } from "../resource.js";
import { handleEvent } from "./event.js";
import { handleMetric } from "./metric.js";
import { handleSpan } from "./span.js";

/**
 * Per-session configuration storage.
 */
const sessionConfigs = new Map<string, OTELConfig>();

/**
 * Handle an incoming sidecar message.
 *
 * Routes the message to the appropriate handler based on type.
 *
 * @param message - The parsed message from a hook
 * @returns Response to send back, or undefined for fire-and-forget
 */
export async function handleMessage(message: SidecarMessage): Promise<SidecarResponse | undefined> {
	switch (message.type) {
		case "ping": {
			// Store session configuration
			sessionConfigs.set(message.sessionId, message.config);

			// Initialize or reinitialize providers if config changed
			const resourceConfig: ResourceConfig = {
				...message.config,
			};

			const wasInitialized = isInitialized();
			const didInit = await initProviders(resourceConfig);

			if (didInit) {
				// Log initialization details
				const { sidecarLog } = require("../log.js") as { sidecarLog: (msg: string) => void };
				const action = wasInitialized ? "reinit" : "init";
				sidecarLog(`[${action}] service_name=${resourceConfig.serviceName ?? "claude-code"}`);
				sidecarLog(`[${action}] endpoint=${resourceConfig.endpoint ?? "none"}`);
				sidecarLog(`[${action}] protocol=${resourceConfig.protocol ?? "http"}`);
				// Note: plugin.name is NOT logged here because it varies per event
				// and should not be in the resource (which is shared by all plugins)
			}

			return { ok: true, version: "0.0.0" };
		}

		case "span": {
			handleSpan(message.data);
			return undefined; // Fire-and-forget
		}

		case "event": {
			handleEvent(message.data);
			return undefined; // Fire-and-forget
		}

		case "metric": {
			handleMetric(message.data);
			return undefined; // Fire-and-forget
		}

		case "shutdown": {
			if (message.sessionId) {
				// Remove session-specific config
				sessionConfigs.delete(message.sessionId);
			} else {
				// Full shutdown requested - flush and shutdown providers
				await shutdownProviders();
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
export function getSessionCount(): number {
	return sessionConfigs.size;
}

/**
 * Clear all session configurations.
 * Primarily for testing purposes.
 * @internal
 */
export function clearSessions(): void {
	sessionConfigs.clear();
}
