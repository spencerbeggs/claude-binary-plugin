import { Schema } from "effect";
import type { ConfigChangeInput } from "../hooks/ConfigChange.js";
import type { CwdChangedInput } from "../hooks/CwdChanged.js";
import type { ElicitationInput } from "../hooks/Elicitation.js";
import type { ElicitationResultInput } from "../hooks/ElicitationResult.js";
import type { FileChangedInput } from "../hooks/FileChanged.js";
import type { InstructionsLoadedInput } from "../hooks/InstructionsLoaded.js";
import type { NotificationInput } from "../hooks/Notification.js";
import type { PermissionRequestInput } from "../hooks/PermissionRequest.js";
import type { PostCompactInput } from "../hooks/PostCompact.js";
import type { PostToolUseInput } from "../hooks/PostToolUse.js";
import type { PostToolUseFailureInput } from "../hooks/PostToolUseFailure.js";
import type { PreCompactInput } from "../hooks/PreCompact.js";
import type { PreToolUseInput } from "../hooks/PreToolUse.js";
import type { SessionEndInput } from "../hooks/SessionEnd.js";
import type { SessionStartInput } from "../hooks/SessionStart.js";
import type { StopInput } from "../hooks/Stop.js";
import type { StopFailureInput } from "../hooks/StopFailure.js";
import type { SubagentStartInput } from "../hooks/SubagentStart.js";
import type { SubagentStopInput } from "../hooks/SubagentStop.js";
import type { TaskCompletedInput } from "../hooks/TaskCompleted.js";
import type { TaskCreatedInput } from "../hooks/TaskCreated.js";
import type { TeammateIdleInput } from "../hooks/TeammateIdle.js";
import type { UserPromptSubmitInput } from "../hooks/UserPromptSubmit.js";
import type { WorktreeCreateInput } from "../hooks/WorktreeCreate.js";
import type { WorktreeRemoveInput } from "../hooks/WorktreeRemove.js";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "./branded.js";
import {
	ConfigChangeSourceSchema,
	ElicitationActionSchema,
	FileChangeEventSchema,
	HookPermissionsModeSchema,
	HookTypeSchema,
	InstructionsLoadedReasonSchema,
	InstructionsMemoryTypeSchema,
	PreCompactTriggerSchema,
	SessionEndReasonSchema,
	SessionStartSourceSchema,
	StopFailureErrorSchema,
} from "./hook-literals.js";
import { JsonObjectSchema } from "./json.js";

// =============================================================================
// SCHEMA METADATA (replaces Zod registry)
// =============================================================================

/**
 * Metadata structure for hook event schemas.
 *
 * @remarks
 * This metadata is attached to schemas via custom annotations,
 * enabling documentation generation and introspection.
 *
 * @public
 */
export interface HookEventSchemaMetadata {
	/** Human-readable description of when this event fires */
	description: string;
	/** Capabilities this hook provides (e.g., ["allow", "deny", "modify"]) */
	capabilities?: string[];
}

/** Custom annotation key for hook event description. */
const DescriptionAnnotation = Symbol.for("HookEventDescription");

/** Custom annotation key for hook event capabilities. */
const CapabilitiesAnnotation = Symbol.for("HookEventCapabilities");

/**
 * Retrieve metadata from a schema's annotations.
 *
 * @param schema - An Effect Schema instance
 * @returns The metadata if present, or undefined
 * @public
 */
export function getSchemaMetadata(schema: Schema.Schema.Any): HookEventSchemaMetadata | undefined {
	const annotations = (schema.ast as { annotations?: Record<symbol, unknown> }).annotations;
	if (!annotations) return undefined;
	const description = annotations[DescriptionAnnotation];
	if (!description) return undefined;
	const capabilities = annotations[CapabilitiesAnnotation] as string[] | undefined;
	const meta: HookEventSchemaMetadata = { description: description as string };
	if (capabilities) {
		meta.capabilities = capabilities;
	}
	return meta;
}

// =============================================================================
// BASE SCHEMA
// =============================================================================

/**
 * Base fields present in all hook events.
 * @internal
 */
const HookEventBaseSchema = Schema.Struct({
	/** Unique identifier for the current session (UUID format) */
	session_id: SessionIdSchema,
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: Schema.optional(TranscriptPathSchema),
	/** Current working directory (optional) */
	cwd: Schema.optional(Schema.String),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: Schema.optional(HookPermissionsModeSchema),
	/** The type of hook event */
	hook_event_name: HookTypeSchema,
	/** Unique identifier for the subagent (present when hook fires inside a subagent) */
	agent_id: Schema.optional(Schema.String),
	/** Agent name (present when session uses --agent or hook fires inside a subagent) */
	agent_type: Schema.optional(Schema.String),
});

