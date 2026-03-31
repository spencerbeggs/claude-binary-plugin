import { dirname } from "node:path";
import type { Layer } from "effect";
import { Effect, ParseResult, Schema } from "effect";
import type { ReadonlyDeep } from "type-fest";
import { Outcome } from "../outcomes/Outcome.js";
import { isValidOutcomeForHook } from "../outcomes/types.js";
import type { BaseState, PipelineHandler, PluginState, SetupFunction } from "../plugin/config.js";
import {
	NotificationEvent,
	PermissionRequestEvent,
	PostToolUseEvent,
	PreCompactEvent,
	PreToolUseEvent,
	SessionEndEvent,
	SessionStartEvent,
	StopEvent,
	SubagentStopEvent,
	UserPromptSubmitEvent,
} from "../schemas/hook-events.js";
import {
	NotificationInput,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopInput,
	SubagentStopInput,
	UserPromptSubmitInput,
} from "../schemas/hook-inputs.js";
import {
	toPassthroughResponse,
	toPermissionRequestResponse,
	toPostToolUseResponse,
	toPreToolUseResponse,
	toSessionStartResponse,
	toStopResponse,
	toUserPromptSubmitResponse,
} from "../schemas/hook-responses.js";
import type {
	ExecutionStatus,
	HookAction,
	PassthroughPipelineOutput,
	PermissionRequestPipelineOutput,
	PostToolUsePipelineOutput,
	PreToolUsePipelineOutput,
	SessionStartPipelineOutput,
	StopPipelineOutput,
	UserPromptSubmitPipelineOutput,
} from "../schemas/pipeline-outputs.js";
import { PluginEnv } from "../services/PluginEnv.js";
import type { Telemetry } from "../services/Telemetry.js";
import { HookExecutionData } from "../services/Telemetry.js";
import type { AnyPipelineOutput } from "../types/pipeline.js";
import { TokenMetrics, isPipelineOutput } from "../types/pipeline.js";
import { makePluginLoggerLive } from "./PluginLoggerLive.js";

// =============================================================================
// TELEMETRY INTERFACE
// =============================================================================

/**
 * Semantic outcome of hook execution for telemetry.
 * @internal
 */
type HookOutcome =
	| "skipped"
	| "allowed"
	| "denied"
	| "modified"
	| "blocked"
	| "context_added"
	| "passthrough"
	| "error";

/**
 * Resolved telemetry service interface (matches Telemetry tag shape).
 * Used for dependency injection in PipelineRuntime.
 * @internal
 */
type TelemetryInterface = Telemetry["Type"];

/**
 * No-op telemetry implementation used when no layer is provided.
 * All methods are safe to call but produce no side effects.
 * @internal
 */
