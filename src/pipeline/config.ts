/**
 * Pipeline-based hook system for declarative hook definitions.
 *
 * This module provides a higher-level abstraction over the raw hook event system,
 * allowing hooks to be defined as pure transformation functions with strict
 * Zod-validated inputs and outputs.
 *
 * @example
 * ```ts
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
 * import { z } from "zod";
 *
 * export default ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   options: z.object({
 *     TIMEOUT_MS: z.number().default(30000),
 *   }),
 *   hooks: {
 *     SessionStart: [{
 *       name: "project-context",
 *       pipeline: async ({ input, state }) => {
 *         return {
 *           status: "executed",
 *           action: "context",
 *           summary: "added project context",
 *           claudeContext: "Project uses TypeScript",
 *         };
 *       }
 *     }],
 *   }
 * });
 * ```
 */

import type { ReadonlyDeep } from "type-fest";
import type { z } from "zod";
import type { $ZodType } from "zod/v4/core";
import type { PluginBuildResult } from "../build/builder.js";
import type {
	NotificationEvent,
	PermissionRequestEvent,
	PostToolUseEvent,
	PreCompactEvent,
	PreToolUseEvent,
	SessionEndEvent,
	SessionStartEvent,
	StopEvent,
	SubagentStopEvent,
	UserPromptSubmitEvent,
} from "../events/subclasses.js";
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
	ToolName,
	UserPromptSubmitInput,
} from "../events/types.js";
import type { PluginTester } from "../testing/builder.js";
import type {
	NotificationPipelineOutput,
	PassthroughPipelineOutput,
	PermissionRequestPipelineOutput,
	PostToolUsePipelineOutput,
	PreCompactPipelineOutput,
	PreToolUsePipelineOutput,
	SessionEndPipelineOutput,
	SessionStartPipelineOutput,
	StopPipelineOutput,
	SubagentStopPipelineOutput,
	UserPromptSubmitPipelineOutput,
} from "./types.js";

// =============================================================================
// HANDLER TYPES
// =============================================================================

/**
 * Context provided to pipeline handlers.
 *
 * @template TInput - Hook event input type (e.g., PreToolUseEvent)
 * @template TOptions - Validated options from plugin schema
 * @template TState - Computed variables from setup function
 *
 * @example
 * ```ts
 * const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
 *   // input: PreToolUseEvent
 *   // options: { DEBUG: boolean, MODE: string }
 *   // state: { projectDir, pluginDir, packageManager, ... }
 *   return { permissionDecision: "allow" };
 * };
 * ```
 */
/**
 * Full state passed to handlers: BaseState + computed state from setup().
 * @public
 */
export type PluginState<TState> = BaseState & TState;

/**
 * Context provided to pipeline handlers.
 *
 * @remarks
 * All properties are deeply readonly to prevent accidental mutations.
 * Handlers should treat their context as immutable and return new
 * output objects rather than modifying input.
 *
 * @typeParam TInput - Hook event input type (e.g., PreToolUseInput)
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @public
 */
export interface HandlerContext<TInput, TOptions, TState = Record<string, unknown>> {
	/** Hook event input from Claude Code (readonly) */
	input: ReadonlyDeep<TInput>;
	/** Validated options from plugin schema (readonly) */
	options: ReadonlyDeep<TOptions>;
	/** State: base paths + computed state from setup() (readonly) */
	state: ReadonlyDeep<PluginState<TState>>;
}

/**
 * Pipeline handler: pure transformation function.
 * Returns a validated output or throws to indicate error.
 * @public
 */
export type PipelineHandler<TInput, TOutput, TOptions, TState = Record<string, unknown>> = (
	ctx: HandlerContext<TInput, TOptions, TState>,
) => TOutput | Promise<TOutput>;

/**
 * Raw handler: full access to event object for advanced use cases.
 *
 * @remarks
 * Unlike pipeline handlers, raw handlers receive the full event object
 * which remains mutable (for calling methods like `event.end()`).
 * Options and state are deeply readonly to prevent mutations.
 *
 * User is responsible for calling `event.end()` with appropriate response.
 *
 * @public
 */
export type RawHandler<TEvent, TOptions, TState = Record<string, unknown>> = (ctx: {
	/** Full event object (mutable for method calls) */
	event: TEvent;
	/** Validated options from plugin schema (readonly) */
	options: ReadonlyDeep<TOptions>;
	/** State: base paths + computed state from setup() (readonly) */
	state: ReadonlyDeep<PluginState<TState>>;
}) => void | Promise<void>;

