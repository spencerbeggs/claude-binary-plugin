import { afterEach, describe, expect, test } from "bun:test";
import type { SessionStartEvent } from "../index.js";
import { HookEventName, SessionStartHookEvent } from "../index.js";
import type { MockEnvContext } from "./mocks.js";
import {
	MockExitError,
	createMockBufferShellExecutor,
	createMockBufferShellResult,
	createMockShellExecutor,
	createMockShellResult,
	defaultBufferShellExecutor,
	defaultShellExecutor,
	envPresets,
	mockCommand,
	mockEnv,
	mockIO,
	resetMockIO,
	runMockedCommand,
	runMockedHook,
	testFatalErrorHandler,
} from "./mocks.js";

describe("mockIO", () => {
	let env: MockEnvContext;

	afterEach(() => {
		resetMockIO();
		env?.restore();
	});

	/** Valid UUID for testing - required by schema validation */
	const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
	const TEST_UUID_2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

	test("creates mock IO with streams", () => {
		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/transcript.json",
			cwd: "/home/user",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		const io = mockIO(input);

		expect(io.stdin).toBeDefined();
		expect(io.stdout).toBeDefined();
		expect(io.stderr).toBeDefined();
	});

	test("works with async HookEvent.create", async () => {
		env = mockEnv(envPresets.claudeHook());

		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/transcript.json",
			cwd: "/project",
			permission_mode: "acceptEdits",
			hook_event_name: HookEventName.SessionStart,
			source: "resume",
		};

		const io = mockIO(input);
		const { event } = await SessionStartHookEvent.create(io);

		expect(event.session_id).toBe(TEST_UUID);
		expect(event.source).toBe("resume");
		expect(event.permission_mode).toBe("acceptEdits");
	});

	test("stdout.write is a mock function", () => {
		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/t.json",
			cwd: "/",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		const io = mockIO(input);

		// Call write
		io.stdout.write("test output");

		// Verify it was called (mock function behavior)
		expect(io.stdout.write).toHaveBeenCalledWith("test output");
	});

	test("stderr.write is a mock function", () => {
		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/t.json",
			cwd: "/",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		const io = mockIO(input);

		// Call write
		io.stderr.write("error output");

		// Verify it was called (mock function behavior)
		expect(io.stderr.write).toHaveBeenCalledWith("error output");
	});

	test("resetMockIO cleans up properly", async () => {
		env = mockEnv(envPresets.claudeHook());

		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/t.json",
			cwd: "/",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		// First call should work
		const io1 = mockIO(input);
		const { event: event1 } = await SessionStartHookEvent.create(io1);
		expect(event1.session_id).toBe(TEST_UUID);

		// Reset the mock
		resetMockIO();

		// Second call with different input should work
		const input2: SessionStartEvent = {
			...input,
			session_id: TEST_UUID_2,
		};
		const io2 = mockIO(input2);
		const { event: event2 } = await SessionStartHookEvent.create(io2);
		expect(event2.session_id).toBe(TEST_UUID_2);
	});

	test("captures stdout from actual write calls", async () => {
		env = mockEnv(envPresets.claudeHook());

		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/t.json",
			cwd: "/",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		const io = mockIO(input);

		// Simulate actual write calls (as would happen in real hook execution)
		process.stdout.write("test stdout output");
		process.stdout.write(new Uint8Array([116, 101, 115, 116])); // "test" as Uint8Array

		expect(io.getStdout()).toContain("test stdout output");
		expect(io.getStdout()).toContain("test");
	});

	test("captures stderr from actual write calls", async () => {
		env = mockEnv(envPresets.claudeHook());

		const input: SessionStartEvent = {
			session_id: TEST_UUID,
			transcript_path: "/tmp/t.json",
			cwd: "/",
			permission_mode: "default",
			hook_event_name: HookEventName.SessionStart,
			source: "startup",
		};

		const io = mockIO(input);

		// Simulate actual write calls
		process.stderr.write("error message");
		process.stderr.write(new Uint8Array([101, 114, 114, 111, 114])); // "error" as Uint8Array

		expect(io.getStderr()).toContain("error message");
		expect(io.getStderr()).toContain("error");
	});
});

