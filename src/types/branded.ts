/**
 * Branded (tagged) types for type-safe identifiers.
 *
 * @remarks
 * This module provides nominal types for string identifiers that should not
 * be accidentally interchanged. Using branded types prevents bugs like passing
 * a `session_id` where a `tool_use_id` is expected.
 *
 * **How branded types work:**
 *
 * TypeScript uses structural typing, so two `string` types are interchangeable.
 * Branded types add a phantom property that makes them nominally distinct:
 *
 * ```typescript
 * // Without branding - compiles but is a bug:
 * function processHook(sessionId: string, toolUseId: string) { }
 * processHook(toolUseId, sessionId); // Oops, swapped arguments!
 *
 * // With branding - compile error:
 * function processHook(sessionId: SessionId, toolUseId: ToolUseId) { }
 * processHook(toolUseId, sessionId); // Error: types are incompatible
 * ```
 *
 * **Creating branded values:**
 *
 * Branded types are created by casting from the base type. The SDK's Zod
 * schemas handle this automatically when parsing input:
 *
 * ```typescript
 * // Manual creation (for testing or internal use)
 * const sessionId = "abc-123" as SessionId;
 *
 * // From parsed input (automatic)
 * const event = HookEventSchemas.parsePreToolUse(json);
 * event.session_id; // Already typed as SessionId
 * ```
 *
 * @see {@link https://github.com/sindresorhus/type-fest#tagged | type-fest Tagged}
 */

import type { Tagged } from "type-fest";

// =============================================================================
// SESSION IDENTIFIERS
// =============================================================================

/**
 * Branded type for Claude Code session identifiers.
 *
 * @remarks
 * Session IDs are UUIDs that identify a Claude Code conversation session.
 * They persist across hook invocations within the same session.
 *
 * @example
 * ```typescript
 * function logSession(sessionId: SessionId): void {
 *   console.log(`Processing session: ${sessionId}`);
 * }
 *
 * // Create from string (for testing)
 * const id = "550e8400-e29b-41d4-a716-446655440000" as SessionId;
 * ```
 *
 * @public
 */
export type SessionId = Tagged<string, "SessionId">;

// =============================================================================
// TOOL IDENTIFIERS
// =============================================================================

/**
 * Branded type for tool use identifiers.
 *
 * @remarks
 * Tool use IDs uniquely identify a specific tool invocation within a session.
 * They are used to correlate PreToolUse and PostToolUse events for the same
 * tool call.
 *
 * @example
 * ```typescript
 * function trackToolUse(toolUseId: ToolUseId): void {
 *   console.log(`Tool invocation: ${toolUseId}`);
 * }
 * ```
 *
 * @public
 */
export type ToolUseId = Tagged<string, "ToolUseId">;

// =============================================================================
// HOOK IDENTIFIERS
// =============================================================================

/**
 * Branded type for custom hook names.
 *
 * @remarks
 * Hook names are user-defined identifiers for pipeline hooks (e.g., "security",
 * "lint", "context"). They appear in telemetry and logs.
 *
 * @example
 * ```typescript
 * function emitHookMetric(hookName: HookName, durationMs: number): void {
 *   metrics.record(`hook.${hookName}.duration`, durationMs);
 * }
 * ```
 *
 * @public
 */
export type HookName = Tagged<string, "HookName">;

// =============================================================================
// PATH IDENTIFIERS
// =============================================================================

/**
 * Branded type for transcript file paths.
 *
 * @remarks
 * Transcript paths point to JSON files containing the conversation history.
 * This type distinguishes transcript paths from general file paths.
 *
 * @public
 */
export type TranscriptPath = Tagged<string, "TranscriptPath">;