// =============================================================================
// EVENT SCHEMA CLASSES
// =============================================================================

/**
 * Schema.Class for PreToolUse events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PreToolUseEvent)(data)` to parse.
 *
 * @public
 */
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>("PreToolUseEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PreToolUse"),
	/** Name of the tool being invoked */
	tool_name: Schema.String,
	/** Input parameters for the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {
	static fromInput(input: typeof PreToolUseInput.Type): PreToolUseEvent {
		return new PreToolUseEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_use_id: input.tool_use_id,
		});
	}
}

/**
 * Schema.Class for PostToolUse events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PostToolUseEvent)(data)` to parse.
 *
 * @public
 */
export class PostToolUseEvent extends Schema.Class<PostToolUseEvent>("PostToolUseEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PostToolUse"),
	/** Name of the tool that was invoked */
	tool_name: Schema.String,
	/** Input parameters that were passed to the tool (JSON object from Claude) */
	tool_input: JsonObjectSchema,
	/** Response returned by the tool (JSON object) */
	tool_response: JsonObjectSchema,
	/** Unique identifier for this tool use */
	tool_use_id: ToolUseIdSchema,
}) {
	static fromInput(input: typeof PostToolUseInput.Type): PostToolUseEvent {
		return new PostToolUseEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			tool_response: input.tool_response,
			tool_use_id: input.tool_use_id,
		});
	}
}

/**
 * Schema.Class for PermissionRequest events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PermissionRequestEvent)(data)` to parse.
 *
 * @public
 */
export class PermissionRequestEvent extends Schema.Class<PermissionRequestEvent>("PermissionRequestEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PermissionRequest"),
	/** Name of the tool requesting permission */
	tool_name: Schema.String,
	/** Input parameters for the tool */
	tool_input: JsonObjectSchema,
	/** Permission suggestions (always-allow options) */
	permission_suggestions: Schema.optional(Schema.Array(JsonObjectSchema)),
}) {
	static fromInput(input: typeof PermissionRequestInput.Type): PermissionRequestEvent {
		return new PermissionRequestEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			tool_name: input.tool_name,
			tool_input: input.tool_input,
			permission_suggestions: input.permission_suggestions,
		});
	}
}

/**
 * Schema.Class for Notification events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(NotificationEvent)(data)` to parse.
 *
 * @public
 */
export class NotificationEvent extends Schema.Class<NotificationEvent>("NotificationEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("Notification"),
	/** The notification message */
	message: Schema.String,
	/** Optional title for the notification */
	title: Schema.optional(Schema.String),
	/** Type of notification */
	notification_type: Schema.String,
}) {
	static fromInput(input: typeof NotificationInput.Type): NotificationEvent {
		return new NotificationEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			message: input.message,
			title: input.title,
			notification_type: input.notification_type,
		});
	}
}

/**
 * Schema.Class for UserPromptSubmit events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(UserPromptSubmitEvent)(data)` to parse.
 *
 * @public
 */
export class UserPromptSubmitEvent extends Schema.Class<UserPromptSubmitEvent>("UserPromptSubmitEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("UserPromptSubmit"),
	/** The user's prompt text */
	prompt: Schema.String,
}) {
	static fromInput(input: typeof UserPromptSubmitInput.Type): UserPromptSubmitEvent {
		return new UserPromptSubmitEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			prompt: input.prompt,
		});
	}
}

/**
 * Schema.Class for Stop events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(StopEvent)(data)` to parse.
 *
 * @public
 */
export class StopEvent extends Schema.Class<StopEvent>("StopEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("Stop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Text content of Claude's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof StopInput.Type): StopEvent {
		return new StopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			stop_hook_active: input.stop_hook_active,
			last_assistant_message: input.last_assistant_message,
		});
	}
}

/**
 * Schema.Class for SubagentStop events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SubagentStopEvent)(data)` to parse.
 *
 * @public
 */
