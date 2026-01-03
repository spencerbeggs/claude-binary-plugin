/**
 * Testing utilities for Claude Code plugins.
 *
 * @remarks
 * This module provides mocking utilities for testing hook handlers and
 * commands without requiring actual Claude Code integration.
 *
 * **Key Utilities:**
 * - {@link Mocks.IO} - Mock stdin/stdout for hook testing
 * - {@link Mocks.Env} - Mock environment variables
 * - {@link Mocks.Command} - Run command handlers with mocked I/O
 * - {@link Mocks.Shell} - Mock shell command execution
 *
 * **Testing Philosophy:**
 * Plugin tests should be isolated and fast. These utilities enable:
 * - Injecting JSON input to simulate Claude Code events
 * - Capturing JSON output for assertion
 * - Mocking environment variables without affecting real env
 * - Mocking shell commands for deterministic results
 *
 * @example
 * ```typescript
 * import { Mocks } from "claude-binary-plugin";
 *
 * test("hook blocks dangerous command", async () => {
 *   const io = Mocks.IO.create({
 *     tool_name: "Bash",
 *     tool_input: { command: "rm -rf /" },
 *   });
 *
 *   await Mocks.Hook.run(myHook);
 *
 *   const output = JSON.parse(io.getStdout());
 *   expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
 * });
 * ```
 *
 * @see {@link MockIOResult} - Captured I/O interface
 * @see {@link MockEnvContext} - Environment mock context
 * @module
 */
import { mock, spyOn } from "bun:test";
import { $ } from "bun";
import { ClaudeBinaryPluginEnv } from "../env/plugin-env.js";
import type { HookEventBase, IO } from "../events/types.js";

// =============================================================================
// LOGGER MOCKS
// =============================================================================

/**
 * No-op logger methods for testing.
 * Spread this into test env objects to satisfy BaseEnv requirements.
 *
 * @example
 * ```ts
 * const env = {
 *   projectDir: "/test",
 *   pluginDir: "/plugins/test",
 *   pluginEnvFile: "/tmp/env",
 *   ...mockLogger(),
 *   // ... other state
 * };
 * ```
 *
 * @public
 */
export function mockLogger(): {
	log: (message: string, ...args: unknown[]) => void;
	info: (message: string, ...args: unknown[]) => void;
	debug: (message: string, ...args: unknown[]) => void;
} {
	const noop = () => {};
	return {
		log: noop,
		info: noop,
		debug: noop,
	};
}

// =============================================================================
// MOCK ENV CLASS
// =============================================================================

/**
 * Mock environment class for testing.
 * @public
 */
export class MockEnv extends ClaudeBinaryPluginEnv {
	protected readonly prefix = "MOCK";
}

/**
 * Captured output from mockIO.
 * Use getStdout() and getStderr() to retrieve captured output as strings.
 *
 * @public
 */
export interface MockIOResult extends IO {
	/** Get all captured stdout output as a string */
	getStdout: () => string;
	/** Get all captured stderr output as a string */
	getStderr: () => string;
	/** Mock environment class */
	envClass: typeof MockEnv;
}

/**
 * Creates a mock IO that works with async create() methods.
 * Mocks Bun.stdin.text() to return the JSON-serialized input.
 * Also mocks process.stdout.write and process.stderr.write to capture and suppress output.
 *
 * @typeParam T - The type of the hook event input, must extend HookEventBase
 * @returns MockIOResult with IO interface plus getStdout() and getStderr() methods
 *
 * @example
 * ```ts
 * const io = mockIO({ tool_name: "Write", ... });
 * await runMockedHook(main);
 *
 * // Examine captured output
 * const output = JSON.parse(io.getStdout());
 * expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
 * ```
 *
 * @public
 */
export function mockIO<T extends HookEventBase>(input: T): MockIOResult {
	const inputStr = JSON.stringify(input);

	// Buffers to capture output
	let stdoutBuffer = "";
	let stderrBuffer = "";

	// Mock Bun.stdin.text() to return the input
	spyOn(Bun.stdin, "text").mockResolvedValue(inputStr);

	// Mock process.stdout.write to capture and suppress JSON output during tests
	spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
		stdoutBuffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
		return true;
	});

	// Mock process.stderr.write to capture and suppress error output during tests
	spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
		stderrBuffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
		return true;
	});

	return {
		stdin: process.stdin,
		stdout: {
			write: mock(() => true),
		} as unknown as typeof process.stdout,
		stderr: {
			write: mock(() => true),
		} as unknown as typeof process.stderr,
		envClass: MockEnv,
		getStdout: () => stdoutBuffer,
		getStderr: () => stderrBuffer,
	};
}

