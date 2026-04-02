import { Schema } from "effect";
import type { PluginBuildResult } from "../build/builder.js";
import type {
	PassthroughOutcome,
	PermissionRequestOutcome,
	PostToolUseOutcome,
	PreToolUseOutcome,
	SessionStartOutcome,
	StopOutcome,
	UserPromptSubmitOutcome,
} from "../outcomes/types.js";
import type {
	NotificationInput,
	PermissionRequestInput,
	PostToolUseInput,
	PreCompactInput,
	PreToolUseInput,
	SessionEndInput,
	SessionStartInput,
	StopInput,
	SubagentStopInput,
	UserPromptSubmitInput,
} from "../schemas/hook-inputs.js";
import type {
	NotificationOutput,
	PassthroughOutput,
	PermissionRequestOutput,
	PostToolUseOutput,
	PreCompactOutput,
	PreToolUseOutput,
	SessionEndOutput,
	SessionStartOutput,
	StopOutput,
	SubagentStopOutput,
	UserPromptSubmitOutput,
} from "../schemas/hook-outputs.js";
// Imports from extracted modules — also re-exported below to preserve backward compatibility
// for any code that imports from `./plugin/config.js`.
import type {
	CmdContext,
	CommandDefinition,
	CommandDefinitionBase,
	CommandHandler,
	CommandHandlerFn,
	CommandInlineDefinition,
	CommandOutput,
	CommandsMap,
} from "./commands.js";
import type {
	HandlerContext,
	HandlerHookDefinition,
	HookDefinition,
	HookDefinitionBase,
	HookEventOptions,
	IO,
	PassthroughHookEntry,
	PluginHandler,
	PluginState,
	ToolFilter,
} from "./handler.js";
import type {
	ExtractCommands,
	ExtractOptionsSchema,
	ExtractSetup,
	ExtractStateSchema,
	InferPluginCommands,
	InferPluginOptions,
	InferPluginState,
} from "./infer.js";
import type { BaseState, ExtractSetupReturn, SetupContext, SetupFunction } from "./state.js";

// Re-export all extracted types so that existing imports from `./plugin/config.js` continue to work.
export type {
	BaseState,
	CmdContext,
	CommandDefinition,
	CommandDefinitionBase,
	CommandHandler,
	CommandHandlerFn,
	CommandInlineDefinition,
	CommandOutput,
	CommandsMap,
	ExtractCommands,
	ExtractOptionsSchema,
	ExtractSetup,
	ExtractSetupReturn,
	ExtractStateSchema,
	HandlerContext,
	HandlerHookDefinition,
	HookDefinition,
	HookDefinitionBase,
	HookEventOptions,
	IO,
	InferPluginCommands,
	InferPluginOptions,
	InferPluginState,
	PassthroughHookEntry,
	PluginHandler,
	PluginState,
	SetupContext,
	SetupFunction,
	ToolFilter,
};

// =============================================================================
// PLUGIN CONFIG BASE CLASS
// =============================================================================

/**
 * Base class for plugin configuration using Schema.Class.
 *
 * @remarks
 * Users extend this via `.extend()` to define their plugin config.
 * Schema fields (like `prefix`) go through `.extend()`.
 * Meta-level schemas (`options`, `state`, `setup`) go as static readonly
 * properties on the subclass — these survive Bun's tree-shaking.
 *
 * @example
 * ```ts
 * class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
 *   prefix: Schema.Literal("MY_PLUGIN"),
 * }) {
 *   static readonly options = Schema.Struct({ MODE: Schema.String });
 *   static readonly state = MyState;
 *   static readonly setup = async () => new MyState({ git: true });
 * }
 * ```
 *
 * @public
 */
export class PluginConfig extends Schema.Class<PluginConfig>("PluginConfig")({}) {}

