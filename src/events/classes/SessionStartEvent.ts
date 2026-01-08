import { HookEventSchemas } from "../../core/schemas.js";
import { OtelConfig } from "../../otel/classes/OtelConfig.js";
import { getSidecarClient } from "../../otel/classes/SidecarClient.js";
import { HookType } from "../enums.js";
import type { HookEventOptions, SessionStartInput, SessionStartSource } from "../types.js";
import { HookEvent } from "./HookEvent.js";
import { SessionStartResponse } from "./ResponseBuilders.js";
import { SchemaValidator } from "./SchemaValidator.js";

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
