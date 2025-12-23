import { mock, spyOn } from "bun:test";
import { $ } from "bun";
import type { HookEventBase, IO } from "./index.js";
import { BunPluginEnv } from "./plugin-env.js";

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
 * Mock environment class for testing hooks
 */
class MockEnv extends BunPluginEnv {
	protected readonly prefix = "MOCK";
}

/**
 * Captured output from mockIO.
 * Use getStdout() and getStderr() to retrieve captured output as strings.
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
 * @template T - The type of the hook event input, must extend HookEventBase
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
 */
export interface CommandOutput {
	logs: string[];
	errors: string[];
	exitCode: number | null;
}

/**
 * Mock context for command testing
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
 * import { mockIO, resetMockIO, runMockedHook } from "@savvy-web/bun-hooks/mocks";
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

/**
 * Result of a shell command execution.
 * Used for dependency injection in functions that spawn subprocesses.
 */
export interface ShellResult {
	/** Exit code of the command (0 = success) */
	exitCode: number;
	/** Standard output as a string */
	stdout: string;
	/** Standard error as a string */
	stderr: string;
}

/**
 * Function type for executing shell commands.
 * Use dependency injection with this type for testable subprocess code.
 *
 * @example
 * ```typescript
 * async function detectVersion(
 *   shell: ShellExecutor = defaultShellExecutor
 * ): Promise<string> {
 *   const result = await shell("node --version");
 *   return result.exitCode === 0 ? result.stdout : "unknown";
 * }
 * ```
 */
export type ShellExecutor = (cmd: string) => Promise<ShellResult>;

/**
 * Default shell executor using Bun.$.
 * Executes commands quietly with nothrow to capture all output.
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
 */
export type BufferShellExecutor = (cmd: string[], options?: BufferShellExecutorOptions) => Promise<BufferShellResult>;