/**
 * Runtime orchestrator that takes a config class and hooks map.
 *
 * @remarks
 * Config describes *what the plugin is* (schema, state, setup).
 * ClaudePlugin describes *what the plugin does* (which handlers run for which hooks).
 * The same config can be used with different hook sets (e.g., test suite with mock handlers).
 *
 * @example
 * ```ts
 * const plugin = new ClaudePlugin(MyConfig, {
 *   PreToolUse: [{ name: "guard", handler: guardHandler }],
 * });
 * await plugin.build({ rootDir: import.meta.dir });
 * ```
 *
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Schema.Class statics are complex; structural constraint suffices
export class ClaudePlugin<TConfig extends abstract new (...args: any[]) => any = typeof PluginConfig> {
	constructor(
		readonly config: TConfig,
		// biome-ignore lint/suspicious/noExplicitAny: HooksMap needs to accept typed handlers from InferHandlers
		readonly hooks: HooksMap<any, any>,
	) {}

	async build(options: PluginBuildOptions = {}): Promise<PluginBuildResult> {
		const { PluginBuilder } = await import("../build/builder.js");
		// biome-ignore lint/suspicious/noExplicitAny: PluginBuilder.fromConfig uses structural typing
		return PluginBuilder.fromConfig(this as any, options);
	}

	test() {
		// biome-ignore lint/suspicious/noExplicitAny: Runtime creation doesn't need strict types
		const { PluginTester: Tester } = require("../testing/builder.js") as any;
		return new Tester(this.config, this.hooks);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Schema.Class statics are complex; structural constraint suffices
	static async build<T extends abstract new (...args: any[]) => any>(
		config: T,
		// biome-ignore lint/suspicious/noExplicitAny: HooksMap needs to accept typed handlers from InferHandlers
		hooks: HooksMap<any>,
		options: PluginBuildOptions = {},
	): Promise<PluginBuildResult> {
		return new ClaudePlugin(config, hooks).build(options);
	}
}

// =============================================================================
// TYPED HANDLER HELPERS
// =============================================================================

/**
 * Typed pipeline handler for SessionStart hooks.
 *
 * @example
 * ```ts
 * import type { SessionStartHandler } from "claude-binary-plugin";
 *
 * const handler: SessionStartHandler<TOptions, TState> = ({ input, options, state }) => {
 *   return new AddContext({ claudeContext: "This project uses TypeScript." });
 * };
 * export default handler;
 * ```
 * @public
 */
export type SessionStartHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	SessionStartInput,
	SessionStartOutput,
	TOptions,
	TState,
	SessionStartOutcome
>;

/**
 * Typed pipeline handler for SessionEnd hooks.
 * @public
 */
export type SessionEndHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	SessionEndInput,
	SessionEndOutput,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * Typed pipeline handler for PreToolUse hooks.
 *
 * @example
 * ```ts
 * import type { Pipeline } from "../plugin.js";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
 *   if (input.tool_name === "Bash") {
 *     return {
 *       status: "executed",
 *       action: "deny",
 *       summary: "denied: dangerous command",
 *       reason: "This command would delete files.",
 *     };
 *   }
 *   return { status: "executed", action: "allow", summary: "allowed tool" };
 * };
 * export default handler;
 * ```
 * @public
 */
export type PreToolUseHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	PreToolUseInput,
	PreToolUseOutput,
	TOptions,
	TState,
	PreToolUseOutcome
>;

/**
 * Typed pipeline handler for PostToolUse hooks.
 * @public
 */
export type PostToolUseHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	PostToolUseInput,
	PostToolUseOutput,
	TOptions,
	TState,
	PostToolUseOutcome
>;

/**
 * Typed pipeline handler for Stop hooks.
 * @public
 */
export type StopHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	StopInput,
	StopOutput,
	TOptions,
	TState,
	StopOutcome
>;

/**
 * Typed pipeline handler for SubagentStop hooks.
 * @public
 */
export type SubagentStopHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	SubagentStopInput,
	StopOutput,
	TOptions,
	TState,
	StopOutcome
>;

/**
 * Typed pipeline handler for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	UserPromptSubmitInput,
	UserPromptSubmitOutput,
	TOptions,
	TState,
	UserPromptSubmitOutcome
>;

/**
 * Typed pipeline handler for PreCompact hooks.
 * @public
 */
export type PreCompactHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	PreCompactInput,
	PassthroughOutput,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * Typed pipeline handler for Notification hooks.
 * @public
 */
export type NotificationHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	NotificationInput,
	NotificationOutput,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * Typed pipeline handler for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestHandler<TOptions, TState = Record<string, string>> = PluginHandler<
	PermissionRequestInput,
	PermissionRequestOutput,
	TOptions,
	TState,
	PermissionRequestOutcome
>;

// =============================================================================
// TYPED HOOK DEFINITIONS PER EVENT TYPE
// =============================================================================

