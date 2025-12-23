import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { FileSystem } from "./debug-logger.js";
import { DebugLogger, getProjectDir } from "./debug-logger.js";
import type { MockEnvContext } from "./mocks.js";
import { mockEnv } from "./mocks.js";

/**
 * Create a mock file system for testing
 */
function createMockFs(): FileSystem & { calls: { method: string; args: unknown[] }[]; written: string[] } {
	const calls: { method: string; args: unknown[] }[] = [];
	const written: string[] = [];

	return {
		calls,
		written,
		existsSync: (path: string) => {
			calls.push({ method: "existsSync", args: [path] });
			return false;
		},
		mkdirSync: (path: string, options?: { recursive?: boolean }) => {
			calls.push({ method: "mkdirSync", args: [path, options] });
			return undefined;
		},
		appendFileSync: (path: string, data: string) => {
			calls.push({ method: "appendFileSync", args: [path, data] });
			written.push(data);
		},
	};
}

describe("DebugLogger", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	describe("constructor", () => {
		test("defaults to disabled when CLAUDE_DEBUG is not set", () => {
			env.delete("CLAUDE_DEBUG");
			env.delete("SAVVY_WORKFLOW_DEBUG");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			expect(logger.isEnabled()).toBe(false);
		});

		test("is enabled when CLAUDE_DEBUG is true", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			expect(logger.isEnabled()).toBe(true);
		});

		test("respects explicit enabled option", () => {
			env.set("CLAUDE_DEBUG", "false");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ enabled: true }, mockFs);

			expect(logger.isEnabled()).toBe(true);
		});

		test("uses default prefix when not provided", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			// pluginName required for file writes
			const logger = new DebugLogger({ pluginName: "test-plugin" }, mockFs);

			logger.info("test");

			expect(mockFs.written[0]).toContain("[plugin]");
		});

		test("uses custom prefix when provided", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			// pluginName required for file writes
			const logger = new DebugLogger({ prefix: "my-hook", pluginName: "test-plugin" }, mockFs);

			logger.info("test");

			expect(mockFs.written[0]).toContain("[my-hook]");
		});
	});

	describe("log path", () => {
		test("uses session-env directory when TEST_PLUGIN_ENV_FILE is set", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
			env.delete("CLAUDE_ENV_FILE");
			const mockFs = createMockFs();
			// pluginName is required for file writes - without it, path is empty
			const logger = new DebugLogger({ pluginName: "test-plugin" }, mockFs);

			expect(logger.getLogPath()).toBe("/home/user/.claude/session-env/abc123/test-plugin-debug.log");
		});

		test("uses session-env directory when CLAUDE_ENV_FILE is set", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.delete("TEST_PLUGIN_ENV_FILE");
			env.set("CLAUDE_ENV_FILE", "/home/user/.claude/session-env/xyz789/hook-0.sh");
			const mockFs = createMockFs();
			// pluginName is required for file writes
			const logger = new DebugLogger({ pluginName: "test-plugin" }, mockFs);

			expect(logger.getLogPath()).toBe("/home/user/.claude/session-env/xyz789/test-plugin-debug.log");
		});

		test("returns empty path when no pluginName (prevents race conditions)", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			// No pluginName = no unique file = empty path (skips writes)
			expect(logger.getLogPath()).toBe("");
		});

		test("returns empty path and skips writes when no session env file", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("CLAUDE_PROJECT_DIR", "/custom/project");
			env.delete("TEST_PLUGIN_ENV_FILE");
			env.delete("CLAUDE_ENV_FILE");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			// No session env file means empty path and skipped writes
			expect(logger.getLogPath()).toBe("");

			// Verify writes are skipped
			logger.info("test message");
			expect(mockFs.written).toHaveLength(0);
		});

		test("skips file writes when no session env available", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.delete("CLAUDE_PROJECT_DIR");
			env.delete("TEST_PLUGIN_ENV_FILE");
			env.delete("CLAUDE_ENV_FILE");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			// No session env means empty path
			expect(logger.getLogPath()).toBe("");

			// Writes should be skipped
			logger.debug("test");
			logger.info("test");
			expect(mockFs.written).toHaveLength(0);
		});

		test("uses custom logPath when provided", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ logPath: "/custom/path/debug.log" }, mockFs);

			expect(logger.getLogPath()).toBe("/custom/path/debug.log");
		});

		test("uses plugin-specific filename when pluginName is set", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ pluginName: "workflow" }, mockFs);

			expect(logger.getLogPath()).toBe("/home/user/.claude/session-env/abc123/workflow-debug.log");
		});

		test("uses plugin-specific filename in session env directory", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ pluginName: "bun-plugin-builder" }, mockFs);

			expect(logger.getLogPath()).toBe("/home/user/.claude/session-env/abc123/bun-plugin-builder-debug.log");
		});

		test("explicit logPath takes precedence over pluginName", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ pluginName: "workflow", logPath: "/custom/path/debug.log" }, mockFs);

			expect(logger.getLogPath()).toBe("/custom/path/debug.log");
		});
	});

	describe("logging methods", () => {
		test("does not write when disabled", () => {
			env.set("CLAUDE_DEBUG", "false");
			env.delete("SAVVY_WORKFLOW_DEBUG");
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			logger.debug("test");
			logger.info("test");
			logger.warn("test");
			logger.error("test");

			expect(mockFs.written).toHaveLength(0);
		});

		test("writes debug messages with correct format", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.debug("hello world");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toMatch(/^\[.*\] \[DEBUG\] \[test\] hello world\n$/);
		});

		test("writes info messages with correct format", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.info("hello world");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toMatch(/^\[.*\] \[INFO \] \[test\] hello world\n$/);
		});

		test("writes warn messages with correct format", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.warn("hello world");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toMatch(/^\[.*\] \[WARN \] \[test\] hello world\n$/);
		});

		test("writes error messages with correct format", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.error("hello world");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toMatch(/^\[.*\] \[ERROR\] \[test\] hello world\n$/);
		});

		test("includes additional arguments in output", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.info("processing", "file.ts", 42);

			expect(mockFs.written[0]).toContain("processing file.ts 42");
		});

		test("info splits multi-line messages into separate log entries", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.info("line one\nline two\nline three");

			expect(mockFs.written).toHaveLength(3);
			expect(mockFs.written[0]).toContain("line one");
			expect(mockFs.written[1]).toContain("line two");
			expect(mockFs.written[2]).toContain("line three");
		});

		test("info splits multi-line messages with args into separate log entries", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.info("header\nbody", "extra");

			expect(mockFs.written).toHaveLength(2);
			expect(mockFs.written[0]).toContain("header");
			expect(mockFs.written[1]).toContain("body extra");
		});

		test("debug keeps multi-line messages on single line", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.debug("line one\nline two");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("line one\nline two");
		});
	});

	describe("directory creation", () => {
		test("creates directory if it does not exist", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ logPath: "/project/.claude/debug.log" }, mockFs);

			logger.info("test");

			const mkdirCall = mockFs.calls.find((c) => c.method === "mkdirSync");
			expect(mkdirCall).toBeDefined();
			expect(mkdirCall?.args[0]).toBe("/project/.claude");
			expect(mkdirCall?.args[1]).toEqual({ recursive: true });
		});

		test("does not create directory if it exists", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs: FileSystem = {
				existsSync: () => true,
				mkdirSync: mock(() => undefined),
				appendFileSync: () => {},
			};
			const logger = new DebugLogger({ logPath: "/project/.claude/debug.log" }, mockFs);

			logger.info("test");

			expect(mockFs.mkdirSync).not.toHaveBeenCalled();
		});

		test("checks directory on each write for robustness", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test" }, mockFs);

			logger.info("first");
			logger.info("second");
			logger.info("third");

			const existsCalls = mockFs.calls.filter((c) => c.method === "existsSync");
			expect(existsCalls).toHaveLength(3);
		});
	});

	describe("child logger", () => {
		test("creates child with combined prefix", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "parent", pluginName: "test" }, mockFs);
			const child = logger.child("child");

			child.info("test");

			expect(mockFs.written[0]).toContain("[parent:child]");
		});

		test("child inherits log path", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "parent", logPath: "/custom/path.log" }, mockFs);
			const child = logger.child("child");

			expect(child.getLogPath()).toBe("/custom/path.log");
		});

		test("child inherits enabled state", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "parent", pluginName: "test", enabled: true }, mockFs);
			const child = logger.child("child");

			expect(child.isEnabled()).toBe(true);
		});

		test("child inherits pluginName", () => {
			env.set("CLAUDE_DEBUG", "true");
			env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "parent", pluginName: "workflow" }, mockFs);
			const child = logger.child("child");

			expect(child.getLogPath()).toBe("/home/user/.claude/session-env/abc123/workflow-debug.log");
		});
	});
});

