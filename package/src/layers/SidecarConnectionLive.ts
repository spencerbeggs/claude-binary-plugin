import type { Socket } from "bun";
import { Effect, Layer, Queue, Ref } from "effect";
import { SidecarError } from "../errors/SidecarError.js";
import type { SidecarProtocolMessage } from "../otel/protocol.js";
import { OtelConfig } from "../services/OtelConfig.js";
import { SidecarConnection } from "../services/SidecarConnection.js";

/**
 * BigInt-safe JSON replacer for serializing protocol messages.
 * Converts BigInt values to strings with "n" suffix.
 */
const bigIntReplacer = (_key: string, value: unknown): unknown => {
	if (typeof value === "bigint") {
		return `${value.toString()}n`;
	}
	return value;
};

/**
 * Serialize a sidecar protocol message to JSON Lines format.
 */
const serialize = (message: typeof SidecarProtocolMessage.Type): string =>
	`${JSON.stringify(message, bigIntReplacer)}\n`;

/**
 * Socket data type for Bun.connect.
 */
interface SocketData {
	connectedAt: number;
}

/**
 * Resolve the socket path from config or environment fallback.
 */
const resolveSocketPath = (configSocketPath: string | undefined): string => {
	if (configSocketPath) return configSocketPath;

	// Check env var
	const envSocket = Bun.env.OTEL_SIDECAR_SOCKET;
	if (envSocket) return envSocket;

	// Session env directory fallback
	const sessionId = Bun.env.CLAUDE_SESSION_ID;
	if (sessionId) {
		return `/tmp/claude-otel-${sessionId}.sock`;
	}

	return "/tmp/claude-otel-default.sock";
};

/**
 * Attempt a single socket connection.
 */
const doConnect = (
	socketPath: string,
	socketRef: Ref.Ref<Socket<SocketData> | null>,
): Effect.Effect<boolean, SidecarError> =>
	Effect.tryPromise({
		try: async () => {
			const socket = await Bun.connect<SocketData>({
				unix: socketPath,
				data: { connectedAt: Date.now() },
				socket: {
					data: () => {
						// Ignore responses — fire-and-forget
					},
					error: () => {
						// Mark disconnected on error — will set ref to null via background fiber
						Effect.runFork(Ref.set(socketRef, null));
					},
					close: () => {
						Effect.runFork(Ref.set(socketRef, null));
					},
					open: () => {
						// Connection established
					},
				},
			});
			Effect.runFork(Ref.set(socketRef, socket));
			return true;
		},
		catch: (err) =>
			new SidecarError({
				stage: "connect",
				message: `Failed to connect to socket at ${socketPath}`,
				cause: err,
			}),
	});

/**
 * Attempt to spawn the sidecar binary and retry connection.
 */
const spawnAndConnect = (
	socketPath: string,
	socketRef: Ref.Ref<Socket<SocketData> | null>,
): Effect.Effect<boolean, SidecarError> =>
	Effect.gen(function* () {
		const pluginRoot = Bun.env.CLAUDE_PLUGIN_ROOT;
		if (!pluginRoot) {
			return false;
		}

		// Try to find the plugin binary
		const pluginName = Bun.env.PLUGIN_NAME;
		if (!pluginName) return false;

		const binaryPath = `${pluginRoot}/${pluginName}.plugin`;
		const exists = yield* Effect.promise(() => Bun.file(binaryPath).exists());
		if (!exists) return false;

		// Spawn sidecar
		yield* Effect.tryPromise({
			try: async () => {
				const proc = Bun.spawn({
					cmd: [binaryPath, "--sidecar"],
					env: {
						...process.env,
						OTEL_SIDECAR_SOCKET: socketPath,
					},
					stdio: ["ignore", "ignore", "ignore"],
				});
				proc.unref();
			},
			catch: (err) =>
				new SidecarError({
					stage: "spawn",
					message: "Failed to spawn sidecar process",
					cause: err,
				}),
		});

		// Retry connection with backoff
		yield* Effect.sleep("100 millis");
		const attempt1 = yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
		if (attempt1) return true;

		yield* Effect.sleep("200 millis");
		const attempt2 = yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
		if (attempt2) return true;

		yield* Effect.sleep("500 millis");
		const attempt3 = yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
		return attempt3;
	});