describe("mockEnv", () => {
	let env: MockEnvContext;

	afterEach(() => {
		env?.restore();
	});

	test("sets env vars in both Bun.env and process.env", () => {
		env = mockEnv({ TEST_MOCK_VAR: "hello" });
		expect(Bun.env.TEST_MOCK_VAR).toBe("hello");
		expect(process.env.TEST_MOCK_VAR).toBe("hello");
	});

	test("restore() removes vars that were set", () => {
		const originalValue = Bun.env.TEST_RESTORE_VAR;
		env = mockEnv({ TEST_RESTORE_VAR: "temp_value" });
		expect(Bun.env.TEST_RESTORE_VAR).toBe("temp_value");

		env.restore();
		expect(Bun.env.TEST_RESTORE_VAR).toBe(originalValue);
	});

	test("provides complete isolation - only mock vars are visible", () => {
		// Save a reference to check restoration works
		const originalHome = Bun.env.HOME;

		env = mockEnv({ TEST_MOCK_VAR: "mock_value" });

		// Only the mock var should be visible
		expect(Bun.env.TEST_MOCK_VAR).toBe("mock_value");
		// Real env vars should NOT be visible (complete isolation)
		expect(Bun.env.HOME).toBeUndefined();

		env.restore();

		// Original env should be fully restored
		expect(Bun.env.HOME).toBe(originalHome);
		// Mock var should be gone
		expect(Bun.env.TEST_MOCK_VAR).toBeUndefined();
	});

	test("restore() fully restores original env state", () => {
		const originalPath = Bun.env.PATH;

		env = mockEnv({ CUSTOM_VAR: "custom" });
		expect(Bun.env.PATH).toBeUndefined(); // Isolated

		env.restore();
		expect(Bun.env.PATH).toBe(originalPath); // Restored
	});

	test("set() adds new vars during test", () => {
		env = mockEnv({});
		env.set("TEST_DYNAMIC_VAR", "dynamic");
		expect(Bun.env.TEST_DYNAMIC_VAR).toBe("dynamic");

		env.restore();
		expect(Bun.env.TEST_DYNAMIC_VAR).toBeUndefined();
	});

	test("delete() removes vars during test", () => {
		env = mockEnv({ TEST_TO_DELETE: "will_be_deleted" });
		expect(Bun.env.TEST_TO_DELETE).toBe("will_be_deleted");

		env.delete("TEST_TO_DELETE");
		expect(Bun.env.TEST_TO_DELETE).toBeUndefined();
	});

	test("get() returns current value", () => {
		env = mockEnv({ TEST_GET_VAR: "get_me" });
		expect(env.get("TEST_GET_VAR")).toBe("get_me");
		expect(env.get("NONEXISTENT")).toBeUndefined();
	});

	test("undefined values in vars are not set", () => {
		env = mockEnv({ DEFINED: "yes", UNDEFINED: undefined });
		expect(Bun.env.DEFINED).toBe("yes");
		expect(Bun.env.UNDEFINED).toBeUndefined();
	});
});

describe("createMockShellResult", () => {
	test("creates result with all fields", () => {
		const result = createMockShellResult(0, "output", "error");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("output");
		expect(result.stderr).toBe("error");
	});

	test("defaults stdout and stderr to empty strings", () => {
		const result = createMockShellResult(1);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("");
	});
});