export class SubagentStopEvent extends Schema.Class<SubagentStopEvent>("SubagentStopEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("SubagentStop"),
	/** Whether a stop hook is currently active */
	stop_hook_active: Schema.Boolean,
	/** Unique identifier for the subagent */
	agent_id: Schema.optional(Schema.String),
	/** Agent type name */
	agent_type: Schema.optional(Schema.String),
	/** Path to the subagent's own transcript */
	agent_transcript_path: Schema.optional(Schema.String),
	/** Text content of the subagent's final response */
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof SubagentStopInput.Type): SubagentStopEvent {
		return new SubagentStopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			stop_hook_active: input.stop_hook_active,
			agent_transcript_path: input.agent_transcript_path,
			last_assistant_message: input.last_assistant_message,
		});
	}
}

/**
 * Schema.Class for PreCompact events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(PreCompactEvent)(data)` to parse.
 *
 * @public
 */
export class PreCompactEvent extends Schema.Class<PreCompactEvent>("PreCompactEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PreCompact"),
	/** What triggered the compact operation */
	trigger: PreCompactTriggerSchema,
	/** Custom instructions for the compact operation */
	custom_instructions: Schema.String,
}) {
	static fromInput(input: typeof PreCompactInput.Type): PreCompactEvent {
		return new PreCompactEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			trigger: input.trigger,
			custom_instructions: input.custom_instructions,
		});
	}
}

/**
 * Schema.Class for SessionStart events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SessionStartEvent)(data)` to parse.
 *
 * @public
 */
export class SessionStartEvent extends Schema.Class<SessionStartEvent>("SessionStartEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("SessionStart"),
	/** What triggered the session start */
	source: SessionStartSourceSchema,
	/** Model identifier */
	model: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof SessionStartInput.Type): SessionStartEvent {
		return new SessionStartEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			source: input.source,
			model: input.model,
		});
	}
}

/**
 * Schema.Class for SessionEnd events.
 *
 * @remarks
 * Provides type, schema, and instanceof check in a single declaration.
 * Use `Schema.decodeUnknownSync(SessionEndEvent)(data)` to parse.
 *
 * @public
 */
export class SessionEndEvent extends Schema.Class<SessionEndEvent>("SessionEndEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("SessionEnd"),
	/** Why the session is ending */
	reason: SessionEndReasonSchema,
}) {
	static fromInput(input: typeof SessionEndInput.Type): SessionEndEvent {
		return new SessionEndEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			agent_id: input.agent_id,
			agent_type: input.agent_type,
			reason: input.reason,
		});
	}
}

// =============================================================================
// NEW EVENT SCHEMA CLASSES
// =============================================================================

/** @public */
export class PostToolUseFailureEvent extends Schema.Class<PostToolUseFailureEvent>("PostToolUseFailureEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PostToolUseFailure"),
	tool_name: Schema.String,
	tool_input: JsonObjectSchema,
	tool_use_id: ToolUseIdSchema,
	error: Schema.String,
	is_interrupt: Schema.optional(Schema.Boolean),
}) {
	static fromInput(input: typeof PostToolUseFailureInput.Type): PostToolUseFailureEvent {
		return new PostToolUseFailureEvent({ ...input });
	}
}

/** @public */
export class StopFailureEvent extends Schema.Class<StopFailureEvent>("StopFailureEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("StopFailure"),
	error: StopFailureErrorSchema,
	error_details: Schema.optional(Schema.String),
	last_assistant_message: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof StopFailureInput.Type): StopFailureEvent {
		return new StopFailureEvent({ ...input });
	}
}

/** @public */
export class SubagentStartEvent extends Schema.Class<SubagentStartEvent>("SubagentStartEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("SubagentStart"),
	agent_id: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof SubagentStartInput.Type): SubagentStartEvent {
		return new SubagentStartEvent({ ...input });
	}
}

/** @public */
export class TaskCreatedEvent extends Schema.Class<TaskCreatedEvent>("TaskCreatedEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("TaskCreated"),
	task_id: Schema.String,
	task_subject: Schema.String,
	task_description: Schema.optional(Schema.String),
	teammate_name: Schema.optional(Schema.String),
	team_name: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof TaskCreatedInput.Type): TaskCreatedEvent {
		return new TaskCreatedEvent({ ...input });
	}
}

/** @public */
export class TaskCompletedEvent extends Schema.Class<TaskCompletedEvent>("TaskCompletedEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("TaskCompleted"),
	task_id: Schema.String,
	task_subject: Schema.String,
	task_description: Schema.optional(Schema.String),
	teammate_name: Schema.optional(Schema.String),
	team_name: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof TaskCompletedInput.Type): TaskCompletedEvent {
		return new TaskCompletedEvent({ ...input });
	}
}

