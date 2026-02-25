import { SidecarClient } from "./SidecarClient.js";

/**
 * Sidecar client pool.
 *
 * @remarks
 * Caches SidecarClient instances by session ID. Within the same process,
 * multiple calls with the same session ID return the same client.
 *
 * @example
 * ```typescript
 * // Get/create a client
 * const client = SidecarClientPool.get(sessionId);
 *
 * // Emit telemetry
 * client.emit({ type: "event", sessionId, data: { ... } });
 *
 * // Remove when session ends
 * SidecarClientPool.remove(sessionId);
 *
 * // Clear all (for testing)
 * SidecarClientPool.clearAll();
 * ```
 *
 * @public
 */
export class SidecarClientPool {
	/**
	 * Client cache - one client per session.
	 * @internal
	 */
	private static readonly clients = new Map<string, SidecarClient>();

	/**
	 * Get or create a sidecar client for the given session.
	 *
	 * @remarks
	 * Clients are cached per session ID. Within the same process,
	 * multiple calls with the same session ID return the same client.
	 *
	 * @param sessionId - The Claude Code session ID
	 * @returns SidecarClient for the session
	 *
	 * @example
	 * ```typescript
	 * const client = SidecarClientPool.get(sessionId);
	 * await client.preconnect();
	 * client.emit(message);
	 * ```
	 *
	 * @public
	 */
	static get(sessionId: string): SidecarClient {
		let client = SidecarClientPool.clients.get(sessionId);
		if (!client) {
			client = new SidecarClient(sessionId);
			SidecarClientPool.clients.set(sessionId, client);
		}
		return client;
	}

	/**
	 * Remove a client from the cache.
	 *
	 * @remarks
	 * Called when a session ends to clean up resources.
	 * Disconnects the client before removing it.
	 *
	 * @param sessionId - The session ID to remove
	 *
	 * @example
	 * ```typescript
	 * // Clean up when session ends
	 * SidecarClientPool.remove(sessionId);
	 * ```
	 *
	 * @public
	 */
	static remove(sessionId: string): void {
		const client = SidecarClientPool.clients.get(sessionId);
		if (client) {
			client.disconnect();
			SidecarClientPool.clients.delete(sessionId);
		}
	}

	/**
	 * Clear all cached clients.
	 *
	 * @remarks
	 * Disconnects all clients and clears the cache.
	 * Useful for testing or process cleanup.
	 *
	 * @example
	 * ```typescript
	 * // In test teardown
	 * afterAll(() => {
	 *   SidecarClientPool.clearAll();
	 * });
	 * ```
	 *
	 * @public
	 */
	static clearAll(): void {
		for (const client of SidecarClientPool.clients.values()) {
			client.disconnect();
		}
		SidecarClientPool.clients.clear();
	}

	/**
	 * Get the number of cached clients.
	 *
	 * @remarks
	 * Useful for testing and debugging.
	 *
	 * @returns Number of cached clients
	 *
	 * @public
	 */
	static get size(): number {
		return SidecarClientPool.clients.size;
	}

	/**
	 * Check if a client exists for a session.
	 *
	 * @param sessionId - The session ID to check
	 * @returns `true` if a client exists for this session
	 *
	 * @public
	 */
	static has(sessionId: string): boolean {
		return SidecarClientPool.clients.has(sessionId);
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
