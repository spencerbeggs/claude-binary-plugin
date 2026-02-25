import { mock, spyOn } from "bun:test";
import { $ } from "bun";
import type { ShellExecutor, ShellResult } from "../build/builder.js";
import type { HookEventBase, IO } from "../events/types.js";
import { PluginEnv } from "../state/classes/PluginEnv.js";

// =============================================================================
// MOCK STATE CLASS
// =============================================================================

/**
 * Mock state class for testing plugin handlers.
 * @public
 */
export class MockState extends PluginEnv {
	protected readonly prefix = "MOCK";
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

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
	/** Mock state class */
	stateClass: typeof MockState;
}

/**
 * Result of capturing command output for testing.
 *
 * @public
 */
export interface MockCommandOutput {
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
	output: MockCommandOutput;
	restore: () => void;
}

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
 * Options for in-memory shell executor operations.
 *
 * @public
 */
export interface InMemoryShellExecutorOptions {
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Function type for in-memory shell command execution.
 * Accepts an array of command arguments and optional options.
 *
 * @public
 */
export type InMemoryShellExecutor = (
	cmd: string[],
	options?: InMemoryShellExecutorOptions,
) => Promise<BufferShellResult>;

/**
 * Result of testing a fatal error handler
 *
 * @public
 */
export interface MockFatalErrorResult {
	/** The exit code passed to process.exit */
	exitCode: number;
	/** The error message(s) logged to console.error */
	errorMessages: string[];
}

// =============================================================================
// ERROR CLASS
// =============================================================================

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

// =============================================================================
// TEST FIXTURES CLASS
// =============================================================================

/**
 * Low-level testing utilities for Claude Code plugins.
 *
 * @remarks
 * **For plugin testing, prefer the fluent API via `plugin.test()`** - see
 * {@link PluginTester} for type-safe hook and command testing with
 * full type inference from your plugin schema.
 *
 * The `TestFixtures` class provides lower-level utilities for SDK development
 * or edge cases where the fluent API is insufficient.
 *
 * **Method Categories:**
 * - I/O: `createIO`, `resetIO`
 * - Environment: `createEnv`, `envPresets`
 * - Command: `createCommand`, `runCommand`, `testFatalError`
 * - Hook: `runHook`
 * - Shell: `shellResult`, `shellExecutor`, `bufferShellResult`, `inMemoryShellExecutor`
 *
 * @example
 * ```typescript
 * import { TestFixtures } from "claude-binary-plugin";
 *
 * // Mock environment
 * const env = TestFixtures.createEnv({ CLAUDE_PROJECT_DIR: "/test" });
 * afterEach(() => env.restore());
 *
 * // Mock I/O for hook testing
 * const io = TestFixtures.createIO({ tool_name: "Bash", tool_input: { command: "ls" } });
 * const exitCode = await TestFixtures.runHook(main);
 *
 * // Mock shell executor
 * const shell = TestFixtures.shellExecutor({
 *   "git status": TestFixtures.shellResult(0, "On branch main"),
 * });
 * ```
 *
 * @public
 */
export class TestFixtures {
	// Private constructor prevents instantiation
	private constructor() {}

	// =========================================================================
	// I/O MOCKING
	// =========================================================================

	/**
	 * Create a mock I/O context for hook testing.
	 *
	 * @remarks
	 * Mocks stdin, stdout, and stderr for testing hook handlers that
	 * read JSON input and write JSON output.
	 *
	 * @typeParam T - The type of the hook event input
	 * @param input - The hook event input to mock
	 * @returns MockIOResult with IO interface plus getStdout() and getStderr() methods
	 *
	 * @public
	 */
	static createIO<T extends HookEventBase>(input: T): MockIOResult {
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
			stateClass: MockState,
			getStdout: () => stdoutBuffer,
			getStderr: () => stderrBuffer,
		};
	}