/**
 * Resets all mocks created by mockIO().
 * Call this in afterEach() to clean up between tests.
 *
 * @public
 */
export function resetMockIO(): void {
	// @ts-expect-error - accessing mock restore
	if (Bun.stdin.text.mockRestore) {
		// @ts-expect-error - accessing mock restore
		Bun.stdin.text.mockRestore();
	}
	// @ts-expect-error - accessing mock restore
	if (process.stdout.write.mockRestore) {
		// @ts-expect-error - accessing mock restore
		process.stdout.write.mockRestore();
	}
	// @ts-expect-error - accessing mock restore
	if (process.stderr.write.mockRestore) {
		// @ts-expect-error - accessing mock restore
		process.stderr.write.mockRestore();
	}
}

// =============================================================================
// COMMAND MOCKING UTILITIES
// =============================================================================

/**
 * Result of capturing command output
 *
 * @public
 */
export interface CommandOutput {
	logs: string[];
	errors: string[];
	exitCode: number | null;
}

/**
 * Mock context for command testing
 *
 * @public
 */
export interface MockCommandContext {
	output: CommandOutput;
	restore: () => void;
}

/**
 * Creates mocks for testing CLI commands.
 * Captures console.log, console.error, and process.exit calls.
 *
 * @param args - CLI arguments to mock (without 'bun' and script name)
 * @returns MockCommandContext with captured output and restore function
 *
 * @example
 * ```ts
 * const ctx = mockCommand(["my-plugin", "--description", "A plugin"]);
 * main();
 * expect(ctx.output.logs).toContain("Success");
 * ctx.restore();
 * ```
 *
 * @public
 */
export function mockCommand(args: string[]): MockCommandContext {
	const originalArgv = process.argv;
	const originalLog = console.log;
	const originalError = console.error;
	const originalExit = process.exit;

	const output: CommandOutput = {
		logs: [],
		errors: [],
		exitCode: null,
	};

	// Mock process.argv
	process.argv = ["bun", "script.ts", ...args];

	// Mock console.log
	console.log = mock((...args: unknown[]) => {
		output.logs.push(args.map(String).join(" "));
	}) as typeof console.log;

	// Mock console.error
	console.error = mock((...args: unknown[]) => {
		output.errors.push(args.map(String).join(" "));
	}) as typeof console.error;

	// Mock process.exit
	process.exit = mock((code?: number) => {
		output.exitCode = code ?? 0;
		// Don't actually exit - throw to stop execution
		throw new MockExitError(code ?? 0);
	}) as typeof process.exit;

	const restore = () => {
		process.argv = originalArgv;
		console.log = originalLog;
		console.error = originalError;
		process.exit = originalExit;
	};

	return { output, restore };
}

/**
 * Error thrown when mocked process.exit is called.
 * Catch this in tests to verify exit behavior.
 *
 * @public
 */
export class MockExitError extends Error {
	constructor(public readonly code: number) {
		super(`process.exit(${code}) called`);
		this.name = "MockExitError";
	}
}

/**
 * Helper to run a command main function with mocked context.
 * Automatically handles MockExitError and captures output.
 *
 * @param args - CLI arguments
 * @param mainFn - The main function to run
 * @returns CommandOutput with captured logs, errors, and exit code
 *
 * @example
 * ```ts
 * const output = await runMockedCommand(["my-plugin"], main);
 * expect(output.exitCode).toBe(0);
 * expect(output.logs.join("\n")).toContain("Success");
 * ```
 *
 * @public
 */
export async function runMockedCommand(args: string[], mainFn: () => Promise<void>): Promise<CommandOutput> {
	const ctx = mockCommand(args);
	try {
		await mainFn();
	} catch (error) {
		if (!(error instanceof MockExitError)) {
			ctx.restore();
			throw error;
		}
	}
	const result = { ...ctx.output };
	ctx.restore();
	return result;
}

// =============================================================================
// HOOK MOCKING UTILITIES
// =============================================================================

