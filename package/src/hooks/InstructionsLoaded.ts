import { Schema } from "effect";
import type { NoAction } from "../outcomes/NoAction.js";
import type { HookDefinition, PluginHandler } from "../plugin/handler.js";
import { NormalizedPathSchema, SessionIdSchema, TranscriptPathSchema, normalizePath } from "../schemas/branded.js";
import {
	HookPermissionsModeSchema,
	InstructionsLoadedReasonSchema,
	InstructionsMemoryTypeSchema,
} from "../schemas/hook-literals.js";
import { PassthroughOutputSchema, PassthroughResponse, toPassthroughResponse } from "./shared.js";

// =============================================================================
// 1. INPUT SCHEMA — raw wire format from stdin
// =============================================================================

/**
 * Input schema for InstructionsLoaded wire format from Claude Code stdin.
 * @public
 */
export class InstructionsLoadedInput extends Schema.Class<InstructionsLoadedInput>("InstructionsLoadedInput")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("InstructionsLoaded"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the instruction file that was loaded */
	file_path: Schema.String,
	/** Scope of the file */
	memory_type: InstructionsMemoryTypeSchema,
	/** Why the file was loaded */
	load_reason: InstructionsLoadedReasonSchema,
	/** Path glob patterns from the file's paths: frontmatter */
	globs: Schema.optional(Schema.Array(Schema.String)),
	/** Path to the file whose access triggered this load */
	trigger_file_path: Schema.optional(Schema.String),
	/** Path to the parent instruction file that included this one */
	parent_file_path: Schema.optional(Schema.String),
}) {}

// =============================================================================
// 2. EVENT CLASS — domain model (what handlers receive)
// =============================================================================

/**
 * Schema.Class for InstructionsLoaded events.
 * @public
 */
export class InstructionsLoadedEvent extends Schema.Class<InstructionsLoadedEvent>("InstructionsLoadedEvent")({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(NormalizedPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(NormalizedPathSchema),
	/** Current permission mode (optional) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: Schema.Literal("InstructionsLoaded"),
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
	/** Absolute path to the instruction file that was loaded */
	file_path: NormalizedPathSchema,
	/** Scope of the file */
	memory_type: InstructionsMemoryTypeSchema,
	/** Why the file was loaded */
	load_reason: InstructionsLoadedReasonSchema,
	/** Path glob patterns from the file's paths: frontmatter */
	globs: Schema.optional(Schema.Array(Schema.String)),
	/** Path to the file whose access triggered this load */
	trigger_file_path: Schema.optional(NormalizedPathSchema),
	/** Path to the parent instruction file that included this one */
	parent_file_path: Schema.optional(NormalizedPathSchema),
}) {
	static fromInput(input: InstructionsLoadedInput): InstructionsLoadedEvent {
		return new InstructionsLoadedEvent({
			session_id: input.session_id,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			memory_type: input.memory_type,
			load_reason: input.load_reason,
			globs: input.globs,
			cwd: input.cwd ? normalizePath(input.cwd) : undefined,
			transcript_path: input.transcript_path ? normalizePath(input.transcript_path) : undefined,
			trigger_file_path: input.trigger_file_path ? normalizePath(input.trigger_file_path) : undefined,
			parent_file_path: input.parent_file_path ? normalizePath(input.parent_file_path) : undefined,
			file_path: normalizePath(input.file_path),
		});
	}
}

// =============================================================================
// 3. OUTCOME UNION
// =============================================================================

/**
 * Valid outcome types for InstructionsLoaded handlers.
 * @public
 */
export type InstructionsLoadedOutcome = NoAction;

/**
 * Set of valid outcome tags for InstructionsLoaded hooks.
 * @public
 */
export const VALID_OUTCOME_TAGS = new Set(["NoAction"]);

// =============================================================================
// 4. OUTPUT SCHEMA — passthrough (no response data)
// =============================================================================

/** @public */
export const InstructionsLoadedOutputSchema = PassthroughOutputSchema;

/** @public */
export type InstructionsLoadedOutput = typeof InstructionsLoadedOutputSchema.Type;

// =============================================================================
// 5. RESPONSE SCHEMA — passthrough (empty object)
// =============================================================================

export { PassthroughResponse as InstructionsLoadedResponse, toPassthroughResponse as toInstructionsLoadedResponse };

// =============================================================================
// 6. HANDLER TYPE
// =============================================================================

/**
 * Handler function type for InstructionsLoaded hooks.
 * @public
 */
export type InstructionsLoadedHandler<TOptions, TState = Record<string, unknown>> = PluginHandler<
	InstructionsLoadedInput,
	InstructionsLoadedOutput,
	TOptions,
	TState,
	InstructionsLoadedOutcome
>;

// =============================================================================
// 7. HOOK DEFINITION TYPE
// =============================================================================

/**
 * Hook definition type for InstructionsLoaded hooks.
 * @public
 */
export type InstructionsLoadedHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	InstructionsLoadedInput,
	InstructionsLoadedOutput,
	unknown,
	TOptions,
	TState,
	InstructionsLoadedOutcome
>;
