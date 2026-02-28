import { afterEach, describe, expect, test } from "bun:test";
import { SidecarClientPool } from "./SidecarClientPool.js";

describe("SidecarClientPool", () => {
	afterEach(() => {
		SidecarClientPool.clearAll();
	});

	test("SidecarClientPool is exported", () => {
		expect(SidecarClientPool).toBeDefined();
	});

	test("get is a static method", () => {
		expect(typeof SidecarClientPool.get).toBe("function");
	});

	test("remove is a static method", () => {
		expect(typeof SidecarClientPool.remove).toBe("function");
	});

	test("clearAll is a static method", () => {
		expect(typeof SidecarClientPool.clearAll).toBe("function");
	});

	describe("get", () => {
		test("creates and returns a client for a session", () => {
			const client = SidecarClientPool.get("session-1");
			expect(client).toBeDefined();
			expect(client.getState()).toBe("disconnected");
		});

		test("returns same client on repeated calls with same session ID", () => {
			const client1 = SidecarClientPool.get("session-1");
			const client2 = SidecarClientPool.get("session-1");
			expect(client1).toBe(client2);
		});

		test("returns different clients for different session IDs", () => {
			const client1 = SidecarClientPool.get("session-1");
			const client2 = SidecarClientPool.get("session-2");
			expect(client1).not.toBe(client2);
		});
	});

	describe("has", () => {
		test("returns false for unknown session", () => {
			expect(SidecarClientPool.has("nonexistent")).toBe(false);
		});

		test("returns true after get() creates a client", () => {
			SidecarClientPool.get("session-1");
			expect(SidecarClientPool.has("session-1")).toBe(true);
		});

		test("returns false after remove()", () => {
			SidecarClientPool.get("session-1");
			SidecarClientPool.remove("session-1");
			expect(SidecarClientPool.has("session-1")).toBe(false);
		});
	});

	describe("size", () => {
		test("returns 0 for empty pool", () => {
			expect(SidecarClientPool.size).toBe(0);
		});

		test("returns correct count after adding clients", () => {
			SidecarClientPool.get("session-1");
			expect(SidecarClientPool.size).toBe(1);

			SidecarClientPool.get("session-2");
			expect(SidecarClientPool.size).toBe(2);
		});

		test("does not increase for duplicate session IDs", () => {
			SidecarClientPool.get("session-1");
			SidecarClientPool.get("session-1");
			expect(SidecarClientPool.size).toBe(1);
		});
	});

	describe("remove", () => {
		test("removes a client from the pool", () => {
			SidecarClientPool.get("session-1");
			expect(SidecarClientPool.size).toBe(1);

			SidecarClientPool.remove("session-1");
			expect(SidecarClientPool.size).toBe(0);
			expect(SidecarClientPool.has("session-1")).toBe(false);
		});

		test("is a no-op for nonexistent session", () => {
			SidecarClientPool.remove("nonexistent");
			expect(SidecarClientPool.size).toBe(0);
		});

		test("get() returns a new client after remove()", () => {
			const client1 = SidecarClientPool.get("session-1");
			SidecarClientPool.remove("session-1");
			const client2 = SidecarClientPool.get("session-1");
			expect(client1).not.toBe(client2);
		});
	});

	describe("clearAll", () => {
		test("empties the pool", () => {
			SidecarClientPool.get("session-1");
			SidecarClientPool.get("session-2");
			SidecarClientPool.get("session-3");
			expect(SidecarClientPool.size).toBe(3);

			SidecarClientPool.clearAll();
			expect(SidecarClientPool.size).toBe(0);
		});

		test("is safe to call on empty pool", () => {
			SidecarClientPool.clearAll();
			expect(SidecarClientPool.size).toBe(0);
		});

		test("all sessions are gone after clear", () => {
			SidecarClientPool.get("session-1");
			SidecarClientPool.get("session-2");
			SidecarClientPool.clearAll();

			expect(SidecarClientPool.has("session-1")).toBe(false);
			expect(SidecarClientPool.has("session-2")).toBe(false);
		});
	});
});