const noopTelemetry: TelemetryInterface = {
	emitHookExecution: () => Effect.void,
	emitError: () => Effect.void,
	emitFatalError: () => Effect.succeed(false),
	preconnect: Effect.void,
	flush: () => Effect.succeed(true),
};

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
	| "PostToolUseFailure"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "StopFailure"
	| "SubagentStart"
	| "SubagentStop"
	| "TaskCreated"
	| "TaskCompleted"
	| "TeammateIdle"
	| "InstructionsLoaded"
	| "ConfigChange"
	| "CwdChanged"
	| "FileChanged"
	| "WorktreeCreate"
	| "WorktreeRemove"
	| "UserPromptSubmit"
	| "PreCompact"
	| "PostCompact"
	| "Elicitation"
	| "ElicitationResult"
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
	/** Effect Schema for validating and persisting plugin options at SessionStart */
	optionsSchema?: Schema.Schema<TOptions, any, never>;
	/** Effect Schema.Class for state — enables typed decode on subsequent hooks */
	stateSchema?: Schema.Schema<TState, any, never>;
	/** Setup function for computing derived state at SessionStart */
	setup?: SetupFunction<TOptions>;
	/**
	 * Effect Layer provided to handler Effects that require services.
	 * When a handler returns an Effect with service requirements (e.g., ShellExecutor),
	 * this layer satisfies those requirements.
	 * In production, pass PipelineLive. In tests, pass test layers.
	 * @public
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Layer type is intentionally broad to accept any service requirements
	handlerLayer?: Layer.Layer<any>;
	/** I/O dependencies for testing (defaults to process.stdin/stdout/stderr) */
	io?: IODependencies;
	/**
	 * Resolved telemetry service for dependency injection.
	 * Defaults to no-op when not provided. In production, resolved from PipelineLive.
	 * In tests, use makeTelemetryTest() layer to create a test implementation.
	 * @internal
	 */
	_telemetry?: TelemetryInterface;
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
	/** The session_id from the parsed event */
	sessionId: string;
	/** Plugin environment instance for accessing prefix and persisting variables */
	stateInstance: PluginEnv<any>;
	/** Effect Schema for validating and transforming options before persistence */
	schema?: Schema.Schema<any, any, never> | undefined;
	/** Effect Schema for encoding state before persistence */
	stateSchema?: Schema.Schema<any, any, never> | undefined;
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
		const {
			hookType,
			hookName,
			pluginName,
			pluginVersion,
			pipeline,
			stateClass,
			tools,
			optionsSchema,
			stateSchema,
			setup,
			handlerLayer,
		} = options;
		const startTime = performance.now();

		// Resolve telemetry service (injected or no-op default)
		const telemetry = options._telemetry ?? noopTelemetry;

		// Merge provided I/O with defaults
		const io: ResolvedIODependencies = { ...PipelineRuntime.defaultIO, ...options.io };

		// Helper to write to stderr
		const writeError = (msg: string) => {
			if (io.stderr && "write" in io.stderr) {
				(io.stderr as NodeJS.WritableStream).write(`${msg}\n`);
			}
		};

		const program = Effect.gen(function* () {
			// Annotate all logs within this scope with hook metadata
			yield* Effect.annotateLogsScoped({ hookType, hookName, pluginName });

			// Preconnect telemetry sidecar for faster emission
			yield* telemetry.preconnect.pipe(Effect.ignoreLogged);

			// Get the appropriate schemas for this hook type
			const hookSchemas = PipelineRuntime.getHookSchemas(hookType);
			if (!hookSchemas) {
				writeError(`Unknown hook type: ${hookType}`);
				return { _tag: "exit" as const, code: 2 };
			}

			// Parse stdin and decode event using Effect Schema
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic event parsing requires runtime typing
			let event: any;
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic state instance requires runtime typing
			let stateInstance: any;
			try {
				// Read input from stdin or pre-loaded text
				const inputText = io.inputText ?? (yield* Effect.tryPromise(() => Bun.stdin.text()));
				const rawInput = JSON.parse(inputText);

				// Decode input and convert to event instance via fromInput
				// biome-ignore lint/suspicious/noExplicitAny: inputSchema is dynamically looked up
				const decodedInput = Schema.decodeUnknownSync(hookSchemas.inputSchema as Schema.Schema<any, any, never>)(
					rawInput,
				);
				event = hookSchemas.fromInput(decodedInput);

				yield* Effect.log("input decoded").pipe(Effect.annotateLogs("channel", "pipeline"));

				// Log event data with optional toolName
				const toolNameAnnotation =
					"tool_name" in decodedInput && decodedInput.tool_name
						? { channel: "event", toolName: decodedInput.tool_name as string }
						: { channel: "event" };
				yield* Effect.log("hook event received").pipe(Effect.annotateLogs(toolNameAnnotation));

				// Initialize state via static forContext method
				const sessionEnvDir = PluginEnv.getSessionEnvDir(event.session_id);

				yield* Effect.log("resolved session env dir").pipe(
					Effect.annotateLogs({ channel: "state", sessionEnvDir: sessionEnvDir ?? "unknown" }),
				);

				// biome-ignore lint/suspicious/noExplicitAny: stateClass is dynamically provided
				stateInstance = yield* Effect.tryPromise(() =>
					(stateClass as any).forContext(hookType === "SessionStart" ? "sessionStart" : "hook", {
						sessionId: event.session_id,
						sessionEnvDir,
						hookName,
					}),
				);
			} catch (error) {
				// Handle validation errors with debug output
				if (ParseResult.isParseError(error)) {
					const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
					writeError(`[${hookName}] Input validation failed:`);
					writeError(formatted);

					if (Bun.env.CLAUDE_DEBUG === "1") {
						writeError(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
						writeError(`[${hookName}] Debug: Set CLAUDE_DEBUG=0 to suppress this output`);
					}
					return { _tag: "exit" as const, code: 2 };
				}
				throw error;
			}

			// Check tool filter for tool-related hooks
			if (tools && tools.length > 0 && "tool_name" in event) {
				const toolName = (event as { tool_name: string }).tool_name;
				if (!tools.includes(toolName)) {
					yield* Effect.log("tool filtered, skipping").pipe(Effect.annotateLogs("channel", "pipeline"));
					// Tool doesn't match filter - emit telemetry and passthrough
					const durationMs = Math.round(performance.now() - startTime);
					const summary = `skipped: tool ${toolName} not in filter`;

					yield* telemetry
						.emitHookExecution(
							new HookExecutionData({
								hookType,
								hookName,
								pluginName,
								pluginVersion,
								durationMs,
								success: true,
								outcome: "skipped",
								summary,
							}),
						)
						.pipe(Effect.ignoreLogged);

					// Flush telemetry before exit
					yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

					// Write empty response and exit (passthrough)
					PipelineRuntime.writeResponse(io, {});
					return { _tag: "exit" as const, code: 0 };
				}
			}

			// Extract options from stateInstance.vars (validated schema output)
			const validatedOptions = (stateInstance.vars ?? {}) as TOptions;

			// For SessionStart, run setup() BEFORE the hook to get fresh state.
			// For other hooks, extract state from the persisted stateInstance.
			const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
			const cwd = "cwd" in event ? (event.cwd as string) : io.cwd();
			const baseState = PipelineRuntime.createBaseState(cwd, claudeEnvFile, stateInstance);

			let state: TState;
			if (hookType === "SessionStart" && setup) {
				state = (yield* Effect.tryPromise(() =>
					Promise.resolve(
						setup({
							options: validatedOptions,
							cwd,
							sessionId: event.session_id,
							baseState,
						}),
					),
				)) as TState;
			} else {
				// Load session env files so PLUGIN_STATE is available in Bun.env
				const sessionEnvDir = PipelineRuntime.findSessionEnvDir(event);
				if (sessionEnvDir) {
					yield* Effect.tryPromise(() => PluginEnv.loadAllHookFiles(sessionEnvDir));
				}
				state = PipelineRuntime.extractPersistedState(stateInstance, stateSchema) as TState;

				yield* Effect.log("loaded persisted state").pipe(
					Effect.annotateLogs({ channel: "state", keyCount: Object.keys(state as object).length }),
				);
			}

			// Merge base state with computed state to create full plugin state.
			// If state is a Schema.Class instance (has methods), use Object.assign
			// to preserve the prototype chain. Otherwise spread into a plain object.
			const pluginState =
				state !== null && typeof state === "object" && Object.getPrototypeOf(state) !== Object.prototype
					? Object.assign(Object.create(Object.getPrototypeOf(state)), state, baseState)
					: { ...baseState, ...state };

			// Call the pipeline handler with new context shape
			yield* Effect.log("invoking handler").pipe(Effect.annotateLogs("channel", "pipeline"));
			// Cast to ReadonlyDeep - values are already immutable from parsing
			const rawOutput = pipeline({
				input: event,
				options: validatedOptions as ReadonlyDeep<TOptions>,
				state: pluginState as ReadonlyDeep<PluginState<TState>>,
			});

			// Handle Effect, Promise, or sync return from handler
			let output: unknown;
			if (Effect.isEffect(rawOutput)) {
				// If handler returns an Effect with service requirements, provide the handler layer
				if (handlerLayer) {
					// biome-ignore lint/suspicious/noExplicitAny: Layer satisfies handler's service requirements at runtime
					output = yield* Effect.provide(rawOutput as Effect.Effect<unknown, unknown, any>, handlerLayer);
				} else {
					output = yield* rawOutput as Effect.Effect<unknown>;
				}
			} else if (rawOutput instanceof Promise || (rawOutput && typeof (rawOutput as any).then === "function")) {
				output = yield* Effect.tryPromise(() => rawOutput as Promise<unknown>);
			} else {
				output = rawOutput;
			}

			yield* Effect.log("handler completed").pipe(Effect.annotateLogs("channel", "pipeline"));

			// Calculate duration (rounded to whole ms to match Claude Code)
			const durationMs = Math.round(performance.now() - startTime);

			// Check if this is an Outcome instance (new pattern)
			if (Outcome.isOutcome(output)) {
				// Validate outcome is valid for this hook type
				if (!isValidOutcomeForHook(hookType, output)) {
					const tag = (output.constructor as { _tag?: string })._tag ?? "unknown";
					writeError(`Outcome "${tag}" is not valid for hook type "${hookType}"`);
					return { _tag: "exit" as const, code: 2 };
				}

				const outcomeTelemetry = output.toTelemetry();

				// Emit hook execution telemetry
				yield* Effect.log("emitting hook execution telemetry").pipe(Effect.annotateLogs("channel", "otel"));
				yield* telemetry
					.emitHookExecution(
						new HookExecutionData({
							hookType,
							hookName,
							pluginName,
							pluginVersion,
							durationMs,
							success: outcomeTelemetry.success,
							outcome: outcomeTelemetry.outcome,
							summary: outcomeTelemetry.summary,
							metrics: outcomeTelemetry.metrics as Record<string, number | undefined> | undefined,
						}),
					)
					.pipe(Effect.ignoreLogged);

				// For SessionStart hooks, persist environment variables
				if (hookType === "SessionStart") {
					yield* Effect.tryPromise(() =>
						PipelineRuntime.persistSessionEnv({
							sessionId: event.session_id,
							stateInstance: stateInstance as PluginEnv<any>,
							schema: optionsSchema,
							stateSchema,
							state: state as Record<string, unknown>,
							baseState,
						}),
					);
				}

				// Flush telemetry before exit
				yield* Effect.log("telemetry flush").pipe(Effect.annotateLogs("channel", "otel"));
				yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

				// Write response from outcome
				PipelineRuntime.writeResponse(io, output.toResponse());
				yield* Effect.log("response written to stdout").pipe(Effect.annotateLogs("channel", "pipeline"));
				return { _tag: "exit" as const, code: 0 };
			}

			// Check if this is a pipeline output (legacy pattern)
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
				yield* Effect.log("emitting hook execution telemetry").pipe(Effect.annotateLogs("channel", "otel"));
				yield* telemetry
					.emitHookExecution(
						new HookExecutionData({
							hookType,
							hookName,
							pluginName,
							pluginVersion,
							durationMs,
							success: output.status !== "error" && output.status !== "timeout",
							outcome,
							summary: output.summary,
							metrics: Object.keys(metrics).length > 0 ? metrics : undefined,
						}),
					)
					.pipe(Effect.ignoreLogged);

				yield* Effect.log("output validated").pipe(Effect.annotateLogs("channel", "pipeline"));

				// Convert pipeline output to response format
				const responseOutput = PipelineRuntime.toResponse(hookType, output);

				// For SessionStart hooks, persist environment variables
				if (hookType === "SessionStart") {
					yield* Effect.tryPromise(() =>
						PipelineRuntime.persistSessionEnv({
							sessionId: event.session_id,
							stateInstance: stateInstance as PluginEnv<any>,
							schema: optionsSchema,
							stateSchema,
							state: state as Record<string, unknown>,
							baseState,
						}),
					);
				}

				// Flush telemetry before exit
				yield* Effect.log("telemetry flush").pipe(Effect.annotateLogs("channel", "otel"));
				yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

				// Write response JSON to stdout
				PipelineRuntime.writeResponse(io, responseOutput);
				yield* Effect.log("response written to stdout").pipe(Effect.annotateLogs("channel", "pipeline"));
				return { _tag: "exit" as const, code: 0 };
			}
			// Non-pipeline output detected - pipeline outputs are required
			const errorMessage =
				`Hook "${hookName}" returned non-pipeline output. ` +
				`Pipeline outputs are required (must have status and summary fields). ` +
				`Received: ${JSON.stringify(output)}`;

			yield* telemetry
				.emitHookExecution(
					new HookExecutionData({
						hookType,
						hookName,
						pluginName,
						pluginVersion,
						durationMs,
						success: false,
						outcome: "error",
						summary: "Invalid output: missing status/summary fields",
					}),
				)
				.pipe(Effect.ignoreLogged);

			// Flush telemetry before exit
			yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

			writeError(errorMessage);
			return { _tag: "exit" as const, code: 2 };
		}).pipe(
			Effect.catchAll((error) => {
				// Handle ParseResult errors that bubble up
				if (ParseResult.isParseError(error)) {
					const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
					const durationMs = Math.round(performance.now() - startTime);
					return Effect.gen(function* () {
						yield* telemetry
							.emitHookExecution(
								new HookExecutionData({
									hookType,
									hookName,
									pluginName,
									pluginVersion,
									durationMs,
									success: false,
									outcome: "error",
									summary: `Output validation failed: ${formatted}`,
								}),
							)
							.pipe(Effect.ignoreLogged);
						yield* telemetry.flush(500).pipe(Effect.ignoreLogged);
						writeError(`Pipeline output validation failed: ${formatted}`);
						return { _tag: "exit" as const, code: 2 };
					});
				}
				return Effect.die(error);
			}),
			Effect.scoped,
			Effect.provide(makePluginLoggerLive(pluginName)),
		);

		const result = await Effect.runPromise(program);
		io.exit(result.code);
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
		const { hookType, hookName, pluginName, handler, stateClass } = options;

		const program = Effect.gen(function* () {
			yield* Effect.annotateLogsScoped({ hookType, hookName, pluginName });

			const hookSchemas = PipelineRuntime.getHookSchemas(hookType);
			if (!hookSchemas) {
				console.error(`Unknown hook type: ${hookType}`);
				return { _tag: "exit" as const, code: 2 };
			}

			// biome-ignore lint/suspicious/noExplicitAny: Dynamic event parsing requires runtime typing
			let event: any;
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic state creation requires runtime typing
			let stateInstance: any;
			try {
				const inputText = yield* Effect.tryPromise(() => Bun.stdin.text());
				const rawInput = JSON.parse(inputText);
				// Decode input and convert to event instance via fromInput
				// biome-ignore lint/suspicious/noExplicitAny: inputSchema is dynamically looked up
				const decodedInput = Schema.decodeUnknownSync(hookSchemas.inputSchema as Schema.Schema<any, any, never>)(
					rawInput,
				);
				event = hookSchemas.fromInput(decodedInput);

				yield* Effect.log("input decoded").pipe(Effect.annotateLogs("channel", "pipeline"));

				// Initialize state via static forContext method
				const sessionEnvDir = PluginEnv.getSessionEnvDir(event.session_id);
				// biome-ignore lint/suspicious/noExplicitAny: stateClass is dynamically provided
				stateInstance = yield* Effect.tryPromise(() =>
					(stateClass as any).forContext(hookType === "SessionStart" ? "sessionStart" : "hook", {
						sessionId: event.session_id,
						sessionEnvDir,
						hookName,
					}),
				);
			} catch (error) {
				// Handle validation errors with debug output
				if (ParseResult.isParseError(error)) {
					const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
					console.error(`[${hookName}] Input validation failed:`);
					console.error(formatted);

					if (Bun.env.CLAUDE_DEBUG === "1") {
						console.error(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
						console.error(`[${hookName}] Debug: Set CLAUDE_DEBUG=0 to suppress this output`);
					}
					return { _tag: "exit" as const, code: 2 };
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
					yield* Effect.tryPromise(() => PluginEnv.loadAllHookFiles(sessionEnvDir));
				}
			}

			const persistedState = PipelineRuntime.extractPersistedState(stateInstance);
			const pluginState = { ...baseState, ...persistedState } as TState;

			yield* Effect.log("invoking handler").pipe(Effect.annotateLogs("channel", "pipeline"));
			yield* Effect.tryPromise(() => Promise.resolve(handler({ event, options: handlerOptions, state: pluginState })));
			yield* Effect.log("handler completed").pipe(Effect.annotateLogs("channel", "pipeline"));
			return { _tag: "done" as const };
		}).pipe(
			Effect.catchAll((error) => {
				// Extract original error from UnknownException for re-throwing
				const cause = "error" in (error as object) ? (error as { error: unknown }).error : error;
				return Effect.die(cause);
			}),
			Effect.scoped,
			Effect.provide(makePluginLoggerLive(pluginName)),
		);

		const result = await Effect.runPromise(program);
		if (result._tag === "exit") {
			process.exit(result.code);
		}
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
	static async handleUnknown(hookKey: string, validHooks: string[], _telemetry?: TelemetryInterface): Promise<never> {
		const startTime = performance.now();
		const telemetry = _telemetry ?? noopTelemetry;

		const writeError = (msg: string) => {
			process.stderr.write(`${msg}\n`);
		};

		const program = Effect.gen(function* () {
			// Preconnect telemetry sidecar
			yield* telemetry.preconnect.pipe(Effect.ignoreLogged);

			// Parse hookKey to extract type and name
			const [hookType, hookName] = hookKey.split("/", 2);
			if (!hookType || !hookName) {
				writeError(`Invalid hook key format: ${hookKey} (expected "HookType/hook-name")`);
				return { _tag: "exit" as const, code: 2 };
			}

			// Read and discard stdin (must consume to avoid hanging)
			yield* Effect.tryPromise(() => Bun.stdin.text()).pipe(Effect.ignoreLogged);

			const durationMs = Math.round(performance.now() - startTime);
			const errorMessage = `Unknown hook: ${hookKey}. Valid hooks: ${validHooks.join(", ")}`;

			// Emit telemetry for the error via Telemetry service
			yield* telemetry
				.emitHookExecution(
					new HookExecutionData({
						hookType: hookType ?? "unknown",
						hookName: `${hookType}/${hookName}`,
						pluginName: "unknown",
						pluginVersion: "unknown",
						durationMs,
						success: false,
						outcome: "error",
						summary: "Unknown hook",
					}),
				)
				.pipe(Effect.ignoreLogged);

			// Flush telemetry before exit
			yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

			writeError(errorMessage);
			return { _tag: "exit" as const, code: 2 };
		}).pipe(Effect.scoped);

		const result = await Effect.runPromise(program);
		process.exit(result.code);
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
	// PRIVATE STATIC METHODS - Schema Lookup
	// =========================================================================

	/**
	 * Get the Input schema and Event factory for a hook event type.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic hook schema lookup requires runtime typing
	private static getHookSchemas(
		hookType: HookEventType,
	): { inputSchema: Schema.Schema.Any; fromInput: (input: any) => any } | undefined {
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic hook schema lookup requires runtime typing
		const schemas: Record<string, { inputSchema: Schema.Schema.Any; fromInput: (input: any) => any }> = {
			PreToolUse: { inputSchema: PreToolUseInput, fromInput: (i) => PreToolUseEvent.fromInput(i) },
			PostToolUse: { inputSchema: PostToolUseInput, fromInput: (i) => PostToolUseEvent.fromInput(i) },
			SessionStart: { inputSchema: SessionStartInput, fromInput: (i) => SessionStartEvent.fromInput(i) },
			SessionEnd: { inputSchema: SessionEndInput, fromInput: (i) => SessionEndEvent.fromInput(i) },
			Stop: { inputSchema: StopInput, fromInput: (i) => StopEvent.fromInput(i) },
			SubagentStop: { inputSchema: SubagentStopInput, fromInput: (i) => SubagentStopEvent.fromInput(i) },
			UserPromptSubmit: {
				inputSchema: UserPromptSubmitInput,
				fromInput: (i) => UserPromptSubmitEvent.fromInput(i),
			},
			PreCompact: { inputSchema: PreCompactInput, fromInput: (i) => PreCompactEvent.fromInput(i) },
			Notification: { inputSchema: NotificationInput, fromInput: (i) => NotificationEvent.fromInput(i) },
			PermissionRequest: {
				inputSchema: PermissionRequestInput,
				fromInput: (i) => PermissionRequestEvent.fromInput(i),
			},
		};
		return schemas[hookType];
	}

	/**
	 * Write a JSON response to stdout.
	 */
	private static writeResponse(io: ResolvedIODependencies, response: unknown): void {
		const json = JSON.stringify(response);
		if (io.stdout && "write" in io.stdout) {
			(io.stdout as NodeJS.WritableStream).write(json);
		}
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

	// =========================================================================
	// PRIVATE STATIC METHODS - Response Conversion
	// =========================================================================

	/**
	 * Convert pipeline output to response format based on hook type.
	 * Delegates to the toResponse functions from hook-responses.ts.
	 */
	private static toResponse(hookType: HookEventType, output: AnyPipelineOutput): unknown {
		switch (hookType) {
			case "PreToolUse":
				return toPreToolUseResponse(output as PreToolUsePipelineOutput);
			case "PostToolUse":
				return toPostToolUseResponse(output as PostToolUsePipelineOutput);
			case "SessionStart":
				return toSessionStartResponse(output as SessionStartPipelineOutput);
			case "SessionEnd":
			case "PreCompact":
			case "Notification":
				return toPassthroughResponse(output as PassthroughPipelineOutput);
			case "Stop":
			case "SubagentStop":
				return toStopResponse(output as StopPipelineOutput);
			case "UserPromptSubmit":
				return toUserPromptSubmitResponse(output as UserPromptSubmitPipelineOutput);
			case "PermissionRequest":
				return toPermissionRequestResponse(output as PermissionRequestPipelineOutput);
			default:
				return output;
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
	private static createBaseState(cwd: string, claudeEnvFile: string, _stateInstance: PluginEnv<any>): BaseState {
		return {
			projectDir: Bun.env.CLAUDE_PROJECT_DIR ?? cwd,
			pluginDir: Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
			pluginEnvFile: claudeEnvFile,
		};
	}

	/**
	 * Extract persisted state from the environment.
	 */
	private static extractPersistedState(
		stateInstance: PluginEnv<any>,
		stateSchema?: Schema.Schema<any, any, never>,
	): Record<string, unknown> {
		const prefix = stateInstance.getPrefix();

		// Debug logging helper
		const debugLog = (msg: string) => {
			if (PipelineRuntime.isDebugEnabled()) {
				console.error(`[extractPersistedState] ${msg}`);
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
			const rawState = JSON.parse(jsonStr);

			// If a state schema is provided, decode through it to get a typed instance
			if (stateSchema) {
				const decoded = Schema.decodeUnknownSync(stateSchema)(rawState);
				debugLog(`Decoded state via schema with keys: ${Object.keys(decoded as object).join(", ")}`);
				return decoded as Record<string, unknown>;
			}

			const keys = Object.keys(rawState);
			debugLog(`Successfully parsed state with ${keys.length} keys: ${keys.join(", ")}`);
			return typeof rawState === "object" && rawState !== null ? rawState : {};
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
		toResponse: PipelineRuntime.toResponse,
		isDebugEnabled: PipelineRuntime.isDebugEnabled,
		extractPersistedState: PipelineRuntime.extractPersistedState,
		createBaseState: PipelineRuntime.createBaseState,
	} as const;

	/**
	 * Persist environment variables for SessionStart hooks.
	 */
	private static async persistSessionEnv(options: PersistSessionEnvOptions): Promise<void> {
		const { sessionId, stateInstance, schema, stateSchema, state, baseState } = options;
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
				const validatedOptions = Schema.decodeUnknownSync(schema)(envInput);

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
			// If a state schema is provided, encode through it for proper serialization
			const encoded = stateSchema ? Schema.encodeUnknownSync(stateSchema)(state) : state;
			const jsonStr = JSON.stringify(encoded);
			vars[`${prefix}_PLUGIN_STATE`] = Buffer.from(jsonStr).toString("base64");
		}

		// Persist all variables
		await PluginEnv.persistVars(sessionId, vars);

		// Register session in SQLite registry for subsequent lookups
		// Claude Code names env files with various prefixes (e.g., "sessionstart-hook-0.sh")
		const sessionEnvDir = dirname(claudeEnvFile);
		if (sessionId && baseState.projectDir) {
			PluginEnv.registerSession(sessionId, baseState.projectDir, sessionEnvDir);
		}
	}
}
