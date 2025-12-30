/**
 * Sidecar client for hook-side IPC communication.
 *
 * @remarks
 * This module provides the {@link SidecarClient} class for sending telemetry
 * to the OTEL sidecar process. It uses a fire-and-forget pattern to ensure
 * hooks are never blocked by telemetry operations.
 *
 * **Design principles:**
 * - Non-blocking: Messages are queued and sent asynchronously
 * - Resilient: Connection failures are handled silently
 * - Lazy reconnection: Reconnects on next emit, not immediately
 * - Auto-spawning: Creates sidecar if not running
 *
 * **Message types:**
 * - `ping` - Initialize sidecar with OTEL config
 * - `event` - Log structured events
 * - `metric` - Record metric values
 * - `span` - Create trace spans
 * - `shutdown` - Signal session/sidecar termination
 *
 * @example
 * ```typescript
 * const client = new SidecarClient(sessionId);
 * await client.preconnect();
 * client.emit({ type: "event", sessionId, data: { ... } });
 * await client.flush();
 * ```
 *
 * @see {@link getSidecarClient} - Get/create singleton client
 * @see docs/SCHEMA.md - OTEL telemetry schema
 * @module
 */

import type { Socket } from "bun";
import { getSessionEnvDir, parseOTELConfig } from "./config.js";
import { getSocketPathWithFallback } from "./platform.js";
import type { OTELConfig, SidecarMessage } from "./protocol.js";
import { serializeMessage } from "./protocol.js";
import { socketExists, spawnSidecar } from "./spawn.js";

/**
 * Client state for tracking connection status.
 * @public
 */
export type ClientState = "disconnected" | "connecting" | "connected";

/**
 * Socket data for client connections.
 * @public
 */
interface SocketData {
	/** Timestamp when connection was established */
	connectedAt: number;
}

/**
 * Client for communicating with the OTEL sidecar.
 *
 * The client uses a fire-and-forget pattern:
 * - Messages are sent without waiting for acknowledgment
 * - Connection failures are handled silently
 * - Reconnection is lazy (attempted on next emit)
 *
 * This ensures hooks are never blocked by telemetry operations.
 * @public
 */
export class SidecarClient {
	private sessionId: string;
	private socketPath: string;
	private socket: Socket<SocketData> | null = null;
	private state: ClientState = "disconnected";
	private connectPromise: Promise<boolean> | null = null;
	private messageQueue: SidecarMessage[] = [];
	private hasPinged = false;

	constructor(sessionId: string, socketPath?: string) {
		this.sessionId = sessionId;

		if (socketPath) {
			this.socketPath = socketPath;
		} else {
			const sessionEnvDir = getSessionEnvDir();
			this.socketPath = sessionEnvDir
				? getSocketPathWithFallback(sessionEnvDir, sessionId)
				: `/tmp/claude-otel-${sessionId}.sock`;
		}
	}

	/**
	 * Get the socket path this client uses.
	 */
	getSocketPath(): string {
		return this.socketPath;
	}

	/**
	 * Get current connection state.
	 */
	getState(): ClientState {
		return this.state;
	}

	/**
	 * Pre-connect to the sidecar socket.
	 *
	 * Call during hook initialization to ensure socket is ready for telemetry.
	 * Spawns sidecar if not running.
	 *
	 * @returns true if connected
	 */
	async preconnect(): Promise<boolean> {
		return this.connectOrSpawn();
	}

	/**
	 * Ensure the sidecar is running and connected.
	 *
	 * Called by SessionStart hooks to initialize the sidecar.
	 * If sidecar is already running, pings it to verify and update config.
	 *
	 * @param config - OTEL configuration
	 * @returns true if sidecar is available
	 */
	async ensureRunning(config: OTELConfig): Promise<boolean> {
		// Try connecting to existing sidecar
		const connected = await this.tryConnect();
		if (connected) {
			// Ping to verify and update config
			this.emit({
				type: "ping",
				sessionId: this.sessionId,
				config,
			});
			return true;
		}

		// Check if socket file exists (sidecar might be starting)
		const exists = await socketExists(this.socketPath);
		if (exists) {
			// Wait a bit and retry
			return this.waitForSocket(1000);
		}

		// Spawn new sidecar
		const result = await spawnSidecar(this.sessionId, config);
		if (!result.success) {
			return false;
		}

		// Wait for socket to become available
		const socketReady = await this.waitForSocket(2000);
		if (socketReady) {
			// Send ping to initialize providers with our config
			this.emit({
				type: "ping",
				sessionId: this.sessionId,
				config,
			});
		}
		return socketReady;
	}

	/**
	 * Send a message to the sidecar.
	 *
	 * This is non-blocking and fire-and-forget:
	 * - If not connected, queues message and attempts connection
	 * - When connected, drains the queue
	 * - If send fails, clears socket for retry on next call
	 * - Never throws or blocks
	 *
	 * @param message - Message to send
	 */
	emit(message: SidecarMessage): void {
		if (this.state !== "connected" || !this.socket) {
			// Queue message and try to connect (spawn if needed)
			this.messageQueue.push(message);
			this.connectOrSpawn().then((connected) => {
				if (connected) {
					this.drainQueue();
				}
			});
			return;
		}

		try {
			const serialized = serializeMessage(message);
			this.socket.write(serialized);
		} catch {
			// Socket error - clear and try reconnect on next emit
			this.disconnect();
		}
	}

