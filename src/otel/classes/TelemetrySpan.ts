/**
 * Span instrumentation utilities for hooks.
 *
 * @remarks
 * Provides a class-based API for tracing hook execution with spans.
 * Spans capture timing and context, serialize to JSON, and send
 * to the sidecar via fire-and-forget IPC.
 *
 * @example
 * ```typescript
 * import { TelemetrySpan, OtelConfig } from "claude-binary-plugin";
 *
 * if (OtelConfig.isEnabled()) {
 *   // Execute code within a traced span
 *   const result = await TelemetrySpan.withHookSpan(event, "validate", async () => {
 *     return validateInput(event.tool_input);
 *   });
 *
 *   // Wrap a hook handler with automatic instrumentation
 *   const handler = TelemetrySpan.instrumentHook("pre-bash", async (event) => {
 *     // Hook logic - automatically traced
 *     return { status: "executed", action: "allow", summary: "ok" };
 *   });
 * }
 * ```
 *
 * @see {@link OtelConfig} - Check if telemetry is enabled
 * @see {@link TelemetryEmitter} - Emit telemetry events
 * @public
 */

import type { HookEventBase } from "../../events/types.js";
import type { SpanData } from "../protocol.js";
import { OtelConfig } from "./OtelConfig.js";
import { PluginInfo } from "./PluginInfo.js";
import { getSidecarClient } from "./SidecarClient.js";
import { TelemetryEmitter } from "./TelemetryEmitter.js";

/**
 * Generate a random hex string for span/trace IDs.
 * @internal
 */
function randomHex(bytes: number): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Telemetry span instrumentation.
 *
 * @remarks
 * Provides static methods for tracing hook execution. All methods
 * are fire-and-forget to avoid blocking hook execution.
 *
 * **Span Types:**
 * - Hook spans: Top-level spans for hook execution
 * - Child spans: Sub-operation spans within a hook
 *
 * **Handler Wrappers:**
 * - instrumentHook: Automatic span for any hook
 * - instrumentToolHook: Tool-specific attributes included
 *
 * @example
 * ```typescript
 * // Execute within a span
 * const result = await TelemetrySpan.withHookSpan(event, "validate", async () => {
 *   return validateInput(event.tool_input);
 * });
 *
 * // Create child spans for sub-operations
 * await TelemetrySpan.withChildSpan(event, "lint", async () => {
 *   await runLint();
 * });
 *
 * // Wrap an entire handler
 * const handler = TelemetrySpan.instrumentHook("pre-bash", async (event) => {
 *   return { status: "executed", action: "allow", summary: "ok" };
 * });
 * ```
 *
 * @public
 */
export class TelemetrySpan {
	/**
	 * Span names for tracing.
	 * Uses `claude_code.hook.*` prefix for consistency.
	 * @public
	 */
	static readonly NAMES = {
		/** Root span for a hook execution. */
		HOOK_EXECUTION: "claude_code.hook.execute",
		/** Span for tool input processing. */
		TOOL_INPUT_PROCESS: "claude_code.hook.tool.input.process",
		/** Span for tool output processing. */
		TOOL_OUTPUT_PROCESS: "claude_code.hook.tool.output.process",
		/** Span for IPC message send. */
		IPC_SEND: "claude_code.hook.sidecar.ipc.send",
		/** Span for OTEL export. */
		OTEL_EXPORT: "claude_code.hook.sidecar.otel.export",
	} as const;