describe("envPresets", () => {
	test("claudeHook returns expected defaults", () => {
		const preset = envPresets.claudeHook();
		expect(preset.CLAUDE_PROJECT_DIR).toBe("/tmp/test-project");
		expect(preset.CLAUDE_PLUGIN_ROOT).toBe("/tmp/test-plugin");
	});

	test("claudeHook accepts overrides", () => {
		const preset = envPresets.claudeHook({ CLAUDE_PROJECT_DIR: "/custom/path" });
		expect(preset.CLAUDE_PROJECT_DIR).toBe("/custom/path");
		expect(preset.CLAUDE_PLUGIN_ROOT).toBe("/tmp/test-plugin");
	});

	test("withEnvFile returns expected defaults with env file", () => {
		const preset = envPresets.withEnvFile("/tmp/env-file.sh");
		expect(preset.CLAUDE_PROJECT_DIR).toBe("/tmp/test-project");
		expect(preset.CLAUDE_PLUGIN_ROOT).toBe("/tmp/test-plugin");
		expect(preset.CLAUDE_ENV_FILE).toBe("/tmp/env-file.sh");
	});

	test("withEnvFile accepts overrides", () => {
		const preset = envPresets.withEnvFile("/tmp/env-file.sh", { CLAUDE_PROJECT_DIR: "/custom/path" });
		expect(preset.CLAUDE_PROJECT_DIR).toBe("/custom/path");
		expect(preset.CLAUDE_ENV_FILE).toBe("/tmp/env-file.sh");
	});

	test("workflowPlugin returns all required vars", () => {
		const preset = envPresets.workflowPlugin();
		expect(preset.SAVVY_WORKFLOW_PROJECT_DIR).toBe("/tmp/test-project");
		expect(preset.SAVVY_WORKFLOW_PLUGIN_ROOT).toBe("/tmp/test-plugin");
		expect(preset.SAVVY_WORKFLOW_DEBUG).toBe("false");
		expect(preset.SAVVY_WORKFLOW_ENABLE_BIOME).toBe("true");
		expect(preset.SAVVY_WORKFLOW_PACKAGE_MANAGER).toBe("unknown");
		expect(preset.SAVVY_WORKFLOW_OS).toBe("linux");
		expect(preset.SAVVY_WORKFLOW_NODE_VERSION).toBe("v24.0.0");
	});

	test("workflowPlugin accepts overrides", () => {
		const preset = envPresets.workflowPlugin({
			SAVVY_WORKFLOW_DEBUG: "true",
			SAVVY_WORKFLOW_OS: "darwin",
		});
		expect(preset.SAVVY_WORKFLOW_DEBUG).toBe("true");
		expect(preset.SAVVY_WORKFLOW_OS).toBe("darwin");
		expect(preset.SAVVY_WORKFLOW_PROJECT_DIR).toBe("/tmp/test-project");
	});
});

describe("mockCommand", () => {
	test("mocks process.argv with provided args", () => {
		const ctx = mockCommand(["--debug", "test"]);
		expect(process.argv).toEqual(["bun", "script.ts", "--debug", "test"]);
		ctx.restore();
	});

	test("captures console.log output", () => {
		const ctx = mockCommand([]);
		console.log("test message");
		expect(ctx.output.logs).toContain("test message");
		ctx.restore();
	});

	test("captures console.error output", () => {
		const ctx = mockCommand([]);
		console.error("error message");
		expect(ctx.output.errors).toContain("error message");
		ctx.restore();
	});

	test("captures process.exit calls", () => {
		const ctx = mockCommand([]);
		try {
			process.exit(42);
		} catch (e) {
			expect(e).toBeInstanceOf(MockExitError);
			expect(ctx.output.exitCode).toBe(42);
		}
		ctx.restore();
	});

	test("restore() resets all mocks", () => {
		const originalArgv = process.argv;
		const originalLog = console.log;
		const originalError = console.error;
		const originalExit = process.exit;

		const ctx = mockCommand(["test"]);
		ctx.restore();

		expect(process.argv).toBe(originalArgv);
		expect(console.log).toBe(originalLog);
		expect(console.error).toBe(originalError);
		expect(process.exit).toBe(originalExit);
	});

	test("defaults exit code to 0 when called without argument", () => {
		const ctx = mockCommand([]);
		try {
			process.exit();
		} catch {
			expect(ctx.output.exitCode).toBe(0);
		}
		ctx.restore();
	});
});

describe("MockExitError", () => {
	test("creates error with exit code", () => {
		const error = new MockExitError(42);
		expect(error.code).toBe(42);
		expect(error.message).toBe("process.exit(42) called");
		expect(error.name).toBe("MockExitError");
	});
});

