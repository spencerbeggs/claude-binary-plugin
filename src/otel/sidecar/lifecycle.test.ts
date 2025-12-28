import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createLifecycleManager, parseIdleTimeout } from "./lifecycle.js";
import type { SidecarServer } from "./server.js";

describe("lifecycle", () => {
	describe("parseIdleTimeout", () => {
		test("returns default when env value is undefined", () => {
			const result = parseIdleTimeout(undefined, 300000);

			expect(result).toBe(300000);
		});

		test("returns default when env value is empty string", () => {
			const result = parseIdleTimeout("", 300000);

			expect(result).toBe(300000);
		});

		test("parses valid integer value", () => {
			const result = parseIdleTimeout("60000", 300000);

			expect(result).toBe(60000);
		});

		test("returns default for invalid number", () => {
			// Mock console.warn to suppress output
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("not-a-number", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("returns default for zero", () => {
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("0", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("returns default for negative number", () => {
			const originalWarn = console.warn;
			console.warn = mock(() => {});

			const result = parseIdleTimeout("-1000", 300000);

			expect(result).toBe(300000);
			console.warn = originalWarn;
		});

		test("uses provided default value", () => {
			const result = parseIdleTimeout(undefined, 120000);

			expect(result).toBe(120000);
		});

		test("uses DEFAULTS.IDLE_TIMEOUT_MS when no default provided", () => {
			const result = parseIdleTimeout(undefined);

			// DEFAULTS.IDLE_TIMEOUT_MS is 5 * 60 * 1000 = 300000
			expect(result).toBe(300000);
		});
	});
});

describe("createLifecycleManager", () => {
	let mockServer: SidecarServer;
	let originalConsoleLog: typeof console.log;

	beforeEach(() => {
		// Mock the server
		mockServer = {
			stop: mock(() => {}),
		} as unknown as SidecarServer;

		// Suppress console.log during tests
		originalConsoleLog = console.log;
		console.log = mock(() => {});
	});

	afterEach(() => {
		console.log = originalConsoleLog;
	});

	test("creates lifecycle manager with initial state", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		expect(manager.state).toBeDefined();
		expect(manager.state.shuttingDown).toBe(false);
		expect(manager.state.idleTimer).not.toBeNull();
		expect(manager.state.startTime).toBeGreaterThan(0);
		expect(manager.state.lastActivity).toBeGreaterThan(0);

		// Clean up timer
		manager.shutdown();
	});

	test("recordActivity updates lastActivity and resets timer", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		const initialActivity = manager.state.lastActivity;
		const initialTimer = manager.state.idleTimer;

		// Wait a small amount and record activity
		Bun.sleepSync(10);
		manager.recordActivity();

		expect(manager.state.lastActivity).toBeGreaterThan(initialActivity);
		expect(manager.state.idleTimer).not.toBe(initialTimer);

		// Clean up timer
		manager.shutdown();
	});

	test("uptime returns elapsed time since start", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		// Wait a small amount
		Bun.sleepSync(10);

		const uptime = manager.uptime();
		expect(uptime).toBeGreaterThanOrEqual(10);

		// Clean up timer
		manager.shutdown();
	});

	test("shutdown stops the server", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		manager.shutdown();

		expect(mockServer.stop).toHaveBeenCalled();
		expect(manager.state.shuttingDown).toBe(true);
		expect(manager.state.idleTimer).toBeNull();
	});

	test("shutdown is idempotent", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		manager.shutdown();
		manager.shutdown();
		manager.shutdown();

		// stop should only be called once
		expect(mockServer.stop).toHaveBeenCalledTimes(1);
	});

	test("shutdown calls onShutdown callback", () => {
		const onShutdown = mock(() => {});
		const manager = createLifecycleManager(mockServer, 1000, onShutdown);

		manager.shutdown();

		expect(onShutdown).toHaveBeenCalled();
	});

	test("idle timeout triggers shutdown", async () => {
		const onShutdown = mock(() => {});
		createLifecycleManager(mockServer, 50, onShutdown); // Very short timeout

		// Wait for idle timeout
		await Bun.sleep(100);

		expect(mockServer.stop).toHaveBeenCalled();
		expect(onShutdown).toHaveBeenCalled();
	});

	test("recordActivity does nothing after shutdown", () => {
		const manager = createLifecycleManager(mockServer, 1000);

		manager.shutdown();
		const afterShutdownActivity = manager.state.lastActivity;

		// This should not throw or update state
		manager.recordActivity();

		expect(manager.state.lastActivity).toBe(afterShutdownActivity);
		expect(manager.state.idleTimer).toBeNull();
	});
});
