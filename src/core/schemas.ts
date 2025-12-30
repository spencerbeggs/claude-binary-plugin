/**
 * Zod schemas for Claude Code hook events.
 *
 * @remarks
 * This module provides runtime validation for hook event data received from
 * Claude Code. All schemas match the TypeScript interfaces defined in the
 * events module.
 *
 * **Using HookEventSchemas (Recommended):**
 *
 * The `HookEventSchemas` class provides all schemas with registry metadata:
 *
 * ```typescript
 * import { HookEventSchemas } from "claude-binary-plugin";
 *
 * // Parse any hook event (discriminated union)
 * const event = HookEventSchemas.parse(jsonString);
 *
 * // Parse specific event type
 * const preToolUse = HookEventSchemas.parsePreToolUse(jsonString);
 *
 * // Access schema directly
 * const validated = HookEventSchemas.PreToolUse.parse(data);
 *
 * // Access registry metadata
 * const meta = HookEventSchemas.registry.get(HookEventSchemas.PreToolUse);
 * console.log(meta.description); // "Fired before a tool executes..."
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @see {@link https://zod.dev/metadata | Zod Registries}
 * @module
 */

import { z } from "zod";

// =============================================================================
// SCHEMA REGISTRY
// =============================================================================

/**
 * Metadata structure for hook event schemas.
 *
 * @remarks
 * This metadata is attached to schemas via the Zod v4 registry system,
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

/**
 * Registry for hook event schema metadata.
 *
 * @remarks
 * This registry stores metadata for all hook event schemas. Users can access
 * this registry to generate documentation or introspect schema capabilities.
 *
 * @example
 * ```typescript
 * // Get metadata for a schema
 * const meta = hookEventSchemaRegistry.get(HookEventSchemas.PreToolUse);
 * console.log(meta.description);
 * console.log(meta.capabilities); // ["allow", "deny", "modify"]
 * ```
 *
 * @public
 */
export const hookEventSchemaRegistry = z.registry<HookEventSchemaMetadata>();

// =============================================================================
// ENUMS AND LITERALS
// =============================================================================

/**
 * Hook event names as Zod enum.
 * @internal
 */
const _HookEventNameSchema = z.enum([
	"PreToolUse",
	"PostToolUse",
	"PermissionRequest",
	"Notification",
	"UserPromptSubmit",
	"Stop",
	"SubagentStop",
	"PreCompact",
	"SessionStart",
	"SessionEnd",
]);

/**
 * Permission modes for hook events.
 * @internal
 */
const _HookPermissionsModeSchema = z.enum(["default", "plan", "acceptEdits", "bypassPermissions"]);

/**
 * Pre-tool-use permission decisions.
 * @internal
 */
const _PreToolUseDecisionSchema = z.enum(["allow", "deny", "ask"]);

/**
 * Permission request behavior.
 * @internal
 */
const _PermissionRequestBehaviorSchema = z.enum(["allow", "deny"]);

/**
 * Pre-compact trigger types.
 * @internal
 */
const _PreCompactTriggerSchema = z.enum(["manual", "auto"]);

/**
 * Session start source types.
 * @internal
 */
const _SessionStartSourceSchema = z.enum(["startup", "resume", "clear", "compact"]);

/**
 * Session end reason types.
 * @internal
 */
const _SessionEndReasonSchema = z.enum(["clear", "logout", "prompt_input_exit", "other"]);

// =============================================================================
// BASE SCHEMA
// =============================================================================

/**
 * Base fields present in all hook events.
 * @internal
 */
const _HookEventBaseSchema = z.object({
	/** Unique identifier for the current session (UUID format) */
	session_id: z.string().uuid(),
	/** Absolute path to the conversation transcript JSON file (optional) */
	transcript_path: z.string().optional(),
	/** Current working directory (optional) */
	cwd: z.string().optional(),
	/** Current permission mode (optional - not present in SessionStart) */
	permission_mode: _HookPermissionsModeSchema.optional(),
	/** The type of hook event */
	hook_event_name: _HookEventNameSchema,
});

// =============================================================================
// EVENT-SPECIFIC SCHEMAS (with registry metadata)
// =============================================================================

/**
 * Schema for PreToolUse events.
 * @internal
 */
const _PreToolUseEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("PreToolUse"),
		/** Name of the tool being invoked */
		tool_name: z.string(),
		/** Input parameters for the tool */
		tool_input: z.record(z.string(), z.unknown()),
		/** Unique identifier for this tool use */
		tool_use_id: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired after Claude creates tool parameters but before the tool executes.",
		capabilities: ["allow", "deny", "modify"],
	});

/**
 * Schema for PostToolUse events.
 * @internal
 */