/**
 * SessionStart hook definition
 * @public
 */
export type SessionStartHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SessionStartInput,
	SessionStartOutput,
	unknown,
	TOptions,
	TState,
	SessionStartOutcome
>;

/**
 * SessionEnd hook definition
 * @public
 */
export type SessionEndHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SessionEndInput,
	SessionEndOutput,
	unknown,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * PreToolUse hook definition with tool filter
 * @public
 */
export type PreToolUseHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PreToolUseInput,
	PreToolUseOutput,
	unknown,
	TOptions,
	TState,
	PreToolUseOutcome
> &
	ToolFilter;

/**
 * PostToolUse hook definition with tool filter
 * @public
 */
export type PostToolUseHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PostToolUseInput,
	PostToolUseOutput,
	unknown,
	TOptions,
	TState,
	PostToolUseOutcome
> &
	ToolFilter;

/**
 * Stop hook definition
 * @public
 */
export type StopHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	StopInput,
	StopOutput,
	unknown,
	TOptions,
	TState,
	StopOutcome
>;

/**
 * SubagentStop hook definition
 * @public
 */
export type SubagentStopHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	SubagentStopInput,
	SubagentStopOutput,
	unknown,
	TOptions,
	TState,
	StopOutcome
>;

/**
 * UserPromptSubmit hook definition
 * @public
 */
export type UserPromptSubmitHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	UserPromptSubmitInput,
	UserPromptSubmitOutput,
	unknown,
	TOptions,
	TState,
	UserPromptSubmitOutcome
>;

/**
 * PreCompact hook definition
 * @public
 */
export type PreCompactHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PreCompactInput,
	PreCompactOutput,
	unknown,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * Notification hook definition
 * @public
 */
export type NotificationHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	NotificationInput,
	NotificationOutput,
	unknown,
	TOptions,
	TState,
	PassthroughOutcome
>;

/**
 * PermissionRequest hook definition
 * @public
 */
export type PermissionRequestHookDefinition<TOptions, TState = Record<string, unknown>> = HookDefinition<
	PermissionRequestInput,
	PermissionRequestOutput,
	unknown,
	TOptions,
	TState,
	PermissionRequestOutcome
>;

// =============================================================================
// HOOKS MAP TYPE
// =============================================================================

/**
 * Map of hook event types to their definitions.
 * @public
 */
export interface HooksMap<TOptions, TState = Record<string, unknown>> {
	SessionStart?: SessionStartHookDefinition<TOptions, TState>[];
	SessionEnd?: SessionEndHookDefinition<TOptions, TState>[];
	PreToolUse?: PreToolUseHookDefinition<TOptions, TState>[];
	PostToolUse?: PostToolUseHookDefinition<TOptions, TState>[];
	Stop?: StopHookDefinition<TOptions, TState>[];
	SubagentStop?: SubagentStopHookDefinition<TOptions, TState>[];
	UserPromptSubmit?: UserPromptSubmitHookDefinition<TOptions, TState>[];
	PreCompact?: PreCompactHookDefinition<TOptions, TState>[];
	Notification?: NotificationHookDefinition<TOptions, TState>[];
	PermissionRequest?: PermissionRequestHookDefinition<TOptions, TState>[];
}

// =============================================================================
// PLUGIN CONFIG OPTIONS
// =============================================================================

/**
 * Plugin configuration options.
 *
 * @typeParam TOptionsSchema - Effect Schema for plugin options validation
 * @typeParam TSetup - Setup function type (used to infer computed vars)
 * @typeParam TCommands - Map of command names to their definitions
 * @public
 */
export interface PluginConfigOptions<
	TOptionsSchema extends Schema.Schema.Any,
	TStateSchema extends Schema.Schema.Any | undefined = undefined,
	// Use function type constraint directly to avoid default type parameter issues
	TSetup extends ((ctx: SetupContext<Schema.Schema.Type<TOptionsSchema>>) => unknown) | undefined = undefined,
	TCommands extends Record<string, CommandDefinitionBase> = Record<string, CommandDefinitionBase>,
