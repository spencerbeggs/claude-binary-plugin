import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { WatchPaths } from "../outcomes/WatchPaths.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { SessionIdSchema, TranscriptPathSchema } from "../schemas/branded.js";
import { FileChangeEventSchema, HookPermissionsModeSchema } from "../schemas/hook-literals.js";
import { ExecutionQualitySchema, HookMetricsSchema } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for FileChanged wire format from Claude Code stdin.
 * @public
 */
export class FileChangedInput extends Schema.Class<FileChangedInput>("FileChangedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("FileChanged"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the file that changed */
	file_path: Schema.String,
	/** What happened: change, add, or unlink */
	event: FileChangeEventSchema,
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for FileChanged events.
 * @public
 */
export class FileChangedEvent extends Schema.Class<FileChangedEvent>("FileChangedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("FileChanged"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the file that changed */
	file_path: Schema.String,
	/** What happened: change, add, or unlink */
	event: FileChangeEventSchema,
}) {
	static fromInput(input: FileChangedInput): FileChangedEvent {
		return new FileChangedEvent({ ...input });
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for FileChanged handlers.
 * @public
 */
export type FileChangedOutcome = WatchPaths | NoAction;

/**
 * Set of valid outcome tags for FileChanged hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["WatchPaths", "NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — discriminated union per execution state
// =============================================================================

/**
 * FileChanged hook output with discriminated union for type safety.
 * @schema
 * @public
 */
export const FileChangedOutputSchema = Schema.Union(
	// Executed state
	Schema.Struct({
		status: Schema.Literal("executed"),
		action: Schema.Literal("none"),
		summary: Schema.String,
		watchPaths: Schema.optional(Schema.Array(Schema.String)),
		quality: Schema.optional(ExecutionQualitySchema),
		metrics: Schema.optional(HookMetricsSchema),
	}),

	// Skipped state
	Schema.Struct({
		status: Schema.Literal("skipped"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),

	// Disabled state
	Schema.Struct({
		status: Schema.Literal("disabled"),
		summary: Schema.String,
		reason: Schema.optional(Schema.String),
	}),

	// Error state
	Schema.Struct({
		status: Schema.Literal("error"),
		summary: Schema.String,
		reason: Schema.String,
	}),
);

/** @public */
export type FileChangedOutput = typeof FileChangedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA
// =============================================================================

/**
 * Response schema for FileChanged hooks.
 * @public
 */
export class FileChangedResponse extends Schema.Class<FileChangedResponse>("FileChangedResponse")({
	watchPaths: Schema.optional(Schema.Array(Schema.String)),
}) {}

/**
 * Convert a FileChanged pipeline output to a FileChangedResponse.
 * @public
 */
export function toFileChangedResponse(output: FileChangedOutput): FileChangedResponse {
	if ("watchPaths" in output && output.watchPaths) {
		return new FileChangedResponse({ watchPaths: output.watchPaths });
	}
	return new FileChangedResponse({});
}

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for FileChanged hooks.
 * @public
 */
export type FileChangedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	FileChangedInput,
	FileChangedOutput,
	TOptions,
	TState,
	FileChangedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for FileChanged hooks.
 * @public
 */
export type FileChangedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	FileChangedInput,
	FileChangedOutput,
	unknown,
	TOptions,
	TState,
	FileChangedOutcome
>;
