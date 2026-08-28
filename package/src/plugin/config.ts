import { Schema } from "effect";
import type { PluginBuildResult } from "../build/builder.js";
import type { HooksMap } from "../hooks/types.js";
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
// RE-EXPORT HANDLER AND HOOK DEFINITION TYPES FROM PER-HOOK MODULES
// =============================================================================

export type { ConfigChangeHandler, ConfigChangeHookDefinition } from "../hooks/ConfigChange.js";
export type { CwdChangedHandler, CwdChangedHookDefinition } from "../hooks/CwdChanged.js";
export type { ElicitationHandler, ElicitationHookDefinition } from "../hooks/Elicitation.js";
export type { ElicitationResultHandler, ElicitationResultHookDefinition } from "../hooks/ElicitationResult.js";
export type { FileChangedHandler, FileChangedHookDefinition } from "../hooks/FileChanged.js";
export type { InstructionsLoadedHandler, InstructionsLoadedHookDefinition } from "../hooks/InstructionsLoaded.js";
export type { NotificationHandler, NotificationHookDefinition } from "../hooks/Notification.js";
export type { PermissionDeniedHandler, PermissionDeniedHookDefinition } from "../hooks/PermissionDenied.js";
export type { PermissionRequestHandler, PermissionRequestHookDefinition } from "../hooks/PermissionRequest.js";
export type { PostCompactHandler, PostCompactHookDefinition } from "../hooks/PostCompact.js";
export type { PostToolUseHandler, PostToolUseHookDefinition } from "../hooks/PostToolUse.js";
export type { PostToolUseFailureHandler, PostToolUseFailureHookDefinition } from "../hooks/PostToolUseFailure.js";
export type { PreCompactHandler, PreCompactHookDefinition } from "../hooks/PreCompact.js";
export type { PreToolUseHandler, PreToolUseHookDefinition } from "../hooks/PreToolUse.js";
export type { SessionEndHandler, SessionEndHookDefinition } from "../hooks/SessionEnd.js";
export type { SessionStartHandler, SessionStartHookDefinition } from "../hooks/SessionStart.js";
export type { StopHandler, StopHookDefinition } from "../hooks/Stop.js";
export type { StopFailureHandler, StopFailureHookDefinition } from "../hooks/StopFailure.js";
export type { SubagentStartHandler, SubagentStartHookDefinition } from "../hooks/SubagentStart.js";
export type { SubagentStopHandler, SubagentStopHookDefinition } from "../hooks/SubagentStop.js";
export type { TaskCompletedHandler, TaskCompletedHookDefinition } from "../hooks/TaskCompleted.js";
export type { TaskCreatedHandler, TaskCreatedHookDefinition } from "../hooks/TaskCreated.js";
export type { TeammateIdleHandler, TeammateIdleHookDefinition } from "../hooks/TeammateIdle.js";
export type { HookOutcomeMap, HooksMap, InferHandlers } from "../hooks/types.js";
export type { UserPromptSubmitHandler, UserPromptSubmitHookDefinition } from "../hooks/UserPromptSubmit.js";
export type { WorktreeCreateHandler, WorktreeCreateHookDefinition } from "../hooks/WorktreeCreate.js";
export type { WorktreeRemoveHandler, WorktreeRemoveHookDefinition } from "../hooks/WorktreeRemove.js";

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