> {
	/**
	 * Environment variable prefix for this plugin.
	 * All env vars will be prefixed with this value.
	 * @example "SAVVY_WORKFLOW" becomes SAVVY_WORKFLOW_DEBUG
	 */
	prefix: string;

	/**
	 * Effect Schema for plugin options (environment variables).
	 * Defines the configurable options validated at startup and injected into handlers.
	 * Options can be set via .env files or Claude Code settings.json.
	 */
	options: TOptionsSchema;

	/**
	 * Effect Schema.Class for plugin state.
	 * When provided, state is encoded through this schema on SessionStart
	 * and decoded back into a typed instance (with methods) on subsequent hooks.
	 *
	 * @example
	 * ```ts
	 * class MyState extends Schema.Class<MyState>("MyState")({
	 *   git: Schema.Boolean,
	 *   packageManager: Schema.Literal("npm", "bun"),
	 * }) {
	 *   getPmExec() { return this.packageManager === "bun" ? "bunx" : "npx"; }
	 * }
	 *
	 * // In plugin config:
	 * state: MyState,
	 * setup: () => new MyState({ git: true, packageManager: "bun" }),
	 * ```
	 */
	state?: TStateSchema;

	/**
	 * Setup function for computing derived environment variables.
	 * Runs during SessionStart after options are validated.
	 * When `state` is provided, setup should return an instance of the state class.
	 *
	 * @example
	 * ```ts
	 * setup: async ({ options, cwd }) => {
	 *   return new MyState({ git: await checkGit(), packageManager: "bun" });
	 * }
	 * ```
	 */
	setup?: TSetup;

	/**
	 * Hook definitions organized by event type.
	 */
	hooks: HooksMap<Schema.Schema.Type<TOptionsSchema>>;

	/**
	 * Command definitions with typed argument schemas.
	 * Commands receive `{ args, options, state }` context.
	 *
	 * @example
	 * ```ts
	 * commands: {
	 *   lint: {
	 *     description: "Fix lint errors",
	 *     args: Schema.Struct({ path: Schema.optionalWith(Schema.String, { default: () => "." }) }),
	 *     handler: "./commands/lint.cmd.ts",
	 *   },
	 * }
	 * ```
	 */
	commands?: TCommands;

	// ─────────────────────────────────────────────────────────────────────────
	// Build options
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Whether to compile to bytecode for faster startup.
	 * @defaultValue false
	 */
	bytecode?: boolean;

	/**
	 * Whether to persist to local cache after build.
	 * @defaultValue true
	 */
	persistLocal?: boolean;

	/**
	 * Whether to compile to standalone binary.
	 * @defaultValue true
	 */
	compile?: boolean;

	/**
	 * Whether to minify output.
	 * @defaultValue true
	 */
	minify?: boolean;

	/**
	 * Whether to embed sourcemaps.
	 * @defaultValue true
	 */
	sourcemap?: boolean;

	/**
	 * Output path for generated hooks.json file.
	 * Relative to the plugin root directory.
	 * @defaultValue "hooks/hooks.json"
	 */
	hooksOutputPath?: string;
}

// =============================================================================
// PLUGIN BUILD OPTIONS
// =============================================================================

/**
 * Options for building a plugin via `plugin.build()`.
 *
 * @remarks
 * These options control the build process. The plugin configuration
 * (hooks, commands, schema) comes from the plugin instance itself.
 *
 * @public
 */
export interface PluginBuildOptions {
	/**
	 * Root directory containing the plugin (defaults to cwd).
	 * This is where the entrypoint and output will be created.
	 */
	rootDir?: string;

	/**
	 * Path to the plugin config file, relative to rootDir.
	 * Used as the import path in the generated entrypoint.
	 * @defaultValue "./plugin.config.ts"
	 */
	configPath?: string;

	/**
	 * Path to plugin.json manifest file or directory containing .claude-plugin/plugin.json.
	 * Used to discover plugin name and version.
	 * @defaultValue `${rootDir}/.claude-plugin/plugin.json`
	 */
	plugin?: string;

	/**
	 * Path to marketplace.json manifest file.
	 * Used for cache path when persistLocal is enabled.
	 */
	marketplace?: string;

	/**
	 * Output filename for the compiled binary.
	 * @defaultValue Auto-derived from plugin.json name as `${name}.plugin`
	 */
	outputName?: string;

	/**
	 * Whether to compile to a standalone binary.
	 * When false, bundles to JavaScript for easier debugging.
	 * @defaultValue true
	 */
	compile?: boolean;