// =============================================================================
// TYPED HANDLER HELPERS - For file-based hooks
// =============================================================================

/**
 * Typed pipeline handler for SessionStart hooks.
 *
 * @example
 * ```ts
 * import type { Pipeline } from "../plugin.js";
 *
 * const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
 *   return {
 *     status: "executed",
 *     action: "context",
 *     summary: "added project context",
 *     claudeContext: "This project uses TypeScript.",
 *   };
 * };
 * export default handler;
 * ```
 * @public
 */
export type SessionStartPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SessionStartInput,
	SessionStartPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SessionEnd hooks.
 * @public
 */
export type SessionEndPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SessionEndInput,
	SessionEndPipelineOutput,
	TOptions,
	TState
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
export type PreToolUsePipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreToolUseInput,
	PreToolUsePipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PostToolUse hooks.
 * @public
 */
export type PostToolUsePipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PostToolUseInput,
	PostToolUsePipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Stop hooks.
 * @public
 */
export type StopPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	StopInput,
	StopPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SubagentStop hooks.
 * @public
 */
export type SubagentStopPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SubagentStopInput,
	StopPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	UserPromptSubmitInput,
	UserPromptSubmitPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PreCompact hooks.
 * @public
 */
export type PreCompactPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreCompactInput,
	PassthroughPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Notification hooks.
 * @public
 */
export type NotificationPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	NotificationInput,
	NotificationPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PermissionRequestInput,
	PermissionRequestPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SessionStart hooks.
 * @public
 */
export type SessionStartRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	SessionStartEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SessionEnd hooks.
 * @public
 */
export type SessionEndRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	SessionEndEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PreToolUse hooks.
 *
 * @example
 * ```ts
 * import type { Pipeline } from "../plugin.js";
 *
 * const handler: Pipeline["PreToolUseRaw"] = async ({ event, options, state }) => {
 *   event.end(event.response().allow());
 * };
 * export default handler;
 * ```
 * @public
 */
export type PreToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	PreToolUseEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PostToolUse hooks.
 * @public
 */
export type PostToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	PostToolUseEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for Stop hooks.
 * @public
 */
export type StopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	StopEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SubagentStop hooks.
 * @public
 */
export type SubagentStopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	SubagentStopEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	UserPromptSubmitEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PreCompact hooks.
 * @public
 */
export type PreCompactRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	PreCompactEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for Notification hooks.
 * @public
 */
export type NotificationRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	NotificationEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	PermissionRequestEvent<TOptions>,
	TOptions,
	TState
>;

// =============================================================================
// HOOK DEFINITION TYPES
// =============================================================================

/**
 * Base hook definition with common fields.
 * @public
 */
export interface HookDefinitionBase {
	/** Unique name for this hook (used in CLI and telemetry) */
	name: string;
	/** Description shown in help text */
	description?: string;
}

/**
 * Tool filter for PreToolUse/PostToolUse hooks.
 * @public
 */
export interface ToolFilter {
	/** Only run this hook for these tools (fast-path skip for others) */
	tools?: ToolName[];
}

/**
 * Pipeline-based hook definition with inline function.
 * @public
 */
export interface PipelineHookDefinition<TInput, TOutput, TOptions> extends HookDefinitionBase {
	/** Pure transformation function */
	pipeline: PipelineHandler<TInput, TOutput, TOptions>;
	handler?: never;
}

/**
 * Pipeline-based hook definition with file path.
 * The file should export a default function matching PipelineHandler signature.
 * Use a relative path from the plugin definition file.
 *
 * @example
 * ```ts
 * {
 *   name: "docs-access",
 *   tools: ["WebFetch"],
 *   pipeline: "./hooks/docs-access.hook.ts"
 * }
 * ```
 * @public
 */
export interface PipelineFileHookDefinition extends HookDefinitionBase {
	/** Relative path to file exporting default pipeline function */
	pipeline: string;
	handler?: never;
}

/**
 * Raw handler-based hook definition with inline function.
 * @public
 */
export interface RawHookDefinition<TEvent, TOptions, TState = Record<string, string>> extends HookDefinitionBase {
	/** Raw event handler with full control */
	handler: RawHandler<TEvent, TOptions, TState>;
	pipeline?: never;
}

/**
 * Raw handler-based hook definition with file path.
 * The file should export a default function matching RawHandler signature.
 * Use a relative path from the plugin definition file.
 *
 * @example
 * ```ts
 * {
 *   name: "post-build",
 *   tools: ["Bash"],
 *   handler: "./hooks/post-build.hook.ts"
 * }
 * ```
 * @public
 */