	/**
	 * Drain queued messages after successful connection.
	 * Automatically sends a ping before the first message to initialize providers.
	 */
	private drainQueue(): void {
		if (!this.socket || this.state !== "connected") {
			return;
		}

		// Send ping before first message to initialize sidecar providers
		if (!this.hasPinged) {
			this.hasPinged = true;
			const config = parseOTELConfig();
			const pingMessage = serializeMessage({
				type: "ping",
				sessionId: this.sessionId,
				config,
			});
			try {
				this.socket.write(pingMessage);
			} catch {
				this.disconnect();
				return;
			}
		}

		while (this.messageQueue.length > 0) {
			const msg = this.messageQueue.shift();
			if (msg) {
				try {
					const serialized = serializeMessage(msg);
					this.socket.write(serialized);
				} catch {
					// Socket error - stop draining
					this.disconnect();
					break;
				}
			}
		}
	}

	/**
	 * Flush any pending messages and wait for them to be sent.
	 *
	 * Use this before process exit to ensure telemetry is delivered.
	 * Times out after the specified duration to avoid hanging.
	 *
	 * @param timeoutMs - Maximum time to wait (default: 1000ms)
	 * @returns true if all messages were sent, false if timed out
	 */
	async flush(timeoutMs = 1000): Promise<boolean> {
		// If nothing queued and already connected, we're done
		if (this.messageQueue.length === 0 && this.state === "connected") {
			return true;
		}

		// If nothing queued and not connected, nothing to flush
		if (this.messageQueue.length === 0 && this.state === "disconnected") {
			return true;
		}

		// Wait for connection and queue drain with timeout
		const start = Date.now();
		const pollInterval = 10;

		while (Date.now() - start < timeoutMs) {
			// Try to connect if not already
			if (this.state !== "connected") {
				await this.connectOrSpawn();
			}

			// If connected, drain the queue
			if (this.state === "connected" && this.socket) {
				this.drainQueue();
			}

			// Check if queue is empty
			if (this.messageQueue.length === 0) {
				return true;
			}

			await Bun.sleep(pollInterval);
		}

		// Timed out with messages still in queue
		return false;
	}

	/**
	 * Send a shutdown message and disconnect.
	 *
	 * @param sessionOnly - If true, only signals this session is ending.
	 *                      If false, requests full sidecar shutdown.
	 */
	shutdown(sessionOnly = true): void {
		if (sessionOnly) {
			this.emit({
				type: "shutdown",
				sessionId: this.sessionId,
			});
		} else {
			this.emit({
				type: "shutdown",
			});
		}

		this.disconnect();
	}

	/**
	 * Disconnect from the sidecar.
	 */
	disconnect(): void {
		if (this.socket) {
			try {
				this.socket.end();
			} catch {
				// Ignore close errors
			}
			this.socket = null;
		}
		this.state = "disconnected";
		this.connectPromise = null;
	}

	/**
	 * Try to connect to the sidecar, spawning it if needed.
	 * Used by emit() for auto-spawning behavior.
	 */
	private async connectOrSpawn(): Promise<boolean> {
		// Try to connect first
		const connected = await this.tryConnect();
		if (connected) {
			return true;
		}

		// Connection failed - spawn the sidecar
		const config = parseOTELConfig();
		const result = await spawnSidecar(this.sessionId, config);
		if (!result.success) {
			return false;
		}

		// Wait for socket to become available
		return this.waitForSocket(2000);
	}

	/**
	 * Try to connect to the sidecar.
	 * Returns cached promise if already connecting.
	 */
	private async tryConnect(): Promise<boolean> {
		if (this.state === "connected" && this.socket) {
			return true;
		}

		if (this.state === "connecting" && this.connectPromise) {
			return this.connectPromise;
		}

		this.state = "connecting";
		this.connectPromise = this.doConnect();

		const result = await this.connectPromise;
		this.connectPromise = null;

		if (result) {
			this.state = "connected";
		} else {
			this.state = "disconnected";
		}

		return result;
	}

	/**
	 * Perform the actual connection.
	 */
	private async doConnect(): Promise<boolean> {
		try {
			this.socket = await Bun.connect<SocketData>({
				unix: this.socketPath,
				data: { connectedAt: Date.now() },
				socket: {
					data: () => {
						// Ignore responses - fire-and-forget
					},
					error: () => {
						this.socket = null;
						this.state = "disconnected";
					},
					close: () => {
						this.socket = null;
						this.state = "disconnected";
					},
					open: () => {
						// Connection established
					},
				},
			});
			return true;
		} catch {
			this.socket = null;
			return false;
		}
	}

	/**
	 * Wait for socket to become available.
	 */
	private async waitForSocket(timeoutMs: number): Promise<boolean> {
		const start = Date.now();
		const pollInterval = 50;

		while (Date.now() - start < timeoutMs) {
			if (await this.tryConnect()) {
				return true;
			}
			await Bun.sleep(pollInterval);
		}

		return false;
	}
}

/**
 * Client cache - one client per session.
 */
const clients = new Map<string, SidecarClient>();

/**
 * Get or create a sidecar client for the given session.
 *
 * Clients are cached per session ID. Within the same process,
 * multiple calls with the same session ID return the same client.
 *
 * @param sessionId - The Claude Code session ID
 * @returns SidecarClient for the session
 * @public
 */
export function getSidecarClient(sessionId: string): SidecarClient {
	let client = clients.get(sessionId);
	if (!client) {
		client = new SidecarClient(sessionId);
		clients.set(sessionId, client);
	}
	return client;
}

/**
 * Remove a client from the cache.
 *
 * Called when a session ends to clean up resources.
 *
 * @param sessionId - The session ID to remove
 * @public
 */
export function removeSidecarClient(sessionId: string): void {
	const client = clients.get(sessionId);
	if (client) {
		client.disconnect();
		clients.delete(sessionId);
	}
}

/**
 * Clear all cached clients.
 *
 * Useful for testing or cleanup.
 * @public
 */
export function clearSidecarClients(): void {
	for (const client of clients.values()) {
		client.disconnect();
	}
	clients.clear();
}
