/**
 * Unix socket server for OTEL sidecar.
 *
 * Uses Bun's native `Bun.listen()` with Unix socket support for high-performance
 * IPC between hooks and the sidecar process.
 *
 * @module
 */

import type { Socket, SocketHandler } from "bun";
import type { SidecarMessage, SidecarResponse } from "../protocol.js";
import { parseMessage } from "../protocol.js";

/**
 * Message handler function type.
 * Returns a response or undefined (for fire-and-forget messages).
 */
export type MessageHandler = (message: SidecarMessage) => SidecarResponse | undefined;

/**
 * Per-client socket data.
 */
interface ClientData {
	/** Partial message buffer for incomplete reads */
	buffer: string;
}

/**
 * Server state and configuration.
 */
export interface ServerState {
	/** Unix socket path */
	socketPath: string;
	/** Active client connections */
	clients: Set<Socket<ClientData>>;
	/** Message handler */
	onMessage: MessageHandler;
	/** Called when activity occurs (for idle timeout) */
	onActivity?: () => void;
	/** Called when server closes */
	onClose?: () => void;
	/** Sidecar version string */
	version: string;
}

/**
 * Unix socket server wrapper.
 */
export interface SidecarServer {
	/** The underlying Bun server */
	readonly server: ReturnType<typeof Bun.listen>;
	/** Server state */
	readonly state: ServerState;
	/** Stop the server */
	stop(): void;
	/** Get number of connected clients */
	clientCount(): number;
}

/**
 * Create a Unix socket server for the sidecar.
 *
 * @param socketPath - Path to the Unix socket file
 * @param onMessage - Handler for incoming messages
 * @param options - Additional server options
 * @returns The server instance
 */
export function createServer(
	socketPath: string,
	onMessage: MessageHandler,
	options: {
		onActivity?: () => void;
		onClose?: () => void;
		version?: string;
	} = {},
): SidecarServer {
	const state: ServerState = {
		socketPath,
		clients: new Set(),
		onMessage,
		onActivity: options.onActivity,
		onClose: options.onClose,
		version: options.version ?? "0.0.0",
	};

	const socketHandler: SocketHandler<ClientData> = {
		open(socket) {
			socket.data = { buffer: "" };
			state.clients.add(socket);
			state.onActivity?.();
		},

		data(socket, data) {
			state.onActivity?.();

			// Append received data to buffer
			socket.data.buffer += typeof data === "string" ? data : new TextDecoder().decode(data);

			// Process complete lines (JSON Lines format)
			const lines = socket.data.buffer.split("\n");
			// Keep the last incomplete line in the buffer
			socket.data.buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.trim()) continue;

				const message = parseMessage(line);
				if (!message) {
					// Invalid message, send error response
					const response: SidecarResponse = {
						ok: false,
						error: "Invalid message format",
						version: state.version,
					};
					socket.write(`${JSON.stringify(response)}\n`);
					continue;
				}

				const result = state.onMessage(message);
				if (result) {
					// Send response with version
					const response: SidecarResponse = {
						...result,
						version: state.version,
					};
					socket.write(`${JSON.stringify(response)}\n`);
				}
			}
		},

		close(socket) {
			state.clients.delete(socket);
		},

		error(socket, error) {
			console.error(`[sidecar] Socket error: ${error.message}`);
			state.clients.delete(socket);
		},

		drain(_socket) {
			// Socket is ready for more writes
		},
	};

	// Remove existing socket file if it exists (Bun.listen will fail if socket exists)
	try {
		Bun.spawnSync(["rm", "-f", socketPath]);
	} catch {
		// Ignore errors - file may not exist
	}

	const server = Bun.listen<ClientData>({
		unix: socketPath,
		socket: socketHandler,
	});

	return {
		server,
		state,
		stop() {
			// Close all client connections
			for (const client of state.clients) {
				client.end();
			}
			state.clients.clear();

			// Stop the server
			server.stop();

			// Clean up socket file
			try {
				const file = Bun.file(socketPath);
				if (file.size >= 0) {
					// Use unlink to remove the socket file
					Bun.spawn(["rm", "-f", socketPath]);
				}
			} catch {
				// Ignore cleanup errors
			}

			state.onClose?.();
		},
		clientCount() {
			return state.clients.size;
		},
	};
}
