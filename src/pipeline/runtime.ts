/**
 * Runtime execution for pipeline-based hooks.
 *
 * @remarks
 * This module provides the core execution infrastructure for pipeline handlers.
 * It bridges the gap between the structured pipeline output format and Claude
 * Code's expected response format.
 *
 * **Key Functions:**
 * - {@link runPipeline} - Main entry point for executing pipeline handlers
 * - {@link runRawHandler} - Entry point for raw handlers (direct HookEvent access)
 * - {@link convertToResponse} - Converts pipeline outputs to response format
 *
 * **Execution Flow:**
 * 1. Parse stdin JSON and create HookEvent instance
 * 2. Load environment via ClaudeBinaryPluginEnv
 * 3. Run setup() if SessionStart to compute state
 * 4. Apply tool filters for PreToolUse/PostToolUse
 * 5. Call pipeline handler with `{ input, options, env }` context
 * 6. Convert output to Claude Code response format
 * 7. Extract metrics and emit OTEL telemetry
 * 8. Write response to stdout and exit
 *
 * **Response Conversion:**
 * Pipeline outputs use semantic field names that get mapped to Claude Code's
 * response format:
 * - `claudeContext` → `additionalContext`
 * - `action: "deny"` → `permissionDecision: "deny"`
 * - `action: "block"` → `decision: "block"`
 * - `userMessage` → `systemMessage` (via HookEvent response builder)
 *
 * @see {@link runPipeline} - Execute a pipeline handler
 * @see {@link runRawHandler} - Execute a raw handler
 * @module
 */

import { z } from "zod";
import { ClaudeBinaryPluginEnv } from "../env/plugin-env.js";
import {
	NotificationHookEvent,
	PermissionRequestHookEvent,
	PostToolUseHookEvent,
	PreCompactHookEvent,
	PreToolUseHookEvent,
	SessionEndHookEvent,
	SessionStartHookEvent,
	StopHookEvent,
	SubagentStopHookEvent,
	UserPromptSubmitHookEvent,
} from "../events/subclasses.js";
import type { HookOutcome } from "../otel/events.js";
import { emitHookExecution } from "../otel/events.js";
import type { BaseEnv, PipelineHandler, SetupFunction } from "./config.js";

// =============================================================================
// INTERNAL RESPONSE TYPES (for Claude Code response builder)
// =============================================================================

/**
 * Internal type for PreToolUse response builder.
 * This is the format expected by the Claude Code response builder,
 * converted from pipeline output format.
 * @public
 */
export interface PreToolUseResponse {
	permissionDecision: "allow" | "deny" | "ask";
	reason?: string;
	updatedInput?: Record<string, unknown>;
}

/**
 * Internal type for PostToolUse response builder.
 * @public
 */
export interface PostToolUseResponse {
	additionalContext?: string;
	decision?: "block";
	reason?: string;
}

/**
 * Internal type for SessionStart response builder.
 * @public
 */
export interface SessionStartResponse {
	additionalContext?: string;
}

/**
 * Internal type for Stop/SubagentStop response builder.
 * @public
 */
export interface StopResponse {
	decision?: "block";
	reason?: string;
}

/**
 * Internal type for UserPromptSubmit response builder.
 * @public
 */
export interface UserPromptSubmitResponse {
	additionalContext?: string;
	decision?: "block";
	reason?: string;
}

/**
 * Internal type for PermissionRequest response builder.
 * @public
 */
export interface PermissionRequestResponse {
	behavior: "allow" | "deny";
	message?: string;
	interrupt?: boolean;
	updatedInput?: Record<string, unknown>;
}

import { extractTokenMetrics } from "./metrics.js";
import type { AnyPipelineOutput, ExecutionStatus, HookAction } from "./types.js";
import { isPipelineOutput } from "./types.js";

// Re-export types that are used in exports
export type { ExecutionStatus, HookAction } from "./types.js";

// =============================================================================
// HOOK EVENT CONSTRUCTORS MAP
// =============================================================================

/**
 * Lazily initialized map of hook event constructors.
 * Uses a function to avoid circular dependency issues when
 * index.ts re-exports from this module while we import event
 * classes from index.ts.
 * @internal
 */
