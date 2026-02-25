import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, SessionEndInput, SessionEndReason } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