/**
 * Helper to run a hook main function with mocked process.exit.
 * Hook main functions call event.end() which internally calls process.exit().
 * This helper mocks process.exit to throw MockExitError instead of terminating.
 *
 * @param mainFn - The hook main function to run
 * @returns The exit code passed to process.exit
 *
 * @example
 * ```ts
 * import { mockIO, resetMockIO, runMockedHook } from "claude-binary-plugin";
 * import { main } from "./my-hook.js";
 *
 * afterEach(() => resetMockIO());
 *
 * test("hook exits with 0 for valid input", async () => {
 *   mockIO({ tool_name: "Write", ... });
 *   const exitCode = await runMockedHook(main);
 *   expect(exitCode).toBe(0);
 * });
 * ```
 *
 * @public
 */
export async function runMockedHook(mainFn: () => Promise<void>): Promise<number> {
	const originalExit = process.exit;
	let exitCode = 0;

	process.exit = mock((code?: number) => {
		exitCode = code ?? 0;
		throw new MockExitError(code ?? 0);
	}) as typeof process.exit;

	try {
		await mainFn();
	} catch (error) {
		if (!(error instanceof MockExitError)) {
			process.exit = originalExit;
			throw error;
		}
	}

	process.exit = originalExit;
	return exitCode;
}

// =============================================================================
// SHELL EXECUTOR UTILITIES
// =============================================================================

// ShellResult and ShellExecutor types are re-exported from ../build/builder.js at the top of this file

import type { ShellExecutor, ShellResult } from "../build/builder.js";

/**
 * Default shell executor using Bun.$.
 * Executes commands quietly with nothrow to capture all output.
 *
 * @public
 */
export const defaultShellExecutor: ShellExecutor = async (cmd: string) => {
	const result = await $`${{ raw: cmd }}`.quiet().nothrow();
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString().trim(),
		stderr: result.stderr.toString().trim(),
	};
};

/**
 * Creates a mock ShellResult for testing.
 *
 * @param exitCode - The exit code (0 for success)
 * @param stdout - Standard output content
 * @param stderr - Standard error content
 * @returns A ShellResult object
 *
 * @example
 * ```typescript
 * const successResult = createMockShellResult(0, "v22.0.0");
 * const errorResult = createMockShellResult(1, "", "command not found");
 * ```
 *
 * @public
 */
export function createMockShellResult(exitCode: number, stdout = "", stderr = ""): ShellResult {
	return { exitCode, stdout, stderr };
}

/**
 * Creates a mock shell executor with predefined responses.
 *
 * @param responses - Map of command patterns to results
 * @param defaultResult - Result for unmatched commands (defaults to exit code 127)
 * @returns A ShellExecutor that returns predefined results
 *
 * @example
 * ```typescript
 * const mockShell = createMockShellExecutor({
 *   "node --version": createMockShellResult(0, "v22.0.0"),
 *   "bun --version": createMockShellResult(0, "1.1.38"),
 * });
 *
 * const result = await mockShell("node --version");
 * expect(result.stdout).toBe("v22.0.0");
 * ```
 *
 * @public
 */
export function createMockShellExecutor(
	responses: Record<string, ShellResult>,
	defaultResult: ShellResult = createMockShellResult(127, "", "command not found"),
): ShellExecutor {
	return async (cmd: string): Promise<ShellResult> => {
		// Check for exact match first
		if (responses[cmd]) {
			return responses[cmd];
		}
		// Check for partial match (command includes pattern)
		for (const [pattern, result] of Object.entries(responses)) {
			if (cmd.includes(pattern)) {
				return result;
			}
		}
		return defaultResult;
	};
}

// =============================================================================
// BUFFER-BASED SHELL EXECUTOR UTILITIES
// =============================================================================
// These types use Buffer for stdout/stderr, suitable for linting tools and
// commands that may output binary data or need Buffer operations.

/**
 * Result of a shell command execution with Buffer output.
 * Used for linting tools and commands that need Buffer operations.
 *
 * @public
 */
export interface BufferShellResult {
	/** Exit code of the command (0 = success) */
	exitCode: number;
	/** Standard output as a Buffer */
	stdout: Buffer;
	/** Standard error as a Buffer */
	stderr: Buffer;
}

/**
 * Options for Buffer shell executor operations.
 *
 * @public
 */