const _PostToolUseEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("PostToolUse"),
		/** Name of the tool that was invoked */
		tool_name: z.string(),
		/** Input parameters that were passed to the tool */
		tool_input: z.record(z.string(), z.unknown()),
		/** Response returned by the tool */
		tool_response: z.record(z.string(), z.unknown()),
		/** Unique identifier for this tool use */
		tool_use_id: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired immediately after a tool completes successfully.",
		capabilities: ["context", "block"],
	});

/**
 * Schema for PermissionRequest events.
 * @internal
 */
const _PermissionRequestEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("PermissionRequest"),
		/** The permission message being shown */
		message: z.string(),
		/** Type of notification/permission being requested */
		notification_type: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when a permission dialog is about to be shown to the user.",
		capabilities: ["allow", "deny"],
	});

/**
 * Schema for Notification events.
 * @internal
 */
const _NotificationEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("Notification"),
		/** The notification message */
		message: z.string(),
		/** Type of notification */
		notification_type: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when Claude Code sends a notification.",
		capabilities: ["passthrough"],
	});

/**
 * Schema for UserPromptSubmit events.
 * @internal
 */
const _UserPromptSubmitEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("UserPromptSubmit"),
		/** The user's prompt text */
		prompt: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when the user submits a prompt, before Claude processes it.",
		capabilities: ["context", "block"],
	});

/**
 * Schema for Stop events.
 * @internal
 */
const _StopEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("Stop"),
		/** Whether a stop hook is currently active */
		stop_hook_active: z.boolean(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when the main Claude Code agent finishes responding.",
		capabilities: ["block"],
	});

/**
 * Schema for SubagentStop events.
 * @internal
 */
const _SubagentStopEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("SubagentStop"),
		/** Whether a stop hook is currently active */
		stop_hook_active: z.boolean(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when a subagent (Task tool) finishes responding.",
		capabilities: ["block"],
	});

/**
 * Schema for PreCompact events.
 * @internal
 */
const _PreCompactEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("PreCompact"),
		/** What triggered the compact operation */
		trigger: _PreCompactTriggerSchema,
		/** Custom instructions for the compact operation */
		custom_instructions: z.string(),
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired before Claude Code compacts the context window.",
		capabilities: ["passthrough"],
	});

/**
 * Schema for SessionStart events.
 * @internal
 */
const _SessionStartEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("SessionStart"),
		/** What triggered the session start */
		source: _SessionStartSourceSchema,
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when Claude Code starts or resumes a session.",
		capabilities: ["context", "setup"],
	});

/**
 * Schema for SessionEnd events.
 * @internal
 */
const _SessionEndEventSchema = _HookEventBaseSchema
	.extend({
		hook_event_name: z.literal("SessionEnd"),
		/** Why the session is ending */
		reason: _SessionEndReasonSchema,
	})
	.register(hookEventSchemaRegistry, {
		description: "Fired when a Claude Code session terminates.",
		capabilities: ["cleanup"],
	});

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================

/**
 * Discriminated union schema for all hook event types.
 * @internal
 */
const _HookEventSchema = z.discriminatedUnion("hook_event_name", [
	_PreToolUseEventSchema,
	_PostToolUseEventSchema,
	_PermissionRequestEventSchema,
	_NotificationEventSchema,
	_UserPromptSubmitEventSchema,
	_StopEventSchema,
	_SubagentStopEventSchema,
	_PreCompactEventSchema,
	_SessionStartEventSchema,
	_SessionEndEventSchema,
]);

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/**
 * Inferred type for any hook event (discriminated union).
 * @public
 */
export type HookEventParsed = z.infer<typeof _HookEventSchema>;

/**
 * Inferred type for PreToolUse events.
 * @public
 */
export type PreToolUseEventParsed = z.infer<typeof _PreToolUseEventSchema>;

/**
 * Inferred type for PostToolUse events.
 * @public
 */
export type PostToolUseEventParsed = z.infer<typeof _PostToolUseEventSchema>;

/**
 * Inferred type for PermissionRequest events.
 * @public
 */
export type PermissionRequestEventParsed = z.infer<typeof _PermissionRequestEventSchema>;

/**
 * Inferred type for Notification events.
 * @public
 */
export type NotificationEventParsed = z.infer<typeof _NotificationEventSchema>;

/**
 * Inferred type for UserPromptSubmit events.
 * @public
 */
export type UserPromptSubmitEventParsed = z.infer<typeof _UserPromptSubmitEventSchema>;

/**
 * Inferred type for Stop events.
 * @public
 */
export type StopEventParsed = z.infer<typeof _StopEventSchema>;

/**
 * Inferred type for SubagentStop events.
 * @public
 */