/**
 * No-op implementation for when OTEL is disabled.
 */
const noopService: SidecarConnection["Type"] = {
	emit: () => Effect.void,
	preconnect: Effect.void,
	flush: () => Effect.succeed(true),
};

/**
 * SidecarConnectionLive is a scoped layer that provides the SidecarConnection
 * service with real socket lifecycle management.
 *
 * When OTEL is disabled, returns a no-op implementation.
 * When enabled, manages a Unix socket connection to the OTEL sidecar with:
 * - Sliding queue for message buffering (drops oldest when full)
 * - Fire-and-forget emit semantics (never blocks caller)
 * - Connection retry with sidecar spawning
 * - Graceful shutdown on scope close
 */
export const SidecarConnectionLive: Layer.Layer<SidecarConnection, never, OtelConfig> = Layer.scoped(
	SidecarConnection,
	Effect.gen(function* () {
		const config = yield* OtelConfig;

		if (!config.enabled) {
			return noopService;
		}

		const socketPath = resolveSocketPath(config.socketPath);
		const queue = yield* Queue.sliding<typeof SidecarProtocolMessage.Type>(1024);
		const socketRef = yield* Ref.make<Socket<SocketData> | null>(null);

		// Register finalizer to clean up socket and queue on scope close
		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				const socket = yield* Ref.get(socketRef);
				if (socket) {
					yield* Effect.try({
						try: () => socket.end(),
						catch: () =>
							new SidecarError({
								stage: "shutdown",
								message: "Error closing socket",
							}),
					}).pipe(Effect.ignoreLogged);
				}
				yield* Queue.shutdown(queue);
			}),
		);

		/**
		 * Write all queued messages to the socket.
		 * Returns true if all drained, false if socket unavailable.
		 */
		const drainQueue = Effect.gen(function* () {
			const socket = yield* Ref.get(socketRef);
			if (!socket) return false;

			const size = yield* Queue.size(queue);
			for (let i = 0; i < size; i++) {
				const msg = yield* Queue.poll(queue);
				if (msg._tag === "Some") {
					const writeResult = yield* Effect.try({
						try: () => {
							socket.write(serialize(msg.value));
							return true;
						},
						catch: () => false,
					});
					if (!writeResult) {
						yield* Ref.set(socketRef, null);
						return false;
					}
				}
			}
			return true;
		});

		const emit = (message: typeof SidecarProtocolMessage.Type): Effect.Effect<void> =>
			Effect.gen(function* () {
				const socket = yield* Ref.get(socketRef);

				if (socket) {
					// Try to write directly
					const writeResult = yield* Effect.try({
						try: () => {
							socket.write(serialize(message));
							return true;
						},
						catch: () => false,
					});
					if (writeResult) return;
					// Socket error, fall through to queue
					yield* Ref.set(socketRef, null);
				}

				// Queue the message
				yield* Queue.offer(queue, message);

				// Attempt reconnection in background fiber
				yield* Effect.gen(function* () {
					const connected = yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
					if (connected) {
						yield* drainQueue;
					}
				}).pipe(Effect.forkDaemon, Effect.ignoreLogged);
			}).pipe(Effect.ignoreLogged);

		const preconnect: Effect.Effect<void> = Effect.gen(function* () {
			const existing = yield* Ref.get(socketRef);
			if (existing) return;

			const connected = yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
			if (!connected) {
				yield* spawnAndConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
			}
		}).pipe(Effect.ignoreLogged);

		const flush = (timeoutMs?: number): Effect.Effect<boolean> => {
			const timeout = timeoutMs ?? 1000;
			return Effect.gen(function* () {
				const size = yield* Queue.size(queue);
				if (size === 0) return true;

				// Try to connect if not connected
				const socket = yield* Ref.get(socketRef);
				if (!socket) {
					yield* doConnect(socketPath, socketRef).pipe(Effect.orElseSucceed(() => false));
				}

				// Attempt to drain
				return yield* drainQueue;
			}).pipe(
				Effect.timeout(`${timeout} millis`),
				Effect.map((opt) => opt ?? false),
				Effect.catchAll(() => Effect.succeed(false)),
			);
		};

		return { emit, preconnect, flush } satisfies SidecarConnection["Type"];
	}),
);