/** @public */
export class TeammateIdleEvent extends Schema.Class<TeammateIdleEvent>("TeammateIdleEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("TeammateIdle"),
	teammate_name: Schema.String,
	team_name: Schema.String,
}) {
	static fromInput(input: typeof TeammateIdleInput.Type): TeammateIdleEvent {
		return new TeammateIdleEvent({ ...input });
	}
}

/** @public */
export class InstructionsLoadedEvent extends Schema.Class<InstructionsLoadedEvent>("InstructionsLoadedEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("InstructionsLoaded"),
	file_path: Schema.String,
	memory_type: InstructionsMemoryTypeSchema,
	load_reason: InstructionsLoadedReasonSchema,
	globs: Schema.optional(Schema.Array(Schema.String)),
	trigger_file_path: Schema.optional(Schema.String),
	parent_file_path: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof InstructionsLoadedInput.Type): InstructionsLoadedEvent {
		return new InstructionsLoadedEvent({ ...input });
	}
}

/** @public */
export class ConfigChangeEvent extends Schema.Class<ConfigChangeEvent>("ConfigChangeEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("ConfigChange"),
	source: ConfigChangeSourceSchema,
	file_path: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof ConfigChangeInput.Type): ConfigChangeEvent {
		return new ConfigChangeEvent({ ...input });
	}
}

/** @public */
export class CwdChangedEvent extends Schema.Class<CwdChangedEvent>("CwdChangedEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("CwdChanged"),
	old_cwd: Schema.String,
	new_cwd: Schema.String,
}) {
	static fromInput(input: typeof CwdChangedInput.Type): CwdChangedEvent {
		return new CwdChangedEvent({ ...input });
	}
}

/** @public */
export class FileChangedEvent extends Schema.Class<FileChangedEvent>("FileChangedEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("FileChanged"),
	file_path: Schema.String,
	event: FileChangeEventSchema,
}) {
	static fromInput(input: typeof FileChangedInput.Type): FileChangedEvent {
		return new FileChangedEvent({ ...input });
	}
}

/** @public */
export class WorktreeCreateEvent extends Schema.Class<WorktreeCreateEvent>("WorktreeCreateEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("WorktreeCreate"),
	name: Schema.String,
}) {
	static fromInput(input: typeof WorktreeCreateInput.Type): WorktreeCreateEvent {
		return new WorktreeCreateEvent({ ...input });
	}
}

/** @public */
export class WorktreeRemoveEvent extends Schema.Class<WorktreeRemoveEvent>("WorktreeRemoveEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("WorktreeRemove"),
	worktree_path: Schema.String,
}) {
	static fromInput(input: typeof WorktreeRemoveInput.Type): WorktreeRemoveEvent {
		return new WorktreeRemoveEvent({ ...input });
	}
}

/** @public */
export class PostCompactEvent extends Schema.Class<PostCompactEvent>("PostCompactEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("PostCompact"),
	trigger: PreCompactTriggerSchema,
	compact_summary: Schema.String,
}) {
	static fromInput(input: typeof PostCompactInput.Type): PostCompactEvent {
		return new PostCompactEvent({ ...input });
	}
}

/** @public */
export class ElicitationEvent extends Schema.Class<ElicitationEvent>("ElicitationEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("Elicitation"),
	mcp_server_name: Schema.String,
	message: Schema.String,
	mode: Schema.optional(Schema.Literal("form", "url")),
	url: Schema.optional(Schema.String),
	elicitation_id: Schema.optional(Schema.String),
	requested_schema: Schema.optional(JsonObjectSchema),
}) {
	static fromInput(input: typeof ElicitationInput.Type): ElicitationEvent {
		return new ElicitationEvent({ ...input });
	}
}

/** @public */
export class ElicitationResultEvent extends Schema.Class<ElicitationResultEvent>("ElicitationResultEvent")({
	...HookEventBaseSchema.fields,
	hook_event_name: Schema.Literal("ElicitationResult"),
	mcp_server_name: Schema.String,
	action: ElicitationActionSchema,
	content: Schema.optional(JsonObjectSchema),
	mode: Schema.optional(Schema.Literal("form", "url")),
	elicitation_id: Schema.optional(Schema.String),
}) {
	static fromInput(input: typeof ElicitationResultInput.Type): ElicitationResultEvent {
		return new ElicitationResultEvent({ ...input });
	}
}