export type SubagentStopEventParsed = z.infer<typeof _SubagentStopEventSchema>;

/**
 * Inferred type for PreCompact events.
 * @public
 */
export type PreCompactEventParsed = z.infer<typeof _PreCompactEventSchema>;

/**
 * Inferred type for SessionStart events.
 * @public
 */
export type SessionStartEventParsed = z.infer<typeof _SessionStartEventSchema>;

/**
 * Inferred type for SessionEnd events.
 * @public
 */
export type SessionEndEventParsed = z.infer<typeof _SessionEndEventSchema>;

// =============================================================================
// HOOK EVENT SCHEMAS CLASS
// =============================================================================

/**
 * Unified class for all hook event schemas with registry metadata.
 *
 * @remarks
 * `HookEventSchemas` provides a class-first API for hook event validation
 * with Zod v4 registry integration. All schemas are registered with metadata
 * enabling documentation generation and introspection.
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
 * | `Any` | Discriminated union of all events |
 *
 * **Parse Methods:**
 *
 * | Method | Description |
 * |--------|-------------|
 * | `parse(json)` | Parse any hook event (discriminated union) |
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
 * // Access registry metadata
 * const meta = HookEventSchemas.registry.get(HookEventSchemas.PreToolUse);
 * console.log(meta.description);
 * console.log(meta.capabilities); // ["allow", "deny", "modify"]
 * ```
 *
 * @see {@link hookEventSchemaRegistry} - The underlying Zod registry
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export const HookEventSchemas = {
	/** The Zod registry containing metadata for all schemas */
	registry: hookEventSchemaRegistry,

	// ─────────────────────────────────────────────────────────────────────────
	// Individual Schemas
	// ─────────────────────────────────────────────────────────────────────────

	/** Schema for PreToolUse events (allow/deny/modify tool execution) */
	PreToolUse: _PreToolUseEventSchema,

	/** Schema for PostToolUse events (add context/block after tool) */
	PostToolUse: _PostToolUseEventSchema,

	/** Schema for PermissionRequest events (auto allow/deny permissions) */
	PermissionRequest: _PermissionRequestEventSchema,

	/** Schema for Notification events (passthrough) */
	Notification: _NotificationEventSchema,

	/** Schema for UserPromptSubmit events (add context/block prompts) */
	UserPromptSubmit: _UserPromptSubmitEventSchema,

	/** Schema for Stop events (block agent completion) */
	Stop: _StopEventSchema,

	/** Schema for SubagentStop events (block subagent completion) */
	SubagentStop: _SubagentStopEventSchema,

	/** Schema for PreCompact events (passthrough) */
	PreCompact: _PreCompactEventSchema,

	/** Schema for SessionStart events (setup/context) */
	SessionStart: _SessionStartEventSchema,

	/** Schema for SessionEnd events (cleanup) */
	SessionEnd: _SessionEndEventSchema,

	/** Discriminated union of all hook event schemas */
	Any: _HookEventSchema,

	// ─────────────────────────────────────────────────────────────────────────
	// Parse Methods
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Parse a JSON string into a validated hook event (discriminated union).
	 *
	 * @param json - Raw JSON string from Claude Code
	 * @returns Validated and typed hook event
	 * @throws {z.ZodError} When the data doesn't match any hook event schema
	 * @throws {SyntaxError} When the JSON is malformed
	 */
	parse(json: string): HookEventParsed {
		return _HookEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a PreToolUse event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parsePreToolUse(json: string): PreToolUseEventParsed {
		return _PreToolUseEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a PostToolUse event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parsePostToolUse(json: string): PostToolUseEventParsed {
		return _PostToolUseEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a PermissionRequest event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parsePermissionRequest(json: string): PermissionRequestEventParsed {
		return _PermissionRequestEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a Notification event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseNotification(json: string): NotificationEventParsed {
		return _NotificationEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a UserPromptSubmit event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseUserPromptSubmit(json: string): UserPromptSubmitEventParsed {
		return _UserPromptSubmitEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a Stop event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseStop(json: string): StopEventParsed {
		return _StopEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a SubagentStop event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseSubagentStop(json: string): SubagentStopEventParsed {
		return _SubagentStopEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a PreCompact event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parsePreCompact(json: string): PreCompactEventParsed {
		return _PreCompactEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a SessionStart event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseSessionStart(json: string): SessionStartEventParsed {
		return _SessionStartEventSchema.parse(JSON.parse(json));
	},

	/**
	 * Parse a JSON string into a SessionEnd event.
	 * @param json - Raw JSON string from Claude Code
	 */
	parseSessionEnd(json: string): SessionEndEventParsed {
		return _SessionEndEventSchema.parse(JSON.parse(json));
	},
} as const;
