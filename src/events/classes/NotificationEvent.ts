import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, NotificationInput, NotificationType } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