describe("DebugLogger.create", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("creates logger with prefix", () => {
		env.set("CLAUDE_DEBUG", "true");
		const logger = DebugLogger.create("workflow-context");

		expect(logger.isEnabled()).toBe(true);
	});

	test("accepts additional options", () => {
		const logger = DebugLogger.create("test", { enabled: true, logPath: "/custom/path.log" });

		expect(logger.isEnabled()).toBe(true);
		expect(logger.getLogPath()).toBe("/custom/path.log");
	});

	test("uses explicit pluginName option for log file path", () => {
		env.set("CLAUDE_DEBUG", "true");
		env.set("TEST_PLUGIN_ENV_FILE", "/home/user/.claude/session-env/abc123/hook-0.sh");
		const logger = DebugLogger.create("my-hook", { pluginName: "custom-plugin" });

		expect(logger.getLogPath()).toBe("/home/user/.claude/session-env/abc123/custom-plugin-debug.log");
	});
});

describe("timing functionality", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		// Set session env file so file writes work
		env = mockEnv({ TEST_PLUGIN_ENV_FILE: "/tmp/session-env/abc/hook-0.sh" });
	});

	afterEach(() => {
		env.restore();
	});

	describe("time() method", () => {
		test("returns a timer that can be stopped", () => {
			env.set("CLAUDE_DEBUG", "true");
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const timer = logger.time("operation");
			const duration = timer.stop();

			expect(duration).toBeGreaterThanOrEqual(0);
			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] operation:");
		});

		test("elapsed() returns current duration without stopping", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const timer = logger.time("operation");
			const elapsed1 = timer.elapsed();
			const elapsed2 = timer.elapsed();

			expect(elapsed1).toBeGreaterThanOrEqual(0);
			expect(elapsed2).toBeGreaterThanOrEqual(elapsed1);
			// Should not have logged yet since we didn't call stop()
			expect(mockFs.written).toHaveLength(0);
		});

		test("does not log when disabled", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: false }, mockFs);

			const timer = logger.time("operation");
			timer.stop();

			expect(mockFs.written).toHaveLength(0);
		});
	});

	describe("timeAsync() method", () => {
		test("times an async function and returns its result", async () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const result = await logger.timeAsync("async-op", async () => {
				return "success";
			});

			expect(result).toBe("success");
			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] async-op:");
		});

		test("logs timing even when function throws", async () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			await expect(
				logger.timeAsync("failing-op", async () => {
					throw new Error("test error");
				}),
			).rejects.toThrow("test error");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] failing-op:");
		});
	});

	describe("timing property (TimingTracker)", () => {
		test("provides access to TimingTracker", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			expect(logger.timing).toBeDefined();
			expect(typeof logger.timing.start).toBe("function");
			expect(typeof logger.timing.end).toBe("function");
			expect(typeof logger.timing.getSummary).toBe("function");
		});

		test("start/end tracks timing", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			logger.timing.start("step1");
			const duration = logger.timing.end("step1");

			expect(duration).toBeGreaterThanOrEqual(0);
		});

		test("logStep logs the duration", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			logger.timing.start("step1");
			logger.timing.logStep("step1");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] step1:");
		});

		test("track logs parallel operation timing", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const start = performance.now();
			const end = start + 100;
			logger.timing.track("parallel-op", start, end);

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] parallel-op: 100.00ms");
		});

		test("getSummary returns formatted summary", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			logger.timing.start("total");
			logger.timing.start("step1");
			logger.timing.end("step1");
			logger.timing.start("step2");
			logger.timing.end("step2");
			logger.timing.end("total");

			const summary = logger.timing.getSummary();

			expect(summary).toContain("=== Timing Summary ===");
			expect(summary).toContain("total:");
			expect(summary).toContain("step1:");
			expect(summary).toContain("step2:");
			expect(summary).toContain("Total:");
		});

		test("getSummary returns empty string when disabled", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: false }, mockFs);

			logger.timing.start("step1");
			logger.timing.end("step1");

			const summary = logger.timing.getSummary();
			expect(summary).toBe("");
		});

		test("end returns 0 for unknown label", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const duration = logger.timing.end("unknown");

			expect(duration).toBe(0);
			expect(mockFs.written[0]).toContain("Warning: no timing entry");
		});
	});

	describe("trackParallel() method", () => {
		test("tracks parallel promise timing", async () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const result = await logger.trackParallel("parallel-task", Promise.resolve("done"));

			expect(result).toBe("done");
			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("[timing] parallel-task:");
		});

		test("works with Promise.all", async () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			const [a, b] = await Promise.all([
				logger.trackParallel("task-a", Promise.resolve(1)),
				logger.trackParallel("task-b", Promise.resolve(2)),
			]);

			expect(a).toBe(1);
			expect(b).toBe(2);
			expect(mockFs.written).toHaveLength(2);
		});
	});

	describe("getTimingSummary() convenience method", () => {
		test("returns timing summary", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ prefix: "test", pluginName: "test", enabled: true }, mockFs);

			logger.timing.start("total");
			logger.timing.end("total");

			const summary = logger.getTimingSummary();

			expect(summary).toContain("=== Timing Summary ===");
		});
	});
});