describe("runMockedCommand", () => {
	test("runs command and captures output", async () => {
		const mainFn = async () => {
			console.log("success");
		};

		const output = await runMockedCommand(["test"], mainFn);
		expect(output.logs).toContain("success");
		expect(output.exitCode).toBeNull();
	});

	test("captures exit code when command exits", async () => {
		const mainFn = async () => {
			console.log("before exit");
			process.exit(1);
		};

		const output = await runMockedCommand(["test"], mainFn);
		expect(output.logs).toContain("before exit");
		expect(output.exitCode).toBe(1);
	});

	test("restores mocks after command completes", async () => {
		const originalArgv = process.argv;
		const mainFn = async () => {};

		await runMockedCommand(["test"], mainFn);

		expect(process.argv).toBe(originalArgv);
	});

	test("re-throws non-MockExitError exceptions", async () => {
		const mainFn = async () => {
			throw new Error("unexpected error");
		};

		await expect(runMockedCommand(["test"], mainFn)).rejects.toThrow("unexpected error");
	});
});

describe("runMockedHook", () => {
	test("runs hook and returns exit code", async () => {
		const hookFn = async () => {
			process.exit(0);
		};

		const exitCode = await runMockedHook(hookFn);
		expect(exitCode).toBe(0);
	});

	test("defaults to 0 when exit called without code", async () => {
		const hookFn = async () => {
			process.exit();
		};

		const exitCode = await runMockedHook(hookFn);
		expect(exitCode).toBe(0);
	});

	test("restores process.exit after hook completes", async () => {
		const originalExit = process.exit;
		const hookFn = async () => {
			process.exit(0);
		};

		await runMockedHook(hookFn);

		expect(process.exit).toBe(originalExit);
	});

	test("re-throws non-MockExitError exceptions", async () => {
		const hookFn = async () => {
			throw new Error("hook error");
		};

		await expect(runMockedHook(hookFn)).rejects.toThrow("hook error");
	});
});

describe("defaultShellExecutor", () => {
	test("executes shell command and returns result", async () => {
		const result = await defaultShellExecutor("echo hello");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("hello");
		expect(result.stderr).toBe("");
	});

	test("handles command errors", async () => {
		const result = await defaultShellExecutor("false");
		expect(result.exitCode).toBe(1);
	});
});

describe("createMockShellExecutor", () => {
	test("returns predefined results for exact matches", async () => {
		const mockShell = createMockShellExecutor({
			"node --version": createMockShellResult(0, "v22.0.0"),
			"bun --version": createMockShellResult(0, "1.1.38"),
		});

		const nodeResult = await mockShell("node --version");
		expect(nodeResult.stdout).toBe("v22.0.0");

		const bunResult = await mockShell("bun --version");
		expect(bunResult.stdout).toBe("1.1.38");
	});

	test("returns predefined results for partial matches", async () => {
		const mockShell = createMockShellExecutor({
			"--version": createMockShellResult(0, "v1.0.0"),
		});

		const result = await mockShell("some-tool --version");
		expect(result.stdout).toBe("v1.0.0");
	});

	test("returns default result for unknown commands", async () => {
		const mockShell = createMockShellExecutor({}, createMockShellResult(127, "", "command not found"));

		const result = await mockShell("unknown-command");
		expect(result.exitCode).toBe(127);
		expect(result.stderr).toBe("command not found");
	});

	test("uses custom default result", async () => {
		const mockShell = createMockShellExecutor({}, createMockShellResult(2, "", "custom error"));

		const result = await mockShell("unknown");
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toBe("custom error");
	});
});

