/**
 * Span instrumentation utilities for hooks.
 *
 * These functions capture timing and context, serialize to JSON,
 * and send to the sidecar via fire-and-forget IPC.
 *
 * No OTEL SDK imports in hook code - just data serialization and IPC.
 *
 * @module
 */

import type { HookEventBase } from "../index.js";
import { getSidecarClient } from "./client.js";
import { isOTELEnabled } from "./config.js";
import { CLAUDE_ATTRS, PLUGIN_ATTRS, SPAN_NAMES } from "./constants.js";
import { emitHookExecution } from "./events.js";
import { getPluginInfo } from "./plugin-info.js";
import type { SpanData } from "./protocol.js";

/**
 * Generate a random hex string for span/trace IDs.
 */
function randomHex(bytes: number): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Execute a function within a traced span.
 * Captures timing and sends span data to sidecar.
 *
 * @example
 * ```typescript
 * const result = await withHookSpan(event, "validate-input", async () => {
 *   return validateInput(event.tool_input);
 * });
 * ```
 * @public
 */
export async function withHookSpan<T>(
	event: HookEventBase,
	spanName: string,
	handler: () => Promise<T>,
	attributes?: Record<string, string | number | boolean>,
): Promise<T> {
	if (!isOTELEnabled()) {
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
		const resolvedSpanName = spanName.startsWith("hook.") ? SPAN_NAMES.HOOK_EXECUTION : spanName;

		const spanData: SpanData = {
			spanId: randomHex(8),
			traceId: randomHex(16),
			name: resolvedSpanName,
			kind: "internal",
			startTimeNs,
			endTimeNs,
			attributes: {
				[CLAUDE_ATTRS.SESSION_ID]: event.session_id,
				[CLAUDE_ATTRS.HOOK_TYPE]: event.hook_event_name,
				[PLUGIN_ATTRS.NAME]: getPluginInfo().name,
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
		const hookName = (attributes?.[CLAUDE_ATTRS.HOOK_NAME] as string) || spanName.replace("hook.", "");
		emitHookExecution(event, hookName, {
			hookType: event.hook_event_name,
			pluginName: getPluginInfo().name,
			pluginVersion: getPluginInfo().version,
			durationMs,
			success: statusCode === "ok",
			error: errorMessage,
			toolName: attributes?.[CLAUDE_ATTRS.TOOL_NAME] as string | undefined,
		});
	}
}

/**
 * Wrap a hook handler with automatic span instrumentation.
 *
 * @example
 * ```typescript
 * const handler = instrumentHook("pre-edit-code", async (event) => {
 *   // Hook logic - automatically traced
 *   return event.response().allow();
 * });
 *
 * export async function main() {
 *   const { event } = await PreToolUseHookEvent.create({ ... });
 *   const response = await handler(event);
 *   event.end(response);
 * }
 * ```
 * @public
 */
export function instrumentHook<TEvent extends HookEventBase, TResult>(
	hookName: string,
	handler: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<TResult> {
	return (event) =>
		withHookSpan(event, `hook.${hookName}`, () => handler(event), {
			[CLAUDE_ATTRS.HOOK_NAME]: hookName,
		});
}

/**
 * Wrap a tool hook handler with tool-specific attributes.
 * Captures tool_name and optionally tool_input.
 * @public
 */
export function instrumentToolHook<TEvent extends HookEventBase & { tool_name: string; tool_input: unknown }, TResult>(
	hookName: string,
	handler: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<TResult> {
	return (event) => {
		const attributes: Record<string, string | number | boolean> = {
			[CLAUDE_ATTRS.HOOK_NAME]: hookName,
			[CLAUDE_ATTRS.TOOL_NAME]: event.tool_name,
		};

		// Optionally include tool input (privacy controlled)
		if (Bun.env.OTEL_PLUGIN_INCLUDE_TOOL_INPUT === "1") {
			const maxLen = Number.parseInt(Bun.env.OTEL_PLUGIN_MAX_TOOL_INPUT_LENGTH || "1000", 10);
			const inputStr = JSON.stringify(event.tool_input);
			attributes["tool.input"] = inputStr.slice(0, maxLen);
		}

		return withHookSpan(event, `hook.${hookName}`, () => handler(event), attributes);
	};
}

/**
 * Create a child span for sub-operations within a hook.
 *
 * @example
 * ```typescript
 * const handler = instrumentHook("pre-commit", async (event) => {
 *   await withChildSpan(event, "lint", async () => {
 *     await runLint();
 *   });
 *
 *   await withChildSpan(event, "typecheck", async () => {
 *     await runTypeCheck();
 *   });
 *
 *   return event.response();
 * });
 * ```
 * @public
 */
export async function withChildSpan<T>(
	event: HookEventBase,
	spanName: string,
	handler: () => Promise<T>,
	attributes?: Record<string, string | number | boolean>,
): Promise<T> {
	// Child spans are additional spans with the same session context
	// The sidecar/Tempo will correlate them by session.id
	return withHookSpan(event, spanName, handler, attributes);
}
