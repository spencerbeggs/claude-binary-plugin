/**
 * Base HookEvent class providing core functionality for all hook event types.
 *
 * This module defines the abstract base class that all hook event subclasses extend.
 * It handles stdin/stdout I/O, environment loading, telemetry emission, and response
 * building for Claude Code hook integrations.
 *
 * @remarks
 * The HookEvent class implements the three-layer plugin model:
 *
 * 1. **Input Layer**: Hook event data from Claude Code (parsed from stdin JSON)
 * 2. **Options Layer**: User-configurable settings validated by Zod schema
 * 3. **State Layer**: Computed environment from the plugin's `setup()` function
 *
 * For pipeline-based development (recommended), you typically don't interact with
 * HookEvent directly. Instead, use {@link ClaudeBinaryPlugin.create} which handles
 * event creation and response building automatically.
 *
 * For raw handler development, subclasses provide typed access to event-specific
 * properties and specialized response builders.
 *
 * @example
 * ```typescript
 * // Raw handler using HookEvent directly
 * import { PreToolUseEvent } from "claude-binary-plugin";
 *
 * export default async function handler() {
 *   const { event, env } = await PreToolUseEvent.create({
 *     stdin: process.stdin,
 *     stdout: process.stdout,
 *     stderr: process.stderr,
 *     envClass: MyPluginEnv,
 *     name: "my-hook",
 *   });
 *
 *   // Access typed properties
 *   if (event.tool_name === "Bash") {
 *     event.end(event.response().deny("Bash not allowed"), 0);
 *   }
 *
 *   event.end(event.response().allow());
 * }
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @see docs/ARCHITECTURE.md for the complete three-layer model documentation
 * @module
 */

import { z } from "zod";
import { HookEventSchemas } from "../core/schemas.js";
import type { HookMetrics, HookOutcome } from "../otel/classes/TelemetryEmitter.js";
import { PluginEnv, formatZodError as formatZodErrorAsMarkdown } from "../state/plugin-state.js";
import { DebugLogger } from "../utils/debug-logger.js";
import type { HookPermissionsMode, HookType } from "./enums.js";
import { HookResponse } from "./response-builders.js";
import type { HookEventBase, HookEventOptions, IO } from "./types.js";
import { SchemaValidator } from "./validation.js";

/**
 * Base class for all hook events in the Claude Code plugin system.
 *
 * @remarks
 * HookEvent provides the foundational functionality that all hook event
 * subclasses inherit:
 *
 * - **I/O Management**: Reading JSON from stdin, writing responses to stdout
 * - **Environment Loading**: Session-aware environment context via {@link PluginEnv}
 * - **Response Building**: Fluent API for constructing hook responses
 * - **Telemetry**: Automatic OTEL event emission for observability
 * - **Error Handling**: Global error handlers for graceful failure
 * - **Debug Logging**: Structured logging with timing information
 *
 * Subclasses (e.g., {@link PreToolUseEvent}, {@link SessionStartEvent})
 * add event-specific properties and specialized response builders.
 *
 * @example
 * ```typescript
 * // The create() factory pattern
 * const { event, env } = await PreToolUseEvent.create({
 *   stdin: process.stdin,
 *   stdout: process.stdout,
 *   stderr: process.stderr,
 *   envClass: MyPluginEnv,
 * });
 *
 * // Use the response builder
 * event.end(event.response().allow());
 *
 * // Or end with an error
 * event.error("Something went wrong");
 * ```
 *
 * @typeParam TState - The plugin state type, typically inferred from plugin schema
 *
 * @see {@link PreToolUseEvent} - Most commonly used subclass
 * @see {@link HookEventOptions} - Options for event creation
 * @see {@link HookResponse} - Base response builder class
 * @public
 */
export class HookEvent<TState = unknown> implements HookEventBase {
	/** Custom name for this hook instance, used in logging and telemetry */
	name: string;
	/** Unique Claude Code session identifier (UUID format) */
	session_id: string;
	/** Absolute path to the conversation transcript file, if available */
	transcript_path?: string;
	/** Current working directory where Claude Code is running */
	cwd?: string;
	/** Current permission mode setting for the session */
	permission_mode?: HookPermissionsMode;
	/** The type of hook event (e.g., "PreToolUse", "SessionStart") */
	hook_event_name: HookType;
	/** Debug logger instance for structured logging with timing */
	readonly log: DebugLogger;
	/** The loaded plugin state containing options and computed state */
	readonly state?: TState;

