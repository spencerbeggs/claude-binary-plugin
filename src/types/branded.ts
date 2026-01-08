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
