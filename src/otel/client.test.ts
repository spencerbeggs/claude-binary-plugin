import { afterEach, describe, expect, test } from "bun:test";
import { SidecarClient, clearSidecarClients, getSidecarClient, removeSidecarClient } from "./client.js";

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
	});
});