	/**
	 * Standard input stream for reading event data.
	 * @internal
	 */
	protected in: typeof process.stdin;
	/**
	 * Standard output stream for writing responses.
	 * @internal
	 */
	protected out: typeof process.stdout;
	/**
	 * Standard error stream for writing error messages.
	 * @internal
	 */
	protected err: typeof process.stderr;
	/**
	 * Timestamp when the hook started processing, for duration tracking.
	 * @internal
	 */
	private startTime: number;
	/**
	 * Plugin name included in telemetry events.
	 * @internal
	 */
	private readonly pluginName: string;
	/**
	 * Plugin version included in telemetry events.
	 * @internal
	 */
	private readonly pluginVersion: string;
	/**
	 * Flag to prevent duplicate telemetry emission on multiple end() calls.
	 * @internal
	 */
	private telemetryEmitted = false;

	constructor(params: HookEventBase, options: HookEventOptions<TState>, state?: TState) {
		this.name = options.name ?? params.hook_event_name;
		this.session_id = params.session_id;
		this.transcript_path = params.transcript_path;
		this.cwd = params.cwd;
		this.permission_mode = params.permission_mode;
		this.hook_event_name = params.hook_event_name;
		this.in = options.stdin;
		this.out = options.stdout;
		this.err = options.stderr;
		this.startTime = performance.now();
		this.pluginName = options.pluginName ?? "unknown";
		this.pluginVersion = options.pluginVersion ?? "0.0.0";
		this.log = DebugLogger.create(options.name ?? params.hook_event_name, {
			pluginName: options.pluginName,
			sessionId: params.session_id,
		});
		this.state = state;
	}

	/**
	 * Creates a response builder for constructing the hook response.
	 *
	 * @remarks
	 * Subclasses override this to return specialized builders (e.g.,
	 * {@link PreToolUseResponse}) that provide type-safe methods
	 * for the specific hook type.
	 *
	 * @returns A new response builder instance
	 *
	 * @example
	 * ```typescript
	 * // Build and send a response
	 * event.end(event.response().allow());
	 *
	 * // Chain multiple settings
	 * event.end(
	 *   event.response()
	 *     .deny("Not allowed")
	 *     .withContext("Additional info for Claude")
	 * );
	 * ```
	 * @public
	 */
	response(): HookResponse {
		return new HookResponse();
	}

	/**
	 * Marks telemetry as already emitted to prevent duplicates.
	 *
	 * @remarks
	 * Call this when you've already emitted telemetry through another
	 * mechanism (e.g., pipeline runtime) to prevent the `end()` method
	 * from emitting duplicate events.
	 *
	 * @internal
	 */
	markTelemetryEmitted(): void {
		this.telemetryEmitted = true;
	}

	/**
	 * Pre-connects to the OTEL sidecar for telemetry emission.
	 *
	 * @param sessionId - The session ID to associate with telemetry
	 *
	 * @remarks
	 * Called during event creation to ensure the sidecar connection
	 * is ready before hook execution begins. Errors are silently
	 * ignored to avoid blocking hook execution.
	 *
	 * @internal
	 */
	protected static async initTelemetry(sessionId: string): Promise<void> {
		try {
			const { TelemetryEmitter } = await import("../otel/classes/TelemetryEmitter.js");
			await TelemetryEmitter.preconnect(sessionId);
		} catch {
			// Silently ignore telemetry errors
		}
	}

	/**
	 * Sets up global error handlers for uncaught exceptions and rejections.
	 *
	 * @param hookName - The hook name to include in error messages
	 *
	 * @remarks
	 * Installs process-level handlers that format errors nicely and
	 * ensure the process exits with code 2 on fatal errors. Zod
	 * validation errors are formatted as markdown for readability.
	 *
	 * @internal
	 */
	protected static setupGlobalErrorHandlers(hookName: string): void {
		const errorHandler = (error: unknown) => {
			if (error instanceof z.ZodError) {
				const formatted = formatZodErrorAsMarkdown(error);
				console.error(`[${hookName}] Validation error:\n${formatted}`);
			} else {
				console.error(`[${hookName}] Fatal error: ${error}`);
			}
			process.exit(2);
		};

		process.on("uncaughtException", errorHandler);
		process.on("unhandledRejection", errorHandler);
	}