	/**
	 * Execute a function within a traced span.
	 *
	 * @remarks
	 * Captures timing and sends span data to sidecar. The span is
	 * automatically ended when the handler completes (success or error).
	 *
	 * @typeParam T - Return type of the handler function
	 * @param event - The hook event base containing session info
	 * @param spanName - Name for the span (e.g., "validate-input")
	 * @param handler - Async function to execute within the span
	 * @param attributes - Optional additional span attributes
	 * @returns Promise resolving to the handler's return value
	 *
	 * @example
	 * ```typescript
	 * const result = await TelemetrySpan.withHookSpan(
	 *   event,
	 *   "validate-input",
	 *   async () => {
	 *     return validateInput(event.tool_input);
	 *   },
	 *   { "input.type": "command" }
	 * );
	 * ```
	 *
	 * @public
	 */
	static async withHookSpan<T>(
		event: HookEventBase,
		spanName: string,
		handler: () => Promise<T>,
		attributes?: Record<string, string | number | boolean>,
	): Promise<T> {
		if (!OtelConfig.isEnabled()) {
			return handler();
		}

		const client = getSidecarClient(event.session_id);
		const startTimeNs = BigInt(Date.now()) * BigInt(1_000_000);
		let statusCode: "ok" | "error" = "ok";
		let errorMessage: string | undefined;

		try {
			return await handler();
		} catch (e) {
			statusCode = "error";
			errorMessage = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			const endTimeNs = BigInt(Date.now()) * BigInt(1_000_000);
			const durationMs = Math.round(Number(endTimeNs - startTimeNs) / 1_000_000);

			// Use aligned span name from constants
			const resolvedSpanName = spanName.startsWith("hook.") ? TelemetrySpan.NAMES.HOOK_EXECUTION : spanName;

			const spanData: SpanData = {
				spanId: randomHex(8),
				traceId: randomHex(16),
				name: resolvedSpanName,
				kind: "internal",
				startTimeNs,
				endTimeNs,
				attributes: {
					[TelemetryEmitter.ATTRS.SESSION_ID]: event.session_id,
					[TelemetryEmitter.ATTRS.HOOK_TYPE]: event.hook_event_name,
					[PluginInfo.ATTRS.NAME]: PluginInfo.get().name,
					...attributes,
				},
				status: {
					code: statusCode,
					message: errorMessage,
				},
			};

			client.emit({
				type: "span",
				sessionId: event.session_id,
				data: spanData,
			});

			// Emit consolidated hook execution event
			const hookName = (attributes?.[TelemetryEmitter.ATTRS.HOOK_NAME] as string) || spanName.replace("hook.", "");
			TelemetryEmitter.emitHookExecution(event, hookName, {
				hookType: event.hook_event_name,
				pluginName: PluginInfo.get().name,
				pluginVersion: PluginInfo.get().version,
				durationMs,
				success: statusCode === "ok",
				error: errorMessage,
				toolName: attributes?.[TelemetryEmitter.ATTRS.TOOL_NAME] as string | undefined,
			});
		}
	}

	/**
	 * Create a child span for sub-operations within a hook.
	 *
	 * @remarks
	 * Child spans are additional spans with the same session context.
	 * The sidecar/Tempo will correlate them by session.id. Use these
	 * for tracing multiple distinct operations within a single hook.
	 *
	 * @typeParam T - Return type of the handler function
	 * @param event - The hook event base containing session info
	 * @param spanName - Name for the child span (e.g., "lint", "typecheck")
	 * @param handler - Async function to execute within the span
	 * @param attributes - Optional additional span attributes
	 * @returns Promise resolving to the handler's return value
	 *
	 * @example
	 * ```typescript
	 * const handler = TelemetrySpan.instrumentHook("pre-commit", async (event) => {
	 *   await TelemetrySpan.withChildSpan(event, "lint", async () => {
	 *     await runLint();
	 *   });
	 *
	 *   await TelemetrySpan.withChildSpan(event, "typecheck", async () => {
	 *     await runTypeCheck();
	 *   });
	 *
	 *   return { status: "executed", action: "allow", summary: "ok" };
	 * });
	 * ```
	 *
	 * @public
	 */
	static withChildSpan<T>(
		event: HookEventBase,
		spanName: string,
		handler: () => Promise<T>,
		attributes?: Record<string, string | number | boolean>,
	): Promise<T> {
		// Child spans are additional spans with the same session context
		// The sidecar/Tempo will correlate them by session.id
		return TelemetrySpan.withHookSpan(event, spanName, handler, attributes);
	}

