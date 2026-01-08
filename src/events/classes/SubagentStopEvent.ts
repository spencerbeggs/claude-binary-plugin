import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, SubagentStopInput } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { StopResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