	/**
	 * Ends the hook execution and sends the response to Claude Code.
	 *
	 * @remarks
	 * This method is the primary way to complete a hook. It:
	 * 1. Logs the execution result with timing
	 * 2. Emits OTEL telemetry for observability
	 * 3. Writes the JSON response to stdout
	 * 4. Exits the process with the specified code
	 *
	 * The method is overloaded to support different use cases:
	 * - `end()` - Exit with code 0, no response
	 * - `end(code)` - Exit with specific code, no response
	 * - `end(builder)` - Exit with code 0, send builder's response
	 * - `end(builder, code)` - Exit with specific code, send response
	 *
	 * @param builderOrCode - Either a response builder or exit code
	 * @param code - Exit code when first param is a builder (default: 0)
	 *
	 * @example
	 * ```typescript
	 * // Simple allow
	 * event.end(event.response().allow());
	 *
	 * // Deny with non-zero exit
	 * event.end(event.response().deny("Blocked"), 1);
	 *
	 * // Exit without response
	 * event.end(0);
	 * ```
	 * @public
	 */
	end(code?: number): never;
	end(builder: HookResponse, code?: number): never;
	end(builderOrCode?: HookResponse | number, code: number = 0): never {
		const elapsedMs = performance.now() - this.startTime;
		const timing = `(${elapsedMs.toFixed(2)}ms)`;

		if (builderOrCode === undefined || typeof builderOrCode === "number") {
			this.log.debug(`✓ completed ${timing}`);
			this.emitTelemetry(Math.round(elapsedMs), true);
			process.exit(builderOrCode ?? 0);
		}

		const summary = builderOrCode.getSummary();
		const isError = code !== 0 || summary.startsWith("blocked") || summary.startsWith("denied");
		if (isError) {
			this.log.debug(`✗ ${summary} ${timing}`);
		} else {
			this.log.debug(`✓ ${summary} ${timing}`);
		}

		const additionalContext = builderOrCode.getAdditionalContext();
		if (additionalContext) {
			this.log.info(additionalContext);
		}

		this.emitTelemetry(Math.round(elapsedMs), !isError, builderOrCode);

		this.out.write(builderOrCode.toJSON());
		process.exit(code);
	}

	/**
	 * Emit OTEL telemetry for hook execution.
	 */
	private emitTelemetry(durationMs: number, success: boolean, builder?: HookResponse): void {
		if (this.telemetryEmitted) return;

		try {
			const { isOTELEnabled } = require("../otel/config.js") as { isOTELEnabled: () => boolean };
			if (!isOTELEnabled()) return;

			const { emitHookExecution } = require("../otel/events.js") as {
				emitHookExecution: (
					event: HookEventBase,
					hookName: string,
					result: {
						hookType: string;
						durationMs: number;
						success: boolean;
						outcome?: HookOutcome;
						summary?: string;
						toolName?: string;
						toolUseId?: string;
						permissionDecision?: "allow" | "deny" | "ask";
						permissionDecisionReason?: string;
						hasUpdatedInput?: boolean;
						decision?: "block";
						reason?: string;
						metrics?: HookMetrics;
						context?: Record<string, string | number | boolean>;
					},
				) => void;
			};

			const result: {
				hookType: string;
				pluginName: string;
				pluginVersion: string;
				durationMs: number;
				success: boolean;
				outcome?: HookOutcome;
				summary?: string;
				toolName?: string;
				toolUseId?: string;
				permissionDecision?: "allow" | "deny" | "ask";
				permissionDecisionReason?: string;
				hasUpdatedInput?: boolean;
				decision?: "block";
				reason?: string;
				metrics?: HookMetrics;
				context?: Record<string, string | number | boolean>;
			} = {
				hookType: this.hook_event_name,
				pluginName: this.pluginName,
				pluginVersion: this.pluginVersion,
				durationMs,
				success,
			};

			if ("tool_name" in this) {
				result.toolName = (this as unknown as { tool_name: string }).tool_name;
			}
			if ("tool_use_id" in this) {
				result.toolUseId = (this as unknown as { tool_use_id: string }).tool_use_id;
			}

			if (builder) {
				const telemetryData = builder.getTelemetryData();
				result.summary = builder.getSummary();

				if (telemetryData.outcome) result.outcome = telemetryData.outcome;
				if (telemetryData.permissionDecision) result.permissionDecision = telemetryData.permissionDecision;
				if (telemetryData.permissionDecisionReason)
					result.permissionDecisionReason = telemetryData.permissionDecisionReason;
				if (telemetryData.hasUpdatedInput !== undefined) result.hasUpdatedInput = telemetryData.hasUpdatedInput;
				if (telemetryData.decision) result.decision = telemetryData.decision;
				if (telemetryData.reason) result.reason = telemetryData.reason;
				if (telemetryData.metrics) result.metrics = telemetryData.metrics;
				if (telemetryData.context) result.context = telemetryData.context;
			}

			emitHookExecution(this, this.name, result);
		} catch {
			// Silently ignore telemetry errors
		}
	}

