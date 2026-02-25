import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, PreToolUseInput, ToolInput, ToolName } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { PreToolUseResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
