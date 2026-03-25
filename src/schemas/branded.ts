import { Schema } from "effect";
import type { Branded } from "effect/Brand";

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
 * // Decode from unknown (validates UUID format)
 * const id = Schema.decodeUnknownSync(SessionIdSchema)("550e8400-e29b-41d4-a716-446655440000");
 * ```
 *
 * @public
 */
export const SessionIdSchema = Schema.UUID.pipe(Schema.brand("SessionId"));
export type SessionId = Branded<string, "SessionId">;

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
export const ToolUseIdSchema = Schema.String.pipe(Schema.brand("ToolUseId"));
export type ToolUseId = Branded<string, "ToolUseId">;

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
export const TranscriptPathSchema = Schema.String.pipe(Schema.brand("TranscriptPath"));
export type TranscriptPath = Branded<string, "TranscriptPath">;
