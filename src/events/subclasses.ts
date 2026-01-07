/**
 * HookEvent subclasses for each Claude Code hook event type.
 *
 * This module provides typed event classes for each hook type supported by Claude Code.
 * Each class extends {@link HookEvent} and implements the corresponding event interface,
 * providing type-safe access to event-specific properties and response builders.
 *
 * @remarks
 * Hook events are created via the static `create()` factory method, which:
 * 1. Reads JSON input from stdin
 * 2. Validates against the Zod schema for that event type
 * 3. Loads the environment context using the session registry
 * 4. Returns both the event instance and the loaded environment
 *
 * For pipeline-based hooks, you typically don't interact with these classes directly.
 * Instead, use the declarative pipeline system via {@link ClaudeBinaryPlugin.create}.
 *
 * @example
 * ```typescript
 * // Direct usage (for raw handlers)
 * const { event, env } = await PreToolUseEvent.create({
 *   stdin: process.stdin,
 *   stdout: process.stdout,
 *   stderr: process.stderr,
 *   envClass: MyPluginEnv,
 * });
 *
 * // Check tool and respond
 * if (event.tool_name === "Bash") {
 *   event.end(event.response().deny("Bash not allowed"));
 * }
 * event.end(event.response().allow());
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @module
 */

import { HookEventSchemas } from "../core/schemas.js";
import { OtelConfig } from "../otel/classes/OtelConfig.js";
import { getSidecarClient } from "../otel/client.js";
import { PluginEnv } from "../state/plugin-state.js";
import { HookEvent } from "./base.js";
import { HookType } from "./enums.js";
import {
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
} from "./response-builders.js";
import type {
	HookEventOptions,
	NotificationInput,
	NotificationType,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreCompactTrigger,
	PreToolUseInput,
	SessionEndInput,
	SessionEndReason,
	SessionStartInput,
	SessionStartSource,
	StopInput,
	SubagentStopInput,
	ToolInput,
	ToolName,
	ToolResponse,
	UserPromptSubmitInput,
} from "./types.js";
import { SchemaValidator } from "./validation.js";

/**
 * Hook event fired before a tool executes.
 *
 * @remarks
 * PreToolUse is the primary mechanism for intercepting and controlling tool execution
 * in Claude Code. This event fires after Claude has created tool parameters but before
 * the tool runs, giving hooks the opportunity to:
 *
 * - **Allow**: Permit the tool call to proceed unchanged
 * - **Deny**: Block the tool call with a reason shown to Claude
 * - **Modify**: Change the tool input before execution via `updatedInput`
 * - **Ask**: Defer to the user for permission decision
 *
 * The event includes the tool name, input parameters, and a unique `tool_use_id`
 * for correlation with {@link PostToolUseEvent} events.
 *
 * @example
 * ```typescript
 * // Pipeline handler for PreToolUse
 * import type { Pipeline } from "../plugin.config.js";
 * import { ToolInputGuard } from "claude-binary-plugin";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input, options, env }) => {
 *   // Block dangerous Bash commands
 *   if (input.tool_name === "Bash" && ToolInputGuard.isBash(input.tool_input)) {
 *     if (input.tool_input.command?.includes("rm -rf")) {
 *       return {
 *         status: "executed",
 *         action: "deny",
 *         summary: "blocked dangerous command",
 *         reason: "rm -rf commands are not permitted",
 *       };
 *     }
 *   }
 *   return { status: "executed", action: "allow", summary: "allowed" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link PostToolUseEvent} - Fires after tool completion
 * @see {@link PreToolUseOutput} - Valid output structure for pipeline handlers
 * @see {@link PreToolUseResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#pretooluse | PreToolUse Hook Documentation}
 * @public
 */
