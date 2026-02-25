import { HookEventSchemas } from "../../core/schemas.js";
import { PluginEnv } from "../../state/classes/PluginEnv.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, PermissionRequestInput } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { PermissionRequestResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
