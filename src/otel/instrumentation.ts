/**
 * Span instrumentation utilities for hooks.
 *
 * @remarks
 * This module delegates to the TelemetrySpan class for backward compatibility.
 * New code should use the TelemetrySpan class directly.
 *
 * @module
 */

import type { HookEventBase } from "../events/types.js";
import { TelemetrySpan } from "./classes/TelemetrySpan.js";

/**
 * Execute a function within a traced span.
 * Captures timing and sends span data to sidecar.
 *
 * @remarks
 * Delegates to TelemetrySpan.withHookSpan() - new code should use that directly.
 *
 * @public
 */
export function withHookSpan<T>(
	event: HookEventBase,
	spanName: string,
	handler: () => Promise<T>,
	attributes?: Record<string, string | number | boolean>,
): Promise<T> {
	return TelemetrySpan.withHookSpan(event, spanName, handler, attributes);
}

/**
 * Wrap a hook handler with automatic span instrumentation.
 *
 * @remarks
 * Delegates to TelemetrySpan.instrumentHook() - new code should use that directly.
 *
 * @public
 */
export function instrumentHook<TEvent extends HookEventBase, TResult>(
	hookName: string,
	handler: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<TResult> {
	return TelemetrySpan.instrumentHook(hookName, handler);
}

/**
 * Wrap a tool hook handler with tool-specific attributes.
 * Captures tool_name and optionally tool_input.
 *
 * @remarks
 * Delegates to TelemetrySpan.instrumentToolHook() - new code should use that directly.
 *
 * @public
 */
export function instrumentToolHook<TEvent extends HookEventBase & { tool_name: string; tool_input: unknown }, TResult>(
	hookName: string,
	handler: (event: TEvent) => Promise<TResult>,
): (event: TEvent) => Promise<TResult> {
	return TelemetrySpan.instrumentToolHook(hookName, handler);
}

/**
 * Create a child span for sub-operations within a hook.
 *
 * @remarks
 * Delegates to TelemetrySpan.withChildSpan() - new code should use that directly.
 *
 * @public
 */
export function withChildSpan<T>(
	event: HookEventBase,
	spanName: string,
	handler: () => Promise<T>,
	attributes?: Record<string, string | number | boolean>,
): Promise<T> {
	return TelemetrySpan.withChildSpan(event, spanName, handler, attributes);
}