	/**
	 * Whether to minify output.
	 * @defaultValue true
	 */
	minify?: boolean;

	/**
	 * Whether to embed sourcemaps.
	 * @defaultValue true
	 */
	sourcemap?: boolean;

	/**
	 * Whether to compile to bytecode for faster startup.
	 * @defaultValue false
	 */
	bytecode?: boolean;

	/**
	 * Cross-compilation target.
	 * @defaultValue Current platform
	 */
	target?: string;

	/**
	 * Whether to clean existing plugin binary before building.
	 * @defaultValue true
	 */
	clean?: boolean;

	/**
	 * Whether to persist to local Claude Code cache after build.
	 * Requires marketplace name to be set.
	 * @defaultValue false
	 */
	persistLocal?: boolean;

	/**
	 * External packages to exclude from bundle.
	 */
	external?: string[];
}

// =============================================================================
// INFER HANDLERS
// =============================================================================

/**
 * Infer all pipeline and handler types from a plugin configuration.
 *
 * @remarks
 * Returns an interface with typed handlers for each hook event.
 * This is the primary type for defining hook handlers in plugin projects.
 *
 * The interface includes pipeline handlers (pure transformation functions):
 *
 * - `Pipeline["PreToolUse"]` - Pipeline handler receiving `{ input, options, state }`
 *
 * @example
 * ```ts
 * import { PluginConfig } from "claude-binary-plugin";
 * import type { InferHandlers } from "claude-binary-plugin";
 *
 * class MyConfig extends PluginConfig.extend<MyConfig>("MyConfig")({
 *   prefix: Schema.Literal("MY_PLUGIN"),
 * }) {
 *   static readonly options = Schema.Struct({ DEBUG: Schema.Boolean });
 * }
 * export type Handlers = InferHandlers<typeof MyConfig>;
 *
 * // In hooks/my-hook.hook.ts
 * import type { Handlers } from "../plugin.config.js";
 *
 * const handler: Handlers["PreToolUse"] = ({ input, options, state }) => {
 *   // input, options, and state are fully typed!
 *   return { status: "executed", action: "allow", summary: "allowed" };
 * };
 * export default handler;
 * ```
 * @public
 */
export interface InferHandlers<T> {
	/**
	 * Handler for session initialization. Runs when Claude Code starts a new session.
	 * Use to add system context, run detection logic, or initialize state.
	 * @see {@link SessionStartHandler}
	 */
	SessionStart: SessionStartHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for session cleanup. Runs when a Claude Code session ends.
	 * Use for cleanup tasks or final logging.
	 * @see {@link SessionEndHandler}
	 */
	SessionEnd: SessionEndHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for tool pre-execution. Runs before Claude executes a tool.
	 * Can allow, deny, or modify the tool input before execution.
	 * @see {@link PreToolUseHandler}
	 */
	PreToolUse: PreToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for tool post-execution. Runs after Claude executes a tool.
	 * Can add context based on tool results or block continuation.
	 * @see {@link PostToolUseHandler}
	 */
	PostToolUse: PostToolUseHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for agent stop events. Runs when Claude is about to stop.
	 * Can block the stop with a reason to continue the conversation.
	 * @see {@link StopHandler}
	 */
	Stop: StopHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for subagent stop events. Runs when a subagent is about to stop.
	 * Can block the subagent stop with a reason.
	 * @see {@link SubagentStopHandler}
	 */
	SubagentStop: SubagentStopHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for user prompt submission. Runs when the user submits a prompt.
	 * Can add context or block the submission.
	 * @see {@link UserPromptSubmitHandler}
	 */
	UserPromptSubmit: UserPromptSubmitHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for context compaction. Runs before Claude compacts conversation history.
	 * Passthrough-only hook for observability.
	 * @see {@link PreCompactHandler}
	 */
	PreCompact: PreCompactHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for notification events. Runs when Claude sends a notification.
	 * Passthrough-only hook for observability.
	 * @see {@link NotificationHandler}
	 */
	Notification: NotificationHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Handler for permission requests. Runs when Claude requests user permission.
	 * Can auto-allow or auto-deny permission requests.
	 * @see {@link PermissionRequestHandler}
	 */
	PermissionRequest: PermissionRequestHandler<InferPluginOptions<T>, InferPluginState<T>>;
}