function getHookEventClasses() {
	return {
		PreToolUse: PreToolUseHookEvent,
		PostToolUse: PostToolUseHookEvent,
		SessionStart: SessionStartHookEvent,
		SessionEnd: SessionEndHookEvent,
		Stop: StopHookEvent,
		SubagentStop: SubagentStopHookEvent,
		UserPromptSubmit: UserPromptSubmitHookEvent,
		PreCompact: PreCompactHookEvent,
		Notification: NotificationHookEvent,
		PermissionRequest: PermissionRequestHookEvent,
	} as const;
}

/**
 * Union of all hook event type names.
 * @public
 */
export type HookEventType = keyof ReturnType<typeof getHookEventClasses>;

// =============================================================================
// PIPELINE OUTPUT PROCESSING
// =============================================================================

/**
 * Map pipeline status and action to HookOutcome for telemetry.
 * @public
 */
function mapToOutcome(status: ExecutionStatus, action?: HookAction): HookOutcome {
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
 * @public
 */
function mapToPermissionDecision(action?: HookAction): "allow" | "deny" | "ask" | undefined {
	if (action === "allow" || action === "deny" || action === "ask") {
		return action;
	}
	// For "modify", we allow with updated input
	if (action === "modify") {
		return "allow";
	}
	return undefined;
}

/**
 * Convert pipeline output to PreToolUse response format.
 * @public
 */
function convertToPreToolUseResponse(output: AnyPipelineOutput): PreToolUseResponse {
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
 * @public
 */
function convertToPostToolUseResponse(output: AnyPipelineOutput): PostToolUseResponse {
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
 * @public
 */
function convertToSessionStartResponse(output: AnyPipelineOutput): SessionStartResponse {
	if ("claudeContext" in output && output.claudeContext) {
		return { additionalContext: output.claudeContext };
	}
	return {};
}

/**
 * Convert pipeline output to Stop response format.
 * @public
 */
function convertToStopResponse(output: AnyPipelineOutput): StopResponse {
	const action = "action" in output ? output.action : undefined;

	if (action === "block" && "reason" in output && output.reason) {
		return { decision: "block", reason: output.reason };
	}
	return {};
}

/**
 * Convert pipeline output to UserPromptSubmit response format.
 * @public
 */
function convertToUserPromptSubmitResponse(output: AnyPipelineOutput): UserPromptSubmitResponse {
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
 * @public
 */
function convertToPermissionRequestResponse(output: AnyPipelineOutput): PermissionRequestResponse {
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
 * @public
 */
function convertToResponse(hookType: HookEventType, output: AnyPipelineOutput): unknown {
	switch (hookType) {
		case "PreToolUse":
			return convertToPreToolUseResponse(output);
		case "PostToolUse":
			return convertToPostToolUseResponse(output);
		case "SessionStart":
			return convertToSessionStartResponse(output);
		case "SessionEnd":
		case "PreCompact":
		case "Notification":
			return {}; // Passthrough
		case "Stop":
		case "SubagentStop":
			return convertToStopResponse(output);
		case "UserPromptSubmit":
			return convertToUserPromptSubmitResponse(output);
		case "PermissionRequest":
			return convertToPermissionRequestResponse(output);
		default:
			return output;
	}
}

// =============================================================================
// PIPELINE RUNNER
// =============================================================================

/**
 * I/O dependencies for runPipeline.
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
 * Resolved I/O dependencies type (inputText remains optional).
 */
type ResolvedIODependencies = Required<Omit<IODependencies, "inputText">> & Pick<IODependencies, "inputText">;

/**
 * Default I/O dependencies using process globals.
 */
const defaultIO: ResolvedIODependencies = {
	stdin: process.stdin,
	stdout: process.stdout,
	stderr: process.stderr,
	exit: (code: number) => process.exit(code),
	cwd: () => process.cwd(),
};

/**
 * Options for running a pipeline hook.
 * @public
 */
export interface RunPipelineOptions<TOptions = unknown, TState = Record<string, string>> {
	/** Hook event type */
	hookType: HookEventType;
	/** Hook name for logging/telemetry */
	hookName: string;
	/** Plugin name for telemetry (passed explicitly to avoid env var cross-contamination) */
	pluginName: string;
	/** Plugin version for telemetry */
	pluginVersion: string;
	/** The pipeline handler function */
	pipeline: PipelineHandler<unknown, unknown, TOptions, TState>;
	/** Environment class for loading env vars */
	envClass: new () => ClaudeBinaryPluginEnv<TOptions>;
	/** Tool filter (for PreToolUse/PostToolUse) */
	tools?: string[];
	/** Zod schema for validating options (used for SessionStart persistence) */
	schema?: z.ZodType<TOptions>;
	/** Setup function for computing derived variables (used for SessionStart persistence) */
	setup?: SetupFunction<TOptions>;
	/** I/O dependencies (defaults to process.*) - for testing */
	io?: IODependencies;
}

/**
 * Apply PreToolUse pipeline output.
 */
function applyPreToolUseOutput(event: PreToolUseHookEvent, output: PreToolUseResponse): never {
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
function applyPostToolUseOutput(event: PostToolUseHookEvent, output: PostToolUseResponse): never {
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
function applySessionStartOutput(event: SessionStartHookEvent, output: SessionStartResponse): never {
	const response = event.response();
	if (output.additionalContext) {
		response.additionalContext(output.additionalContext);
	}
	event.end(response);
}

/**
 * Apply Stop/SubagentStop pipeline output.
 */
function applyStopOutput(event: StopHookEvent | SubagentStopHookEvent, output: StopResponse): never {
	const response = event.response();
	if ("decision" in output && output.decision === "block") {
		response.block(output.reason ?? "Blocked by hook");
	}
	event.end(response);
}

/**
 * Apply UserPromptSubmit pipeline output.
 */
function applyUserPromptSubmitOutput(event: UserPromptSubmitHookEvent, output: UserPromptSubmitResponse): never {
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
function applyPermissionRequestOutput(event: PermissionRequestHookEvent, output: PermissionRequestResponse): never {
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
function applyPassthroughOutput(event: SessionEndHookEvent | PreCompactHookEvent | NotificationHookEvent): never {
	event.end(event.response());
}

/**
 * Dispatch to the correct apply function based on hook type.
 */
// biome-ignore lint/suspicious/noExplicitAny: Dynamic dispatch based on hook type
function applyPipelineOutput(event: any, hookType: HookEventType, output: unknown): never {
	switch (hookType) {
		case "PreToolUse":
			return applyPreToolUseOutput(event, output as PreToolUseResponse);
		case "PostToolUse":
			return applyPostToolUseOutput(event, output as PostToolUseResponse);
		case "SessionStart":
			return applySessionStartOutput(event, output as SessionStartResponse);
		case "SessionEnd":
		case "PreCompact":
		case "Notification":
			return applyPassthroughOutput(event);
		case "Stop":
		case "SubagentStop":
			return applyStopOutput(event, output as StopResponse);
		case "UserPromptSubmit":
			return applyUserPromptSubmitOutput(event, output as UserPromptSubmitResponse);
		case "PermissionRequest":
			return applyPermissionRequestOutput(event, output as PermissionRequestResponse);
		default: {
			// Exhaustive check
			const _exhaustive: never = hookType;
			throw new Error(`Unknown hook type: ${_exhaustive}`);
		}
	}
}

/**
 * Execute a pipeline hook handler.
 *
 * @remarks
 * This is the main entry point for compiled pipeline hooks. The generated
 * entrypoint calls this function with the appropriate configuration for
 * each hook type.
 *
 * **Execution steps:**
 * 1. Create HookEvent from stdin JSON
 * 2. Check tool filter (PreToolUse/PostToolUse only)
 * 3. Load environment via `envClass.forContext()`
 * 4. Run `setup()` and persist state if SessionStart
 * 5. Call pipeline handler with `{ input, options, env }`
 * 6. Validate output matches hook type schema
 * 7. Extract metrics and emit OTEL telemetry
 * 8. Convert to response format and write to stdout
 * 9. Exit process with appropriate code
 *
 * **Tool filtering:**
 * For PreToolUse and PostToolUse, if `tools` is specified, the hook
 * only runs when the tool name matches. Non-matching tools passthrough
 * immediately without calling the handler.
 *
 * **Error handling:**
 * - Validation errors are logged to stderr and exit code 2
 * - Uncaught exceptions are caught, logged, and exit code 2
 * - Handler-thrown errors should return error status in output
 *
 * @param options - Pipeline configuration including hookType, handler, schema
 *
 * @typeParam TOptions - Type of validated options from plugin schema
 * @typeParam TState - Type of computed state from setup()
 *
 * @public
 */
export async function runPipeline<TOptions = unknown, TState = Record<string, string>>(
	options: RunPipelineOptions<TOptions, TState>,
): Promise<never> {
	const { hookType, hookName, pluginName, pluginVersion, pipeline, envClass, tools, schema, setup } = options;
	const startTime = performance.now();

	// Merge provided I/O with defaults
	const io: ResolvedIODependencies = { ...defaultIO, ...options.io };

	// Helper to write to stderr
	const writeError = (msg: string) => {
		if (io.stderr && "write" in io.stderr) {
			(io.stderr as NodeJS.WritableStream).write(`${msg}\n`);
		}
	};

	// Get the appropriate event class
	const EventClass = getHookEventClasses()[hookType];
	if (!EventClass) {
		writeError(`Unknown hook type: ${hookType}`);
		io.exit(2);
	}

	// Create the event from stdin
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic event creation requires runtime typing
	let event: any;
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic env creation requires runtime typing
	let env: any;
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
			envClass,
		});
		event = result.event;
		env = result.env;
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

			emitHookExecution(event, hookName, {
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
		// Extract options from env.vars (validated schema output)
		const validatedOptions = (env.vars ?? {}) as TOptions;

		// For SessionStart, run setup() BEFORE the hook to get fresh state.
		// For other hooks, extract state from the persisted env.
		const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
		const cwd = "cwd" in event ? (event.cwd as string) : io.cwd();
		const baseEnv = createBaseEnv(cwd, claudeEnvFile, env);

		let state: TState;
		if (hookType === "SessionStart" && setup) {
			state = (await setup({
				options: validatedOptions,
				cwd,
				sessionId: event.session_id,
				env: baseEnv,
			})) as TState;
		} else {
			state = extractStateFromEnv(env) as TState;
		}

		// Merge base env with state to create full plugin env
		// Include logger methods from the env instance
		const pluginEnv = {
			...baseEnv,
			...state,
			// Bind logger methods from env instance so they work in handlers
			log: env.log.bind(env),
			info: env.info.bind(env),
			debug: env.debug.bind(env),
		};

		// Call the pipeline handler with new context shape
		const output = await pipeline({ input: event, options: validatedOptions, env: pluginEnv });

		// Calculate duration (rounded to whole ms to match Claude Code)
		const durationMs = Math.round(performance.now() - startTime);

		// Check if this is a pipeline output
		if (isPipelineOutput(output)) {
			// Extract telemetry from pipeline output
			const action = "action" in output ? (output.action as HookAction) : undefined;
			const outcome = mapToOutcome(output.status, action);

			// Extract token metrics for auto-instrumentation
			const tokenMetrics = extractTokenMetrics(output);

			// Build telemetry metrics
			const metrics: Record<string, number | undefined> = {};
			if (tokenMetrics.hookTotal > 0) {
				metrics.contextTokens = tokenMetrics.hookTotal;
			}
			if ("metrics" in output && output.metrics) {
				Object.assign(metrics, output.metrics);
			}

			// Emit hook execution telemetry
			emitHookExecution(event, hookName, {
				hookType,
				pluginName,
				pluginVersion,
				durationMs,
				success: output.status !== "error" && output.status !== "timeout",
				outcome,
				summary: output.summary,
				toolName: "tool_name" in event ? (event.tool_name as string) : undefined,
				toolUseId: "tool_use_id" in event ? (event.tool_use_id as string) : undefined,
				permissionDecision: mapToPermissionDecision(action),
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
			const responseOutput = convertToResponse(hookType, output);

			// For SessionStart hooks, persist environment variables
			if (hookType === "SessionStart") {
				await persistSessionEnv({
					event: event as SessionStartHookEvent,
					env: env as ClaudeBinaryPluginEnv<unknown>,
					schema,
					state: state as Record<string, unknown>,
					baseEnv,
				});
			}

			// Apply response output and end
			applyPipelineOutput(event, hookType, responseOutput);
		} else {
			// Non-pipeline output detected - pipeline outputs are required
			// All handlers must return objects with { status, summary, action?, ... }
			const durationMs = Math.round(performance.now() - startTime);
			const errorMessage =
				`Hook "${hookName}" returned non-pipeline output. ` +
				`Pipeline outputs are required (must have status and summary fields). ` +
				`Received: ${JSON.stringify(output)}`;

			emitHookExecution(event, hookName, {
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

			// event.error() calls process.exit() internally, but event is typed as any
			// so TypeScript can't infer never - throw to satisfy the return type
			event.error(errorMessage);
			throw new Error(errorMessage); // unreachable, but satisfies never
		}
	} catch (error) {
		const durationMs = Math.round(performance.now() - startTime);

		if (error instanceof z.ZodError) {
			// Output validation failed - emit error telemetry
			emitHookExecution(event, hookName, {
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
 * Check if CLAUDE_DEBUG is enabled (handles "1", "true", etc.)
 * @internal
 */
function isDebugEnabled(): boolean {
	const val = Bun.env.CLAUDE_DEBUG;
	return val === "1" || val === "true";
}

/**
 * Extract state from the environment.
 * Reads `prefix`_PLUGIN_STATE and parses it as JSON.
 *
 * @param env - The plugin environment instance
 * @returns State object parsed from `prefix`_PLUGIN_STATE
 * @internal
 */
function extractStateFromEnv(env: ClaudeBinaryPluginEnv<unknown>): Record<string, unknown> {
	const prefix = env.getPrefix();

	// Always log to file for debugging (bypasses stderr issues)
	const debugLog = (msg: string) => {
		if (isDebugEnabled()) {
			// Use env's logger if available, otherwise console.error
			if (typeof env.info === "function") {
				env.info(`[extractStateFromEnv] ${msg}`);
			} else {
				console.error(`[extractStateFromEnv] ${msg}`);
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

/**
 * Options for persisting session environment variables.
 */
interface PersistSessionEnvOptions {
	event: SessionStartHookEvent;
	env: ClaudeBinaryPluginEnv<unknown>;
	schema?: z.ZodType<unknown>;
	/** State from setup() - will be JSON-stringified */
	state?: Record<string, unknown>;
	/** Base env (projectDir, pluginDir, pluginEnvFile) */
	baseEnv: BaseEnv;
}

/**
 * Create the base env object for the setup function.
 * @internal
 */
function createBaseEnv(cwd: string, claudeEnvFile: string, env: ClaudeBinaryPluginEnv<unknown>): BaseEnv {
	return {
		projectDir: Bun.env.CLAUDE_PROJECT_DIR ?? cwd,
		pluginDir: Bun.env.CLAUDE_PLUGIN_ROOT ?? "",
		pluginEnvFile: claudeEnvFile,
		// Bind logger methods from env instance
		log: env.log.bind(env),
		info: env.info.bind(env),
		debug: env.debug.bind(env),
	};
}

/**
 * Persist environment variables for SessionStart hooks.
 *
 * Writes exactly 4 env vars:
 * 1. {prefix}_PROJECT_DIR - project directory path
 * 2. {prefix}_PLUGIN_DIR - plugin directory path
 * 3. {prefix}_PLUGIN_ENV_FILE - path to the env file
 * 4. {prefix}_PLUGIN_STATE - JSON-stringified state from setup()
 *
 * Options from the schema are persisted with their original keys for compatibility.
 */
async function persistSessionEnv(options: PersistSessionEnvOptions): Promise<void> {
	const { event, env, schema, state, baseEnv } = options;
	const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE;
	if (!claudeEnvFile) {
		return; // No env file to write to
	}

	// Get the plugin prefix from the env instance
	const prefix = env.getPrefix();
	if (!prefix) {
		return; // No prefix, can't construct variable names
	}

	const vars: Record<string, string> = {};

	// ─────────────────────────────────────────────────────────────────────────
	// Base env vars (always written)
	// ─────────────────────────────────────────────────────────────────────────
	vars[`${prefix}_PROJECT_DIR`] = baseEnv.projectDir;
	vars[`${prefix}_PLUGIN_DIR`] = baseEnv.pluginDir;
	vars[`${prefix}_PLUGIN_ENV_FILE`] = baseEnv.pluginEnvFile;

	// ─────────────────────────────────────────────────────────────────────────
	// Options (validated from schema with defaults)
	// ─────────────────────────────────────────────────────────────────────────
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

	// ─────────────────────────────────────────────────────────────────────────
	// State (JSON-stringified and base64-encoded to avoid shell escaping issues)
	// ─────────────────────────────────────────────────────────────────────────
	if (state) {
		// Base64 encode to avoid shell escaping issues with $, backticks, quotes, etc.
		const jsonStr = JSON.stringify(state);
		vars[`${prefix}_PLUGIN_STATE`] = Buffer.from(jsonStr).toString("base64");
	}

	// Persist all variables
	await ClaudeBinaryPluginEnv.persistVars(event.session_id, vars);

	// Register session in SQLite registry for subsequent lookups
	const sessionEnvDir = claudeEnvFile.replace(/\/hook-\d+\.sh$/, "");
	if (sessionEnvDir !== claudeEnvFile && event.session_id && baseEnv.projectDir) {
		ClaudeBinaryPluginEnv.registerSession(event.session_id, baseEnv.projectDir, sessionEnvDir);
	}
}

/**
 * Options for running a raw handler hook.
 * @public
 */
export interface RunRawHandlerOptions<TOptions, TState = Record<string, string>> {
	/** Hook event type */
	hookType: HookEventType;
	/** Hook name for logging */
	hookName: string;
	/** Plugin name for telemetry (passed explicitly to avoid env var cross-contamination) */
	pluginName: string;
	/** Plugin version for telemetry */
	pluginVersion: string;
	/** The raw handler function */
	handler: (ctx: { event: unknown; options: TOptions; env: TState }) => void | Promise<void>;
	/** Environment class */
	envClass: new () => ClaudeBinaryPluginEnv<TOptions>;
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
 * @typeParam TOptions - Type of validated options from plugin schema
 * @typeParam TState - Type of computed state from setup()
 *
 * @public
 */
export async function runRawHandler<TOptions, TState = Record<string, string>>(
	options: RunRawHandlerOptions<TOptions, TState>,
): Promise<void> {
	const { hookType, hookName, pluginName, pluginVersion, handler, envClass } = options;

	const EventClass = getHookEventClasses()[hookType];
	if (!EventClass) {
		console.error(`Unknown hook type: ${hookType}`);
		process.exit(2);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Dynamic event creation requires runtime typing
	let event: any;
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic env creation requires runtime typing
	let env: any;
	try {
		// biome-ignore lint/suspicious/noExplicitAny: EventClass is dynamically selected at runtime
		const result = await (EventClass as any).create({
			name: hookName,
			pluginName,
			pluginVersion,
			stdin: process.stdin,
			stdout: process.stdout,
			stderr: process.stderr,
			envClass,
		});
		event = result.event;
		env = result.env;
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

	// Extract options and state, merge with base env
	const handlerOptions = (env.vars ?? {}) as TOptions;
	const claudeEnvFile = Bun.env.CLAUDE_ENV_FILE ?? "";
	const cwd = "cwd" in event ? (event.cwd as string) : process.cwd();
	const baseEnv = createBaseEnv(cwd, claudeEnvFile, env);
	const state = extractStateFromEnv(env);
	const pluginEnv = { ...baseEnv, ...state } as TState;

	await handler({ event, options: handlerOptions, env: pluginEnv });
}

/**
 * Handle an unknown hook by emitting telemetry and exiting with error.
 *
 * This function is called when a plugin receives a hook invocation for
 * a hook that doesn't exist. It:
 * 1. Parses the hook key to extract type and name
 * 2. Reads stdin to get session info for telemetry
 * 3. Emits error telemetry
 * 4. Writes error to stderr
 * 5. Exits with code 2
 *
 * @param hookKey - The hook key in format "HookType/hook-name"
 * @param validHooks - Array of valid hook keys for error message
 * @public
 */
export async function handleUnknownHook(hookKey: string, validHooks: string[]): Promise<never> {
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
		const { isOTELEnabled } = await import("../otel/config.js");
		if (isOTELEnabled()) {
			const { emitHookExecutionDirect } = await import("../otel/events.js");
			emitHookExecutionDirect({
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

// =============================================================================
// INTERNAL EXPORTS (for testing only - not re-exported from index.ts)
// =============================================================================

export {
	createBaseEnv,
	extractStateFromEnv,
	getHookEventClasses,
	isDebugEnabled,
	mapToOutcome,
	mapToPermissionDecision,
	convertToPreToolUseResponse,
	convertToPostToolUseResponse,
	convertToSessionStartResponse,
	convertToStopResponse,
	convertToUserPromptSubmitResponse,
	convertToPermissionRequestResponse,
	convertToResponse,
};
