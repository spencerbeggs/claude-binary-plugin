import { dirname } from "node:path";
import type { ReadonlyDeep } from "type-fest";
import { z } from "zod";
import { NotificationEvent } from "../../events/classes/NotificationEvent.js";
import { PermissionRequestEvent } from "../../events/classes/PermissionRequestEvent.js";
import { PostToolUseEvent } from "../../events/classes/PostToolUseEvent.js";
import { PreCompactEvent } from "../../events/classes/PreCompactEvent.js";
import { PreToolUseEvent } from "../../events/classes/PreToolUseEvent.js";
import { SessionEndEvent } from "../../events/classes/SessionEndEvent.js";
import { SessionStartEvent } from "../../events/classes/SessionStartEvent.js";
import { StopEvent } from "../../events/classes/StopEvent.js";
import { SubagentStopEvent } from "../../events/classes/SubagentStopEvent.js";
import { UserPromptSubmitEvent } from "../../events/classes/UserPromptSubmitEvent.js";
import type { HookOutcome } from "../../otel/classes/TelemetryEmitter.js";
import { TelemetryEmitter } from "../../otel/classes/TelemetryEmitter.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import type { BaseState, PipelineHandler, PluginState, SetupFunction } from "../config.js";
import { TokenMetrics } from "../metrics.js";
import type { AnyPipelineOutput, ExecutionStatus, HookAction } from "../types.js";
import { isPipelineOutput } from "../types.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Union of all hook event type names.
 * @public
 */
export type HookEventType =
	| "PreToolUse"
	| "PostToolUse"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "SubagentStop"
	| "UserPromptSubmit"
	| "PreCompact"
	| "Notification"
	| "PermissionRequest";

/**
 * I/O dependencies for pipeline execution.
 * Allows injection for testing without mocking process globals.
 * @public
 */
export interface IODependencies {
	/** Readable stream for hook input (defaults to process.stdin) */
	stdin?: NodeJS.ReadableStream;
	/** Writable stream for hook output (defaults to process.stdout) */
	stdout?: NodeJS.WritableStream;
	/** Writable stream for error output (defaults to process.stderr) */
	stderr?: NodeJS.WritableStream;
	/** Exit function (defaults to process.exit) */
	exit?: (code: number) => never;
	/** Get current working directory (defaults to process.cwd) */
	cwd?: () => string;
	/**
	 * Pre-loaded input text, bypasses stdin reading.
	 * Useful for testing without mocking Bun.stdin.
	 */
	inputText?: string;
}

/**
 * Options for running a pipeline hook.
 * @public
 */
export interface PipelineConfig<TOptions = unknown, TState = Record<string, string>> {
	/** Hook event type (e.g., "PreToolUse", "SessionStart") */
	hookType: HookEventType;
	/** Custom hook name for logging and telemetry identification */
	hookName: string;
	/** Plugin name for telemetry attribution (passed explicitly to avoid env var cross-contamination) */
	pluginName: string;
	/** Plugin version for telemetry attribution (from package.json) */
	pluginVersion: string;
	/** Pipeline handler function that processes the hook event and returns a pipeline output */
	pipeline: PipelineHandler<unknown, unknown, TOptions, TState>;
	/** State class constructor for loading and validating environment variables */
	stateClass: new () => PluginEnv<TOptions>;
	/** Tool name filter for PreToolUse/PostToolUse hooks (hook skips if tool not in list) */
	tools?: string[];
	/** Zod schema for validating and persisting plugin options at SessionStart */
	optionsSchema?: z.ZodType<TOptions>;
	/** Setup function for computing derived state at SessionStart */
	setup?: SetupFunction<TOptions>;
	/** I/O dependencies for testing (defaults to process.stdin/stdout/stderr) */
	io?: IODependencies;
}

/**
 * Options for running a raw handler hook.
 * @public
 */
export interface RunRawHandlerOptions<TOptions, TState = Record<string, string>> {
	/** Hook event type (e.g., "PreToolUse", "SessionStart") */
	hookType: HookEventType;
	/** Custom hook name for logging and telemetry identification */
	hookName: string;
	/** Plugin name for telemetry attribution (passed explicitly to avoid env var cross-contamination) */
	pluginName: string;
	/** Plugin version for telemetry attribution (from package.json) */
	pluginVersion: string;
	/** Raw handler function with direct access to the HookEvent object */
	handler: (ctx: { event: unknown; options: TOptions; state: TState }) => void | Promise<void>;
	/** State class constructor for loading and validating environment variables */
	stateClass: new () => PluginEnv<TOptions>;
}

// =============================================================================
// INTERNAL RESPONSE TYPES
// =============================================================================

/**
 * Internal type for PreToolUse response builder.
 * @public
 */
export interface PreToolUseResponseData {
	/** Permission decision: allow tool execution, deny with reason, or defer to user */
	permissionDecision: "allow" | "deny" | "ask";
	/** Reason for denial (shown to Claude when decision is "deny") */
	reason?: string | undefined;
	/** Modified tool input to use instead of original (allows input transformation) */
	updatedInput?: Record<string, unknown> | undefined;
}

/**
 * Internal type for PostToolUse response builder.
 * @public
 */
