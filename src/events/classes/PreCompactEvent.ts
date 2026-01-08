import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, PreCompactInput, PreCompactTrigger } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