	/**
	 * Reset all I/O mocks.
	 *
	 * @remarks
	 * Call this in afterEach() to clean up between tests.
	 *
	 * @public
	 */
	static resetIO(): void {
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

	// =========================================================================
	// ENVIRONMENT MOCKING
	// =========================================================================

	/**
	 * Create an isolated mock environment.
	 *
	 * @remarks
	 * Provides complete isolation for environment variables in tests.
	 * All existing env vars are hidden during the test.
	 *
	 * @param vars - Environment variables to set
	 * @returns MockEnvContext for managing the mock
	 *
	 * @public
	 */
	static createEnv(vars: Record<string, string | undefined> = {}): MockEnvContext {
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
	static readonly envPresets = {
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

	/**
	 * Mock state class for PluginEnv.
	 *
	 * @public
	 */
	static readonly MockStateClass = MockState;

	// =========================================================================
	// COMMAND MOCKING
	// =========================================================================

	/**
	 * Create a mock command context.
	 *
	 * @remarks
	 * Mocks process.argv, console.log/error, and process.exit
	 * for testing CLI command handlers.
	 *
	 * @param args - CLI arguments
	 * @returns MockCommandContext with captured output and restore function
	 *
	 * @public
	 */
	static createCommand(args: string[]): MockCommandContext {
		const originalArgv = process.argv;
		const originalLog = console.log;
		const originalError = console.error;
		const originalExit = process.exit;

		const output: MockCommandOutput = {
			logs: [],
			errors: [],
			exitCode: null,
		};

		// Mock process.argv
		process.argv = ["bun", "script.ts", ...args];

		// Mock console.log
		console.log = mock((...logArgs: unknown[]) => {
			output.logs.push(logArgs.map(String).join(" "));
		}) as typeof console.log;

		// Mock console.error
		console.error = mock((...errorArgs: unknown[]) => {
			output.errors.push(errorArgs.map(String).join(" "));
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
	 * Run a command with mocked context.
	 *
	 * @param args - CLI arguments
	 * @param mainFn - The main function to run
	 * @returns MockCommandOutput with captured logs, errors, and exit code
	 *
	 * @public
	 */
	static async runCommand(args: string[], mainFn: () => Promise<void>): Promise<MockCommandOutput> {
		const ctx = TestFixtures.createCommand(args);
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

	/**
	 * Test a fatal error handler.
	 *
	 * @param handler - The fatal error handler function to test
	 * @param error - The error to pass to the handler
	 * @returns MockFatalErrorResult with captured exit code and error messages
	 *
	 * @public
	 */
	static testFatalError(
		handler: (error: unknown) => never,
		error: unknown = new Error("Test error"),
	): MockFatalErrorResult {
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

	// =========================================================================
	// HOOK MOCKING
	// =========================================================================

	/**
	 * Run a hook main function with mocked process.exit.
	 *
	 * @remarks
	 * Hook main functions call event.end() which internally calls process.exit().
	 * This helper mocks process.exit to throw MockExitError instead of terminating.
	 *
	 * @param mainFn - The hook main function to run
	 * @returns The exit code passed to process.exit
	 *
	 * @public
	 */
	static async runHook(mainFn: () => Promise<void>): Promise<number> {
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

	// =========================================================================
	// SHELL MOCKING
	// =========================================================================

	/**
	 * Create a ShellResult for mocking.
	 *
	 * @param exitCode - The exit code (0 for success)
	 * @param stdout - Standard output content
	 * @param stderr - Standard error content
	 * @returns A ShellResult object
	 *
	 * @public
	 */
	static shellResult(exitCode: number, stdout = "", stderr = ""): ShellResult {
		return { exitCode, stdout, stderr };
	}

	/**
	 * Create a mock shell executor with predefined responses.
	 *
	 * @param responses - Map of command patterns to results
	 * @param defaultResult - Result for unmatched commands
	 * @returns A ShellExecutor that returns predefined results
	 *
	 * @public
	 */
	static shellExecutor(
		responses: Record<string, ShellResult>,
		defaultResult: ShellResult = TestFixtures.shellResult(127, "", "command not found"),
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

	/**
	 * Default shell executor using Bun.$.
	 * Executes commands quietly with nothrow to capture all output.
	 *
	 * @public
	 */
	static readonly defaultShellExecutor: ShellExecutor = async (cmd: string) => {
		const result = await $`${{ raw: cmd }}`.quiet().nothrow();
		return {
			exitCode: result.exitCode,
			stdout: result.stdout.toString().trim(),
			stderr: result.stderr.toString().trim(),
		};
	};

	/**
	 * Create a BufferShellResult for mocking.
	 *
	 * @param exitCode - The exit code (0 for success)
	 * @param stdout - Standard output content
	 * @param stderr - Standard error content
	 * @returns A BufferShellResult object
	 *
	 * @public
	 */
	static bufferShellResult(
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
	 * Create a mock in-memory shell executor.
	 *
	 * @param handler - Function that determines response based on command
	 * @returns A InMemoryShellExecutor that returns predefined results
	 *
	 * @public
	 */
	static inMemoryShellExecutor(
		handler: (cmd: string[], options?: InMemoryShellExecutorOptions) => Promise<BufferShellResult>,
	): InMemoryShellExecutor {
		return handler;
	}

	/**
	 * Default in-memory shell executor using Bun.$.
	 * Executes commands quietly with nothrow to capture all output.
	 * Supports timeout option to prevent hanging.
	 *
	 * @public
	 */
	static readonly defaultInMemoryShellExecutor: InMemoryShellExecutor = async (
		cmd: string[],
		options?: InMemoryShellExecutorOptions,
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

	// =========================================================================
	// UTILITY CLASSES
	// =========================================================================

	/**
	 * Error thrown when mocked process.exit is called.
	 *
	 * @public
	 */
	static readonly ExitError = MockExitError;

	/**
	 * No-op logger methods for testing.
	 *
	 * @returns Object with log, info, debug methods
	 *
	 * @public
	 */
	static logger(): {
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
}
