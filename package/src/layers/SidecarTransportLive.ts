import type { Socket, SocketHandler } from "bun";
import { Effect, Layer, Ref } from "effect";
import { OTEL_SCOPE } from "../otel/message-builders.js";
import type { OtelProtocolConfig, SidecarProtocolMessage, SidecarResponse } from "../otel/protocol.js";
import { MessageRouter } from "../services/MessageRouter.js";
import type { ResourceConfig } from "../services/OtelProviders.js";
import { OtelProviders } from "../services/OtelProviders.js";
import { SidecarTransport } from "../services/SidecarTransport.js";

/**
 * Default socket path for the sidecar Unix socket.
 */
const DEFAULT_SOCKET_PATH = "/tmp/claude-otel-sidecar.sock";

/**
 * Per-client socket data for buffering incomplete reads.
 */
interface ClientData {
	buffer: string;
}

/**
 * Parse a JSON Line message with BigInt revival.
 * Replaces SidecarMessage.parse() from the deleted SidecarMessage.ts.
 */
const parseMessage = (line: string): typeof SidecarProtocolMessage.Type | null => {
	try {
		const trimmed = line.trim();
		if (!trimmed) return null;
		return JSON.parse(trimmed, (_key, value) => {
			if (typeof value === "string" && /^\d+n$/.test(value)) {
				return BigInt(value.slice(0, -1));
			}
			return value;
		}) as typeof SidecarProtocolMessage.Type;
	} catch {
		return null;
	}
};

/**
 * Route an incoming sidecar message to the appropriate handler.
 *
 * This is a pure function that replaces SidecarRouter's static class.
 * It accepts the providers service and session config ref as parameters
 * instead of relying on global state.
 */
const routeMessage = (
	message: typeof SidecarProtocolMessage.Type,
	providers: OtelProviders["Type"],
	sessionConfigs: Map<string, OtelProtocolConfig>,
	router: MessageRouter["Type"],
): Effect.Effect<SidecarResponse | undefined> =>
	Effect.gen(function* () {
		switch (message.type) {
			case "ping": {
				const config = message.config as OtelProtocolConfig;
				sessionConfigs.set(message.sessionId, config);

				yield* providers.reinit({ ...config } as ResourceConfig);

				return { ok: true, version: "0.0.0" } satisfies SidecarResponse;
			}

			case "span": {
				const tracer = providers.getTracer(OTEL_SCOPE.NAME);
				yield* router.handleSpan(message.data, tracer);
				return undefined;
			}

			case "event": {
				const logger = message.data.scope
					? providers.getLogger(message.data.scope.name, message.data.scope.version)
					: providers.getLogger(OTEL_SCOPE.NAME);
				yield* router.handleEvent(message.data, logger);
				return undefined;
			}

			case "metric": {
				const meter = providers.getMeter(OTEL_SCOPE.NAME);
				yield* router.handleMetric(message.data, meter);
				return undefined;
			}

			case "shutdown": {
				if (message.sessionId) {
					sessionConfigs.delete(message.sessionId);
					return { ok: true } satisfies SidecarResponse;
				}
				// Full shutdown — signal via Effect.interrupt so the scope unwinds
				return yield* Effect.interrupt;
			}

			default: {
				const _exhaustive: never = message;
				return {
					ok: false,
					error: `Unknown message type: ${(_exhaustive as typeof SidecarProtocolMessage.Type).type}`,
				} satisfies SidecarResponse;
			}
		}
	});

/**
 * Create a scoped SidecarTransport layer that manages a Unix socket server.
 *
 * The `lastActivity` Ref is shared with the idle-timeout watcher in SidecarMain.
 * On every incoming message, the ref is updated with `Date.now()`.
 *
 * The server is torn down automatically when the scope closes (via Effect finalizer).
 *
 * @param lastActivity - Shared Ref for idle timeout coordination
 * @returns A Layer providing SidecarTransport, requiring OtelProviders
 *
 * @public
 */
export const makeSidecarTransportLive = (
	lastActivity: Ref.Ref<number>,
): Layer.Layer<SidecarTransport, never, OtelProviders | MessageRouter> =>
	Layer.scoped(
		SidecarTransport,
		Effect.gen(function* () {
			const providers = yield* OtelProviders;
			const router = yield* MessageRouter;

			// Session config storage (per-session OTEL config)
			const sessionConfigs = new Map<string, OtelProtocolConfig>();

			// Track connected clients for cleanup
			const clients = new Set<Socket<ClientData>>();

			// Socket path from env or default
			const socketPath = process.env.OTEL_SIDECAR_SOCKET ?? DEFAULT_SOCKET_PATH;

			// Remove stale socket file
			yield* Effect.sync(() => {
				try {
					Bun.spawnSync(["rm", "-f", socketPath]);
				} catch {
					// Ignore — file may not exist
				}
			});

			// Create the socket handler
			const socketHandler: SocketHandler<ClientData> = {
				open: (socket) => {
					socket.data = { buffer: "" };
					clients.add(socket);
					Ref.set(lastActivity, Date.now()).pipe(Effect.runSync);
				},

				data: (socket, raw) => {
					Ref.set(lastActivity, Date.now()).pipe(Effect.runSync);

					socket.data.buffer += typeof raw === "string" ? raw : new TextDecoder().decode(raw);

					const lines = socket.data.buffer.split("\n");
					socket.data.buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.trim()) continue;

						const message = parseMessage(line);
						if (!message) {
							const response: SidecarResponse = {
								ok: false,
								error: "Invalid message format",
								version: "0.0.0",
							};
							socket.write(`${JSON.stringify(response)}\n`);
							continue;
						}

						// Route message — run the Effect synchronously for fire-and-forget,
						// or capture response for request/reply messages.
						const effect = routeMessage(message, providers, sessionConfigs, router).pipe(
							Effect.tap((result) =>
								Effect.sync(() => {
									if (result) {
										socket.write(`${JSON.stringify(result)}\n`);
									}
								}),
							),
							Effect.catchAll((cause) =>
								Effect.sync(() => {
									const response: SidecarResponse = {
										ok: false,
										error: `Handler error: ${String(cause)}`,
										version: "0.0.0",
									};
									socket.write(`${JSON.stringify(response)}\n`);
								}),
							),
						);

						Effect.runPromise(effect).catch(() => {
							// Interrupt from shutdown is expected — swallow it
						});
					}
				},

				close: (socket) => {
					clients.delete(socket);
				},

				error: (_socket, _error) => {
					clients.delete(_socket);
				},

				drain: (_socket) => {
					// Socket is ready for more writes
				},
			};

			// Start the server
			const server = Bun.listen<ClientData>({
				unix: socketPath,
				socket: socketHandler,
			});

			// Register finalizer: close clients, stop server, remove socket file
			yield* Effect.addFinalizer(() =>
				Effect.sync(() => {
					for (const client of clients) {
						client.end();
					}
					clients.clear();
					server.stop();
					try {
						Bun.spawnSync(["rm", "-f", socketPath]);
					} catch {
						// Ignore cleanup errors
					}
				}),
			);

			return {
				clientCount: Effect.sync(() => clients.size),
			} satisfies SidecarTransport["Type"];
		}),
	);