export interface BufferShellExecutorOptions {
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Function type for executing shell commands with Buffer output.
 * Accepts an array of command arguments and optional options.
 *
 * @example
 * ```typescript
 * async function runLinter(
 *   shell: BufferShellExecutor = defaultBufferShellExecutor
 * ): Promise<LintResult> {
 *   const result = await shell(["biome", "check", "--write", "file.ts"]);
 *   return result.exitCode === 0 ? { success: true } : { success: false };
 * }
 * ```
 *
 * @public
 */
export type BufferShellExecutor = (cmd: string[], options?: BufferShellExecutorOptions) => Promise<BufferShellResult>;

/**
 * Default buffer shell executor using Bun.$.
 * Executes commands quietly with nothrow to capture all output.
 * Supports timeout option to prevent hanging.
 *
 * @public
 */
export const defaultBufferShellExecutor: BufferShellExecutor = async (
	cmd: string[],
	options?: BufferShellExecutorOptions,
) => {
	const DEFAULT_TIMEOUT_MS = 30_000;
	const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

	const shellPromise = $`${cmd}`.quiet().nothrow();
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout);
	});

	const result = await Promise.race([shellPromise, timeoutPromise]);
	return {
		exitCode: result.exitCode,
		stdout: Buffer.from(result.stdout),
		stderr: Buffer.from(result.stderr),
	};
};

/**
 * Creates a mock BufferShellResult for testing.
 *
 * @param exitCode - The exit code (0 for success)
 * @param stdout - Standard output content (string or Buffer)
 * @param stderr - Standard error content (string or Buffer)
 * @returns A BufferShellResult object
 *
 * @example
 * ```typescript
 * const successResult = createMockBufferShellResult(0, "formatted output");
 * const errorResult = createMockBufferShellResult(1, "", "lint error");
 * ```
 *
 * @public
 */
export function createMockBufferShellResult(
	exitCode: number,
	stdout: string | Buffer = "",
	stderr: string | Buffer = "",
): BufferShellResult {
	return {
		exitCode,
		stdout: typeof stdout === "string" ? Buffer.from(stdout) : stdout,
		stderr: typeof stderr === "string" ? Buffer.from(stderr) : stderr,
	};
}

/**
 * Creates a mock buffer shell executor with predefined responses.
 *
 * @param handler - Function that determines response based on command
 * @returns A BufferShellExecutor that returns predefined results
 *
 * @example
 * ```typescript
 * const mockShell = createMockBufferShellExecutor(async (cmd) => {
 *   const cmdString = cmd.join(" ");
 *   if (cmdString.includes("--write")) {
 *     return createMockBufferShellResult(0);
 *   }
 *   if (cmdString.includes("--reporter=gitlab")) {
 *     return createMockBufferShellResult(0, "[]");
 *   }
 *   return createMockBufferShellResult(0);
 * });
 * ```
 *
 * @public
 */
export function createMockBufferShellExecutor(
	handler: (cmd: string[], options?: BufferShellExecutorOptions) => Promise<BufferShellResult>,
): BufferShellExecutor {
	return handler;
}

// =============================================================================
// ENVIRONMENT MOCKING UTILITIES
// =============================================================================

/**
 * Context object returned by mockEnv for managing the mock environment.
 *
 * @public
 */
export interface MockEnvContext {
	/** Restore original environment values */
	restore: () => void;
	/** Set an additional env var (will be restored on restore()) */
	set: (key: string, value: string) => void;
	/** Delete an env var (will be restored on restore()) */
	delete: (key: string) => void;
	/** Get current value */
	get: (key: string) => string | undefined;
}

/**
 * Creates a fully isolated mock environment context for testing.
 *
 * @remarks
 * This provides complete isolation by:
 * 1. Saving the ENTIRE current env state
 * 2. Clearing ALL env vars
 * 3. Setting only the specified test values
 * 4. Fully restoring the original env on restore()
 *
 * This prevents any pollution between tests - tests only see vars they explicitly set.
 *
 * @param vars - Environment variables to set (only these will be visible in the test)
 * @param options - Configuration options (deprecated - isolation is now automatic)
 * @returns MockEnvContext for managing the mock
 *
 * @example
 * ```typescript
 * import { mockEnv, type MockEnvContext } from "claude-binary-plugin";
 *
 * describe("MyTest", () => {
 *   let env: MockEnvContext;
 *
 *   beforeEach(() => {
 *     // Test will ONLY see CLAUDE_PROJECT_DIR - all other env vars are hidden
 *     env = mockEnv({
 *       CLAUDE_PROJECT_DIR: "/tmp/test-project",
 *     });
 *   });
 *
 *   afterEach(() => {
 *     env.restore(); // Fully restores original env
 *   });
 *
 *   test("uses isolated env", () => {
 *     expect(Bun.env.CLAUDE_PROJECT_DIR).toBe("/tmp/test-project");
 *     expect(Bun.env.HOME).toBeUndefined(); // Real env vars not visible
 *     env.set("NEW_VAR", "value");
 *     expect(Bun.env.NEW_VAR).toBe("value");
 *   });
 * });
 * ```
 *
 * @public
 */