export interface RawFileHookDefinition extends HookDefinitionBase {
	/** Relative path to file exporting default handler function */
	handler: string;
	pipeline?: never;
}

/**
 * Passthrough hook entry - included directly in hooks.json without compilation.
 * Use this for hooks that don't need to be part of the binary plugin,
 * like bash scripts or external tools.
 *
 * @example
 * ```ts
 * {
 *   matcher: "startup",
 *   hooks: [{ type: "command", command: "bash ./scripts/init.sh" }]
 * }
 * ```
 * @public
 */
export interface PassthroughHookEntry {
	/** Optional matcher pattern for tool filtering */
	matcher?: string;
	/** Array of hook commands to execute */
	hooks: Array<{ type: "command"; command: string }>;
	/** Mark that this is not a compiled hook */
	name?: never;
	pipeline?: never;
	handler?: never;
}

/**
 * Hook definition: either pipeline, handler, file path, or passthrough.
 * @public
 */
export type HookDefinition<TInput, TOutput, TEvent, TOptions, TState = Record<string, string>> =
	| PipelineHookDefinition<TInput, TOutput, TOptions>
	| PipelineFileHookDefinition
	| RawHookDefinition<TEvent, TOptions, TState>
	| RawFileHookDefinition
	| PassthroughHookEntry;

// =============================================================================
// TYPED HOOK DEFINITIONS PER EVENT TYPE
// =============================================================================

/**
 * SessionStart hook definition
 * @public
 */
export type SessionStartHookDefinition<TOptions> = HookDefinition<
	SessionStartInput,
	SessionStartPipelineOutput,
	SessionStartEvent<TOptions>,
	TOptions
>;

/**
 * SessionEnd hook definition
 * @public
 */
export type SessionEndHookDefinition<TOptions> = HookDefinition<
	SessionEndInput,
	SessionEndPipelineOutput,
	SessionEndEvent<TOptions>,
	TOptions
>;

/**
 * PreToolUse hook definition with tool filter
 * @public
 */
export type PreToolUseHookDefinition<TOptions> = HookDefinition<
	PreToolUseInput,
	PreToolUsePipelineOutput,
	PreToolUseEvent<TOptions>,
	TOptions
> &
	ToolFilter;

/**
 * PostToolUse hook definition with tool filter
 * @public
 */
export type PostToolUseHookDefinition<TOptions> = HookDefinition<
	PostToolUseInput,
	PostToolUsePipelineOutput,
	PostToolUseEvent<TOptions>,
	TOptions
> &
	ToolFilter;

/**
 * Stop hook definition
 * @public
 */
export type StopHookDefinition<TOptions> = HookDefinition<StopInput, StopPipelineOutput, StopEvent<TOptions>, TOptions>;

/**
 * SubagentStop hook definition
 * @public
 */
export type SubagentStopHookDefinition<TOptions> = HookDefinition<
	SubagentStopInput,
	SubagentStopPipelineOutput,
	SubagentStopEvent<TOptions>,
	TOptions
>;

/**
 * UserPromptSubmit hook definition
 * @public
 */
export type UserPromptSubmitHookDefinition<TOptions> = HookDefinition<
	UserPromptSubmitInput,
	UserPromptSubmitPipelineOutput,
	UserPromptSubmitEvent<TOptions>,
	TOptions
>;

/**
 * PreCompact hook definition
 * @public
 */
export type PreCompactHookDefinition<TOptions> = HookDefinition<
	PreCompactInput,
	PreCompactPipelineOutput,
	PreCompactEvent<TOptions>,
	TOptions
>;

/**
 * Notification hook definition
 * @public
 */
export type NotificationHookDefinition<TOptions> = HookDefinition<
	NotificationInput,
	NotificationPipelineOutput,
	NotificationEvent<TOptions>,
	TOptions
>;

/**
 * PermissionRequest hook definition
 * @public
 */
export type PermissionRequestHookDefinition<TOptions> = HookDefinition<
	PermissionRequestInput,
	PermissionRequestPipelineOutput,
	PermissionRequestEvent<TOptions>,
	TOptions
>;

// =============================================================================
// HOOKS MAP TYPE
// =============================================================================

/**
 * Map of hook event types to their definitions.
 * @public
 */
