import { Schema } from "effect";
import { SessionIdSchema, ToolUseIdSchema, TranscriptPathSchema } from "./branded.js";
import type {
	NotificationInput,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopInput,
	SubagentStopInput,
	UserPromptSubmitInput,
} from "./hook-inputs.js";
import {
	HookPermissionsModeSchema,
	HookTypeSchema,
	PreCompactTriggerSchema,
	SessionEndReasonSchema,
	SessionStartSourceSchema,
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
	/** The permission message being shown */
	message: Schema.String,
	/** Type of notification/permission being requested */
	notification_type: Schema.String,
}) {
	static fromInput(input: typeof PermissionRequestInput.Type): PermissionRequestEvent {
		return new PermissionRequestEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			message: input.message,
			notification_type: input.notification_type,
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
			message: input.message,
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
}) {
	static fromInput(input: typeof StopInput.Type): StopEvent {
		return new StopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			stop_hook_active: input.stop_hook_active,
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
}) {
	static fromInput(input: typeof SubagentStopInput.Type): SubagentStopEvent {
		return new SubagentStopEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			stop_hook_active: input.stop_hook_active,
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
}) {
	static fromInput(input: typeof SessionStartInput.Type): SessionStartEvent {
		return new SessionStartEvent({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			permission_mode: input.permission_mode,
			hook_event_name: input.hook_event_name,
			source: input.source,
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
			reason: input.reason,
		});
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
	PermissionRequestEvent,
	NotificationEvent,
	UserPromptSubmitEvent,
	StopEvent,
	SubagentStopEvent,
	PreCompactEvent,
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
}