export class PreToolUseEvent<TState = unknown> extends HookEvent<TState> implements PreToolUseInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.PreToolUse as const;
	/** The name of the tool being invoked (e.g., "Bash", "Edit", "Write") */
	tool_name: ToolName;
	/** The input parameters for the tool, structure varies by tool type */
	tool_input: ToolInput;
	/** Unique identifier for this tool invocation, used to correlate with PostToolUse */
	tool_use_id: string;

	constructor(params: PreToolUseInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PreToolUseResponse {
		return new PreToolUseResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: PreToolUseEvent<TState>; state: TState }> {
		const hookName = options.name ?? "PreToolUseEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreToolUseInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(eventText, HookEventSchemas.PreToolUse, hookName)) as PreToolUseInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new PreToolUseEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired after a tool completes execution.
 *
 * @remarks
 * PostToolUse fires after a tool has finished executing, providing access to both
 * the original input and the tool's response. This enables hooks to:
 *
 * - **Block**: Prevent Claude from seeing the result and continuing
 * - **Context**: Add additional context for Claude based on the result
 * - **Continue**: Allow the result to pass through unchanged
 *
 * The `tool_use_id` can be used to correlate with the corresponding
 * {@link PreToolUseEvent} for the same tool invocation.
 *
 * @example
 * ```typescript
 * // Pipeline handler for PostToolUse
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PostToolUse"] = ({ input, options, env }) => {
 *   // Add context after file reads
 *   if (input.tool_name === "Read" && input.tool_response) {
 *     return {
 *       status: "executed",
 *       action: "context",
 *       summary: "added file context",
 *       claudeContext: "Note: This file follows the project's coding standards.",
 *     };
 *   }
 *   return { status: "executed", action: "continue", summary: "passthrough" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link PreToolUseEvent} - Fires before tool execution
 * @see {@link PostToolUseOutput} - Valid output structure for pipeline handlers
 * @see {@link PostToolUseResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#posttooluse | PostToolUse Hook Documentation}
 * @public
 */
export class PostToolUseEvent<TState = unknown> extends HookEvent<TState> implements PostToolUseInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.PostToolUse as const;
	/** The name of the tool that was invoked */
	tool_name: ToolName;
	/** The input parameters that were passed to the tool */
	tool_input: ToolInput;
	/** The response/output from the tool execution */
	tool_response: ToolResponse;
	/** Unique identifier matching the corresponding PreToolUse event */
	tool_use_id: string;

	constructor(params: PostToolUseInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.tool_name = params.tool_name;
		this.tool_input = params.tool_input;
		this.tool_response = params.tool_response;
		this.tool_use_id = params.tool_use_id;
	}

	override response(): PostToolUseResponse {
		return new PostToolUseResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: PostToolUseEvent<TState>; state: TState }> {
		const hookName = options.name ?? "PostToolUseEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PostToolUseInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(eventText, HookEventSchemas.PostToolUse, hookName)) as PostToolUseInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new PostToolUseEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when Claude Code shows a permission dialog to the user.
 *
 * @remarks
 * PermissionRequest fires when Claude Code needs user permission for an action.
 * This hook enables automation of permission decisions, which is useful for:
 *
 * - **Auto-allowing** trusted operations (e.g., git commands in a known repo)
 * - **Auto-denying** risky operations based on policy
 * - **Passing through** to let the user decide interactively
 *
 * Unlike PreToolUse (which controls whether a tool runs), PermissionRequest
 * specifically handles the permission UI that Claude Code shows to users.
 *
 * @example
 * ```typescript
 * // Pipeline handler for PermissionRequest
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PermissionRequest"] = ({ input, options, env }) => {
 *   // Auto-allow git operations
 *   if (input.message.includes("git")) {
 *     return {
 *       status: "executed",
 *       action: "allow",
 *       summary: "auto-allowed git operation",
 *     };
 *   }
 *   // Let user decide for everything else
 *   return { status: "skipped", action: "none", summary: "deferred to user" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link PermissionRequestOutput} - Valid output structure for pipeline handlers
 * @see {@link PermissionRequestResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @public
 */
export class PermissionRequestEvent<TState = unknown> extends HookEvent<TState> implements PermissionRequestInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.PermissionRequest as const;
	/** The permission request message shown to the user */
	message: string;
	/** The type of notification/permission being requested */
	notification_type: string;

	constructor(params: PermissionRequestInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	override response(): PermissionRequestResponse {
		return new PermissionRequestResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: PermissionRequestEvent<TState>; state: TState }> {
		const hookName = options.name ?? "PermissionRequestEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PermissionRequestInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(
			eventText,
			HookEventSchemas.PermissionRequest,
			hookName,
		)) as PermissionRequestInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new PermissionRequestEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when Claude Code sends a notification.
 *
 * @remarks
 * Notification events are informational - they notify hooks about events
 * but don't expect a response that affects Claude's behavior. This is a
 * passthrough-only hook type, meaning hooks can observe but not modify behavior.
 *
 * Common notification types include progress updates, status messages,
 * and informational alerts from Claude Code.
 *
 * @example
 * ```typescript
 * // Pipeline handler for Notification
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["Notification"] = ({ input, options, env }) => {
 *   // Log notifications for observability
 *   console.error(`[${input.notification_type}] ${input.message}`);
 *   return { status: "executed", action: "none", summary: "logged notification" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link NotificationPipelineOutput} - Valid output structure for pipeline handlers
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @public
 */
export class NotificationEvent<TState = unknown> extends HookEvent<TState> implements NotificationInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.Notification as const;
	/** The notification message content */
	message: string;
	/** The category/type of notification (e.g., "progress", "status") */
	notification_type: NotificationType;

	constructor(params: NotificationInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.message = params.message;
		this.notification_type = params.notification_type;
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: NotificationEvent<TState>; state: TState }> {
		const hookName = options.name ?? "NotificationEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read NotificationInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(
			eventText,
			HookEventSchemas.Notification,
			hookName,
		)) as NotificationInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new NotificationEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when a user submits a prompt to Claude Code.
 *
 * @remarks
 * UserPromptSubmit fires immediately when the user submits their input,
 * before Claude begins processing. This hook can:
 *
 * - **Block**: Prevent the prompt from being processed
 * - **Context**: Add additional context for Claude to consider
 * - **Continue**: Allow the prompt through unchanged
 *
 * This is useful for enforcing policies on user input, adding automatic
 * context based on the prompt content, or logging user interactions.
 *
 * @example
 * ```typescript
 * // Pipeline handler for UserPromptSubmit
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["UserPromptSubmit"] = ({ input, options, env }) => {
 *   // Add project-specific context for certain keywords
 *   if (input.prompt.includes("deploy")) {
 *     return {
 *       status: "executed",
 *       action: "context",
 *       summary: "added deployment context",
 *       claudeContext: "Deployment requires running tests first. Current branch: main",
 *     };
 *   }
 *   return { status: "executed", action: "continue", summary: "passthrough" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link UserPromptSubmitOutput} - Valid output structure for pipeline handlers
 * @see {@link UserPromptSubmitResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#userpromptsubmit | UserPromptSubmit Hook Documentation}
 * @public
 */
export class UserPromptSubmitEvent<TState = unknown> extends HookEvent<TState> implements UserPromptSubmitInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.UserPromptSubmit as const;
	/** The user's prompt text */
	prompt: string;

	constructor(params: UserPromptSubmitInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.prompt = params.prompt;
	}

	override response(): UserPromptSubmitResponse {
		return new UserPromptSubmitResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: UserPromptSubmitEvent<TState>; state: TState }> {
		const hookName = options.name ?? "UserPromptSubmitEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read UserPromptSubmitInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(
			eventText,
			HookEventSchemas.UserPromptSubmit,
			hookName,
		)) as UserPromptSubmitInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new UserPromptSubmitEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when the main Claude agent finishes responding.
 *
 * @remarks
 * Stop fires after Claude has completed its response to the user's prompt.
 * This hook can block Claude from stopping, effectively forcing it to continue
 * working. This is useful for:
 *
 * - Ensuring Claude completes multi-step workflows
 * - Validating that all required tasks are finished
 * - Adding final verification or cleanup steps
 *
 * The `stop_hook_active` property indicates whether stop hooks are currently
 * enabled for the session.
 *
 * @example
 * ```typescript
 * // Pipeline handler for Stop
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["Stop"] = ({ input, options, env }) => {
 *   // Ensure tests pass before allowing stop
 *   if (env.pendingTests > 0) {
 *     return {
 *       status: "executed",
 *       action: "block",
 *       summary: "blocked: tests pending",
 *       reason: `${env.pendingTests} tests still need to be run`,
 *     };
 *   }
 *   return { status: "executed", action: "continue", summary: "allowed stop" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link SubagentStopEvent} - Similar hook for subagents
 * @see {@link StopPipelineOutput} - Valid output structure for pipeline handlers
 * @see {@link StopResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#stop | Stop Hook Documentation}
 * @public
 */
export class StopEvent<TState = unknown> extends HookEvent<TState> implements StopInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.Stop as const;
	/** Whether stop hooks are currently active for this session */
	stop_hook_active: boolean;

	constructor(params: StopInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponse {
		return new StopResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: StopEvent<TState>; state: TState }> {
		const hookName = options.name ?? "StopEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read StopInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(eventText, HookEventSchemas.Stop, hookName)) as StopInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new StopEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when a Claude subagent finishes responding.
 *
 * @remarks
 * SubagentStop is similar to {@link StopEvent} but fires for subagents
 * (spawned via the Task tool) rather than the main agent. This allows hooks
 * to control when subagents are allowed to complete their work.
 *
 * Like Stop, this hook can block the subagent from finishing, requiring it
 * to continue working until certain conditions are met.
 *
 * @example
 * ```typescript
 * // Pipeline handler for SubagentStop
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["SubagentStop"] = ({ input, options, env }) => {
 *   // Allow subagents to stop without additional checks
 *   return { status: "executed", action: "continue", summary: "allowed subagent stop" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link StopEvent} - Similar hook for the main agent
 * @see {@link SubagentStopPipelineOutput} - Valid output structure for pipeline handlers
 * @see {@link StopResponse} - Fluent builder for responses (shared with Stop)
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#subagentstop | SubagentStop Hook Documentation}
 * @public
 */
export class SubagentStopEvent<TState = unknown> extends HookEvent<TState> implements SubagentStopInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.SubagentStop as const;
	/** Whether stop hooks are currently active for this session */
	stop_hook_active: boolean;

	constructor(params: SubagentStopInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.stop_hook_active = params.stop_hook_active;
	}

	override response(): StopResponse {
		return new StopResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: SubagentStopEvent<TState>; state: TState }> {
		const hookName = options.name ?? "SubagentStopEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SubagentStopInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(
			eventText,
			HookEventSchemas.SubagentStop,
			hookName,
		)) as SubagentStopInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new SubagentStopEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired before Claude Code compacts the conversation context.
 *
 * @remarks
 * PreCompact fires when Claude Code is about to summarize/compact the conversation
 * to stay within context limits. This is a passthrough-only hook - it cannot
 * prevent compaction but can observe when it occurs.
 *
 * The `trigger` property indicates why compaction is happening (e.g., context
 * limit approaching), and `custom_instructions` contains any user-specified
 * compaction instructions.
 *
 * @example
 * ```typescript
 * // Pipeline handler for PreCompact
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PreCompact"] = ({ input, options, env }) => {
 *   // Log compaction events for debugging
 *   console.error(`Context compaction triggered: ${input.trigger}`);
 *   return { status: "executed", action: "none", summary: "observed compaction" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link PreCompactPipelineOutput} - Valid output structure for pipeline handlers
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks Documentation}
 * @public
 */
export class PreCompactEvent<TState = unknown> extends HookEvent<TState> implements PreCompactInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.PreCompact as const;
	/** The reason compaction was triggered (e.g., "context_limit") */
	trigger: PreCompactTrigger;
	/** User-provided instructions for how to handle compaction */
	custom_instructions: string;

	constructor(params: PreCompactInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.trigger = params.trigger;
		this.custom_instructions = params.custom_instructions;
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: PreCompactEvent<TState>; state: TState }> {
		const hookName = options.name ?? "PreCompactEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read PreCompactInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(eventText, HookEventSchemas.PreCompact, hookName)) as PreCompactInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new PreCompactEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when a Claude Code session starts or resumes.
 *
 * @remarks
 * SessionStart is the initialization point for plugins. It fires when:
 * - A new Claude Code session begins
 * - An existing session is resumed (continued conversation)
 *
 * This hook is special because it runs the plugin's `setup()` function to
 * compute environment state that persists across all subsequent hooks.
 * SessionStart hooks can inject context that Claude will see at the start
 * of every session.
 *
 * The `source` property indicates whether this is a new session ("new") or
 * a resumed session ("resume").
 *
 * @example
 * ```typescript
 * // Pipeline handler for SessionStart
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["SessionStart"] = ({ input, options, env }) => {
 *   // Inject project context at session start
 *   const context = [
 *     `# Project: ${env.projectName}`,
 *     `Package manager: ${env.packageManager}`,
 *     `Node version: ${env.nodeVersion}`,
 *   ].join("\n");
 *
 *   return {
 *     status: "executed",
 *     action: "context",
 *     summary: "added project context",
 *     claudeContext: context,
 *   };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link SessionEndEvent} - Fires when the session terminates
 * @see {@link SessionStartOutput} - Valid output structure for pipeline handlers
 * @see {@link SessionStartResponse} - Fluent builder for responses
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#sessionstart | SessionStart Hook Documentation}
 * @public
 */
export class SessionStartEvent<TState = unknown> extends HookEvent<TState> implements SessionStartInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.SessionStart as const;
	/** Whether this is a new session or a resumed one ("new" | "resume") */
	source: SessionStartSource;

	constructor(params: SessionStartInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.source = params.source;
	}

	override response(): SessionStartResponse {
		return new SessionStartResponse();
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: SessionStartEvent<TState>; state: TState }> {
		const hookName = options.name ?? "SessionStartEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionStartInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(
			eventText,
			HookEventSchemas.SessionStart,
			hookName,
		)) as SessionStartInput;
		const name = options.name ?? parsed.hook_event_name;

		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const { state } = (await (options.stateClass as any).initializeSession({
			hookName: name,
			sessionId: parsed.session_id,
		})) as { state: TState; persisted: unknown };

		// Initialize OTEL sidecar if telemetry is enabled
		if (OtelConfig.isEnabled()) {
			const client = getSidecarClient(parsed.session_id);
			const config = OtelConfig.fromEnv();
			await client.ensureRunning(config);
		}

		const event = new SessionStartEvent(parsed, options, state);
		return { event, state };
	}
}

/**
 * Hook event fired when a Claude Code session terminates.
 *
 * @remarks
 * SessionEnd fires when a session is about to end. This is a passthrough-only
 * hook - it cannot prevent the session from ending but can perform cleanup
 * or logging tasks.
 *
 * The `reason` property indicates why the session is ending (e.g., user exit,
 * timeout, error).
 *
 * @example
 * ```typescript
 * // Pipeline handler for SessionEnd
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["SessionEnd"] = ({ input, options, env }) => {
 *   // Log session end for analytics
 *   console.error(`Session ended: ${input.reason}`);
 *   return { status: "executed", action: "none", summary: "logged session end" };
 * };
 *
 * export default handler;
 * ```
 *
 * @typeParam TState - The plugin state type containing options and computed state
 *
 * @see {@link SessionStartEvent} - Fires when the session begins
 * @see {@link SessionEndPipelineOutput} - Valid output structure for pipeline handlers
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#sessionend | SessionEnd Hook Documentation}
 * @public
 */
export class SessionEndEvent<TState = unknown> extends HookEvent<TState> implements SessionEndInput {
	/** {@inheritDoc HookEvent.hook_event_name} */
	override hook_event_name = HookType.SessionEnd as const;
	/** The reason the session is ending (e.g., "user_exit", "timeout") */
	reason: SessionEndReason;

	constructor(params: SessionEndInput, options: HookEventOptions<TState>, state?: TState) {
		super(params, options, state);
		this.reason = params.reason;
	}

	static override async create<TState = unknown>(
		options: HookEventOptions<TState>,
	): Promise<{ event: SessionEndEvent<TState>; state: TState }> {
		const hookName = options.name ?? "SessionEndEvent";
		HookEvent.setupGlobalErrorHandlers(hookName);

		const eventText = await HookEvent.readInputText(options);
		if (!eventText) {
			throw new Error("Failed to read SessionEndInput from stdin");
		}
		const parsed = (await SchemaValidator.parse(eventText, HookEventSchemas.SessionEnd, hookName)) as SessionEndInput;
		const sessionEnvDir = await PluginEnv.getSessionEnvDir(parsed.session_id);
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic state loading
		const state = (await (options.stateClass as any).forContext("hook", {
			sessionId: parsed.session_id,
			sessionEnvDir,
			hookName,
		})) as TState;
		const event = new SessionEndEvent(parsed, options, state);
		return { event, state };
	}
}
