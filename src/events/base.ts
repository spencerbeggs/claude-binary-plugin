/**
 * Base HookEvent class for all hook events.
 * @module
 */

import { z } from "zod";
import { HookEventSchema } from "../core/schemas.js";
import { ClaudeBinaryPluginEnv, formatZodError as formatZodErrorAsMarkdown } from "../env/plugin-env.js";
import { DebugLogger } from "../utils/debug-logger.js";
import type { HookEventName } from "./enums.js";
import { HookResponseBuilder } from "./response-builders.js";
import type { HookMetrics, HookOutcome } from "./response-types.js";
import type { HookEventBase, HookEventOptions, HookPermissionsMode, IO } from "./types.js";
import { parseWithOTEL } from "./validation.js";

/**
 * Base class for all hook events.
 * Provides common functionality for reading events and sending responses.
 * @public
 */
export class HookEvent<TEnv = unknown> implements HookEventBase {
	name: string;
	/** Unique session identifier */
	session_id: string;
	/** Path to the conversation transcript (optional) */
	transcript_path?: string;
	/** Current working directory (optional) */
	cwd?: string;
	/** Current permission mode (optional) */
	permission_mode?: HookPermissionsMode;
	/** The type of hook event */
	hook_event_name: HookEventName;
	/** Debug logger for this hook event */
	readonly log: DebugLogger;
	/** Loaded environment (if envLoader was provided) */
	readonly env?: TEnv;

	protected in: typeof process.stdin;
	protected out: typeof process.stdout;
	protected err: typeof process.stderr;
	private startTime: number;
	/** Plugin name for telemetry */
	private readonly pluginName: string;
	/** Plugin version for telemetry */
	private readonly pluginVersion: string;
	/** Flag to prevent duplicate telemetry emission */
	private telemetryEmitted = false;

	constructor(params: HookEventBase, options: HookEventOptions<TEnv>, env?: TEnv) {
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
		this.env = env;
	}

	/**
	 * Create a response builder for this event.
	 */
	response(): HookResponseBuilder {
		return new HookResponseBuilder();
	}

	/**
	 * Mark telemetry as already emitted.
	 */
	markTelemetryEmitted(): void {
		this.telemetryEmitted = true;
	}

	/**
	 * Pre-connect to OTEL sidecar for telemetry.
	 */
	protected static async initTelemetry(sessionId: string): Promise<void> {
		try {
			const { preconnectTelemetry } = await import("../otel/index.js");
			await preconnectTelemetry(sessionId);
		} catch {
			// Silently ignore telemetry errors
		}
	}

	/**
	 * Set up global error handlers for uncaught exceptions.
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
	 * End the hook with an optional response.
	 */
	end(code?: number): never;
	end(builder: HookResponseBuilder, code?: number): never;
	end(builderOrCode?: HookResponseBuilder | number, code: number = 0): never {
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
	private emitTelemetry(durationMs: number, success: boolean, builder?: HookResponseBuilder): void {
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
	 * End the hook with a blocking error.
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
	 * Reads input text from options.inputText or Bun.stdin.
	 */
	protected static async readInputText(options: IO): Promise<string> {
		if (options.inputText !== undefined) {
			return options.inputText;
		}
		return Bun.stdin.text();
	}

	/**
	 * Create a HookEvent from stdin.
	 */
	static async create<TEnv = unknown>(options: HookEventOptions<TEnv>): Promise<{ event: HookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "HookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const params = await HookEvent.readInputText(options);
		if (params) {
			const parsed = (await parseWithOTEL(params, HookEventSchema, hookName)) as HookEventBase;
			const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
			// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
			const env = (await (options.envClass as any).forContext("hook", {
				sessionId: parsed.session_id,
				sessionEnvDir,
				hookName,
			})) as TEnv;
			const event = new HookEvent(parsed, options, env);
			return { event, env };
		}
		throw new Error("Failed to read HookEvent from stdin");
	}
}