// =============================================================================
// ANNOTATED SCHEMA REFERENCES (for metadata retrieval)
// =============================================================================

/** @internal Annotated schema for PreToolUse events */
const PreToolUseEventAnnotated = PreToolUseEvent.annotations({
	[DescriptionAnnotation]: "Fired after Claude creates tool parameters but before the tool executes.",
	[CapabilitiesAnnotation]: ["allow", "deny", "modify"],
});

/** @internal Annotated schema for PostToolUse events */
const PostToolUseEventAnnotated = PostToolUseEvent.annotations({
	[DescriptionAnnotation]: "Fired immediately after a tool completes successfully.",
	[CapabilitiesAnnotation]: ["context", "block"],
});

/** @internal Annotated schema for PermissionRequest events */
const PermissionRequestEventAnnotated = PermissionRequestEvent.annotations({
	[DescriptionAnnotation]: "Fired when a permission dialog is about to be shown to the user.",
	[CapabilitiesAnnotation]: ["allow", "deny"],
});

/** @internal Annotated schema for Notification events */
const NotificationEventAnnotated = NotificationEvent.annotations({
	[DescriptionAnnotation]: "Fired when Claude Code sends a notification.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

/** @internal Annotated schema for UserPromptSubmit events */
const UserPromptSubmitEventAnnotated = UserPromptSubmitEvent.annotations({
	[DescriptionAnnotation]: "Fired when the user submits a prompt, before Claude processes it.",
	[CapabilitiesAnnotation]: ["context", "block"],
});

/** @internal Annotated schema for Stop events */
const StopEventAnnotated = StopEvent.annotations({
	[DescriptionAnnotation]: "Fired when the main Claude Code agent finishes responding.",
	[CapabilitiesAnnotation]: ["block"],
});

/** @internal Annotated schema for SubagentStop events */
const SubagentStopEventAnnotated = SubagentStopEvent.annotations({
	[DescriptionAnnotation]: "Fired when a subagent (Task tool) finishes responding.",
	[CapabilitiesAnnotation]: ["block"],
});

/** @internal Annotated schema for PreCompact events */
const PreCompactEventAnnotated = PreCompactEvent.annotations({
	[DescriptionAnnotation]: "Fired before Claude Code compacts the context window.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

/** @internal Annotated schema for SessionStart events */
const SessionStartEventAnnotated = SessionStartEvent.annotations({
	[DescriptionAnnotation]: "Fired when Claude Code starts or resumes a session.",
	[CapabilitiesAnnotation]: ["context", "setup"],
});

/** @internal Annotated schema for SessionEnd events */
const SessionEndEventAnnotated = SessionEndEvent.annotations({
	[DescriptionAnnotation]: "Fired when a Claude Code session terminates.",
	[CapabilitiesAnnotation]: ["cleanup"],
});

const PostToolUseFailureEventAnnotated = PostToolUseFailureEvent.annotations({
	[DescriptionAnnotation]: "Fired when a tool execution fails.",
	[CapabilitiesAnnotation]: ["context"],
});

const StopFailureEventAnnotated = StopFailureEvent.annotations({
	[DescriptionAnnotation]: "Fired when the turn ends due to an API error.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

const SubagentStartEventAnnotated = SubagentStartEvent.annotations({
	[DescriptionAnnotation]: "Fired when a subagent is spawned.",
	[CapabilitiesAnnotation]: ["context"],
});

const TaskCreatedEventAnnotated = TaskCreatedEvent.annotations({
	[DescriptionAnnotation]: "Fired when a task is being created.",
	[CapabilitiesAnnotation]: ["block"],
});

const TaskCompletedEventAnnotated = TaskCompletedEvent.annotations({
	[DescriptionAnnotation]: "Fired when a task is being marked as completed.",
	[CapabilitiesAnnotation]: ["block"],
});

const TeammateIdleEventAnnotated = TeammateIdleEvent.annotations({
	[DescriptionAnnotation]: "Fired when a teammate is about to go idle.",
	[CapabilitiesAnnotation]: ["block"],
});

const InstructionsLoadedEventAnnotated = InstructionsLoadedEvent.annotations({
	[DescriptionAnnotation]: "Fired when a CLAUDE.md or rules file is loaded.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

const ConfigChangeEventAnnotated = ConfigChangeEvent.annotations({
	[DescriptionAnnotation]: "Fired when a configuration file changes.",
	[CapabilitiesAnnotation]: ["block"],
});

const CwdChangedEventAnnotated = CwdChangedEvent.annotations({
	[DescriptionAnnotation]: "Fired when the working directory changes.",
	[CapabilitiesAnnotation]: ["watchPaths"],
});

const FileChangedEventAnnotated = FileChangedEvent.annotations({
	[DescriptionAnnotation]: "Fired when a watched file changes on disk.",
	[CapabilitiesAnnotation]: ["watchPaths"],
});

const WorktreeCreateEventAnnotated = WorktreeCreateEvent.annotations({
	[DescriptionAnnotation]: "Fired when a worktree is being created.",
	[CapabilitiesAnnotation]: ["path"],
});

const WorktreeRemoveEventAnnotated = WorktreeRemoveEvent.annotations({
	[DescriptionAnnotation]: "Fired when a worktree is being removed.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

const PostCompactEventAnnotated = PostCompactEvent.annotations({
	[DescriptionAnnotation]: "Fired after context compaction completes.",
	[CapabilitiesAnnotation]: ["passthrough"],
});

const ElicitationEventAnnotated = ElicitationEvent.annotations({
	[DescriptionAnnotation]: "Fired when an MCP server requests user input.",
	[CapabilitiesAnnotation]: ["accept", "decline", "cancel"],
});

const ElicitationResultEventAnnotated = ElicitationResultEvent.annotations({
	[DescriptionAnnotation]: "Fired after a user responds to an MCP elicitation.",
	[CapabilitiesAnnotation]: ["accept", "decline", "cancel"],
});

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================

/**
 * Union schema for all hook event types.
 *
 * @remarks
 * Use this schema to validate any hook event data from Claude Code.
 * Effect Schema auto-detects the discriminator from literal `hook_event_name` fields.
 *
 * @public
 */
export const HookEventSchema = Schema.Union(
	PreToolUseEvent,
	PostToolUseEvent,
	PostToolUseFailureEvent,
	PermissionRequestEvent,
	NotificationEvent,
	UserPromptSubmitEvent,
	StopEvent,
	StopFailureEvent,
	SubagentStartEvent,
	SubagentStopEvent,
	TaskCreatedEvent,
	TaskCompletedEvent,
	TeammateIdleEvent,
	InstructionsLoadedEvent,
	ConfigChangeEvent,
	CwdChangedEvent,
	FileChangedEvent,
	WorktreeCreateEvent,
	WorktreeRemoveEvent,
	PreCompactEvent,
	PostCompactEvent,
	ElicitationEvent,
	ElicitationResultEvent,
	SessionStartEvent,
	SessionEndEvent,
);

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/**
 * Inferred type for any hook event (discriminated union).
 * @public
 */
export type HookEventParsed = typeof HookEventSchema.Type;

// =============================================================================
// HOOK EVENT SCHEMAS CLASS
// =============================================================================

/**
 * Unified class for all hook event schemas with annotation metadata.
 *
 * @remarks
 * `HookEventSchemas` provides a class-first API for hook event validation
 * with annotation-based metadata. All schemas carry metadata via annotations,
 * enabling documentation generation and introspection. All members are static.
 *
 * **Available Schemas:**
 *
 * | Property | Description |
 * |----------|-------------|
 * | `PreToolUse` | Before tool execution (allow/deny/modify) |
 * | `PostToolUse` | After tool completes (context/block) |
 * | `PermissionRequest` | Permission dialog (allow/deny) |
 * | `Notification` | Notification event (passthrough) |
 * | `UserPromptSubmit` | User prompt submission (context/block) |
 * | `Stop` | Agent completion (block) |
 * | `SubagentStop` | Subagent completion (block) |
 * | `PreCompact` | Before context compaction (passthrough) |
 * | `SessionStart` | Session begins (context/setup) |
 * | `SessionEnd` | Session ends (cleanup) |
 * | `Any` | Union of all events |
 *
 * **Parse Methods:**
 *
 * | Method | Description |
 * |--------|-------------|
 * | `parse(json)` | Parse any hook event (union) |
 * | `parsePreToolUse(json)` | Parse PreToolUse event |
 * | `parsePostToolUse(json)` | Parse PostToolUse event |
 * | ... | (one for each event type) |
 *
 * @example
 * ```typescript
 * import { HookEventSchemas } from "claude-binary-plugin";
 *
 * // Parse any hook event
 * const event = HookEventSchemas.parse(jsonString);
 * if (event.hook_event_name === "PreToolUse") {
 *   console.log(event.tool_name);
 * }
 *
 * // Parse specific event type
 * const preToolUse = HookEventSchemas.parsePreToolUse(jsonString);
 * console.log(preToolUse.tool_input);
 *
 * // Access annotation metadata
 * const meta = HookEventSchemas.getMetadata(HookEventSchemas.PreToolUse);
 * console.log(meta?.description);
 * console.log(meta?.capabilities); // ["allow", "deny", "modify"]
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export class HookEventSchemas {
	private constructor() {}

	// ─────────────────────────────────────────────────────────────────────────
	// Metadata
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get metadata for a hook event schema.
	 *
	 * @param schema - An Effect Schema instance
	 * @returns The metadata if present, or undefined
	 */
	static getMetadata(schema: Schema.Schema.Any): HookEventSchemaMetadata | undefined {
		return getSchemaMetadata(schema);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Individual Schemas (annotated versions for metadata)
	// ─────────────────────────────────────────────────────────────────────────

	/** Schema for PreToolUse events (allow/deny/modify tool execution) */
	static readonly PreToolUse = PreToolUseEventAnnotated;

	/** Schema for PostToolUse events (add context/block after tool) */
	static readonly PostToolUse = PostToolUseEventAnnotated;

	/** Schema for PermissionRequest events (auto allow/deny permissions) */
	static readonly PermissionRequest = PermissionRequestEventAnnotated;

	/** Schema for Notification events (passthrough) */
	static readonly Notification = NotificationEventAnnotated;

	/** Schema for UserPromptSubmit events (add context/block prompts) */
	static readonly UserPromptSubmit = UserPromptSubmitEventAnnotated;

	/** Schema for Stop events (block agent completion) */
	static readonly Stop = StopEventAnnotated;

	/** Schema for SubagentStop events (block subagent completion) */
	static readonly SubagentStop = SubagentStopEventAnnotated;

	/** Schema for PreCompact events (passthrough) */
	static readonly PreCompact = PreCompactEventAnnotated;

	/** Schema for SessionStart events (setup/context) */
	static readonly SessionStart = SessionStartEventAnnotated;

	/** Schema for SessionEnd events (cleanup) */
	static readonly SessionEnd = SessionEndEventAnnotated;

	/** Schema for PostToolUseFailure events (context after tool failure) */
	static readonly PostToolUseFailure = PostToolUseFailureEventAnnotated;

	/** Schema for StopFailure events (fire-and-forget on API error) */
	static readonly StopFailure = StopFailureEventAnnotated;

	/** Schema for SubagentStart events (context on subagent spawn) */
	static readonly SubagentStart = SubagentStartEventAnnotated;

	/** Schema for TaskCreated events (block task creation) */
	static readonly TaskCreated = TaskCreatedEventAnnotated;

	/** Schema for TaskCompleted events (block task completion) */
	static readonly TaskCompleted = TaskCompletedEventAnnotated;

	/** Schema for TeammateIdle events (block teammate idle) */
	static readonly TeammateIdle = TeammateIdleEventAnnotated;

	/** Schema for InstructionsLoaded events (observability) */
	static readonly InstructionsLoaded = InstructionsLoadedEventAnnotated;

	/** Schema for ConfigChange events (block config changes) */
	static readonly ConfigChange = ConfigChangeEventAnnotated;

	/** Schema for CwdChanged events (env reload) */
	static readonly CwdChanged = CwdChangedEventAnnotated;

	/** Schema for FileChanged events (file watch) */
	static readonly FileChanged = FileChangedEventAnnotated;

	/** Schema for WorktreeCreate events (custom worktree) */
	static readonly WorktreeCreate = WorktreeCreateEventAnnotated;

	/** Schema for WorktreeRemove events (cleanup) */
	static readonly WorktreeRemove = WorktreeRemoveEventAnnotated;

	/** Schema for PostCompact events (post-compaction) */
	static readonly PostCompact = PostCompactEventAnnotated;

	/** Schema for Elicitation events (MCP user input) */
	static readonly Elicitation = ElicitationEventAnnotated;

	/** Schema for ElicitationResult events (MCP response) */
	static readonly ElicitationResult = ElicitationResultEventAnnotated;

	/** Union of all hook event schemas */
	static readonly Any = HookEventSchema;

	// ─────────────────────────────────────────────────────────────────────────
	// Parse Methods
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Parse a JSON string into a validated hook event (union).
	 *
	 * @param json - Raw JSON string from Claude Code
	 * @returns Validated and typed hook event
	 * @throws `ParseError` when the data doesn't match any hook event schema
	 * @throws `SyntaxError` when the JSON is malformed
	 */
	static parse(json: string): HookEventParsed {
		return Schema.decodeUnknownSync(HookEventSchema)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a PreToolUse event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parsePreToolUse(json: string): PreToolUseEvent {
		return Schema.decodeUnknownSync(PreToolUseEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a PostToolUse event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parsePostToolUse(json: string): PostToolUseEvent {
		return Schema.decodeUnknownSync(PostToolUseEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a PermissionRequest event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parsePermissionRequest(json: string): PermissionRequestEvent {
		return Schema.decodeUnknownSync(PermissionRequestEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a Notification event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseNotification(json: string): NotificationEvent {
		return Schema.decodeUnknownSync(NotificationEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a UserPromptSubmit event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseUserPromptSubmit(json: string): UserPromptSubmitEvent {
		return Schema.decodeUnknownSync(UserPromptSubmitEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a Stop event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseStop(json: string): StopEvent {
		return Schema.decodeUnknownSync(StopEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a SubagentStop event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseSubagentStop(json: string): SubagentStopEvent {
		return Schema.decodeUnknownSync(SubagentStopEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a PreCompact event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parsePreCompact(json: string): PreCompactEvent {
		return Schema.decodeUnknownSync(PreCompactEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a SessionStart event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseSessionStart(json: string): SessionStartEvent {
		return Schema.decodeUnknownSync(SessionStartEvent)(JSON.parse(json));
	}

	/**
	 * Parse a JSON string into a SessionEnd event.
	 * @param json - Raw JSON string from Claude Code
	 */
	static parseSessionEnd(json: string): SessionEndEvent {
		return Schema.decodeUnknownSync(SessionEndEvent)(JSON.parse(json));
	}

	static parsePostToolUseFailure(json: string): PostToolUseFailureEvent {
		return Schema.decodeUnknownSync(PostToolUseFailureEvent)(JSON.parse(json));
	}

	static parseStopFailure(json: string): StopFailureEvent {
		return Schema.decodeUnknownSync(StopFailureEvent)(JSON.parse(json));
	}

	static parseSubagentStart(json: string): SubagentStartEvent {
		return Schema.decodeUnknownSync(SubagentStartEvent)(JSON.parse(json));
	}

	static parseTaskCreated(json: string): TaskCreatedEvent {
		return Schema.decodeUnknownSync(TaskCreatedEvent)(JSON.parse(json));
	}

	static parseTaskCompleted(json: string): TaskCompletedEvent {
		return Schema.decodeUnknownSync(TaskCompletedEvent)(JSON.parse(json));
	}

	static parseTeammateIdle(json: string): TeammateIdleEvent {
		return Schema.decodeUnknownSync(TeammateIdleEvent)(JSON.parse(json));
	}

	static parseInstructionsLoaded(json: string): InstructionsLoadedEvent {
		return Schema.decodeUnknownSync(InstructionsLoadedEvent)(JSON.parse(json));
	}

	static parseConfigChange(json: string): ConfigChangeEvent {
		return Schema.decodeUnknownSync(ConfigChangeEvent)(JSON.parse(json));
	}

	static parseCwdChanged(json: string): CwdChangedEvent {
		return Schema.decodeUnknownSync(CwdChangedEvent)(JSON.parse(json));
	}

	static parseFileChanged(json: string): FileChangedEvent {
		return Schema.decodeUnknownSync(FileChangedEvent)(JSON.parse(json));
	}

	static parseWorktreeCreate(json: string): WorktreeCreateEvent {
		return Schema.decodeUnknownSync(WorktreeCreateEvent)(JSON.parse(json));
	}

	static parseWorktreeRemove(json: string): WorktreeRemoveEvent {
		return Schema.decodeUnknownSync(WorktreeRemoveEvent)(JSON.parse(json));
	}

	static parsePostCompact(json: string): PostCompactEvent {
		return Schema.decodeUnknownSync(PostCompactEvent)(JSON.parse(json));
	}

	static parseElicitation(json: string): ElicitationEvent {
		return Schema.decodeUnknownSync(ElicitationEvent)(JSON.parse(json));
	}

	static parseElicitationResult(json: string): ElicitationResultEvent {
		return Schema.decodeUnknownSync(ElicitationResultEvent)(JSON.parse(json));
	}
}