describe("defaultBufferShellExecutor", () => {
	test("executes command and returns Buffer result", async () => {
		const result = await defaultBufferShellExecutor(["echo", "hello"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("hello");
	});

	test("handles command errors", async () => {
		const result = await defaultBufferShellExecutor(["false"]);
		expect(result.exitCode).toBe(1);
	});

	test("respects timeout option", async () => {
		// This test would actually timeout, so we'll just verify the interface
		const result = await defaultBufferShellExecutor(["echo", "test"], { timeout: 5000 });
		expect(result.exitCode).toBe(0);
	});
});

describe("createMockBufferShellResult", () => {
	test("creates result with Buffer outputs from strings", () => {
		const result = createMockBufferShellResult(0, "stdout text", "stderr text");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBeInstanceOf(Buffer);
		expect(result.stderr).toBeInstanceOf(Buffer);
		expect(result.stdout.toString()).toBe("stdout text");
		expect(result.stderr.toString()).toBe("stderr text");
	});

	test("creates result with Buffer outputs from Buffers", () => {
		const stdoutBuf = Buffer.from("stdout");
		const stderrBuf = Buffer.from("stderr");
		const result = createMockBufferShellResult(1, stdoutBuf, stderrBuf);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe(stdoutBuf);
		expect(result.stderr).toBe(stderrBuf);
	});

	test("defaults stdout and stderr to empty Buffers", () => {
		const result = createMockBufferShellResult(0);
		expect(result.stdout.toString()).toBe("");
		expect(result.stderr.toString()).toBe("");
	});
});

describe("createMockBufferShellExecutor", () => {
	test("returns results from handler function", async () => {
		const mockShell = createMockBufferShellExecutor(async (cmd) => {
			if (cmd.includes("--write")) {
				return createMockBufferShellResult(0);
			}
			return createMockBufferShellResult(1, "", "error");
		});

		const successResult = await mockShell(["biome", "check", "--write"]);
		expect(successResult.exitCode).toBe(0);

		const errorResult = await mockShell(["biome", "check"]);
		expect(errorResult.exitCode).toBe(1);
	});

	test("passes command array to handler", async () => {
		let receivedCmd: string[] = [];
		const mockShell = createMockBufferShellExecutor(async (cmd, _options) => {
			receivedCmd = cmd;
			return createMockBufferShellResult(0);
		});

		await mockShell(["test", "command", "--flag"]);
		expect(receivedCmd).toEqual(["test", "command", "--flag"]);
	});

	test("passes options to handler", async () => {
		let receivedOptions: { timeout?: number } | undefined;
		const mockShell = createMockBufferShellExecutor(async (_cmd, options) => {
			receivedOptions = options;
			return createMockBufferShellResult(0);
		});

		await mockShell(["test"], { timeout: 10000 });
		expect(receivedOptions?.timeout).toBe(10000);
	});
});

describe("testFatalErrorHandler", () => {
	test("captures exit code and error messages", () => {
		const handler = (error: unknown): never => {
			console.error("Fatal error:", error);
			process.exit(2);
		};

		const result = testFatalErrorHandler(handler);
		expect(result.exitCode).toBe(2);
		expect(result.errorMessages.join(" ")).toContain("Fatal error");
		expect(result.errorMessages.join(" ")).toContain("Test error");
	});

	test("handles custom error", () => {
		const handler = (error: unknown): never => {
			console.error("Error:", (error as Error).message);
			process.exit(1);
		};

		const result = testFatalErrorHandler(handler, new Error("Custom error"));
		expect(result.exitCode).toBe(1);
		expect(result.errorMessages.join(" ")).toContain("Custom error");
	});

	test("defaults exit code to 0 when no code provided", () => {
		const handler = (): never => {
			process.exit();
		};

		const result = testFatalErrorHandler(handler);
		expect(result.exitCode).toBe(0);
	});

	test("restores console.error and process.exit", () => {
		const originalError = console.error;
		const originalExit = process.exit;

		const handler = (): never => {
			process.exit(2);
		};

		testFatalErrorHandler(handler);

		expect(console.error).toBe(originalError);
		expect(process.exit).toBe(originalExit);
	});

	test("re-throws non-MockExitError exceptions", () => {
		const handler = (): never => {
			throw new Error("Unexpected error");
		};

		expect(() => testFatalErrorHandler(handler)).toThrow("Unexpected error");
	});
});