export function mockEnv(
	vars: Record<string, string | undefined> = {},
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_options: { clearPrefix?: string; clearSuffix?: string } = {},
): MockEnvContext {
	// Save ENTIRE env state for full restoration
	const originalEnv = new Map<string, string>();
	for (const key of Object.keys(Bun.env)) {
		const value = Bun.env[key];
		if (value !== undefined) {
			originalEnv.set(key, value);
		}
	}

	// Clear ALL env vars for complete isolation
	for (const key of Object.keys(Bun.env)) {
		delete Bun.env[key];
		delete process.env[key];
	}

	// Set only the specified test values
	for (const [key, value] of Object.entries(vars)) {
		if (value !== undefined) {
			Bun.env[key] = value;
			process.env[key] = value;
		}
	}

	return {
		restore: () => {
			// Clear all current vars (including any set during test)
			for (const key of Object.keys(Bun.env)) {
				delete Bun.env[key];
				delete process.env[key];
			}

			// Restore ENTIRE original env
			for (const [key, value] of originalEnv) {
				Bun.env[key] = value;
				process.env[key] = value;
			}
		},

		set: (key: string, value: string) => {
			Bun.env[key] = value;
			process.env[key] = value;
		},

		delete: (key: string) => {
			delete Bun.env[key];
			delete process.env[key];
		},

		get: (key: string) => Bun.env[key],
	};
}

/**
 * Preset environment configurations for common test scenarios.
 *
 * @public
 */
export const envPresets = {
	/** Minimal Claude Code hook environment */
	claudeHook: (overrides: Record<string, string> = {}): Record<string, string> => ({
		CLAUDE_PROJECT_DIR: "/tmp/test-project",
		CLAUDE_PLUGIN_ROOT: "/tmp/test-plugin",
		CLAUDE_CONFIG_DIR: "/tmp/test-claude-config",
		...overrides,
	}),

	/** Environment with CLAUDE_ENV_FILE set */
	withEnvFile: (envFilePath: string, overrides: Record<string, string> = {}): Record<string, string> => ({
		CLAUDE_PROJECT_DIR: "/tmp/test-project",
		CLAUDE_PLUGIN_ROOT: "/tmp/test-plugin",
		CLAUDE_CONFIG_DIR: "/tmp/test-claude-config",
		CLAUDE_ENV_FILE: envFilePath,
		...overrides,
	}),
} as const;

// =============================================================================
// FATAL ERROR HANDLER TESTING
// =============================================================================

/**
 * Result of testing a fatal error handler
 *
 * @public
 */
export interface FatalErrorResult {
	/** The exit code passed to process.exit */
	exitCode: number;
	/** The error message(s) logged to console.error */
	errorMessages: string[];
}

/**
 * Helper to test fatal error handler functions.
 * These functions typically log an error and call process.exit(2).
 *
 * @param handler - The fatal error handler function to test
 * @param error - The error to pass to the handler (defaults to Error("Test error"))
 * @returns FatalErrorResult with captured exit code and error messages
 *
 * @example
 * ```ts
 * import { testFatalErrorHandler } from "claude-binary-plugin";
 * import { handleFatalError } from "./my-cmd.cmd.js";
 *
 * describe("handleFatalError", () => {
 *   test("logs error and exits with code 2", () => {
 *     const result = testFatalErrorHandler(handleFatalError);
 *
 *     expect(result.exitCode).toBe(2);
 *     expect(result.errorMessages.join(" ")).toContain("Fatal");
 *     expect(result.errorMessages.join(" ")).toContain("Test error");
 *   });
 *
 *   test("handles custom error", () => {
 *     const result = testFatalErrorHandler(handleFatalError, new Error("Custom error"));
 *
 *     expect(result.errorMessages.join(" ")).toContain("Custom error");
 *   });
 * });
 * ```
 *
 * @public
 */
export function testFatalErrorHandler(
	handler: (error: unknown) => never,
	error: unknown = new Error("Test error"),
): FatalErrorResult {
	const originalExit = process.exit;
	const originalError = console.error;
	let exitCode = 0;
	const errorMessages: string[] = [];

	console.error = mock((...args: unknown[]) => {
		errorMessages.push(args.map(String).join(" "));
	}) as typeof console.error;

	process.exit = mock((code?: number) => {
		exitCode = code ?? 0;
		throw new MockExitError(code ?? 0);
	}) as typeof process.exit;

	try {
		handler(error);
	} catch (e) {
		if (!(e instanceof MockExitError)) {
			process.exit = originalExit;
			console.error = originalError;
			throw e;
		}
	}

	process.exit = originalExit;
	console.error = originalError;

	return { exitCode, errorMessages };
}

