import { dirname } from "node:path";
import { Effect, Layer, ParseResult, Schema } from "effect";
import { PluginRuntimeError } from "../errors/PluginRuntimeError.js";
import { NotificationEvent, NotificationInput } from "../hooks/Notification.js";
import type { PermissionRequestOutput } from "../hooks/PermissionRequest.js";
import {
	PermissionRequestEvent,
	PermissionRequestInput,
	toPermissionRequestResponse,
} from "../hooks/PermissionRequest.js";
import type { PostToolUseOutput } from "../hooks/PostToolUse.js";
import { PostToolUseEvent, PostToolUseInput, toPostToolUseResponse } from "../hooks/PostToolUse.js";
import { PreCompactEvent, PreCompactInput } from "../hooks/PreCompact.js";
import type { PreToolUseOutput } from "../hooks/PreToolUse.js";
import { PreToolUseEvent, PreToolUseInput, toPreToolUseResponse } from "../hooks/PreToolUse.js";
import { SessionEndEvent, SessionEndInput } from "../hooks/SessionEnd.js";
import type { SessionStartOutput } from "../hooks/SessionStart.js";
import { SessionStartEvent, SessionStartInput, toSessionStartResponse } from "../hooks/SessionStart.js";
import type { StopOutput } from "../hooks/Stop.js";
import { StopEvent, StopInput, toStopResponse } from "../hooks/Stop.js";
import { SubagentStopEvent, SubagentStopInput } from "../hooks/SubagentStop.js";
import type { ExecutionStatus, HookAction, PassthroughOutput } from "../hooks/shared.js";
import { toPassthroughResponse } from "../hooks/shared.js";
import { isValidOutcomeForHook } from "../hooks/types.js";
import type { UserPromptSubmitOutput } from "../hooks/UserPromptSubmit.js";
import { UserPromptSubmitEvent, UserPromptSubmitInput, toUserPromptSubmitResponse } from "../hooks/UserPromptSubmit.js";
import { Outcome } from "../outcomes/Outcome.js";
import type { PluginHandler, PluginState } from "../plugin/handler.js";
import type { BaseState, SetupFunction } from "../plugin/state.js";
import { EnvBridge } from "../services/EnvBridge.js";
import { EnvCoordinator } from "../services/EnvCoordinator.js";
import { EnvLoader } from "../services/EnvLoader.js";
import { EnvResolver } from "../services/EnvResolver.js";
import type { PluginRunConfig, RunResult } from "../services/PluginRuntimeService.js";
import { PluginRuntimeService } from "../services/PluginRuntimeService.js";
import type { Telemetry } from "../services/Telemetry.js";
import { HookExecutionData } from "../services/Telemetry.js";
import type { ReadonlyDeep } from "../types/common.js";
import type { AnyHookOutput } from "../types/pipeline.js";
import { TokenMetrics, isHookOutput } from "../types/pipeline.js";
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
 * Convert hook output to response format based on hook type.
 * @internal
 */
