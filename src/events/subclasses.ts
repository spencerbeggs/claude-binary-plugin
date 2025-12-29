/**
 * HookEvent subclasses for each event type.
 * @module
 */

import {
	NotificationEventSchema,
	PermissionRequestEventSchema,
	PostToolUseEventSchema,
	PreCompactEventSchema,
	PreToolUseEventSchema,
	SessionEndEventSchema,
	SessionStartEventSchema,
	StopEventSchema,
	SubagentStopEventSchema,
	UserPromptSubmitEventSchema,
} from "../core/schemas.js";
import { ClaudeBinaryPluginEnv } from "../env/plugin-env.js";
import { getSidecarClient } from "../otel/client.js";
import { isOTELEnabled, parseOTELConfig } from "../otel/config.js";
import { HookEvent } from "./base.js";
import { HookEventName } from "./enums.js";
import {
	PermissionRequestResponseBuilder,
	PostToolUseResponseBuilder,
	PreToolUseResponseBuilder,
	SessionStartResponseBuilder,
	StopResponseBuilder,
	UserPromptSubmitResponseBuilder,
} from "./response-builders.js";
import type {
	HookEventOptions,
	NotificationEvent,
	NotificationType,
	PermissionRequestEvent,
	PostToolUseEvent,
	PreCompactEvent,
	PreCompactTrigger,
	PreToolUseEvent,
	SessionEndEvent,
	SessionEndReason,
	SessionStartEvent,
	SessionStartSource,
	StopEvent,
	SubagentStopEvent,
	ToolInput,
	ToolName,
	ToolResponse,
	UserPromptSubmitEvent,
} from "./types.js";
import { parseWithOTEL } from "./validation.js";

/**
 * Hook event for PreToolUse - fired before a tool executes.
 * @public
 */
export class PreToolUseHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PreToolUseEvent {
	override hook_event_name = HookEventName.PreToolUse as const;
	tool_name: ToolName;
	tool_input: ToolInput;
	tool_use_id: string;

	constructor(params: PreToolUseEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PreToolUseResponseBuilder {
		return new PreToolUseResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PreToolUseHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PreToolUseHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreToolUseEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PreToolUseEventSchema, hookName)) as PreToolUseEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PreToolUseHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for PostToolUse - fired after a tool completes.
 * @public
 */
export class PostToolUseHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PostToolUseEvent {
	override hook_event_name = HookEventName.PostToolUse as const;
	tool_name: ToolName;
	tool_input: ToolInput;
	tool_response: ToolResponse;
	tool_use_id: string;

	constructor(params: PostToolUseEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_response = params.tool_response;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PostToolUseResponseBuilder {
		return new PostToolUseResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PostToolUseHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PostToolUseHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PostToolUseEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PostToolUseEventSchema, hookName)) as PostToolUseEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PostToolUseHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for PermissionRequest - fired when permission dialog is shown.
 * @public
 */
export class PermissionRequestHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PermissionRequestEvent {
	override hook_event_name = HookEventName.PermissionRequest as const;
	message: string;
	notification_type: string;

	constructor(params: PermissionRequestEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	override response(): PermissionRequestResponseBuilder {
		return new PermissionRequestResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PermissionRequestHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PermissionRequestHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PermissionRequestEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PermissionRequestEventSchema, hookName)) as PermissionRequestEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PermissionRequestHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for Notification - fired when Claude Code sends notifications.
 * @public
 */
export class NotificationHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements NotificationEvent {
	override hook_event_name = HookEventName.Notification as const;
	message: string;
	notification_type: NotificationType;