/**
 * Default buffer shell executor using Bun.$.
 * Executes commands quietly with nothrow to capture all output.
 * Supports timeout option to prevent hanging.
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
 * import { mockEnv, type MockEnvContext } from "@savvy-web/bun-hooks/mocks";
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

	/** Minimal workflow plugin environment with all required SAVVY_WORKFLOW_* vars */
	workflowPlugin: (overrides: Record<string, string> = {}): Record<string, string> => {
		// Set defaults first, then merge with overrides to avoid duplicate key warnings
		const defaults: Record<string, string> = {
			SAVVY_WORKFLOW_PROJECT_DIR: "/tmp/test-project",
			SAVVY_WORKFLOW_PLUGIN_ROOT: "/tmp/test-plugin",
			SAVVY_WORKFLOW_DEBUG: "false",
			// Mock session env file with randomized path to prevent pollution and conflicts
			SAVVY_WORKFLOW_SESSION_ENV_FILE: `/tmp/test-session-env-${crypto.randomUUID()}`,
			SAVVY_WORKFLOW_ENABLE_BIOME: "true",
			SAVVY_WORKFLOW_ENABLE_TURBO: "false",
			SAVVY_WORKFLOW_ENABLE_MARKDOWNLINT: "false",
			SAVVY_WORKFLOW_ENABLE_SHELLCHECK: "true",
			SAVVY_WORKFLOW_ENABLE_COREPACK: "false",
			SAVVY_WORKFLOW_ENABLE_YAML_LINT: "true",
			SAVVY_WORKFLOW_ENABLE_COMMITLINT: "false",
			SAVVY_WORKFLOW_ENABLE_CHANGESETS: "false",
			SAVVY_WORKFLOW_ENABLE_NVM: "false",
			SAVVY_WORKFLOW_ENABLE_NODE: "true",
			SAVVY_WORKFLOW_ENABLE_BUN: "true",
			SAVVY_WORKFLOW_ENABLE_DENO: "false",
			SAVVY_WORKFLOW_PACKAGE_MANAGER: "unknown",
			SAVVY_WORKFLOW_NODE_VERSION: "v24.0.0",
			SAVVY_WORKFLOW_BUN_VERSION: "1.3.3",
			SAVVY_WORKFLOW_DENO_VERSION: "",
			SAVVY_WORKFLOW_OS: "linux",
			SAVVY_WORKFLOW_ARCH: "x64",
			SAVVY_WORKFLOW_OS_VERSION: "Ubuntu 22.04",
			SAVVY_WORKFLOW_SHELL: "bash",
			SAVVY_WORKFLOW_SHELL_VERSION: "5.0.0",
			SAVVY_WORKFLOW_HOSTNAME: "test-host",
			SAVVY_WORKFLOW_USERNAME: "test-user",
			SAVVY_WORKFLOW_CPU_CORES: "4",
			SAVVY_WORKFLOW_MEMORY_GB: "8",
			SAVVY_WORKFLOW_XDG_COMPLIANCE: "full",
			SAVVY_WORKFLOW_XDG_CONFIG_HOME: "/home/test/.config",
			SAVVY_WORKFLOW_XDG_DATA_HOME: "/home/test/.local/share",
			SAVVY_WORKFLOW_XDG_STATE_HOME: "/home/test/.local/state",
			SAVVY_WORKFLOW_XDG_CACHE_HOME: "/home/test/.cache",
			SAVVY_WORKFLOW_XDG_RUNTIME_DIR: "/tmp/runtime-test",
			SAVVY_WORKFLOW_HOMEBREW: "not installed",
			SAVVY_WORKFLOW_BIOME_CONFIG: "",
			SAVVY_WORKFLOW_MARKDOWNLINT_CONFIG: "",
			SAVVY_WORKFLOW_PRETTIER_CONFIG: "",
			SAVVY_WORKFLOW_COMMITLINT_CONFIG: "",
			SAVVY_WORKFLOW_CHANGESETS_CHANGELOG: "",
			SAVVY_WORKFLOW_CHANGESETS_BASE_BRANCH: "",
			SAVVY_WORKFLOW_SHELLCHECK_BIN: "/usr/bin/shellcheck",
			SAVVY_WORKFLOW_TS_COMPILER: "tsgo",
			SAVVY_WORKFLOW_TS_COMPILER_PATH: "/usr/local/bin/tsgo",
			SAVVY_WORKFLOW_TEST_RUNNER: "bun",
			SAVVY_WORKFLOW_TEST_RUNNER_VERSION: "1.3.3",
			SAVVY_WORKFLOW_TEST_RUNNER_CONFIG: "",
			// Git detection
			SAVVY_WORKFLOW_GIT_AVAILABLE: "true",
			SAVVY_WORKFLOW_GIT_VERSION: "2.43.0",
			SAVVY_WORKFLOW_GIT_REPO: "true",
			SAVVY_WORKFLOW_GH_AVAILABLE: "true",
			SAVVY_WORKFLOW_GH_VERSION: "2.40.1",
			// Branch detection
			SAVVY_WORKFLOW_GIT_DEFAULT_BRANCH: "main",
			SAVVY_WORKFLOW_GIT_CURRENT_BRANCH: "main",
			// Git safety
			SAVVY_WORKFLOW_GIT_ALLOW_PUSH_DEFAULT: "false",
			SAVVY_WORKFLOW_GIT_ALLOW_DANGEROUS_DEFAULT: "false",
			// Workspace packages
			SAVVY_WORKFLOW_WORKSPACE_PACKAGES: "[]",
			SAVVY_WORKFLOW_WORKSPACE_COUNT: "0",
		};

		return { ...defaults, ...overrides };
	},

	/** Minimal bun-plugin-builder plugin environment with all required SAVVY_BUN_PLUGIN_BUILDER_* vars */
	bunPluginBuilder: (overrides: Record<string, string> = {}): Record<string, string> => ({
		SAVVY_BUN_PLUGIN_BUILDER_PLUGIN_ROOT: "/tmp/test-plugin",
		SAVVY_BUN_PLUGIN_BUILDER_PROJECT_DIR: "/tmp/test-project",
		SAVVY_BUN_PLUGIN_BUILDER_SESSION_ENV_FILE: `/tmp/test-session-env-${crypto.randomUUID()}`,
		SAVVY_BUN_PLUGIN_BUILDER_DEBUG: "false",
		...overrides,
	}),
} as const;

// =============================================================================
// FATAL ERROR HANDLER TESTING
// =============================================================================

/**
 * Result of testing a fatal error handler
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
 * import { testFatalErrorHandler } from "@savvy-web/bun-hooks/mocks";
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
