import { dirname } from "node:path";
import { Effect, Layer, ParseResult, Schema } from "effect";
import type { ReadonlyDeep } from "type-fest";
import { PipelineError } from "../errors/PipelineError.js";
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
import type { PipelineRunConfig, RunResult } from "../services/PipelineRuntimeService.js";
import { PipelineRuntimeService } from "../services/PipelineRuntimeService.js";
import { PluginEnv } from "../services/PluginEnv.js";
import type { Telemetry } from "../services/Telemetry.js";
import { HookExecutionData } from "../services/Telemetry.js";
import type { AnyPipelineOutput } from "../types/pipeline.js";
import { TokenMetrics, isPipelineOutput } from "../types/pipeline.js";
import { makePluginLoggerLive } from "./PluginLoggerLive.js";

// =============================================================================
// INTERNAL TYPES
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
 * @internal
 */
type TelemetryInterface = Telemetry["Type"];

/**
 * No-op telemetry implementation used when no layer is provided.
 * @internal
 */
const noopTelemetry: TelemetryInterface = {
	emitHookExecution: () => Effect.void,
	emitError: () => Effect.void,
	emitFatalError: () => Effect.succeed(false),
	preconnect: Effect.void,
	flush: () => Effect.succeed(true),
};

/**
 * Options for persisting session environment variables.
 * @internal
 */
interface PersistSessionEnvOptions {
	readonly sessionId: string;
	// biome-ignore lint/suspicious/noExplicitAny: PluginEnv generic varies by plugin
	readonly stateInstance: PluginEnv<any>;
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	readonly schema?: Schema.Schema<any, any, never> | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	readonly stateSchema?: Schema.Schema<any, any, never> | undefined;
	readonly state?: Record<string, unknown> | undefined;
	readonly baseState: BaseState;
}

// =============================================================================
// MODULE-LEVEL HELPER FUNCTIONS
// =============================================================================

/**
 * Get the Input schema and Event factory for a hook event type.
 * @internal
 */