function toResponseForHook(hookType: string, output: AnyHookOutput): unknown {
	switch (hookType) {
		case "PreToolUse":
			return toPreToolUseResponse(output as PreToolUseOutput);
		case "PostToolUse":
			return toPostToolUseResponse(output as PostToolUseOutput);
		case "SessionStart":
			return toSessionStartResponse(output as SessionStartOutput);
		case "SessionEnd":
		case "PreCompact":
		case "Notification":
			return toPassthroughResponse(output as PassthroughOutput);
		case "Stop":
		case "SubagentStop":
			return toStopResponse(output as StopOutput);
		case "UserPromptSubmit":
			return toUserPromptSubmitResponse(output as UserPromptSubmitOutput);
		case "PermissionRequest":
			return toPermissionRequestResponse(output as PermissionRequestOutput);
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
 * Live implementation of PluginRuntimeService.
 *
 * @remarks
 * Extracts the core execution logic from `PipelineRuntime.run()`, converting it
 * to an Effect that returns `RunResult` instead of writing stdout and calling
 * `process.exit()`. All Effect services needed by handlers are provided via
 * `config.handlerLayer`.
 *
 * Uses EnvCoordinator, EnvResolver, EnvLoader, and EnvBridge for all environment
 * variable management instead of the legacy PluginEnv static methods.
 *
 * @public
 */
export const PluginRuntimeServiceLive = Layer.effect(
	PluginRuntimeService,
	Effect.gen(function* () {
		const coordinator = yield* EnvCoordinator;
		const resolver = yield* EnvResolver;
		const loader = yield* EnvLoader;
		const bridge = yield* EnvBridge;

		return PluginRuntimeService.of({
			run: <TOptions, TState>(
				config: PluginRunConfig<TOptions, TState>,
			): Effect.Effect<RunResult, PluginRuntimeError> => {
				const {
					hookType,
					hookName,
					pluginName,
					pluginVersion,
					handler,
					tools,
					optionsSchema,
					stateSchema,
					prefix,
					setup,
					handlerLayer,
					inputText,
				} = config;
				const startTime = performance.now();

				// Resolve telemetry — PluginRunConfig doesn't expose _telemetry,
				// so we always use noopTelemetry for now. Telemetry integration
				// will be wired in a later task when the service is composed.
				const telemetry: TelemetryInterface = noopTelemetry;

				// Cast handler/schemas to their real types for internal use
				const pipeline = handler as PluginHandler<unknown, unknown, TOptions, TState>;
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
							new PluginRuntimeError({
								hookName,
								stage: "parse",
								cause: `Unknown hook type: ${hookType}`,
							}),
						);
					}

					// Parse stdin and decode event
					// biome-ignore lint/suspicious/noExplicitAny: Dynamic event parsing requires runtime typing
					let event: any;
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
					} catch (error) {
						if (ParseResult.isParseError(error)) {
							const formatted = ParseResult.TreeFormatter.formatErrorSync(error);
							writeError(`[${hookName}] Input validation failed:`);
							writeError(formatted);
							if (Bun.env.CLAUDE_DEBUG === "1") {
								writeError(`\n[${hookName}] Debug: Hook type=${hookType}, Plugin=${pluginName}`);
							}
							return yield* Effect.fail(
								new PluginRuntimeError({
									hookName,
									stage: "parse",
									cause: formatted,
								}),
							);
						}
						throw error;
					}

					// Resolve session env dir via EnvResolver
					const sessionEnvDir = yield* resolver
						.getSessionEnvDir(event.session_id)
						.pipe(Effect.catchAll(() => Effect.succeed(undefined)));

					yield* Effect.log("resolved session env dir").pipe(
						Effect.annotateLogs({ channel: "state", sessionEnvDir: sessionEnvDir ?? "unknown" }),
					);

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

					// Load options + state using EnvCoordinator
					const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
					const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
					const baseState: BaseState = {
						projectDir: Bun.env.CLAUDE_PROJECT_DIR ?? cwd,
						pluginDir: Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
						pluginEnvFile: claudeEnvFile,
					};

					let validatedOptions: TOptions;
					let state: TState;

					if (hookType === "SessionStart") {
						// For SessionStart: use coordinator to load and validate options
						if (typedOptionsSchema) {
							validatedOptions = yield* coordinator
								.forSessionStart(typedOptionsSchema, {
									projectRoot: baseState.projectDir,
									sessionId: event.session_id,
									hookName,
								})
								.pipe(
									Effect.catchAll((error) =>
										Effect.fail(
											new PluginRuntimeError({
												hookName,
												stage: "validate",
												cause: error,
											}),
										),
									),
								);
						} else {
							validatedOptions = {} as TOptions;
						}

						// Run setup function if provided
						if (typedSetup) {
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
							state = {} as TState;
						}
					} else {
						// For non-SessionStart hooks: find env dir and load persisted state
						const envDir = yield* findSessionEnvDirEffect(event, resolver);

						if (envDir) {
							yield* loader.loadSessionEnvFiles(envDir).pipe(Effect.catchAll(() => Effect.succeed(0)));
						}

						// Load options via coordinator
						if (typedOptionsSchema) {
							const hookParams: { sessionId: string; sessionEnvDir?: string; hookName?: string } = {
								sessionId: event.session_id ?? Bun.env.CLAUDE_SESSION_ID ?? "",
								hookName,
							};
							if (envDir) hookParams.sessionEnvDir = envDir;
							validatedOptions = yield* coordinator.forHook(typedOptionsSchema, hookParams).pipe(
								Effect.catchAll((error) =>
									Effect.fail(
										new PluginRuntimeError({
											hookName,
											stage: "validate",
											cause: error,
										}),
									),
								),
							);
						} else {
							validatedOptions = {} as TOptions;
						}

						// Extract persisted state from env
						state = (yield* extractPersistedStateEffect(prefix, typedStateSchema, bridge)) as TState;

						yield* Effect.log("loaded persisted state").pipe(
							Effect.annotateLogs({
								channel: "state",
								keyCount: Object.keys(state as object).length,
							}),
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
								new PluginRuntimeError({
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
							yield* persistSessionEnvEffect({
								sessionId: event.session_id,
								prefix,
								optionsSchema: typedOptionsSchema,
								stateSchema: typedStateSchema,
								state: state as Record<string, unknown>,
								baseState,
								coordinator,
								bridge,
								resolver,
							});
						}

						yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

						return {
							code: 0,
							response: output.toResponse(),
							telemetry: outcomeTelemetry,
						} satisfies RunResult;
					}

					// Handle legacy hook output
					if (isHookOutput(output)) {
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
							yield* persistSessionEnvEffect({
								sessionId: event.session_id,
								prefix,
								optionsSchema: typedOptionsSchema,
								stateSchema: typedStateSchema,
								state: state as Record<string, unknown>,
								baseState,
								coordinator,
								bridge,
								resolver,
							});
						}

						yield* telemetry.flush(500).pipe(Effect.ignoreLogged);

						return {
							code: 0,
							response: responseOutput as Record<string, unknown>,
						} satisfies RunResult;
					}

					// Non-hook output error
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
						new PluginRuntimeError({
							hookName,
							stage: "output",
							cause: errorMessage,
						}),
					);
				}).pipe(
					Effect.catchAll((error) => {
						if (error instanceof PluginRuntimeError) {
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
									new PluginRuntimeError({
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
		});
	}),
);

// =============================================================================
// INTERNAL EFFECT HELPERS
// =============================================================================

/**
 * Find the session environment directory using EnvResolver.
 * Tries session_id from event, then CLAUDE_SESSION_ID, then CLAUDE_ENV_FILE,
 * then project dir fallback.
 * @internal
 */
function findSessionEnvDirEffect(
	// biome-ignore lint/suspicious/noExplicitAny: Event type varies by hook type
	event: any,
	resolverService: EnvResolver["Type"],
): Effect.Effect<string | undefined, never> {
	return Effect.gen(function* () {
		// Try event session_id
		if (event.session_id) {
			const dir = yield* resolverService
				.getSessionEnvDir(event.session_id)
				.pipe(Effect.catchAll(() => Effect.succeed(undefined)));
			if (dir) return dir;
		}

		// Try CLAUDE_SESSION_ID env var
		if (Bun.env.CLAUDE_SESSION_ID) {
			const dir = yield* resolverService
				.getSessionEnvDir(Bun.env.CLAUDE_SESSION_ID)
				.pipe(Effect.catchAll(() => Effect.succeed(undefined)));
			if (dir) return dir;
		}

		// Try CLAUDE_ENV_FILE
		if (Bun.env.CLAUDE_ENV_FILE) {
			return dirname(Bun.env.CLAUDE_ENV_FILE);
		}

		// Try any *_PLUGIN_ENV_FILE env var
		for (const [key, value] of Object.entries(Bun.env)) {
			if (key.endsWith("_PLUGIN_ENV_FILE") && value) {
				return dirname(value);
			}
		}

		// Try project dir fallback
		const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
		const dir = yield* resolverService
			.getProjectSessionEnvDir(cwd)
			.pipe(Effect.catchAll(() => Effect.succeed(undefined)));
		if (dir) return dir;

		return undefined;
	});
}

/**
 * Extract persisted state from the environment using EnvBridge.
 * Reads the PREFIX_PLUGIN_STATE env var, base64-decodes it, and
 * optionally validates through the state schema.
 * @internal
 */
function extractPersistedStateEffect<TState>(
	prefix: string | undefined,
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	stateSchema: Schema.Schema<any, any, never> | undefined,
	bridgeService: EnvBridge["Type"],
): Effect.Effect<TState, never> {
	return Effect.gen(function* () {
		yield* Effect.logDebug(`[extractPersistedState] prefix=${prefix}`);

		if (!prefix) {
			yield* Effect.logDebug("[extractPersistedState] No prefix available");
			return {} as TState;
		}

		const stateEnvKey = `${prefix}_PLUGIN_STATE`;
		const envVars = yield* bridgeService.read([stateEnvKey]);
		const stateJson = envVars[stateEnvKey];

		yield* Effect.logDebug(`[extractPersistedState] Looking for ${stateEnvKey}, found=${stateJson ? "yes" : "no"}`);

		if (!stateJson) {
			// Log prefixed vars for debugging
			const allVars = yield* bridgeService.readAll();
			const prefixedVars = Object.keys(allVars).filter((k) => k.startsWith(prefix));
			yield* Effect.logDebug(
				`[extractPersistedState] Found ${prefixedVars.length} vars with prefix ${prefix}: ${prefixedVars.join(", ")}`,
			);
			return {} as TState;
		}

		const parseResult = yield* Effect.try({
			try: () => {
				const jsonStr = Buffer.from(stateJson, "base64").toString("utf8");
				return JSON.parse(jsonStr);
			},
			catch: (e) => e,
		}).pipe(Effect.option);

		if (parseResult._tag === "None") {
			yield* Effect.logDebug(`[extractPersistedState] Failed to parse ${stateEnvKey}`);
			return {} as TState;
		}

		const rawState = parseResult.value;

		if (stateSchema) {
			const decoded = Schema.decodeUnknownSync(stateSchema)(rawState);
			yield* Effect.logDebug(
				`[extractPersistedState] Decoded state via schema with keys: ${Object.keys(decoded as object).join(", ")}`,
			);
			return decoded as TState;
		}

		const keys = Object.keys(rawState);
		yield* Effect.logDebug(
			`[extractPersistedState] Successfully parsed state with ${keys.length} keys: ${keys.join(", ")}`,
		);
		return (typeof rawState === "object" && rawState !== null ? rawState : {}) as TState;
	});
}

/**
 * Options for the persist session env helper.
 * @internal
 */
interface PersistOptions {
	readonly sessionId: string;
	readonly prefix: string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	readonly optionsSchema?: Schema.Schema<any, any, never> | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Schema type varies
	readonly stateSchema?: Schema.Schema<any, any, never> | undefined;
	readonly state?: Record<string, unknown> | undefined;
	readonly baseState: BaseState;
	readonly coordinator: EnvCoordinator["Type"];
	readonly bridge: EnvBridge["Type"];
	readonly resolver: EnvResolver["Type"];
}

/**
 * Persist environment variables for SessionStart hooks using EnvCoordinator.
 * @internal
 */
function persistSessionEnvEffect(options: PersistOptions): Effect.Effect<void, never> {
	const { sessionId, prefix, optionsSchema, stateSchema, state, baseState, coordinator, bridge, resolver } = options;

	return Effect.gen(function* () {
		const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE;
		if (!claudeEnvFile) return;
		if (!prefix) return;

		const vars: Record<string, string> = {};

		// Base state vars
		vars[`${prefix}_PROJECT_DIR`] = baseState.projectDir;
		vars[`${prefix}_PLUGIN_DIR`] = baseState.pluginDir;
		vars[`${prefix}_PLUGIN_ENV_FILE`] = baseState.pluginEnvFile;

		// Validated options from env
		if (optionsSchema) {
			const allVars = yield* bridge.readAll();
			const envInput: Record<string, string | undefined> = {};
			for (const key of Object.keys(allVars)) {
				if (key.startsWith(`${prefix}_`)) {
					const optionName = key.slice(prefix.length + 1);
					envInput[optionName] = allVars[key];
				}
			}

			const validationResult = yield* Effect.try({
				try: () => Schema.decodeUnknownSync(optionsSchema)(envInput),
				catch: (error) => error,
			}).pipe(Effect.option);

			if (validationResult._tag === "Some") {
				const validatedOptions = validationResult.value;
				if (typeof validatedOptions === "object" && validatedOptions !== null) {
					for (const [key, value] of Object.entries(validatedOptions)) {
						const stringValue = typeof value === "string" ? value : JSON.stringify(value);
						vars[`${prefix}_${key}`] = stringValue;
					}
				}
			} else {
				yield* Effect.logError(`[${prefix}] Options validation failed`);
			}
		}

		// Persisted state
		if (state) {
			const encoded = stateSchema ? Schema.encodeUnknownSync(stateSchema)(state) : state;
			const jsonStr = JSON.stringify(encoded);
			vars[`${prefix}_PLUGIN_STATE`] = Buffer.from(jsonStr).toString("base64");
		}

		// Persist via coordinator
		yield* coordinator
			.persistSessionEnv({
				sessionId,
				prefix,
				vars,
				projectDir: baseState.projectDir,
				claudeEnvFile,
			})
			.pipe(Effect.catchAll(() => Effect.void));

		// Register session mapping
		const sessionEnvDir = dirname(claudeEnvFile);
		if (sessionId && baseState.projectDir) {
			yield* resolver
				.registerSession(sessionId, baseState.projectDir, sessionEnvDir)
				.pipe(Effect.catchAll(() => Effect.void));
		}
	}).pipe(Effect.catchAll(() => Effect.void));
}