export interface HooksMap<TOptions> {
	SessionStart?: SessionStartHookDefinition<TOptions>[];
	SessionEnd?: SessionEndHookDefinition<TOptions>[];
	PreToolUse?: PreToolUseHookDefinition<TOptions>[];
	PostToolUse?: PostToolUseHookDefinition<TOptions>[];
	Stop?: StopHookDefinition<TOptions>[];
	SubagentStop?: SubagentStopHookDefinition<TOptions>[];
	UserPromptSubmit?: UserPromptSubmitHookDefinition<TOptions>[];
	PreCompact?: PreCompactHookDefinition<TOptions>[];
	Notification?: NotificationHookDefinition<TOptions>[];
	PermissionRequest?: PermissionRequestHookDefinition<TOptions>[];
}

// =============================================================================
// COMMAND PIPELINE TYPES
// =============================================================================

/**
 * Command definition with Zod argument schema for declarative command definitions.
 *
 * @typeParam TArgs - Zod schema type for command arguments
 *
 * @example
 * ```ts
 * commands: {
 *   lint: {
 *     description: "Fix lint errors across the codebase",
 *     args: z.object({
 *       path: z.string().optional().default(".").describe("Path to lint"),
 *       fix: z.boolean().optional().default(true).describe("Auto-fix issues"),
 *     }),
 *     pipeline: "./commands/lint.cmd.ts",
 *   },
 * }
 * ```
 * @public
 */
export interface CommandDefinition<TArgs extends $ZodType = $ZodType> {
	/** Description shown in help text and to LLM */
	description: string;
	/** Zod schema for validating CLI arguments */
	args?: TArgs;
	/** Path to handler file (relative to plugin root) */
	pipeline: string;
}

/**
 * Context provided to command handlers.
 *
 * @typeParam TArgs - Validated argument type from Zod schema
 * @typeParam TOptions - Validated options from plugin schema (Layer 2)
 * @typeParam TState - Computed variables from setup function (Layer 3)
 *
 * @example
 * ```ts
 * const handler: Commands["lint"] = async ({ args, options, state }) => {
 *   // args: { path: string, fix: boolean } - validated from CLI
 *   // options: { AUTO_ALLOW_ENABLED: boolean, ... } - from schema
 *   // state: { projectDir, pluginDir, packageManager, ... } - base + computed
 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
 * };
 * ```
 * @public
 */
export interface CmdContext<TArgs, TOptions, TState = Record<string, unknown>> {
	/** Validated command arguments from CLI */
	args: TArgs;
	/** Validated options from plugin schema */
	options: TOptions;
	/** State: base paths + computed state from setup() */
	state: PluginState<TState>;
}

/**
 * Command handler function signature.
 *
 * @typeParam TArgs - Validated argument type from Zod schema
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - State from setup function
 * @public
 */
export type CommandHandler<TArgs, TOptions, TState = Record<string, unknown>> = (
	ctx: CmdContext<TArgs, TOptions, TState>,
) => CommandOutput | Promise<CommandOutput>;

/**
 * Command output structure returned by command handlers.
 * Commands output markdown for LLM consumption.
 * @public
 */
export interface CommandOutput {
	/** Exit code (0 = success, 1 = issues found, 2 = fatal error) */
	exitCode: number;
	/** Markdown output for LLM consumption */
	output: string;
	/** Optional structured data for programmatic access */
	data?: Record<string, unknown>;
}

/**
 * Map of command names to their definitions.
 * @public
 */
export type CommandsMap = Record<string, CommandDefinition>;

/**
 * Base state values provided to setup and handlers.
 * These are the core paths that the pipeline provides automatically.
 *
 * Persisted as:
 * - `PREFIX_PROJECT_DIR`
 * - `PREFIX_PLUGIN_DIR`
 * - `PREFIX_PLUGIN_ENV_FILE`
 * @public
 */
export interface BaseState {
	/** Project directory (from CLAUDE_PROJECT_DIR or cwd) */
	readonly projectDir: string;
	/** Plugin root directory (from CLAUDE_PLUGIN_ROOT) */
	readonly pluginDir: string;
	/** Path to the session env file (from CLAUDE_ENV_FILE) */
	readonly pluginEnvFile: string;

	// Logger methods (bound from PluginEnv instance)
	/** Log at INFO level */
	log(message: string, ...args: unknown[]): void;
	/** Log at INFO level (alias for log) */
	info(message: string, ...args: unknown[]): void;
	/** Log at DEBUG level */
	debug(message: string, ...args: unknown[]): void;
}

