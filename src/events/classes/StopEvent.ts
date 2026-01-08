import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, StopInput } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { StopResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