	constructor(params: NotificationEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: NotificationHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "NotificationHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read NotificationEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, NotificationEventSchema, hookName)) as NotificationEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new NotificationHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for UserPromptSubmit - fired when user submits a prompt.
 * @public
 */
export class UserPromptSubmitHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements UserPromptSubmitEvent {
	override hook_event_name = HookEventName.UserPromptSubmit as const;
	prompt: string;

	constructor(params: UserPromptSubmitEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.prompt = params.prompt;
	}

	override response(): UserPromptSubmitResponseBuilder {
		return new UserPromptSubmitResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: UserPromptSubmitHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "UserPromptSubmitHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read UserPromptSubmitEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, UserPromptSubmitEventSchema, hookName)) as UserPromptSubmitEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new UserPromptSubmitHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for Stop - fired when main agent finishes responding.
 * @public
 */
export class StopHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements StopEvent {
	override hook_event_name = HookEventName.Stop as const;
	stop_hook_active: boolean;

	constructor(params: StopEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponseBuilder {
		return new StopResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: StopHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "StopHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read StopEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, StopEventSchema, hookName)) as StopEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new StopHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for SubagentStop - fired when a subagent finishes responding.
 * @public
 */
export class SubagentStopHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SubagentStopEvent {
	override hook_event_name = HookEventName.SubagentStop as const;
	stop_hook_active: boolean;

	constructor(params: SubagentStopEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponseBuilder {
		return new StopResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SubagentStopHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SubagentStopHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SubagentStopEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SubagentStopEventSchema, hookName)) as SubagentStopEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new SubagentStopHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for PreCompact - fired before context compaction.
 * @public
 */
export class PreCompactHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements PreCompactEvent {
	override hook_event_name = HookEventName.PreCompact as const;
	trigger: PreCompactTrigger;
	custom_instructions: string;

	constructor(params: PreCompactEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.trigger = params.trigger;
		this.custom_instructions = params.custom_instructions;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: PreCompactHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "PreCompactHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreCompactEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, PreCompactEventSchema, hookName)) as PreCompactEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new PreCompactHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for SessionStart - fired when a session starts or resumes.
 * @public
 */
export class SessionStartHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SessionStartEvent {
	override hook_event_name = HookEventName.SessionStart as const;
	source: SessionStartSource;

	constructor(params: SessionStartEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.source = params.source;
	}

	override response(): SessionStartResponseBuilder {
		return new SessionStartResponseBuilder();
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SessionStartHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SessionStartHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionStartEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SessionStartEventSchema, hookName)) as SessionStartEvent;
		const name = options.name ?? parsed.hook_event_name;

		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const { env } = (await (options.envClass as any).initializeSession({
			hookName: name,
			sessionId: parsed.session_id,
		})) as { env: TEnv; persisted: unknown };

		// Initialize OTEL sidecar if telemetry is enabled
		if (isOTELEnabled()) {
			const client = getSidecarClient(parsed.session_id);
			const config = parseOTELConfig();
			await client.ensureRunning(config);
		}

		const event = new SessionStartHookEvent(parsed, options, env);
		return { event, env };
	}
}

/**
 * Hook event for SessionEnd - fired when a session terminates.
 * @public
 */
export class SessionEndHookEvent<TEnv = unknown> extends HookEvent<TEnv> implements SessionEndEvent {
	override hook_event_name = HookEventName.SessionEnd as const;
	reason: SessionEndReason;

	constructor(params: SessionEndEvent, options: HookEventOptions<TEnv>, env?: TEnv) {
		super(params, options, env);
		this.reason = params.reason;
	}

	static override async create<TEnv = unknown>(
		options: HookEventOptions<TEnv>,
	): Promise<{ event: SessionEndHookEvent<TEnv>; env: TEnv }> {
		const hookName = options.name ?? "SessionEndHookEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionEndEvent from stdin");
		}
		const parsed = (await parseWithOTEL(eventText, SessionEndEventSchema, hookName)) as SessionEndEvent;
		const sessionEnvDir = await ClaudeBinaryPluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic env loading
		const env = (await (options.envClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TEnv;
		const event = new SessionEndHookEvent(parsed, options, env);
		return { event, env };
	}
}