/**
 * Context passed to the setup function during SessionStart.
 * @public
 */
export interface SetupContext<TOptions> {
	/** Validated options from the schema (with defaults applied) */
	options: TOptions;
	/** Current working directory from the session event */
	cwd: string;
	/** Session ID from Claude Code */
	sessionId: string;
	/** Base state paths (projectDir, pluginDir, pluginEnvFile) */
	baseState: BaseState;
}

/**
 * Setup function for computing derived environment variables.
 * Runs during SessionStart after options are validated.
 *
 * @typeParam TOptions - Validated options type from schema
 * @typeParam TState - Return type with specific computed variable names
 * @returns Object with computed values of any type (will be typed through inference)
 *
 * @example
 * ```ts
 * setup: async ({ options, cwd }) => {
 *   const detection = await runDetectionPipeline();
 *   return {
 *     detection,  // Full typed object
 *     sessionInfo: formatSessionInfo(detection),  // Pre-formatted string
 *   };
 * }
 * ```
 * @public
 */
export type SetupFunction<TOptions, TState = Record<string, unknown>> = (
	ctx: SetupContext<TOptions>,
) => Promise<TState> | TState;

/**
 * Helper type to extract the return type of a setup function.
 * Handles both sync and async return types.
 *
 * Uses `infer _TOptions` to match SetupContext with any options type,
 * allowing the pattern to match setup functions regardless of their options type.
 * @public
 */
export type ExtractSetupReturn<T> = T extends (ctx: SetupContext<infer _TOptions>) => Promise<infer R>
	? R
	: T extends (ctx: SetupContext<infer _TOptions>) => infer R
		? R
		: Record<string, unknown>;

/**
 * Plugin configuration options.
 *
 * @typeParam TOptionsSchema - Zod schema for plugin options validation
 * @typeParam TSetup - Setup function type (used to infer computed vars)
 * @typeParam TCommands - Map of command names to their definitions
 * @public
 */
export interface PluginConfig<
	TOptionsSchema extends $ZodType,
	// Use function type constraint directly to avoid default type parameter issues
	TSetup extends ((ctx: SetupContext<z.infer<TOptionsSchema>>) => unknown) | undefined = undefined,
	TCommands extends Record<string, CommandDefinition> = Record<string, never>,