	/**
	 * Ends the hook with an error, writing to stderr and exiting with code 2.
	 *
	 * @param message - The error message to display
	 *
	 * @remarks
	 * Use this for unrecoverable errors during hook execution. The message
	 * is written to stderr (truncated in logs if over 50 chars) and OTEL
	 * telemetry is emitted with the error details.
	 *
	 * Exit code 2 indicates a hook error to Claude Code.
	 *
	 * @example
	 * ```typescript
	 * if (!config.isValid) {
	 *   event.error("Invalid configuration: missing required fields");
	 * }
	 * ```
	 * @public
	 */
	error(message: string): never {
		const elapsedMs = performance.now() - this.startTime;
		const timing = `(${elapsedMs.toFixed(2)}ms)`;
		const shortMsg = message.length > 50 ? `${message.slice(0, 50)}...` : message;
		this.log.info(`✗ error: ${shortMsg} ${timing}`);
		this.emitTelemetryError(Math.round(elapsedMs), message);
		this.err.write(message);
		process.exit(2);
	}

	/**
	 * Emit OTEL telemetry for hook error.
	 */
	private emitTelemetryError(durationMs: number, errorMessage: string): void {
		try {
			const { isOTELEnabled } = require("../otel/config.js") as { isOTELEnabled: () => boolean };
			if (!isOTELEnabled()) return;

			const { emitHookExecution } = require("../otel/events.js") as {
				emitHookExecution: (
					event: HookEventBase,
					hookName: string,
					result: {
						hookType: string;
						durationMs: number;
						success: boolean;
						error?: string;
						toolName?: string;
					},
				) => void;
			};

			const result: {
				hookType: string;
				pluginName: string;
				pluginVersion: string;
				durationMs: number;
				success: boolean;
				error: string;
				toolName?: string;
			} = {
				hookType: this.hook_event_name,
				pluginName: this.pluginName,
				pluginVersion: this.pluginVersion,
				durationMs,
				success: false,
				error: errorMessage,
			};

			if ("tool_name" in this) {
				result.toolName = (this as unknown as { tool_name: string }).tool_name;
			}

			emitHookExecution(this, this.name, result);
		} catch {
			// Silently ignore telemetry errors
		}
	}

	/**
	 * Reads the input text from either the options or stdin.
	 *
	 * @param options - IO options containing optional inputText
	 * @returns The input text (event JSON)
	 *
	 * @remarks
	 * If `options.inputText` is provided (useful for testing), it's returned directly.
	 * Otherwise, reads from `Bun.stdin` which is the standard input from Claude Code.
	 *
	 * @internal
	 */
	protected static async readInputText(options: IO): Promise<string> {
		if (options.inputText !== undefined) {
			return options.inputText;
		}
		return Bun.stdin.text();
	}

	/**
	 * Factory method to create a HookEvent from Claude Code's stdin input.
	 *
	 * @typeParam TEnv - The plugin environment type
	 * @param options - Configuration including I/O streams and environment class
	 * @returns An object containing both the event instance and loaded environment
	 *
	 * @remarks
	 * This is the primary entry point for creating hook events. It:
	 * 1. Sets up global error handlers for graceful failure
	 * 2. Reads and parses JSON from stdin
	 * 3. Validates the input against the appropriate Zod schema
	 * 4. Loads the plugin environment from the session registry
	 * 5. Returns both the typed event and environment
	 *
	 * Subclasses override this to return their specific event type.
	 *
	 * @example
	 * ```typescript
	 * const { event, env } = await HookEvent.create({
	 *   stdin: process.stdin,
	 *   stdout: process.stdout,
	 *   stderr: process.stderr,
	 *   envClass: MyPluginEnv,
	 *   name: "my-hook",
	 * });
	 * ```
	 *
	 * @throws Error if stdin is empty or invalid JSON
	 * @public
	 */
	static async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: HookEvent<TState>; state: TState }> {
		const hookName = options.name ?? "HookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const params = await HookEvent.readInputText(options);
		if (params) {
			const parsed = (await SchemaValidator.parse(params, HookEventSchemas.Any, hookName)) as HookEventBase;
			const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
			const state = (await (options.stateClass as any).forContext("hook", {
				sessionId: parsed.session_id,
				sessionEnvDir,
				hookName,
			})) as TState;
			const event = new HookEvent(parsed, options, state);
			return { event, state };
		}
		throw new Error("Failed to read HookEvent from stdin");
	}
}
