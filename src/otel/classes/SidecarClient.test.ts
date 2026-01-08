import { afterEach, describe, expect, test } from "bun:test";
import { SidecarClient, clearSidecarClients, getSidecarClient, removeSidecarClient } from "./SidecarClient.js";

describe("client", () => {
	afterEach(() => {
		// Clean up clients after each test
		clearSidecarClients();
	});

	describe("SidecarClient", () => {
		test("constructor sets session ID and socket path", () => {
			const client = new SidecarClient("test-session-123", "/tmp/test.sock");

			expect(client.getSocketPath()).toBe("/tmp/test.sock");
			expect(client.getState()).toBe("disconnected");
		});

		test("initial state is disconnected", () => {
			const client = new SidecarClient("test-session");

			expect(client.getState()).toBe("disconnected");
		});

		test("emit does not throw when disconnected", () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			// Should not throw - fire and forget
			expect(() => {
				client.emit({
					type: "ping",
					sessionId: "test-session",
					config: {},
				});
			}).not.toThrow();
		});

		test("disconnect is idempotent", () => {
			const client = new SidecarClient("test-session");

			// Should not throw even when called multiple times
			client.disconnect();
			client.disconnect();
			client.disconnect();

			expect(client.getState()).toBe("disconnected");
		});

		test("shutdown calls disconnect", () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			client.shutdown();

			expect(client.getState()).toBe("disconnected");
		});
	});

	describe("getSidecarClient", () => {
		test("returns new client for new session ID", () => {
			const client = getSidecarClient("session-1");

			expect(client).toBeInstanceOf(SidecarClient);
		});

		test("returns same client for same session ID", () => {
			const client1 = getSidecarClient("session-1");
			const client2 = getSidecarClient("session-1");

			expect(client1).toBe(client2);
		});

		test("returns different clients for different session IDs", () => {
			const client1 = getSidecarClient("session-1");
			const client2 = getSidecarClient("session-2");

			expect(client1).not.toBe(client2);
		});
	});

	describe("removeSidecarClient", () => {
		test("removes client from cache", () => {
			const client1 = getSidecarClient("session-to-remove");
			removeSidecarClient("session-to-remove");
			const client2 = getSidecarClient("session-to-remove");

			expect(client1).not.toBe(client2);
		});

		test("does nothing for non-existent session", () => {
			// Should not throw
			expect(() => {
				removeSidecarClient("nonexistent-session");
			}).not.toThrow();
		});
	});

	describe("clearSidecarClients", () => {
		test("removes all clients from cache", () => {
			const client1 = getSidecarClient("session-1");
			const client2 = getSidecarClient("session-2");

			clearSidecarClients();

			const newClient1 = getSidecarClient("session-1");
			const newClient2 = getSidecarClient("session-2");

			expect(newClient1).not.toBe(client1);
			expect(newClient2).not.toBe(client2);
		});
	});

	describe("connection behavior", () => {
		test("tryConnect returns false for non-existent socket", async () => {
			const client = new SidecarClient("test-session", "/nonexistent/path/socket.sock");

			// ensureRunning will try to connect and spawn, both should fail gracefully
			const result = await client.ensureRunning({});

			expect(result).toBe(false);
			expect(client.getState()).toBe("disconnected");
		});

		test("preconnect returns false for non-existent socket", async () => {
			const client = new SidecarClient("test-session", "/nonexistent/path/socket.sock");

			const result = await client.preconnect();

			expect(result).toBe(false);
			expect(client.getState()).toBe("disconnected");
		});
	});

	describe("flush", () => {
		test("returns true when queue is empty and disconnected", async () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			const result = await client.flush(100);

			expect(result).toBe(true);
		});

		test("returns false when unable to connect within timeout", async () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			// Queue a message
			client.emit({
				type: "event",
				sessionId: "test-session",
				data: {
					name: "test.event",
					attributes: {},
					timeNs: BigInt(Date.now() * 1_000_000),
				},
			});

			// Flush with short timeout - should fail to connect
			const result = await client.flush(50);

			expect(result).toBe(false);
		});
	});

	describe("shutdown", () => {
		test("shutdown with sessionOnly=true sends session shutdown", () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			// Should not throw
			client.shutdown(true);

			expect(client.getState()).toBe("disconnected");
		});

		test("shutdown with sessionOnly=false sends full shutdown", () => {
			const client = new SidecarClient("test-session", "/nonexistent/socket.sock");

			// Should not throw
			client.shutdown(false);

			expect(client.getState()).toBe("disconnected");
		});
	});

	describe("real socket connection", () => {
		test("can connect to a real Unix socket server", async () => {
			const socketPath = `/tmp/test-client-${Date.now()}.sock`;
			let receivedData = "";

			// Create a simple Unix socket server
			const server = Bun.listen({
				unix: socketPath,
				socket: {
					data: (_socket, data) => {
						receivedData += data.toString();
					},
					open: () => {},
					close: () => {},
					error: () => {},
				},
			});

			try {
				const client = new SidecarClient("test-session", socketPath);

				// Connect and send a message
				const connected = await client.preconnect();
				expect(connected).toBe(true);
				expect(client.getState()).toBe("connected");

				// Emit a message
				client.emit({
					type: "ping",
					sessionId: "test-session",
					config: {},
				});

				// Give socket time to send
				await Bun.sleep(50);

				// Verify data was received
				expect(receivedData).toContain("ping");

				client.disconnect();
				expect(client.getState()).toBe("disconnected");
			} finally {
				server.stop();
				// Clean up socket file
				try {
					await Bun.$`rm -f ${socketPath}`.quiet().nothrow();
				} catch {
					// Ignore cleanup errors
				}
			}
		});

		test("drainQueue sends queued messages after connection", async () => {
			const socketPath = `/tmp/test-drain-${Date.now()}.sock`;
			let receivedData = "";

			// Create a simple Unix socket server
			const server = Bun.listen({
				unix: socketPath,
				socket: {
					data: (_socket, data) => {
						receivedData += data.toString();
					},
					open: () => {},
					close: () => {},
					error: () => {},
				},
			});

			try {
				const client = new SidecarClient("test-session", socketPath);

				// Queue messages before connecting
				client.emit({
					type: "event",
					sessionId: "test-session",
					data: {
						name: "queued.event.1",
						attributes: {},
						timeNs: BigInt(Date.now() * 1_000_000),
					},
				});
				client.emit({
					type: "event",
					sessionId: "test-session",
					data: {
						name: "queued.event.2",
						attributes: {},
						timeNs: BigInt(Date.now() * 1_000_000),
					},
				});

				// Give time for connection and queue drain
				await Bun.sleep(100);

				// Verify queued messages were sent (along with auto-ping)
				expect(receivedData).toContain("ping"); // Auto-ping on first drain
				expect(receivedData).toContain("queued.event.1");
				expect(receivedData).toContain("queued.event.2");

				client.disconnect();
			} finally {
				server.stop();
				try {
					await Bun.$`rm -f ${socketPath}`.quiet().nothrow();
				} catch {
					// Ignore cleanup errors
				}
			}
		});

		test("flush returns true when queue is drained", async () => {
			const socketPath = `/tmp/test-flush-${Date.now()}.sock`;

			// Create a simple Unix socket server
			const server = Bun.listen({
				unix: socketPath,
				socket: {
					data: () => {},
					open: () => {},
					close: () => {},
					error: () => {},
				},
			});

			try {
				const client = new SidecarClient("test-session", socketPath);

				// Queue a message
				client.emit({
					type: "event",
					sessionId: "test-session",
					data: {
						name: "flush.test",
						attributes: {},
						timeNs: BigInt(Date.now() * 1_000_000),
					},
				});

				// Flush should succeed
				const result = await client.flush(1000);

				expect(result).toBe(true);

				client.disconnect();
			} finally {
				server.stop();
				try {
					await Bun.$`rm -f ${socketPath}`.quiet().nothrow();
				} catch {
					// Ignore cleanup errors
				}
			}
		});

		test("flush returns true immediately when connected with empty queue", async () => {
			const socketPath = `/tmp/test-flush-empty-${Date.now()}.sock`;

			// Create a simple Unix socket server
			const server = Bun.listen({
				unix: socketPath,
				socket: {
					data: () => {},
					open: () => {},
					close: () => {},
					error: () => {},
				},
			});

			try {
				const client = new SidecarClient("test-session", socketPath);

				// Connect first
				await client.preconnect();

				// Flush with empty queue should return immediately
				const result = await client.flush(100);

				expect(result).toBe(true);

				client.disconnect();
			} finally {
				server.stop();
				try {
					await Bun.$`rm -f ${socketPath}`.quiet().nothrow();
				} catch {
					// Ignore cleanup errors
				}
			}
		});

		test("handles socket close event", async () => {
			const socketPath = `/tmp/test-close-${Date.now()}.sock`;

			// Create a simple Unix socket server
			const server = Bun.listen({
				unix: socketPath,
				socket: {
					data: () => {},
					open: (socket) => {
						// Close the socket from server side after a brief moment
						setTimeout(() => socket.end(), 50);
					},
					close: () => {},
					error: () => {},
				},
			});

			try {
				const client = new SidecarClient("test-session", socketPath);

				// Connect
				await client.preconnect();
				expect(client.getState()).toBe("connected");

				// Wait for server to close the connection
				await Bun.sleep(100);

				// State should transition to disconnected
				expect(client.getState()).toBe("disconnected");
			} finally {
				server.stop();
				try {
					await Bun.$`rm -f ${socketPath}`.quiet().nothrow();
				} catch {
					// Ignore cleanup errors
				}
			}
		});
	});
});
