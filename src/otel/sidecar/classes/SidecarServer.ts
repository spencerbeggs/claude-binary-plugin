import type { Socket, SocketHandler } from "bun";
import { SidecarMessage } from "../../classes/SidecarMessage.js";
import type { SidecarProtocolMessage, SidecarResponse } from "../../protocol.js";

/**
 * Message handler function type.
 * Returns a response or undefined (for fire-and-forget messages).
 * @public
 */
export type MessageHandler = (message: SidecarProtocolMessage) => SidecarResponse | undefined;

/**
 * Per-client socket data.
 */
interface ClientData {
	/** Partial message buffer for incomplete reads */
	buffer: string;
}

/**
 * Server configuration options.
 * @public
 */
export interface SidecarServerOptions {
	/** Called when activity occurs (for idle timeout) */
	onActivity?: () => void;
	/** Called when server closes */
	onClose?: () => void;
	/** Sidecar version string */
	version?: string;
}

/**
 * Unix socket server for the OTEL sidecar.
 *
 * Listens on a Unix domain socket for incoming IPC messages from hooks.
 * Messages are in JSON Lines format (newline-delimited JSON).
 *
 * @example
 * ```typescript
 * const server = new SidecarServer("/tmp/otel.sock", (message) => {
 *   console.log("Received:", message);
 *   return { ok: true };
 * }, {
 *   version: "1.0.0",
 *   onActivity: () => lifecycle.recordActivity(),
 * });
 *
 * // Later, stop the server
 * server.stop();
 * ```
 *
 * @public
 */
export class SidecarServer {
	/**
	 * Unix socket path.
	 */
	readonly socketPath: string;

	/**
	 * Active client connections.
	 */
	private clients = new Set<Socket<ClientData>>();

	/**
	 * Message handler.
	 */
	private onMessage: MessageHandler;

	/**
	 * Activity callback.
	 */
	private onActivity?: () => void;

	/**
	 * Close callback.
	 */
	private onClose?: () => void;

	/**
	 * Sidecar version string.
	 */
	private version: string;

	/**
	 * The underlying Bun server.
	 */
	private server: ReturnType<typeof Bun.listen>;

	/**
	 * Create a Unix socket server for the sidecar.
	 *
	 * @param socketPath - Path to the Unix socket file
	 * @param onMessage - Handler for incoming messages
	 * @param options - Additional server options
	 */
	constructor(socketPath: string, onMessage: MessageHandler, options: SidecarServerOptions = {}) {
		this.socketPath = socketPath;
		this.onMessage = onMessage;
		this.onActivity = options.onActivity;
		this.onClose = options.onClose;
		this.version = options.version ?? "0.0.0";

		const socketHandler: SocketHandler<ClientData> = {
			open: (socket) => {
				socket.data = { buffer: "" };
				this.clients.add(socket);
				this.onActivity?.();
			},

			data: (socket, data) => {
				this.onActivity?.();

				// Append received data to buffer
				socket.data.buffer += typeof data === "string" ? data : new TextDecoder().decode(data);

				// Process complete lines (JSON Lines format)
				const lines = socket.data.buffer.split("\n");
				// Keep the last incomplete line in the buffer
				socket.data.buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.trim()) continue;

					const message = SidecarMessage.parse(line);
					if (!message) {
						// Invalid message, send error response
						const response: SidecarResponse = {
							ok: false,
							error: "Invalid message format",
							version: this.version,
						};
						socket.write(`${JSON.stringify(response)}\n`);
						continue;
					}

					const result = this.onMessage(message);
					if (result) {
						// Send response with version
						const response: SidecarResponse = {
							...result,
							version: this.version,
						};
						socket.write(`${JSON.stringify(response)}\n`);
					}
				}
			},

			close: (socket) => {
				this.clients.delete(socket);
			},

			error: (socket, error) => {
				console.error(`[sidecar] Socket error: ${error.message}`);
				this.clients.delete(socket);
			},

			drain: (_socket) => {
				// Socket is ready for more writes
			},
		};

		// Remove existing socket file if it exists (Bun.listen will fail if socket exists)
		try {
			Bun.spawnSync(["rm", "-f", socketPath]);
		} catch {
			// Ignore errors - file may not exist
		}

		this.server = Bun.listen<ClientData>({
			unix: socketPath,
			socket: socketHandler,
		});
	}

	/**
	 * Stop the server.
	 */
	stop(): void {
		// Close all client connections
		for (const client of this.clients) {
			client.end();
		}
		this.clients.clear();

		// Stop the server
		this.server.stop();

		// Clean up socket file
		try {
			const file = Bun.file(this.socketPath);
			if (file.size >= 0) {
				// Use unlink to remove the socket file
				Bun.spawn(["rm", "-f", this.socketPath]);
			}
		} catch {
			// Ignore cleanup errors
		}

		this.onClose?.();
	}

	/**
	 * Get number of connected clients.
	 */
	clientCount(): number {
		return this.clients.size;
	}
}