describe("getProjectDir", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("returns CLAUDE_PROJECT_DIR when set", () => {
		env.set("CLAUDE_PROJECT_DIR", "/custom/claude/project");

		expect(getProjectDir()).toBe("/custom/claude/project");
	});

	test("returns cwd when CLAUDE_PROJECT_DIR is not set", () => {
		env.delete("CLAUDE_PROJECT_DIR");

		expect(getProjectDir()).toBe(process.cwd());
	});
});

describe("DebugLogger OTEL integration", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = mockEnv({});
		// Set session env file so file writes work
		env.set("TEST_PLUGIN_ENV_FILE", "/tmp/session-env/abc/hook-0.sh");
	});

	afterEach(() => {
		env.restore();
	});

	describe("sessionId", () => {
		test("accepts sessionId in constructor options", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({ sessionId: "test-session-123" }, mockFs);

			expect(logger.getSessionId()).toBe("test-session-123");
		});

		test("sessionId is undefined by default", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			expect(logger.getSessionId()).toBeUndefined();
		});

		test("setSessionContext updates sessionId", () => {
			const mockFs = createMockFs();
			const logger = new DebugLogger({}, mockFs);

			expect(logger.getSessionId()).toBeUndefined();

			logger.setSessionContext("new-session-456");

			expect(logger.getSessionId()).toBe("new-session-456");
		});

		test("child logger inherits sessionId", () => {
			const mockFs = createMockFs();
			const parent = new DebugLogger({ sessionId: "parent-session" }, mockFs);
			const child = parent.child("child-prefix");

			expect(child.getSessionId()).toBe("parent-session");
		});

		test("child logger inherits sessionId set via setSessionContext", () => {
			const mockFs = createMockFs();
			const parent = new DebugLogger({}, mockFs);
			parent.setSessionContext("dynamic-session");

			const child = parent.child("child-prefix");

			expect(child.getSessionId()).toBe("dynamic-session");
		});
	});

	describe("OTEL dual-write behavior", () => {
		test("does not emit to sidecar when OTEL is disabled", () => {
			// OTEL is disabled by default (no CLAUDE_CODE_ENABLE_TELEMETRY=1)
			const mockFs = createMockFs();
			// pluginName required for file writes
			const logger = new DebugLogger({ pluginName: "test", enabled: true, sessionId: "test-session" }, mockFs);

			// This should write to file but NOT attempt OTEL emit
			logger.info("test message");

			// File write should occur
			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("test message");
		});

		test("does not emit to sidecar when sessionId is not set", () => {
			// Even if OTEL were enabled, no sessionId means no emit
			const mockFs = createMockFs();
			// pluginName required for file writes
			const logger = new DebugLogger({ pluginName: "test", enabled: true }, mockFs);

			logger.info("test message");

			// File write should occur
			expect(mockFs.written).toHaveLength(1);
		});

		test("diag level never emits to sidecar", () => {
			const mockFs = createMockFs();
			// pluginName required for file writes
			const logger = new DebugLogger({ pluginName: "test", sessionId: "test-session" }, mockFs);

			// diag always writes to file, never to OTEL
			logger.diag("diagnostic message");

			expect(mockFs.written).toHaveLength(1);
			expect(mockFs.written[0]).toContain("diagnostic message");
		});
	});
});