export interface PostToolUseResponseData {
	/** Context to add for Claude based on tool execution results */
	additionalContext?: string;
	/** Block continuation of the conversation after tool execution */
	decision?: "block";
	/** Reason for blocking (shown to Claude when decision is "block") */
	reason?: string;
}

/**
 * Internal type for SessionStart response builder.
 * @public
 */
export interface SessionStartResponseData {
	/** System context to add for Claude at session initialization */
	additionalContext?: string;
}

/**
 * Internal type for Stop/SubagentStop response builder.
 * @public
 */
export interface StopResponseData {
	/** Block the agent from stopping to continue the conversation */
	decision?: "block";
	/** Reason for blocking the stop (shown to Claude) */
	reason?: string;
}

/**
 * Internal type for UserPromptSubmit response builder.
 * @public
 */
export interface UserPromptSubmitResponseData {
	/** Context to add for Claude based on the user's prompt */
	additionalContext?: string;
	/** Block the prompt submission from being processed */
	decision?: "block";
	/** Reason for blocking the prompt (shown to user) */
	reason?: string;
}

/**
 * Internal type for PermissionRequest response builder.
 * @public
 */
export interface PermissionRequestResponseData {
	/** Auto-allow or auto-deny the permission request */
	behavior: "allow" | "deny";
	/** Message to display explaining the permission decision */
	message?: string | undefined;
	/** Whether to interrupt the current operation when denying */
	interrupt?: boolean | undefined;
	/** Modified input to use if allowing with changes */
	updatedInput?: Record<string, unknown> | undefined;
}

// =============================================================================
// RESOLVED TYPES
// =============================================================================

/**
 * Resolved I/O dependencies type (inputText remains optional).
 */
type ResolvedIODependencies = Required<Omit<IODependencies, "inputText">> & Pick<IODependencies, "inputText">;

/**
 * Options for persisting session environment variables.
 */
interface PersistSessionEnvOptions {
	/** The SessionStart event containing session_id and other metadata */
	event: SessionStartEvent;
	/** Plugin environment instance for accessing prefix and persisting variables */
	stateInstance: PluginEnv<unknown>;
	/** Zod schema for validating and transforming options before persistence */
	schema?: z.ZodType<unknown> | undefined;
	/** Computed state from setup() function (will be JSON-stringified and base64-encoded) */
	state?: Record<string, unknown> | undefined;
	/** Base state containing projectDir, pluginDir, and pluginEnvFile paths */
	baseState: BaseState;
}

// =============================================================================
// PIPELINE RUNTIME CLASS
// =============================================================================

/**
 * Runtime execution for pipeline-based hooks.
 *
 * @remarks
 * The `PipelineRuntime` class consolidates all runtime execution logic into a
 * single, static class. This includes hook execution, raw handler execution,
 * and unknown hook handling.
 *
 * @example
 * ```typescript
 * import { PipelineRuntime } from "claude-binary-plugin";
 *
 * // Execute a pipeline handler
 * await PipelineRuntime.run({
 *   hookType: "PreToolUse",
 *   hookName: "security",
 *   pluginName: "my-plugin",
 *   pluginVersion: "1.0.0",
 *   pipeline: myHandler,
 *   stateClass: MyEnv,
 * });
 *
 * // Execute a raw handler
 * await PipelineRuntime.runRaw({
 *   hookType: "PreToolUse",
 *   hookName: "custom",
 *   pluginName: "my-plugin",
 *   pluginVersion: "1.0.0",
 *   handler: async ({ event }) => event.end(event.response().allow()),
 *   stateClass: MyEnv,
 * });
 * ```
 *
 * @public
 */
export class PipelineRuntime {
	// Private constructor prevents instantiation
	private constructor() {}

	// =========================================================================
	// PUBLIC METHODS
	// =========================================================================

