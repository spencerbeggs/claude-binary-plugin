import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, PostToolUseInput, ToolInput, ToolName, ToolResponse } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { PostToolUseResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