> {
	/**
	 * Environment variable prefix for this plugin.
	 * All env vars will be prefixed with this value.
	 * @example "SAVVY_WORKFLOW" becomes SAVVY_WORKFLOW_DEBUG
	 */
	prefix: string;

	/**
	 * Zod schema for plugin options (environment variables).
	 * Defines the configurable options validated at startup and injected into handlers.
	 * Options can be set via .env files or Claude Code settings.json.
	 */
	options: TOptionsSchema;

	/**
	 * Setup function for computing derived environment variables.
	 * Runs during SessionStart after options are validated.
	 * Returned variables are prefixed and persisted to CLAUDE_ENV_FILE.
	 *
	 * @example
	 * ```ts
	 * setup: async ({ options, cwd }) => {
	 *   const gitInstalled = await detectGitInstalled();
	 *   return { GIT_INSTALLED: String(gitInstalled) } as const;
	 * }
	 * ```
	 */
	setup?: TSetup;

	/**
	 * Hook definitions organized by event type.
	 */
	hooks: HooksMap<z.infer<TOptionsSchema>>;

	/**
	 * Command definitions with typed argument schemas.
	 * Commands receive `{ args, options, state }` context.
	 *
	 * @example
	 * ```ts
	 * commands: {
	 *   lint: {
	 *     description: "Fix lint errors",
	 *     args: z.object({ path: pathArg({ defaultValue: "." }) }),
	 *     pipeline: "./commands/lint.cmd.ts",
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
// PLUGIN CLASS
// =============================================================================

/**
 * Claude Code plugin with declarative hook definitions.
 *
 * @remarks
 * `ClaudeBinaryPlugin` is the core class for creating Claude Code plugins.
 * Use the static `create()` factory to instantiate plugins with full type inference.
 *
 * **Three-Layer Model:**
 * 1. **Input** - Hook event data from Claude Code (stdin JSON)
 * 2. **Options** - User-configurable settings validated by Zod schema
 * 3. **State** - Computed values from `setup()` function at SessionStart
 *
 * **Static Methods:**
 * - `ClaudeBinaryPlugin.create()` - Factory for creating plugin instances
 * - `ClaudeBinaryPlugin.build()` - Compile plugin to executable (tree-shakeable)
 *
 * **Type Inference:**
 * Use the namespace utilities to extract types from plugin instances:
 * - `ClaudeBinaryPlugin.InferOptions<typeof plugin>` - Options type from schema
 * - `ClaudeBinaryPlugin.InferState<typeof plugin>` - State type from setup()
 * - `ClaudeBinaryPlugin.InferPipeline<typeof plugin>` - Handler types for hooks
 * - `ClaudeBinaryPlugin.InferCommands<typeof plugin>` - Handler types for commands
 *
 * @example
 * ```ts
 * // plugin.config.ts
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   options: z.object({
 *     TIMEOUT_MS: z.number().default(30000),
 *   }),
 *   hooks: {
 *     SessionStart: [{
 *       name: "project-context",
 *       pipeline: async ({ input, state }) => {
 *         return {
 *           status: "executed",
 *           action: "context",
 *           summary: "added context",
 *           claudeContext: "Hello from plugin!",
 *         };
 *       }
 *     }],
 *   }
 * });
 *
 * export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
 * export default plugin;
 * ```
 *
 * @example Building a plugin programmatically
 * ```ts
 * import plugin from "./plugin.config.ts";
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
 *
 * await ClaudeBinaryPlugin.build(plugin, {
 *   rootDir: import.meta.dir,
 *   compile: true,
 * });
 * ```
 *
 * @typeParam TOptionsSchema - Zod schema for plugin options validation
 * @typeParam TSetup - Setup function type (used to infer state)
 * @typeParam TCommands - Map of command names to their definitions
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks | Claude Code Hooks}
 * @public
 */
export class ClaudeBinaryPlugin<
	TOptionsSchema extends $ZodType,
	TSetup extends ((ctx: SetupContext<z.infer<TOptionsSchema>>) => unknown) | undefined = undefined,
	TCommands extends Record<string, CommandDefinition> = Record<string, never>,
> {
	/**
	 * The plugin configuration.
	 * @public
	 */
	readonly config: PluginConfig<TOptionsSchema, TSetup, TCommands>;

	/**
	 * Private constructor - use `ClaudeBinaryPlugin.create()` instead.
	 * @internal
	 */
	private constructor(config: PluginConfig<TOptionsSchema, TSetup, TCommands>) {
		this.config = config;
	}

	/**
	 * Create a new plugin instance.
	 *
	 * @remarks
	 * This is the primary factory for creating Claude Code plugins.
	 * The returned instance contains the configuration and can be passed
	 * to `ClaudeBinaryPlugin.build()` for compilation.
	 *
	 * @typeParam TOptionsSchema - Zod schema for plugin options validation
	 * @typeParam TSetup - Setup function type (inferred from config.setup)
	 * @typeParam TCommands - Map of command names to their definitions
	 *
	 * @param config - Plugin configuration
	 * @returns Plugin instance ready for building or export
	 *
	 * @example
	 * ```ts
	 * const plugin = ClaudeBinaryPlugin.create({
	 *   prefix: "MY_PLUGIN",
	 *   options: z.object({ ALLOW_SUDO: z.boolean().default(false) }),
	 *   hooks: {
	 *     PreToolUse: [{
	 *       name: "security",
	 *       tools: ["Bash"],
	 *       pipeline: "./hooks/security.hook.ts",
	 *     }],
	 *   },
	 * });
	 * ```
	 *
	 * @public
	 */
	static create<
		TOptionsSchema extends $ZodType,
		TSetup extends ((ctx: SetupContext<z.infer<TOptionsSchema>>) => unknown) | undefined = undefined,
		TCommands extends Record<string, CommandDefinition> = Record<string, never>,
	>(config: PluginConfig<TOptionsSchema, TSetup, TCommands>): ClaudeBinaryPlugin<TOptionsSchema, TSetup, TCommands> {
		return new ClaudeBinaryPlugin(config);
	}

	/**
	 * Build a plugin to a compiled executable.
	 *
	 * @remarks
	 * This static method compiles a plugin instance to a single-file Bun executable.
	 * It uses dynamic import to load the build system, making the build code
	 * tree-shakeable when not used.
	 *
	 * **Build Process:**
	 * 1. Read plugin.json/marketplace.json manifests for name/version
	 * 2. Extract hooks and commands from plugin configuration
	 * 3. Generate TypeScript entrypoint
	 * 4. Compile to single-file executable with Bun.build()
	 * 5. Generate hooks.json manifest for Claude Code
	 * 6. Optionally sync to Claude Code plugins cache
	 *
	 * @param plugin - The plugin instance to build
	 * @param options - Build configuration options
	 * @returns Result of the build operation
	 *
	 * @example
	 * ```ts
	 * import plugin from "./plugin.config.ts";
	 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
	 *
	 * const result = await ClaudeBinaryPlugin.build(plugin, {
	 *   rootDir: import.meta.dir,
	 *   compile: true,
	 * });
	 *
	 * if (result.success) {
	 *   console.log(`Built: ${result.output}`);
	 * }
	 * ```
	 *
	 * @public
	 */
	static async build(
		// biome-ignore lint/suspicious/noExplicitAny: Accept any plugin type for build
		plugin: ClaudeBinaryPlugin<any, any, any>,
		options: PluginBuildOptions = {},
	): Promise<PluginBuildResult> {
		// Dynamic import to avoid circular dependency and enable tree-shaking
		const { PluginBuilder } = await import("../build/builder.js");
		return PluginBuilder.fromConfig(plugin, options);
	}

	/**
	 * Create a test builder for this plugin.
	 *
	 * @remarks
	 * Returns a fluent test builder with full type inference for options, state,
	 * and hook inputs. Use this in your test files to create type-safe test contexts.
	 *
	 * **Lifecycle:**
	 * 1. Create test context with `plugin.test()`
	 * 2. Configure with `.withOptions()` and `.withState()` (required)
	 * 3. Set hook input with hook-specific methods (e.g., `.withPreToolUseInput()`)
	 * 4. Run test with `.runHook()` or `.runCommand()`
	 * 5. Clean up with `.dispose()` in `afterEach()`
	 *
	 * @returns A new PluginTester instance with full type inference
	 *
	 * @example
	 * ```ts
	 * import plugin from "../plugin.config.js";
	 *
	 * describe("security hook", () => {
	 *   let ctx: ReturnType<typeof plugin.test>;
	 *
	 *   beforeEach(() => {
	 *     ctx = plugin.test()
	 *       .withOptions({ ALLOW_SUDO: false, API_KEY: "test" })
	 *       .withState({ packageManager: "bun", gitRepo: true });
	 *   });
	 *
	 *   afterEach(() => ctx.dispose());
	 *
	 *   test("blocks dangerous commands", async () => {
	 *     const result = await ctx
	 *       .withPreToolUseInput({
	 *         tool_name: "Bash",
	 *         tool_input: { command: "rm -rf /" },
	 *       })
	 *       .runHook("PreToolUse", "security");
	 *
	 *     expect(result.action).toBe("deny");
	 *   });
	 * });
	 * ```
	 *
	 * @public
	 */
	test(): PluginTester<
		z.infer<TOptionsSchema>,
		ExtractSetupReturn<NonNullable<TSetup>>,
		HooksMap<z.infer<TOptionsSchema>>,
		TCommands
	> {
		// Dynamic import to enable tree-shaking when test() is not used
		// biome-ignore lint/suspicious/noExplicitAny: Runtime creation doesn't need strict types
		const { PluginTester } = require("../testing/builder.js") as any;
		return new PluginTester(this.config);
	}
}

/**
 * Options for building a plugin via `ClaudeBinaryPlugin.build()`.
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
// TYPE INFERENCE UTILITIES (Zod-like pattern)
// =============================================================================

/**
 * Namespace for type inference utilities.
 * Merges with the ClaudeBinaryPlugin class to enable Zod-like patterns.
 *
 * @example
 * ```ts
 * // In plugin.config.ts
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   options: z.object({ DEBUG: z.boolean().default(false) }),
 *   hooks: { ... }
 * });
 *
 * export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
 * export default plugin;
 *
 * // In hooks/my-hook.hook.ts
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
 *   // input, options, and state are fully typed!
 *   return { permissionDecision: "allow" };
 * };
 * export default handler;
 * ```
 * @public
 */
export namespace ClaudeBinaryPlugin {
	/**
	 * Helper type to extract the options schema from a ClaudeBinaryPlugin instance.
	 * @public
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
	export type ExtractOptionsSchema<T> = T extends ClaudeBinaryPlugin<infer TSchema, any, any> ? TSchema : never;

	/**
	 * Helper type to extract setup function type from a ClaudeBinaryPlugin instance.
	 * @public
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
	export type ExtractSetup<T> = T extends ClaudeBinaryPlugin<any, infer TSetup, any> ? TSetup : undefined;

	/**
	 * Helper type to extract commands map from a ClaudeBinaryPlugin instance.
	 * @public
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
	export type ExtractCommands<T> = T extends ClaudeBinaryPlugin<any, any, infer TCommands> ? TCommands : never;

	/**
	 * Extract the inferred Options type from a plugin.
	 *
	 * @example
	 * ```ts
	 * type Options = ClaudeBinaryPlugin.InferOptions<typeof plugin>;
	 * ```
	 * @public
	 */
	export type InferOptions<T> = z.infer<ExtractOptionsSchema<T>>;

	/**
	 * Extract the inferred State type from a plugin's setup function.
	 * State is merged with BaseState to form the full PluginState passed to handlers.
	 *
	 * @example
	 * ```ts
	 * type State = ClaudeBinaryPlugin.InferState<typeof plugin>;
	 * // { packageManager: string; typeChecker: string; ... }
	 * ```
	 * @public
	 */
	export type InferState<T> =
		ExtractSetup<T> extends undefined ? Record<string, unknown> : ExtractSetupReturn<NonNullable<ExtractSetup<T>>>;

	/**
	 * Infer all pipeline and handler types from a plugin.
	 * Returns an interface with typed handlers for each hook event.
	 *
	 * @example
	 * ```ts
	 * export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
	 *
	 * // Pipeline handlers (pure transformation)
	 * const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => { ... };
	 *
	 * // Raw handlers (full event access)
	 * const handler: Pipeline["PreToolUseRaw"] = ({ event, options, state }) => { ... };
	 * ```
	 */
	export interface InferPipeline<T> {
		// Pipeline handlers (pure transformation functions)
		SessionStart: SessionStartPipeline<InferOptions<T>, InferState<T>>;
		SessionEnd: SessionEndPipeline<InferOptions<T>, InferState<T>>;
		PreToolUse: PreToolUsePipeline<InferOptions<T>, InferState<T>>;
		PostToolUse: PostToolUsePipeline<InferOptions<T>, InferState<T>>;
		Stop: StopPipeline<InferOptions<T>, InferState<T>>;
		SubagentStop: SubagentStopPipeline<InferOptions<T>, InferState<T>>;
		UserPromptSubmit: UserPromptSubmitPipeline<InferOptions<T>, InferState<T>>;
		PreCompact: PreCompactPipeline<InferOptions<T>, InferState<T>>;
		Notification: NotificationPipeline<InferOptions<T>, InferState<T>>;
		PermissionRequest: PermissionRequestPipeline<InferOptions<T>, InferState<T>>;

		// Raw handlers (full event access)
		SessionStartRaw: SessionStartRawHandler<InferOptions<T>, InferState<T>>;
		SessionEndRaw: SessionEndRawHandler<InferOptions<T>, InferState<T>>;
		PreToolUseRaw: PreToolUseRawHandler<InferOptions<T>, InferState<T>>;
		PostToolUseRaw: PostToolUseRawHandler<InferOptions<T>, InferState<T>>;
		StopRaw: StopRawHandler<InferOptions<T>, InferState<T>>;
		SubagentStopRaw: SubagentStopRawHandler<InferOptions<T>, InferState<T>>;
		UserPromptSubmitRaw: UserPromptSubmitRawHandler<InferOptions<T>, InferState<T>>;
		PreCompactRaw: PreCompactRawHandler<InferOptions<T>, InferState<T>>;
		NotificationRaw: NotificationRawHandler<InferOptions<T>, InferState<T>>;
		PermissionRequestRaw: PermissionRequestRawHandler<InferOptions<T>, InferState<T>>;
	}

	/**
	 * Extract the commands map from a plugin.
	 * @public
	 */
	export type InferCommandsMap<T> = ExtractCommands<T>;

	/**
	 * Infer command handler types from a plugin.
	 * Returns an interface with typed handlers for each command.
	 *
	 * @example
	 * ```ts
	 * export type Commands = ClaudeBinaryPlugin.InferCommands<typeof plugin>;
	 *
	 * // In commands/lint.cmd.ts
	 * const handler: Commands["lint"] = async ({ args, options, state }) => {
	 *   // args, options, and state are fully typed!
	 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
	 * };
	 * ```
	 */
	export type InferCommands<T> = {
		[K in keyof InferCommandsMap<T>]: InferCommandsMap<T>[K] extends CommandDefinition<infer TArgs>
			? CommandHandler<z.infer<TArgs>, InferOptions<T>, InferState<T>>
			: never;
	};
}