	/**
	 * Execute a pipeline hook handler.
	 *
	 * @remarks
	 * Main entry point for executing pipeline-style hooks. Handles the full
	 * lifecycle: parsing stdin, loading environment, running the handler,
	 * emitting telemetry, and writing the response.
	 *
	 * **Execution steps:**
	 * 1. Create HookEvent from stdin JSON
	 * 2. Check tool filter (PreToolUse/PostToolUse only)
	 * 3. Load environment via `stateClass.forContext()`
	 * 4. Run `setup()` and persist state if SessionStart
	 * 5. Call pipeline handler with `{ input, options, state }`
	 * 6. Validate output matches hook type schema
	 * 7. Extract metrics and emit OTEL telemetry
	 * 8. Convert to response format and write to stdout
	 * 9. Exit process with appropriate code
	 *
	 * @param options - Pipeline configuration
	 * @returns Never (exits process after writing response)
	 *
	 * @public
	 */
	static async run<TOptions = unknown, TState = Record<string, string>>(
		options: PipelineConfig<TOptions, TState>,
	): Promise<never> {
		const { hookType, hookName, pluginName, pluginVersion, pipeline, stateClass, tools, optionsSchema, setup } =
			options;
		const startTime = performance.now();

		// Merge provided I/O with defaults
		const io: ResolvedIODependencies = { ...PipelineRuntime.defaultIO, ...options.io };

		// Helper to write to stderr
		const writeError = (msg: string) => {
			if (io.stderr && "write" in io.stderr) {
				(io.stderr as NodeJS.WritableStream).write(`${msg}\n`);
			}
		};

		// Get the appropriate event class
		const EventClass = PipelineRuntime.getHookEventClasses()[hookType];
		if (!EventClass) {
			writeError(`Unknown hook type: ${hookType}`);
			io.exit(2);
		}

		// Create the event from stdin
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic event creation requires runtime typing
		let event: any;
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state instance requires runtime typing
		let stateInstance: any;
		try {
			// biome-ignore lint/suspicious/noExplicitAny: EventClass is dynamically selected at runtime
			const result = await (EventClass as any).create({
				name: hookName,
				pluginName,
				pluginVersion,
				stdin: io.stdin,
				stdout: io.stdout,
				stderr: io.stderr,
				inputText: io.inputText,
				stateClass,
			});
			event = result.event;
			stateInstance = result.state;
		} catch (error) {
			// Handle validation errors with debug output
			if (error instanceof z.ZodError) {
				writeError(`[${hookName}] Input validation failed:`);
				writeError(JSON.stringify(error.issues, null, 2));

				if (Bun.env.CLAUDE_DEBUG === "1") {
					writeError(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
					writeError(`[${hookName}] Debug: Set CLAUDE_DEBUG=0 to suppress this output`);
				}
				io.exit(2);
			}
			throw error;
		}

		// Check tool filter for tool-related hooks
		if (tools && tools.length > 0 && "tool_name" in event) {
			const toolName = (event as { tool_name: string }).tool_name;
			if (!tools.includes(toolName)) {
				// Tool doesn't match filter - emit telemetry and passthrough
				const durationMs = Math.round(performance.now() - startTime);
				const summary = `skipped: tool ${toolName} not in filter`;

				TelemetryEmitter.emitHookExecution(event, hookName, {
					hookType,
					pluginName,
					pluginVersion,
					durationMs,
					success: true,
					outcome: "skipped",
					summary,
					toolName,
					toolUseId: "tool_use_id" in event ? (event.tool_use_id as string) : undefined,
				});

				// Mark telemetry as emitted to prevent duplicate from event.end()
				event.markTelemetryEmitted();
				event.end(event.response().outcome("skipped").summary(summary));
			}
		}

		try {
			// Extract options from stateInstance.vars (validated schema output)
			const validatedOptions = (stateInstance.vars ?? {}) as TOptions;

			// For SessionStart, run setup() BEFORE the hook to get fresh state.
			// For other hooks, extract state from the persisted stateInstance.
			const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
			const cwd = "cwd" in event ? (event.cwd as string) : io.cwd();
			const baseState = PipelineRuntime.createBaseState(cwd, claudeEnvFile, stateInstance);

			let state: TState;
			if (hookType === "SessionStart" && setup) {
				state = (await setup({
					options: validatedOptions,
					cwd,
					sessionId: event.session_id,
					baseState,
				})) as TState;
			} else {
				// Load session env files so PLUGIN_STATE is available in Bun.env
				const sessionEnvDir = PipelineRuntime.findSessionEnvDir(event);
				if (sessionEnvDir) {
					await PluginEnv.loadAllHookFiles(sessionEnvDir);
				}
				state = PipelineRuntime.extractPersistedState(stateInstance) as TState;
			}

			// Merge base state with computed state to create full plugin state
			// Include logger methods from the state instance
			const pluginState = {
				...baseState,
				...state,
				// Bind logger methods from state instance so they work in handlers
				log: stateInstance.log.bind(stateInstance),
				info: stateInstance.info.bind(stateInstance),
				debug: stateInstance.debug.bind(stateInstance),
			};

			// Call the pipeline handler with new context shape
			// Cast to ReadonlyDeep - values are already immutable from parsing
			const output = await pipeline({
				input: event,
				options: validatedOptions as ReadonlyDeep<TOptions>,
				state: pluginState as ReadonlyDeep<PluginState<TState>>,
			});

			// Calculate duration (rounded to whole ms to match Claude Code)
			const durationMs = Math.round(performance.now() - startTime);

			// Check if this is a pipeline output
			if (isPipelineOutput(output)) {
				// Extract telemetry from pipeline output
				const action = "action" in output ? (output.action as HookAction) : undefined;
				const outcome = PipelineRuntime.mapToOutcome(output.status, action);

				// Extract token metrics for auto-instrumentation
				const tokenMetrics = TokenMetrics.extractFromOutput(output);

				// Build telemetry metrics
				const metrics: Record<string, number | undefined> = {};
				if (tokenMetrics.hookTotal > 0) {
					metrics.contextTokens = tokenMetrics.hookTotal;
				}
				if ("metrics" in output && output.metrics) {
					Object.assign(metrics, output.metrics);
				}

				// Emit hook execution telemetry
				TelemetryEmitter.emitHookExecution(event, hookName, {
					hookType,
					pluginName,
					pluginVersion,
					durationMs,
					success: output.status !== "error" && output.status !== "timeout",
					outcome,
					summary: output.summary,
					toolName: "tool_name" in event ? (event.tool_name as string) : undefined,
					toolUseId: "tool_use_id" in event ? (event.tool_use_id as string) : undefined,
					permissionDecision: PipelineRuntime.mapToPermissionDecision(action),
					permissionDecisionReason: "reason" in output ? output.reason : undefined,
					hasUpdatedInput: "updatedInput" in output && output.updatedInput !== undefined,
					hasAdditionalContext: "claudeContext" in output && !!output.claudeContext,
					additionalContext: "claudeContext" in output ? output.claudeContext : undefined,
					decision: action === "block" ? "block" : undefined,
					reason: "reason" in output ? output.reason : undefined,
					metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
				});

				// Mark telemetry as emitted to prevent duplicate from event.end()
				event.markTelemetryEmitted();

				// Convert pipeline output to response format
				const responseOutput = PipelineRuntime.convertToResponse(hookType, output);

				// For SessionStart hooks, persist environment variables
				if (hookType === "SessionStart") {
					await PipelineRuntime.persistSessionEnv({
						event: event as SessionStartEvent,
						stateInstance: stateInstance as PluginEnv<unknown>,
						schema: optionsSchema,
						state: state as Record<string, unknown>,
						baseState,
					});
				}

				// Apply response output and end
				PipelineRuntime.applyPipelineOutput(event, hookType, responseOutput);
			} else {
				// Non-pipeline output detected - pipeline outputs are required
				const errorMessage =
					`Hook "${hookName}" returned non-pipeline output. ` +
					`Pipeline outputs are required (must have status and summary fields). ` +
					`Received: ${JSON.stringify(output)}`;

				TelemetryEmitter.emitHookExecution(event, hookName, {
					hookType,
					pluginName,
					pluginVersion,
					durationMs,
					success: false,
					outcome: "error",
					summary: "Invalid output: missing status/summary fields",
					error: errorMessage,
					toolName: "tool_name" in event ? (event.tool_name as string) : undefined,
				});

				// Mark telemetry as emitted to prevent duplicate from event.error()
				event.markTelemetryEmitted();

				event.error(errorMessage);
				throw new Error(errorMessage); // unreachable, but satisfies never
			}
		} catch (error) {
			const durationMs = Math.round(performance.now() - startTime);

			if (error instanceof z.ZodError) {
				// Output validation failed - emit error telemetry
				TelemetryEmitter.emitHookExecution(event, hookName, {
					hookType,
					pluginName,
					pluginVersion,
					durationMs,
					success: false,
					outcome: "error",
					summary: `Output validation failed: ${error.message}`,
					error: error.message,
					toolName: "tool_name" in event ? (event.tool_name as string) : undefined,
				});
				// Mark telemetry as emitted to prevent duplicate from event.error()
				event.markTelemetryEmitted();
				event.error(`Pipeline output validation failed: ${error.message}`);
			}
			// Re-throw other errors
			throw error;
		}
	}

	/**
	 * Execute a raw handler hook.
	 *
	 * @remarks
	 * Raw handlers receive direct access to the HookEvent object instead of
	 * the pipeline abstraction. They are responsible for:
	 * - Calling `event.end()` or using response builder methods
	 * - Managing their own telemetry (optional)
	 * - Handling errors and exit codes
	 *
	 * Use raw handlers when you need:
	 * - Direct access to response builder fluent API
	 * - Custom response formatting not supported by pipeline outputs
	 * - Maximum control over the response flow
	 *
	 * @param options - Raw handler configuration
	 *
	 * @public
	 */
	static async runRaw<TOptions, TState = Record<string, string>>(
		options: RunRawHandlerOptions<TOptions, TState>,
	): Promise<void> {
		const { hookType, hookName, pluginName, pluginVersion, handler, stateClass } = options;

		const EventClass = PipelineRuntime.getHookEventClasses()[hookType];
		if (!EventClass) {
			console.error(`Unknown hook type: ${hookType}`);
			process.exit(2);
		}

		// biome-ignore lint/suspicious/noExplicitAny: Dynamic event creation requires runtime typing
		let event: any;
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state creation requires runtime typing
		let stateInstance: any;
		try {
			// biome-ignore lint/suspicious/noExplicitAny: EventClass is dynamically selected at runtime
			const result = await (EventClass as any).create({
				name: hookName,
				pluginName,
				pluginVersion,
				stdin: process.stdin,
				stdout: process.stdout,
				stderr: process.stderr,
				stateClass,
			});
			event = result.event;
			stateInstance = result.state;
		} catch (error) {
			// Handle validation errors with debug output
			if (error instanceof z.ZodError) {
				console.error(`[${hookName}] Input validation failed:`);
				console.error(JSON.stringify(error.issues, null, 2));

				if (Bun.env.CLAUDE_DEBUG === "1") {
					console.error(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
					console.error(`[${hookName}] Debug: Set CLAUDE_DEBUG=0 to suppress this output`);
				}
				process.exit(2);
			}
			throw error;
		}

		// Extract options and state, merge with base state
		const handlerOptions = (stateInstance.vars ?? {}) as TOptions;
		const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
		const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
		const baseState = PipelineRuntime.createBaseState(cwd, claudeEnvFile, stateInstance);

		// Load session env files for non-SessionStart hooks
		if (hookType !== "SessionStart") {
			const sessionEnvDir = PipelineRuntime.findSessionEnvDir(event);
			if (sessionEnvDir) {
				await PluginEnv.loadAllHookFiles(sessionEnvDir);
			}
		}

		const persistedState = PipelineRuntime.extractPersistedState(stateInstance);
		const pluginState = { ...baseState, ...persistedState } as TState;

		await handler({ event, options: handlerOptions, state: pluginState });
	}

	/**
	 * Handle an unknown hook by emitting telemetry and exiting with error.
	 *
	 * @remarks
	 * This method is called when a plugin receives a hook invocation for
	 * a hook that doesn't exist. It:
	 * 1. Parses the hook key to extract type and name
	 * 2. Reads stdin to get session info for telemetry
	 * 3. Emits error telemetry
	 * 4. Writes error to stderr
	 * 5. Exits with code 2
	 *
	 * @param hookKey - The hook key in format "HookType/hook-name"
	 * @param validHooks - Array of valid hook keys for error message
	 *
	 * @public
	 */
	static async handleUnknown(hookKey: string, validHooks: string[]): Promise<never> {
		const startTime = performance.now();

		// Parse hookKey to extract type and name
		const [hookType, hookName] = hookKey.split("/", 2);
		if (!hookType || !hookName) {
			process.stderr.write(`Invalid hook key format: ${hookKey} (expected "HookType/hook-name")\n`);
			process.exit(2);
		}

		// Try to read stdin for session info (for telemetry)
		let sessionId: string | undefined;
		try {
			const stdin = await Bun.stdin.text();
			if (stdin) {
				const input = JSON.parse(stdin);
				sessionId = input.session_id;
			}
		} catch {
			// Ignore stdin parsing errors
		}

		const durationMs = Math.round(performance.now() - startTime);
		const errorMessage = `Unknown hook: ${hookKey}. Valid hooks: ${validHooks.join(", ")}`;

		// Emit telemetry for the error
		try {
			const { OtelConfig } = await import("../../otel/classes/OtelConfig.js");
			if (OtelConfig.isEnabled()) {
				TelemetryEmitter.emitHookExecutionDirect({
					sessionId: sessionId ?? "unknown",
					hookName: `${hookType}/${hookName}`,
					hookType,
					durationMs,
					success: false,
					outcome: "error",
					summary: "Unknown hook",
					error: errorMessage,
				});
			}
		} catch {
			// Ignore telemetry errors
		}

		process.stderr.write(`${errorMessage}\n`);
		process.exit(2);
	}

	// =========================================================================
	// PRIVATE STATIC PROPERTIES
	// =========================================================================

	/**
	 * Default I/O dependencies using process globals.
	 */
	private static readonly defaultIO: ResolvedIODependencies = {
		stdin: process.stdin,
		stdout: process.stdout,
		stderr: process.stderr,
		exit: (code: number) => process.exit(code),
		cwd: () => process.cwd(),
	};

	// =========================================================================
	// PRIVATE STATIC METHODS - Hook Event Classes
	// =========================================================================

	/**
	 * Get map of hook event constructors.
	 */
	private static getHookEventClasses() {
		return {
			PreToolUse: PreToolUseEvent,
			PostToolUse: PostToolUseEvent,
			SessionStart: SessionStartEvent,
			SessionEnd: SessionEndEvent,
			Stop: StopEvent,
			SubagentStop: SubagentStopEvent,
			UserPromptSubmit: UserPromptSubmitEvent,
			PreCompact: PreCompactEvent,
			Notification: NotificationEvent,
			PermissionRequest: PermissionRequestEvent,
		} as const;
	}

	// =========================================================================
	// PRIVATE STATIC METHODS - Outcome Mapping
	// =========================================================================

	/**
	 * Map pipeline status and action to HookOutcome for telemetry.
	 */
	private static mapToOutcome(status: ExecutionStatus, action?: HookAction): HookOutcome {
		// Non-executed states
		if (status === "skipped") return "skipped";
		if (status === "error") return "error";
		if (status === "timeout") return "error";
		if (status === "disabled") return "skipped";
		if (status === "cached") {
			// For cached, check the action
			if (action === "deny") return "denied";
			if (action === "allow") return "allowed";
			return "passthrough";
		}

		// Executed states - map by action
		if (!action) return "passthrough";

		switch (action) {
			case "allow":
				return "allowed";
			case "deny":
				return "denied";
			case "ask":
				return "passthrough";
			case "block":
				return "blocked";
			case "continue":
				return "passthrough";
			case "modify":
				return "modified";
			case "context":
				return "context_added";
			case "none":
				return "passthrough";
			default:
				return "passthrough";
		}
	}

	/**
	 * Map pipeline action to permission decision for response builder.
	 */
	private static mapToPermissionDecision(action?: HookAction): "allow" | "deny" | "ask" | undefined {
		if (action === "allow" || action === "deny" || action === "ask") {
			return action;
		}
		// For "modify", we allow with updated input
		if (action === "modify") {
			return "allow";
		}
		return undefined;
	}

	// =========================================================================
	// PRIVATE STATIC METHODS - Response Conversion
	// =========================================================================

	/**
	 * Convert pipeline output to PreToolUse response format.
	 */
	private static convertToPreToolUseResponseData(output: AnyPipelineOutput): PreToolUseResponseData {
		const action = "action" in output ? output.action : undefined;

		// Map action to permission decision
		let permissionDecision: "allow" | "deny" | "ask" = "allow";
		if (action === "deny") {
			permissionDecision = "deny";
		} else if (action === "ask") {
			permissionDecision = "ask";
		}

		return {
			permissionDecision,
			reason: "reason" in output ? output.reason : undefined,
			updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
		};
	}

	/**
	 * Convert pipeline output to PostToolUse response format.
	 */
	private static convertToPostToolUseResponseData(output: AnyPipelineOutput): PostToolUseResponseData {
		const action = "action" in output ? output.action : undefined;

		if (action === "block" && "reason" in output && output.reason) {
			return { decision: "block", reason: output.reason };
		}
		if (action === "context" && "claudeContext" in output && output.claudeContext) {
			return { additionalContext: output.claudeContext };
		}
		return {};
	}

	/**
	 * Convert pipeline output to SessionStart response format.
	 */
	private static convertToSessionStartResponseData(output: AnyPipelineOutput): SessionStartResponseData {
		if ("claudeContext" in output && output.claudeContext) {
			return { additionalContext: output.claudeContext };
		}
		return {};
	}

	/**
	 * Convert pipeline output to Stop response format.
	 */
	private static convertToStopResponseData(output: AnyPipelineOutput): StopResponseData {
		const action = "action" in output ? output.action : undefined;

		if (action === "block" && "reason" in output && output.reason) {
			return { decision: "block", reason: output.reason };
		}
		return {};
	}

	/**
	 * Convert pipeline output to UserPromptSubmit response format.
	 */
	private static convertToUserPromptSubmitResponseData(output: AnyPipelineOutput): UserPromptSubmitResponseData {
		const action = "action" in output ? output.action : undefined;

		if (action === "block" && "reason" in output && output.reason) {
			return { decision: "block", reason: output.reason };
		}
		if (action === "context" && "claudeContext" in output && output.claudeContext) {
			return { additionalContext: output.claudeContext };
		}
		return {};
	}

	/**
	 * Convert pipeline output to PermissionRequest response format.
	 */
	private static convertToPermissionRequestResponseData(output: AnyPipelineOutput): PermissionRequestResponseData {
		const action = "action" in output ? output.action : undefined;

		return {
			behavior: action === "deny" ? "deny" : "allow",
			message: "reason" in output ? output.reason : undefined,
			interrupt: "interrupt" in output ? output.interrupt : undefined,
			updatedInput: "updatedInput" in output ? output.updatedInput : undefined,
		};
	}

	/**
	 * Convert pipeline output to response format based on hook type.
	 */
	private static convertToResponse(hookType: HookEventType, output: AnyPipelineOutput): unknown {
		switch (hookType) {
			case "PreToolUse":
				return PipelineRuntime.convertToPreToolUseResponseData(output);
			case "PostToolUse":
				return PipelineRuntime.convertToPostToolUseResponseData(output);
			case "SessionStart":
				return PipelineRuntime.convertToSessionStartResponseData(output);
			case "SessionEnd":
			case "PreCompact":
			case "Notification":
				return {}; // Passthrough
			case "Stop":
			case "SubagentStop":
				return PipelineRuntime.convertToStopResponseData(output);
			case "UserPromptSubmit":
				return PipelineRuntime.convertToUserPromptSubmitResponseData(output);
			case "PermissionRequest":
				return PipelineRuntime.convertToPermissionRequestResponseData(output);
			default:
				return output;
		}
	}

	// =========================================================================
	// PRIVATE STATIC METHODS - Response Application
	// =========================================================================

	/**
	 * Apply PreToolUse pipeline output.
	 */
	private static applyPreToolUseOutput(event: PreToolUseEvent, output: PreToolUseResponseData): never {
		const response = event.response();
		if (output.permissionDecision === "allow") {
			response.allow();
		} else if (output.permissionDecision === "deny") {
			response.deny(output.reason);
		} else if (output.permissionDecision === "ask") {
			response.ask();
		}
		if (output.updatedInput) {
			response.updateInput(output.updatedInput);
		}
		event.end(response);
	}

	/**
	 * Apply PostToolUse pipeline output.
	 */
	private static applyPostToolUseOutput(event: PostToolUseEvent, output: PostToolUseResponseData): never {
		const response = event.response();
		if ("additionalContext" in output && output.additionalContext) {
			response.additionalContext(output.additionalContext);
		} else if ("decision" in output && output.decision === "block") {
			response.block(output.reason ?? "Blocked by hook");
		}
		event.end(response);
	}

	/**
	 * Apply SessionStart pipeline output.
	 */
	private static applySessionStartOutput(event: SessionStartEvent, output: SessionStartResponseData): never {
		const response = event.response();
		if (output.additionalContext) {
			response.additionalContext(output.additionalContext);
		}
		event.end(response);
	}

	/**
	 * Apply Stop/SubagentStop pipeline output.
	 */
	private static applyStopOutput(event: StopEvent | SubagentStopEvent, output: StopResponseData): never {
		const response = event.response();
		if ("decision" in output && output.decision === "block") {
			response.block(output.reason ?? "Blocked by hook");
		}
		event.end(response);
	}

	/**
	 * Apply UserPromptSubmit pipeline output.
	 */
	private static applyUserPromptSubmitOutput(
		event: UserPromptSubmitEvent,
		output: UserPromptSubmitResponseData,
	): never {
		const response = event.response();
		if ("additionalContext" in output && output.additionalContext) {
			response.additionalContext(output.additionalContext);
		} else if ("decision" in output && output.decision === "block") {
			response.block(output.reason ?? "Blocked by hook");
		}
		event.end(response);
	}

	/**
	 * Apply PermissionRequest pipeline output.
	 */
	private static applyPermissionRequestOutput(
		event: PermissionRequestEvent,
		output: PermissionRequestResponseData,
	): never {
		const response = event.response();
		if (output.behavior === "allow") {
			response.allow();
		} else {
			response.deny(output.message);
			if (output.interrupt) {
				response.interrupt(true);
			}
		}
		if (output.updatedInput) {
			response.updateInput(output.updatedInput);
		}
		event.end(response);
	}

	/**
	 * Apply passthrough output (for hooks that only support passthrough).
	 */
	private static applyPassthroughOutput(event: SessionEndEvent | PreCompactEvent | NotificationEvent): never {
		event.end(event.response());
	}

	/**
	 * Dispatch to the correct apply function based on hook type.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic dispatch based on hook type
	private static applyPipelineOutput(event: any, hookType: HookEventType, output: unknown): never {
		switch (hookType) {
			case "PreToolUse":
				return PipelineRuntime.applyPreToolUseOutput(event, output as PreToolUseResponseData);
			case "PostToolUse":
				return PipelineRuntime.applyPostToolUseOutput(event, output as PostToolUseResponseData);
			case "SessionStart":
				return PipelineRuntime.applySessionStartOutput(event, output as SessionStartResponseData);
			case "SessionEnd":
			case "PreCompact":
			case "Notification":
				return PipelineRuntime.applyPassthroughOutput(event);
			case "Stop":
			case "SubagentStop":
				return PipelineRuntime.applyStopOutput(event, output as StopResponseData);
			case "UserPromptSubmit":
				return PipelineRuntime.applyUserPromptSubmitOutput(event, output as UserPromptSubmitResponseData);
			case "PermissionRequest":
				return PipelineRuntime.applyPermissionRequestOutput(event, output as PermissionRequestResponseData);
			default: {
				// Exhaustive check
				const _exhaustive: never = hookType;
				throw new Error(`Unknown hook type: ${_exhaustive}`);
			}
		}
	}

	// =========================================================================
	// PRIVATE STATIC METHODS - State Management
	// =========================================================================

	/**
	 * Check if CLAUDE_DEBUG is enabled.
	 */
	private static isDebugEnabled(): boolean {
		const val = Bun.env.CLAUDE_DEBUG;
		return val === "1" || val === "true";
	}

	/**
	 * Find the session environment directory for loading persisted state.
	 * Uses the same strategies as Commands.findSessionEnvDir but with
	 * access to the hook event's session_id.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Event type varies by hook type
	private static findSessionEnvDir(event: any): string | undefined {
		// Try session_id from the hook event (most reliable for hooks)
		if (event.session_id) {
			const dir = PluginEnv.getSessionEnvDir(event.session_id);
			if (dir) return dir;
		}

		// Try CLAUDE_SESSION_ID env var
		if (Bun.env.CLAUDE_SESSION_ID) {
			const dir = PluginEnv.getSessionEnvDir(Bun.env.CLAUDE_SESSION_ID);
			if (dir) return dir;
		}

		// Try CLAUDE_ENV_FILE parent directory
		if (Bun.env.CLAUDE_ENV_FILE) {
			return dirname(Bun.env.CLAUDE_ENV_FILE);
		}

		// Look for any *_PLUGIN_ENV_FILE env var
		for (const [key, value] of Object.entries(Bun.env)) {
			if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
				return dirname(value);
			}
		}

		// Try project directory via registry
		const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
		const dir = PluginEnv.getProjectSessionEnvDir(cwd);
		if (dir) return dir;

		return undefined;
	}

	/**
	 * Create the base state object for the setup function.
	 */
	private static createBaseState(cwd: string, claudeEnvFile: string, stateInstance: PluginEnv<unknown>): BaseState {
		return {
			projectDir: Bun.env.CLAUDE_PROJECT_DIR ?? cwd,
			pluginDir: Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
			pluginEnvFile: claudeEnvFile,
			// Bind logger methods from state instance
			log: stateInstance.log.bind(stateInstance),
			info: stateInstance.info.bind(stateInstance),
			debug: stateInstance.debug.bind(stateInstance),
		};
	}

	/**
	 * Extract persisted state from the environment.
	 */
	private static extractPersistedState(stateInstance: PluginEnv<unknown>): Record<string, unknown> {
		const prefix = stateInstance.getPrefix();

		// Debug logging helper
		const debugLog = (msg: string) => {
			if (PipelineRuntime.isDebugEnabled()) {
				if (typeof stateInstance.info === "function") {
					stateInstance.info(`[extractPersistedState] ${msg}`);
				} else {
					console.error(`[extractPersistedState] ${msg}`);
				}
			}
		};

		debugLog(`prefix=${prefix}`);

		if (!prefix) {
			debugLog("No prefix available");
			return {};
		}

		// Read the PLUGIN_STATE env var and parse as JSON
		const stateEnvKey = `${prefix}_PLUGIN_STATE`;
		const stateJson = Bun.env[stateEnvKey];

		debugLog(`Looking for ${stateEnvKey}, found=${stateJson ? "yes" : "no"}`);

		if (!stateJson) {
			// Log all env vars with this prefix to help debug
			const prefixedVars = Object.keys(Bun.env).filter((k) => k.startsWith(prefix));
			debugLog(`Found ${prefixedVars.length} vars with prefix ${prefix}: ${prefixedVars.join(", ")}`);
			return {};
		}

		try {
			// Decode from base64 first, then parse JSON
			const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
			const state = JSON.parse(jsonStr);
			const keys = Object.keys(state);
			debugLog(`Successfully parsed state with ${keys.length} keys: ${keys.join(", ")}`);
			return typeof state === "object" && state !== null ? state : {};
		} catch (e) {
			debugLog(`Failed to parse ${stateEnvKey}: ${e}`);
			return {};
		}
	}

	// =========================================================================
	// INTERNAL EXPORTS (for testing)
	// =========================================================================

	/**
	 * Internal methods exposed for testing.
	 * @internal
	 */
	static readonly internal = {
		mapToOutcome: PipelineRuntime.mapToOutcome,
		mapToPermissionDecision: PipelineRuntime.mapToPermissionDecision,
		convertToPreToolUseResponseData: PipelineRuntime.convertToPreToolUseResponseData,
		convertToPostToolUseResponseData: PipelineRuntime.convertToPostToolUseResponseData,
		convertToSessionStartResponseData: PipelineRuntime.convertToSessionStartResponseData,
		convertToStopResponseData: PipelineRuntime.convertToStopResponseData,
		convertToUserPromptSubmitResponseData: PipelineRuntime.convertToUserPromptSubmitResponseData,
		convertToPermissionRequestResponseData: PipelineRuntime.convertToPermissionRequestResponseData,
		convertToResponse: PipelineRuntime.convertToResponse,
		isDebugEnabled: PipelineRuntime.isDebugEnabled,
		extractPersistedState: PipelineRuntime.extractPersistedState,
		createBaseState: PipelineRuntime.createBaseState,
	} as const;

	/**
	 * Persist environment variables for SessionStart hooks.
	 */
	private static async persistSessionEnv(options: PersistSessionEnvOptions): Promise<void> {
		const { event, stateInstance, schema, state, baseState } = options;
		const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE;
		if (!claudeEnvFile) {
			return; // No env file to write to
		}

		// Get the plugin prefix from the state instance
		const prefix = stateInstance.getPrefix();
		if (!prefix) {
			return; // No prefix, can't construct variable names
		}

		const vars: Record<string, string> = {};

		// Base state vars (always written)
		vars[`${prefix}_PROJECT_DIR`] = baseState.projectDir;
		vars[`${prefix}_PLUGIN_DIR`] = baseState.pluginDir;
		vars[`${prefix}_PLUGIN_ENV_FILE`] = baseState.pluginEnvFile;

		// Options (validated from schema with defaults)
		if (schema) {
			// Build input object from prefixed env vars
			const envInput: Record<string, string | undefined> = {};
			for (const key of Object.keys(Bun.env)) {
				if (key.startsWith(`${prefix}_`)) {
					const optionName = key.slice(prefix.length + 1);
					envInput[optionName] = Bun.env[key];
				}
			}

			// Parse with schema to apply defaults and validation
			try {
				const validatedOptions = schema.parse(envInput);

				// Persist validated options (stringify non-string values)
				if (typeof validatedOptions === "object" && validatedOptions !== null) {
					for (const [key, value] of Object.entries(validatedOptions)) {
						const stringValue = typeof value === "string" ? value : JSON.stringify(value);
						vars[`${prefix}_${key}`] = stringValue;
					}
				}
			} catch (error) {
				// Schema validation failed - log but continue with base vars
				console.error(`[${prefix}] Options validation failed:`, error);
			}
		}

		// State (JSON-stringified and base64-encoded)
		if (state) {
			const jsonStr = JSON.stringify(state);
			vars[`${prefix}_PLUGIN_STATE`] = Buffer.from(jsonStr).toString("base64");
		}

		// Persist all variables
		await PluginEnv.persistVars(event.session_id, vars);

		// Register session in SQLite registry for subsequent lookups
		// Claude Code names env files with various prefixes (e.g., "sessionstart-hook-0.sh")
		const sessionEnvDir = dirname(claudeEnvFile);
		if (event.session_id && baseState.projectDir) {
			PluginEnv.registerSession(event.session_id, baseState.projectDir, sessionEnvDir);
		}
	}
}