	/**
	 * Wrap a hook handler with automatic span instrumentation.
	 *
	 * @remarks
	 * Returns a new handler function that wraps the original with
	 * automatic span creation. The span captures the full hook execution
	 * time and any errors that occur.
	 *
	 * @typeParam TEvent - The hook event type (extends HookEventBase)
	 * @typeParam TResult - Return type of the handler
	 * @param hookName - Name for the hook (e.g., "pre-bash", "security")
	 * @param handler - The hook handler function to wrap
	 * @returns Wrapped handler with automatic span instrumentation
	 *
	 * @example
	 * ```typescript
	 * const handler = TelemetrySpan.instrumentHook("pre-bash", async (event) => {
	 *   // Hook logic - automatically traced
	 *   if (isDangerous(event.tool_input)) {
	 *     return { status: "executed", action: "deny", summary: "blocked" };
	 *   }
	 *   return { status: "executed", action: "allow", summary: "ok" };
	 * });
	 *
	 * // Later, call the wrapped handler
	 * const result = await handler(event);
	 * ```
	 *
	 * @public
	 */
	static instrumentHook<TEvent extends HookEventBase, TResult>(
		hookName: string,
		handler: (event: TEvent) => Promise<TResult>,
	): (event: TEvent) => Promise<TResult> {
		return (event) =>
			TelemetrySpan.withHookSpan(event, `hook.${hookName}`, () => handler(event), {
				[TelemetryEmitter.ATTRS.HOOK_NAME]: hookName,
			});
	}

	/**
	 * Wrap a tool hook handler with tool-specific attributes.
	 *
	 * @remarks
	 * Similar to `instrumentHook`, but automatically includes tool_name
	 * in span attributes. Optionally includes tool_input when
	 * `OTEL_PLUGIN_INCLUDE_TOOL_INPUT=1` is set.
	 *
	 * @typeParam TEvent - Tool hook event type (PreToolUse or PostToolUse)
	 * @typeParam TResult - Return type of the handler
	 * @param hookName - Name for the hook (e.g., "pre-bash")
	 * @param handler - The tool hook handler function to wrap
	 * @returns Wrapped handler with tool-specific span instrumentation
	 *
	 * @example
	 * ```typescript
	 * const handler = TelemetrySpan.instrumentToolHook(
	 *   "pre-bash",
	 *   async (event) => {
	 *     // event.tool_name is automatically added to span attributes
	 *     const command = event.tool_input.command;
	 *     return { status: "executed", action: "allow", summary: "ok" };
	 *   }
	 * );
	 * ```
	 *
	 * @public
	 */
	static instrumentToolHook<TEvent extends HookEventBase & { tool_name: string; tool_input: unknown }, TResult>(
		hookName: string,
		handler: (event: TEvent) => Promise<TResult>,
	): (event: TEvent) => Promise<TResult> {
		return (event) => {
			const attributes: Record<string, string | number | boolean> = {
				[TelemetryEmitter.ATTRS.HOOK_NAME]: hookName,
				[TelemetryEmitter.ATTRS.TOOL_NAME]: event.tool_name,
			};

			// Optionally include tool input (privacy controlled)
			if (Bun.env.OTEL_PLUGIN_INCLUDE_TOOL_INPUT === "1") {
				const maxLen = Number.parseInt(Bun.env.OTEL_PLUGIN_MAX_TOOL_INPUT_LENGTH || "1000", 10);
				const inputStr = JSON.stringify(event.tool_input);
				attributes["tool.input"] = inputStr.slice(0, maxLen);
			}

			return TelemetrySpan.withHookSpan(event, `hook.${hookName}`, () => handler(event), attributes);
		};
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
