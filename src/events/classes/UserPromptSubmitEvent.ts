import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, UserPromptSubmitInput } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { UserPromptSubmitResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