// =============================================================================
// MOCKS CLASS
// =============================================================================

/**
 * Testing utilities for Claude Code plugins.
 *
 * @remarks
 * The `Mocks` class provides static properties grouping related testing
 * utilities for easier discovery and usage. Each sub-object provides
 * utilities for a specific testing domain.
 *
 * **Sub-namespaces:**
 * - `Mocks.IO` - I/O mocking (stdin, stdout, stderr)
 * - `Mocks.Env` - Environment variable mocking
 * - `Mocks.Command` - CLI command testing
 * - `Mocks.Hook` - Hook handler testing
 * - `Mocks.Shell` - Shell executor mocking
 *
 * @example
 * ```typescript
 * import { Mocks } from "claude-binary-plugin";
 *
 * // Mock environment
 * const env = Mocks.Env.create({ CLAUDE_PROJECT_DIR: "/test" });
 * afterEach(() => env.restore());
 *
 * // Mock I/O for hook testing
 * const io = Mocks.IO.create({ tool_name: "Bash", tool_input: { command: "ls" } });
 * const exitCode = await Mocks.Hook.run(main);
 *
 * // Mock shell executor
 * const shell = Mocks.Shell.executor({
 *   "git status": Mocks.Shell.result(0, "On branch main"),
 * });
 * ```
 *
 * @public
 */
export class Mocks {
	// Private constructor prevents instantiation
	private constructor() {}

	/**
	 * I/O mocking utilities for hook testing.
	 *
	 * @remarks
	 * Mocks stdin, stdout, and stderr for testing hook handlers that
	 * read JSON input and write JSON output.
	 *
	 * @public
	 */
	static readonly IO = {
		/** Create a mock I/O context for hook testing. */
		create: mockIO,

		/** Reset all I/O mocks. Call in afterEach(). */
		reset: resetMockIO,
	} as const;

	/**
	 * Environment variable mocking utilities.
	 *
	 * @remarks
	 * Provides complete isolation for environment variables in tests.
	 * All existing env vars are hidden during the test.
	 *
	 * @public
	 */
	static readonly Env = {
		/** Create an isolated mock environment. */
		create: mockEnv,

		/** Preset environment configurations. */
		presets: envPresets,

		/** Mock environment class for ClaudeBinaryPluginEnv. */
		Class: MockEnv,
	} as const;

	/**
	 * CLI command testing utilities.
	 *
	 * @remarks
	 * Mocks process.argv, console.log/error, and process.exit
	 * for testing CLI command handlers.
	 *
	 * @public
	 */
	static readonly Command = {
		/** Create a mock command context. */
		create: mockCommand,

		/** Run a command with mocked context. */
		run: runMockedCommand,

		/** Test a fatal error handler. */
		testFatalError: testFatalErrorHandler,
	} as const;

	/**
	 * Hook handler testing utilities.
	 *
	 * @remarks
	 * Mocks process.exit for testing hook handlers that
	 * call event.end() which internally exits the process.
	 *
	 * @public
	 */
	static readonly Hook = {
		/** Run a hook main function with mocked process.exit. */
		run: runMockedHook,
	} as const;

	/**
	 * Shell executor mocking utilities.
	 *
	 * @remarks
	 * Provides mock shell executors for testing code that
	 * executes shell commands (e.g., tool detection, linting).
	 *
	 * @public
	 */
	static readonly Shell = {
		/** Create a ShellResult for mocking. */
		result: createMockShellResult,

		/** Create a mock shell executor with predefined responses. */
		executor: createMockShellExecutor,

		/** Default shell executor using Bun.$. */
		default: defaultShellExecutor,

		/** Buffer-based shell utilities for linting tools. */
		Buffer: {
			/** Create a BufferShellResult for mocking. */
			result: createMockBufferShellResult,

			/** Create a mock buffer shell executor. */
			executor: createMockBufferShellExecutor,

			/** Default buffer shell executor using Bun.$. */
			default: defaultBufferShellExecutor,
		},
	} as const;

	/**
	 * Utility classes and types.
	 *
	 * @public
	 */
	static readonly Utils = {
		/** Error thrown when mocked process.exit is called. */
		ExitError: MockExitError,

		/** No-op logger methods for testing. */
		logger: mockLogger,
	} as const;
}