function getHookSchemas(
	hookType: string,
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic hook schema lookup requires runtime typing
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
 * Create the base state object for the setup function.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: PluginEnv generic varies by plugin
function createBaseState(cwd: string, claudeEnvFile: string, _stateInstance: PluginEnv<any>): BaseState {
	return {
		projectDir: Bun.env.CLAUDE_PROJECT_DIR ?? cwd,
		pluginDir: Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
		pluginEnvFile: claudeEnvFile,
	};
}

/**
 * Check if CLAUDE_DEBUG is enabled.
 * @internal
 */
function isDebugEnabled(): boolean {
	const val = Bun.env.CLAUDE_DEBUG;
	return val === "1" || val === "true";
}

/**
 * Extract persisted state from the environment.
 * @internal
 */
function extractPersistedState(
	// biome-ignore lint/suspicious/noExplicitAny: PluginEnv generic varies by plugin
	stateInstance: PluginEnv<any>,
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	stateSchema?: Schema.Schema<any, any, never>,
): Record<string, unknown> {
	const prefix = stateInstance.getPrefix();

	const debugLog = (msg: string) => {
		if (isDebugEnabled()) {
			console.error(`[extractPersistedState] ${msg}`);
		}
	};

	debugLog(`prefix=${prefix}`);

	if (!prefix) {
		debugLog("No prefix available");
		return {};
	}

	const stateEnvKey = `${prefix}_PLUGIN_STATE`;
	const stateJson = Bun.env[stateEnvKey];

	debugLog(`Looking for ${stateEnvKey}, found=${stateJson ? "yes" : "no"}`);

	if (!stateJson) {
		const prefixedVars = Object.keys(Bun.env).filter((k) => k.startsWith(prefix));
		debugLog(`Found ${prefixedVars.length} vars with prefix ${prefix}: ${prefixedVars.join(", ")}`);
		return {};
	}

	try {
		const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
		const rawState = JSON.parse(jsonStr);

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

/**
 * Find the session environment directory for loading persisted state.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Event type varies by hook type
function findSessionEnvDir(event: any): string | undefined {
	if (event.session_id) {
		const dir = PluginEnv.getSessionEnvDir(event.session_id);
		if (dir) return dir;
	}

	if (Bun.env.CLAUDE_SESSION_ID) {
		const dir = PluginEnv.getSessionEnvDir(Bun.env.CLAUDE_SESSION_ID);
		if (dir) return dir;
	}

	if (Bun.env.CLAUDE_ENV_FILE) {
		return dirname(Bun.env.CLAUDE_ENV_FILE);
	}

	for (const [key, value] of Object.entries(Bun.env)) {
		if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
			return dirname(value);
		}
	}

	const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
	const dir = PluginEnv.getProjectSessionEnvDir(cwd);
	if (dir) return dir;

	return undefined;
}

/**
 * Persist environment variables for SessionStart hooks.
 * @internal
 */
async function persistSessionEnv(options: PersistSessionEnvOptions): Promise<void> {
	const { sessionId, stateInstance, schema, stateSchema, state, baseState } = options;
	const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE;
	if (!claudeEnvFile) return;

	const prefix = stateInstance.getPrefix();
	if (!prefix) return;

	const vars: Record<string, string> = {};

	vars[`${prefix}_PROJECT_DIR`] = baseState.projectDir;
	vars[`${prefix}_PLUGIN_DIR`] = baseState.pluginDir;
	vars[`${prefix}_PLUGIN_ENV_FILE`] = baseState.pluginEnvFile;

	if (schema) {
		const envInput: Record<string, string | undefined> = {};
		for (const key of Object.keys(Bun.env)) {
			if (key.startsWith(`${prefix}_`)) {
				const optionName = key.slice(prefix.length + 1);
				envInput[optionName] = Bun.env[key];
			}
		}

		try {
			const validatedOptions = Schema.decodeUnknownSync(schema)(envInput);
			if (typeof validatedOptions === "object" && validatedOptions !== null) {
				for (const [key, value] of Object.entries(validatedOptions)) {
					const stringValue = typeof value === "string" ? value : JSON.stringify(value);
					vars[`${prefix}_${key}`] = stringValue;
				}
			}
		} catch (error) {
			console.error(`[${prefix}] Options validation failed:`, error);
		}
	}

	if (state) {
		const encoded = stateSchema ? Schema.encodeUnknownSync(stateSchema)(state) : state;
		const jsonStr = JSON.stringify(encoded);
		vars[`${prefix}_PLUGIN_STATE`] = Buffer.from(jsonStr).toString("base64");
	}

	await PluginEnv.persistVars(sessionId, vars);

	const sessionEnvDir = dirname(claudeEnvFile);
	if (sessionId && baseState.projectDir) {
		PluginEnv.registerSession(sessionId, baseState.projectDir, sessionEnvDir);
	}
}

/**
 * Map pipeline status and action to HookOutcome for telemetry.
 * @internal
 */
function mapToOutcome(status: ExecutionStatus, action?: HookAction): HookOutcome {
	if (status === "skipped") return "skipped";
	if (status === "error") return "error";
	if (status === "timeout") return "error";
	if (status === "disabled") return "skipped";
	if (status === "cached") {
		if (action === "deny") return "denied";
		if (action === "allow") return "allowed";
		return "passthrough";
	}

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
 * Convert pipeline output to response format based on hook type.
 * @internal
 */
function toResponseForHook(hookType: string, output: AnyPipelineOutput): unknown {
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

/**
 * Helper to write error messages to stderr.
 * @internal
 */
function writeError(msg: string): void {
	process.stderr.write(`${msg}\n`);
}

// =============================================================================
// LIVE LAYER IMPLEMENTATION
// =============================================================================

/**
 * Live implementation of PipelineRuntimeService.
 *
 * @remarks
 * Extracts the core execution logic from `PipelineRuntime.run()`, converting it
 * to an Effect that returns `RunResult` instead of writing stdout and calling
 * `process.exit()`. All Effect services needed by handlers are provided via
 * `config.handlerLayer`.
 *
 * @public
 */
export const PipelineRuntimeServiceLive = Layer.succeed(
	PipelineRuntimeService,
	PipelineRuntimeService.of({
		run: <TOptions, TState>(config: PipelineRunConfig<TOptions, TState>): Effect.Effect<RunResult, PipelineError> => {
			const {
				hookType,
				hookName,
				pluginName,
				pluginVersion,
				handler,
				stateClass,
				tools,
				optionsSchema,
				stateSchema,
				setup,
				handlerLayer,
				inputText,
			} = config;
			const startTime = performance.now();

			// Resolve telemetry — PipelineRunConfig doesn't expose _telemetry,
			// so we always use noopTelemetry for now. Telemetry integration
			// will be wired in a later task when the service is composed.
			const telemetry: TelemetryInterface = noopTelemetry;

			// Cast handler/schemas to their real types for internal use
			const pipeline = handler as PipelineHandler<unknown, unknown, TOptions, TState>;
			// biome-ignore lint/suspicious/noExplicitAny: Schema type varies by plugin
			const typedOptionsSchema = optionsSchema as Schema.Schema<any, any, never> | undefined;
			// biome-ignore lint/suspicious/noExplicitAny: Schema type varies by plugin
			const typedStateSchema = stateSchema as Schema.Schema<any, any, never> | undefined;
			const typedSetup = setup as SetupFunction<TOptions> | undefined;
			// biome-ignore lint/suspicious/noExplicitAny: Layer satisfies handler's service requirements at runtime
			const typedHandlerLayer = handlerLayer as Layer.Layer<any> | undefined;

			return Effect.gen(function* () {
				yield* Effect.annotateLogsScoped({ hookType, hookName, pluginName });
				yield* telemetry.preconnect.pipe(Effect.ignoreLogged);

				// Get hook schemas
				const hookSchemas = getHookSchemas(hookType);
				if (!hookSchemas) {
					return yield* Effect.fail(
						new PipelineError({
							hookName,
							stage: "parse",
							cause: `Unknown hook type: ${hookType}`,
						}),
					);
				}

				// Parse stdin and decode event
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic event parsing requires runtime typing
				let event: any;
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic state instance requires runtime typing
				let stateInstance: any;
				try {
					const rawText = inputText ?? (yield* Effect.tryPromise(() => Bun.stdin.text()));
					const rawInput = JSON.parse(rawText);

					// biome-ignore lint/suspicious/noExplicitAny: inputSchema is dynamically looked up
					const decodedInput = Schema.decodeUnknownSync(hookSchemas.inputSchema as Schema.Schema<any, any, never>)(
						rawInput,
					);
					event = hookSchemas.fromInput(decodedInput);

					yield* Effect.log("input decoded").pipe(Effect.annotateLogs("channel", "pipeline"));

					const toolNameAnnotation =
						"tool_name" in decodedInput && decodedInput.tool_name
							? { channel: "event", toolName: decodedInput.tool_name as string }
							: { channel: "event" };
					yield* Effect.log("hook event received").pipe(Effect.annotateLogs(toolNameAnnotation));

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
					if (ParseResult.isParseError(error)) {
						const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
						writeError(`[${hookName}] Input validation failed:`);
						writeError(formatted);
						if (Bun.env.CLAUDE_DEBUG === "1") {
							writeError(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
						}
						return yield* Effect.fail(
							new PipelineError({
								hookName,
								stage: "parse",
								cause: formatted,
							}),
						);
					}
					throw error;
				}

				// Tool filtering
				if (tools && tools.length > 0 && "tool_name" in event) {
					const toolName = (event as { tool_name: string }).tool_name;
					if (!tools.includes(toolName)) {
						yield* Effect.log("tool filtered, skipping").pipe(Effect.annotateLogs("channel", "pipeline"));
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

						yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

						return { code: 0, response: {} } satisfies RunResult;
					}
				}

				// Load options + state
				const validatedOptions = (stateInstance.vars ?? {}) as TOptions;
				const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
				const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
				const baseState = createBaseState(cwd, claudeEnvFile, stateInstance);

				let state: TState;
				if (hookType === "SessionStart" && typedSetup) {
					state = (yield* Effect.tryPromise(() =>
						Promise.resolve(
							typedSetup({
								options: validatedOptions,
								cwd,
								sessionId: event.session_id,
								baseState,
							}),
						),
					)) as TState;
				} else {
					const sessionEnvDir = findSessionEnvDir(event);
					if (sessionEnvDir) {
						yield* Effect.tryPromise(() => PluginEnv.loadAllHookFiles(sessionEnvDir));
					}
					state = extractPersistedState(stateInstance, typedStateSchema) as TState;
					yield* Effect.log("loaded persisted state").pipe(
						Effect.annotateLogs({ channel: "state", keyCount: Object.keys(state as object).length }),
					);
				}

				// Merge base state with computed state
				const pluginState =
					state !== null && typeof state === "object" && Object.getPrototypeOf(state) !== Object.prototype
						? Object.assign(Object.create(Object.getPrototypeOf(state)), state, baseState)
						: { ...baseState, ...state };

				// Call handler
				yield* Effect.log("invoking handler").pipe(Effect.annotateLogs("channel", "pipeline"));
				const rawOutput = pipeline({
					input: event,
					options: validatedOptions as ReadonlyDeep<TOptions>,
					state: pluginState as ReadonlyDeep<PluginState<TState>>,
				});

				let output: unknown;
				if (Effect.isEffect(rawOutput)) {
					if (typedHandlerLayer) {
						// biome-ignore lint/suspicious/noExplicitAny: Layer satisfies handler's service requirements at runtime
						output = yield* Effect.provide(rawOutput as Effect.Effect<unknown, unknown, any>, typedHandlerLayer);
					} else {
						output = yield* rawOutput as Effect.Effect<unknown>;
					}
				} else if (rawOutput instanceof Promise || (rawOutput && typeof (rawOutput as any).then === "function")) {
					output = yield* Effect.tryPromise(() => rawOutput as Promise<unknown>);
				} else {
					output = rawOutput;
				}

				yield* Effect.log("handler completed").pipe(Effect.annotateLogs("channel", "pipeline"));
				const durationMs = Math.round(performance.now() - startTime);

				// Handle Outcome (new pattern)
				if (Outcome.isOutcome(output)) {
					if (!isValidOutcomeForHook(hookType, output)) {
						const tag = (output.constructor as { _tag?: string })._tag ?? "unknown";
						writeError(`Outcome "${tag}" is not valid for hook type "${hookType}"`);
						return yield* Effect.fail(
							new PipelineError({
								hookName,
								stage: "output",
								cause: `Outcome "${tag}" is not valid for hook type "${hookType}"`,
							}),
						);
					}

					const outcomeTelemetry = output.toTelemetry();

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

					if (hookType === "SessionStart") {
						yield* Effect.tryPromise(() =>
							persistSessionEnv({
								sessionId: event.session_id,
								// biome-ignore lint/suspicious/noExplicitAny: PluginEnv generic varies by plugin
								stateInstance: stateInstance as PluginEnv<any>,
								schema: typedOptionsSchema,
								stateSchema: typedStateSchema,
								state: state as Record<string, unknown>,
								baseState,
							}),
						);
					}

					yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

					return { code: 0, response: output.toResponse(), telemetry: outcomeTelemetry } satisfies RunResult;
				}

				// Handle legacy pipeline output
				if (isPipelineOutput(output)) {
					const action = "action" in output ? (output.action as HookAction) : undefined;
					const outcome = mapToOutcome(output.status, action);

					const tokenMetrics = TokenMetrics.extractFromOutput(output);
					const metrics: Record<string, number | undefined> = {};
					if (tokenMetrics.hookTotal > 0) {
						metrics.contextTokens = tokenMetrics.hookTotal;
					}
					if ("metrics" in output && output.metrics) {
						Object.assign(metrics, output.metrics);
					}

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

					const responseOutput = toResponseForHook(hookType, output);

					if (hookType === "SessionStart") {
						yield* Effect.tryPromise(() =>
							persistSessionEnv({
								sessionId: event.session_id,
								// biome-ignore lint/suspicious/noExplicitAny: PluginEnv generic varies by plugin
								stateInstance: stateInstance as PluginEnv<any>,
								schema: typedOptionsSchema,
								stateSchema: typedStateSchema,
								state: state as Record<string, unknown>,
								baseState,
							}),
						);
					}

					yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

					return { code: 0, response: responseOutput as Record<string, unknown> } satisfies RunResult;
				}

				// Non-pipeline output error
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

				yield* telemetry.flush(500).pipe(Effect.ignoreLogged);
				writeError(errorMessage);

				return yield* Effect.fail(
					new PipelineError({
						hookName,
						stage: "output",
						cause: errorMessage,
					}),
				);
			}).pipe(
				Effect.catchAll((error) => {
					if (error instanceof PipelineError) {
						return Effect.fail(error);
					}
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
							return yield* Effect.fail(
								new PipelineError({
									hookName,
									stage: "validate",
									cause: formatted,
								}),
							);
						});
					}
					return Effect.die(error);
				}),
				Effect.scoped,
				Effect.provide(makePluginLoggerLive(pluginName)),
			);
		},
	}),
);
