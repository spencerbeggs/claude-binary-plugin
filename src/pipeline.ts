/**
 * Pipeline-based hook system for declarative hook definitions.
 *
 * This module provides a higher-level abstraction over the raw hook event system,
 * allowing hooks to be defined as pure transformation functions with strict
 * Zod-validated inputs and outputs.
 *
 * @example
 * ```ts
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin/pipeline";
 * import { z } from "zod";
 *
 * export default ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   schema: z.object({
 *     DEBUG: z.boolean().default(false),
 *   }),
 *   hooks: {
 *     SessionStart: [{
 *       name: "project-context",
 *       pipeline: async ({ input, env }) => {
 *         return { additionalContext: "Project uses TypeScript" };
 *       }
 *     }],
 *   }
 * });
 * ```
 */

import type { z } from "zod";
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
	ToolName,
	UserPromptSubmitEvent,
} from "./index.js";
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
} from "./pipeline-types.js";
import { OutputSchemas } from "./pipeline-types.js";

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
 * const handler: Pipeline["PreToolUse"] = ({ input, options, computed }) => {
 *   // input: PreToolUseEvent
 *   // options: { DEBUG: boolean, MODE: string }
 *   // computed: { GIT_INSTALLED: string, CAN_PUSH: string }
 *   return { permissionDecision: "allow" };
 * };
 * ```
 */
/**
 * Full environment passed to handlers: BaseEnv + state from setup().
 */
export type PluginEnv<TState> = BaseEnv & TState;

export interface PipelineContext<TInput, TOptions, TState = Record<string, unknown>> {
	/** Hook event input from Claude Code */
	input: TInput;
	/** Validated options from plugin schema */
	options: TOptions;
	/** Environment: base paths + state from setup() */
	env: PluginEnv<TState>;
}

/**
 * Pipeline handler: pure transformation function.
 * Returns a validated output or throws to indicate error.
 */
export type PipelineHandler<TInput, TOutput, TOptions, TState = Record<string, unknown>> = (
	ctx: PipelineContext<TInput, TOptions, TState>,
) => TOutput | Promise<TOutput>;

/**
 * Raw handler: full access to event object for advanced use cases.
 * User is responsible for calling event.end() with appropriate response.
 */
export type RawHandler<TEvent, TOptions, TState = Record<string, unknown>> = (ctx: {
	event: TEvent;
	options: TOptions;
	env: PluginEnv<TState>;
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
 * const handler: Pipeline["SessionStart"] = ({ input, options, computed }) => {
 *   return {
 *     status: "executed",
 *     action: "context",
 *     summary: "added project context",
 *     claudeContext: "This project uses TypeScript.",
 *   };
 * };
 * export default handler;
 * ```
 */
export type SessionStartPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SessionStartEvent,
	SessionStartOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SessionEnd hooks.
 */
export type SessionEndPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SessionEndEvent,
	SessionEndOutput,
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
 * const handler: Pipeline["PreToolUse"] = ({ input, options, computed }) => {
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
 */
export type PreToolUsePipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreToolUseEvent,
	PreToolUseOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PostToolUse hooks.
 */
export type PostToolUsePipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PostToolUseEvent,
	PostToolUseOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Stop hooks.
 */
export type StopPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	StopEvent,
	StopOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SubagentStop hooks.
 */
export type SubagentStopPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	SubagentStopEvent,
	StopOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for UserPromptSubmit hooks.
 */
export type UserPromptSubmitPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	UserPromptSubmitEvent,
	UserPromptSubmitOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PreCompact hooks.
 */
export type PreCompactPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreCompactEvent,
	PassthroughOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Notification hooks.
 */
export type NotificationPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	NotificationEvent,
	NotificationOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PermissionRequest hooks.
 */
export type PermissionRequestPipeline<TOptions, TState = Record<string, string>> = PipelineHandler<
	PermissionRequestEvent,
	PermissionRequestOutput,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SessionStart hooks.
 */
export type SessionStartRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").SessionStartHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SessionEnd hooks.
 */
export type SessionEndRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").SessionEndHookEvent<TOptions>,
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
 * const handler: Pipeline["PreToolUseRaw"] = async ({ event, options, computed }) => {
 *   event.end(event.response().allow());
 * };
 * export default handler;
 * ```
 */
export type PreToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").PreToolUseHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PostToolUse hooks.
 */
export type PostToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").PostToolUseHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for Stop hooks.
 */
export type StopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").StopHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SubagentStop hooks.
 */
export type SubagentStopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").SubagentStopHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for UserPromptSubmit hooks.
 */
export type UserPromptSubmitRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").UserPromptSubmitHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PreCompact hooks.
 */
export type PreCompactRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").PreCompactHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for Notification hooks.
 */
export type NotificationRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").NotificationHookEvent<TOptions>,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PermissionRequest hooks.
 */
export type PermissionRequestRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	import("./index.js").PermissionRequestHookEvent<TOptions>,
	TOptions,
	TState
>;

// =============================================================================
// HOOK DEFINITION TYPES
// =============================================================================

/**
 * Base hook definition with common fields.
 */
interface HookDefinitionBase {
	/** Unique name for this hook (used in CLI and telemetry) */
	name: string;
	/** Description shown in help text */
	description?: string;
}

/**
 * Tool filter for PreToolUse/PostToolUse hooks.
 */
interface ToolFilter {
	/** Only run this hook for these tools (fast-path skip for others) */
	tools?: ToolName[];
}

/**
 * Pipeline-based hook definition with inline function.
 */
interface PipelineHookDefinition<TInput, TOutput, TOptions> extends HookDefinitionBase {
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
 */
interface PipelineFileHookDefinition extends HookDefinitionBase {
	/** Relative path to file exporting default pipeline function */
	pipeline: string;
	handler?: never;
}

/**
 * Raw handler-based hook definition with inline function.
 */
interface RawHookDefinition<TEvent, TOptions, TState = Record<string, string>> extends HookDefinitionBase {
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
 */
interface RawFileHookDefinition extends HookDefinitionBase {
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

/** SessionStart hook definition */
export type SessionStartHookDefinition<TOptions> = HookDefinition<
	SessionStartEvent,
	SessionStartOutput,
	import("./index.js").SessionStartHookEvent<TOptions>,
	TOptions
>;

/** SessionEnd hook definition */
export type SessionEndHookDefinition<TOptions> = HookDefinition<
	SessionEndEvent,
	SessionEndOutput,
	import("./index.js").SessionEndHookEvent<TOptions>,
	TOptions
>;

/** PreToolUse hook definition with tool filter */
export type PreToolUseHookDefinition<TOptions> = HookDefinition<
	PreToolUseEvent,
	PreToolUseOutput,
	import("./index.js").PreToolUseHookEvent<TOptions>,
	TOptions
> &
	ToolFilter;

/** PostToolUse hook definition with tool filter */
export type PostToolUseHookDefinition<TOptions> = HookDefinition<
	PostToolUseEvent,
	PostToolUseOutput,
	import("./index.js").PostToolUseHookEvent<TOptions>,
	TOptions
> &
	ToolFilter;

/** Stop hook definition */
export type StopHookDefinition<TOptions> = HookDefinition<
	StopEvent,
	StopOutput,
	import("./index.js").StopHookEvent<TOptions>,
	TOptions
>;

/** SubagentStop hook definition */
export type SubagentStopHookDefinition<TOptions> = HookDefinition<
	SubagentStopEvent,
	SubagentStopOutput,
	import("./index.js").SubagentStopHookEvent<TOptions>,
	TOptions
>;

/** UserPromptSubmit hook definition */
export type UserPromptSubmitHookDefinition<TOptions> = HookDefinition<
	UserPromptSubmitEvent,
	UserPromptSubmitOutput,
	import("./index.js").UserPromptSubmitHookEvent<TOptions>,
	TOptions
>;

/** PreCompact hook definition */
export type PreCompactHookDefinition<TOptions> = HookDefinition<
	PreCompactEvent,
	PreCompactOutput,
	import("./index.js").PreCompactHookEvent<TOptions>,
	TOptions
>;

/** Notification hook definition */
export type NotificationHookDefinition<TOptions> = HookDefinition<
	NotificationEvent,
	NotificationOutput,
	import("./index.js").NotificationHookEvent<TOptions>,
	TOptions
>;

/** PermissionRequest hook definition */
export type PermissionRequestHookDefinition<TOptions> = HookDefinition<
	PermissionRequestEvent,
	PermissionRequestOutput,
	import("./index.js").PermissionRequestHookEvent<TOptions>,
	TOptions
>;

// =============================================================================
// HOOKS MAP TYPE
// =============================================================================

/**
 * Map of hook event types to their definitions.
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
// PLUGIN CONFIGURATION
// =============================================================================

/**
 * Command configuration for CLI commands (legacy format).
 * @deprecated Use CommandDefinition with args schema instead
 */
export interface CommandConfig {
	/** Command name used in CLI */
	name: string;
	/** Import path relative to plugin root */
	path: string;
	/** Description shown in help text */
	description?: string;
}

// =============================================================================
// COMMAND PIPELINE TYPES
// =============================================================================

/**
 * Command definition with Zod argument schema for declarative command definitions.
 *
 * @template TArgs - Zod schema type for command arguments
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
 */
export interface CommandDefinition<TArgs extends z.ZodType = z.ZodType> {
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
 * @template TArgs - Validated argument type from Zod schema
 * @template TOptions - Validated options from plugin schema (Layer 2)
 * @template TState - Computed variables from setup function (Layer 3)
 *
 * @example
 * ```ts
 * const handler: Commands["lint"] = async ({ args, options, env }) => {
 *   // args: { path: string, fix: boolean } - validated from CLI
 *   // options: { AUTO_ALLOW_ENABLED: boolean, ... } - from schema
 *   // env: { projectDir, pluginDir, packageManager, ... } - base + state
 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
 * };
 * ```
 */
export interface CommandContext<TArgs, TOptions, TState = Record<string, unknown>> {
	/** Validated command arguments from CLI */
	args: TArgs;
	/** Validated options from plugin schema */
	options: TOptions;
	/** Environment: base paths + state from setup() */
	env: PluginEnv<TState>;
}

/**
 * Command handler function signature.
 *
 * @template TArgs - Validated argument type from Zod schema
 * @template TOptions - Validated options from plugin schema
 * @template TState - State from setup function
 */
export type CommandHandler<TArgs, TOptions, TState = Record<string, unknown>> = (
	ctx: CommandContext<TArgs, TOptions, TState>,
) => CommandOutput | Promise<CommandOutput>;

/**
 * Command output structure returned by command handlers.
 * Commands output markdown for LLM consumption.
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
 */
export type CommandsMap = Record<string, CommandDefinition>;

/**
 * Base environment values provided to setup and handlers.
 * These are the core paths that the pipeline provides automatically.
 *
 * Persisted as:
 * - {prefix}_PROJECT_DIR
 * - {prefix}_PLUGIN_DIR
 * - {prefix}_PLUGIN_ENV_FILE
 */
export interface BaseEnv {
	/** Project directory (from CLAUDE_PROJECT_DIR or cwd) */
	readonly projectDir: string;
	/** Plugin root directory (from CLAUDE_PLUGIN_ROOT) */
	readonly pluginDir: string;
	/** Path to the session env file (from CLAUDE_ENV_FILE) */
	readonly pluginEnvFile: string;

	// Logger methods (bound from ClaudeBinaryPluginEnv instance)
	/** Log at INFO level */
	log(message: string, ...args: unknown[]): void;
	/** Log at INFO level (alias for log) */
	info(message: string, ...args: unknown[]): void;
	/** Log at DEBUG level */
	debug(message: string, ...args: unknown[]): void;
}

/**
 * Context passed to the setup function during SessionStart.
 */
export interface SetupContext<TOptions> {
	/** Validated options from the schema (with defaults applied) */
	options: TOptions;
	/** Current working directory from the session event */
	cwd: string;
	/** Session ID from Claude Code */
	sessionId: string;
	/** Base environment paths (projectDir, pluginDir, pluginEnvFile) */
	env: BaseEnv;
}

/**
 * Setup function for computing derived environment variables.
 * Runs during SessionStart after options are validated.
 *
 * @template TOptions - Validated options type from schema
 * @template TState - Return type with specific computed variable names
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
 */
type ExtractSetupReturn<T> = T extends (ctx: SetupContext<infer _TOptions>) => Promise<infer R>
	? R
	: T extends (ctx: SetupContext<infer _TOptions>) => infer R
		? R
		: Record<string, unknown>;

/**
 * Plugin configuration options.
 *
 * @template TEnv - Zod schema type for environment validation
 * @template TSetup - Setup function type (used to infer computed vars)
 * @template TCommands - Map of command names to their definitions
 */
export interface PluginConfig<
	TEnv extends z.ZodType,
	// Use function type constraint directly to avoid default type parameter issues
	TSetup extends ((ctx: SetupContext<z.infer<TEnv>>) => unknown) | undefined = undefined,
	TCommands extends Record<string, CommandDefinition> = Record<string, never>,
> {
	/**
	 * Environment variable prefix for this plugin.
	 * All env vars will be prefixed with this value.
	 * @example "SAVVY_WORKFLOW" -> SAVVY_WORKFLOW_DEBUG
	 */
	prefix: string;

	/**
	 * Zod schema for plugin environment variables.
	 * These are validated at startup and injected into handlers.
	 */
	schema: TEnv;

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
	hooks: HooksMap<z.infer<TEnv>>;

	/**
	 * Command definitions with typed argument schemas.
	 * Commands receive { args, options, computed } context.
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
	 * @default false
	 */
	bytecode?: boolean;

	/**
	 * Whether to persist to local cache after build.
	 * @default true
	 */
	persistLocal?: boolean;

	/**
	 * Whether to compile to standalone binary.
	 * @default true
	 */
	compile?: boolean;

	/**
	 * Whether to minify output.
	 * @default true
	 */
	minify?: boolean;

	/**
	 * Whether to embed sourcemaps.
	 * @default true
	 */
	sourcemap?: boolean;

	/**
	 * Output path for generated hooks.json file.
	 * Relative to the plugin root directory.
	 * @default "hooks/hooks.json"
	 */
	hooksOutputPath?: string;
}

/**
 * Compiled plugin ready for building.
 *
 * @template TEnv - Zod schema type
 * @template TSetup - Setup function type (preserves return type for inference)
 * @template TCommands - Map of command names to their definitions
 */
export interface CompiledPlugin<
	TEnv extends z.ZodType,
	// Use function type constraint directly to avoid default type parameter issues
	TSetup extends ((ctx: SetupContext<z.infer<TEnv>>) => unknown) | undefined = undefined,
	TCommands extends Record<string, CommandDefinition> = Record<string, never>,
> {
	config: PluginConfig<TEnv, TSetup, TCommands>;
}

// =============================================================================
// PLUGIN FACTORY
// =============================================================================

/**
 * Factory for creating Claude Code plugins with declarative hook definitions.
 *
 * @example
 * ```ts
 * export default ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   schema: z.object({
 *     DEBUG: z.boolean().default(false),
 *   }),
 *   hooks: {
 *     SessionStart: [{
 *       name: "project-context",
 *       pipeline: async ({ input, env }) => {
 *         return { additionalContext: "Hello from plugin!" };
 *       }
 *     }],
 *     PreToolUse: [{
 *       name: "security-check",
 *       tools: ["Bash", "Write"],
 *       pipeline: ({ input, env }) => {
 *         if (input.tool_input.command?.includes("rm -rf")) {
 *           return { permissionDecision: "deny", reason: "Dangerous command" };
 *         }
 *         return { permissionDecision: "allow" };
 *       }
 *     }],
 *   }
 * });
 * ```
 */
export const ClaudeBinaryPlugin = {
	/**
	 * Create a new plugin configuration.
	 * This returns a config object that can be used by the builder.
	 *
	 * @template TEnv - Zod schema type
	 * @template TSetup - Setup function type (inferred from config.setup)
	 * @template TCommands - Map of command names to their definitions
	 */
	create<
		TEnv extends z.ZodType,
		TSetup extends ((ctx: SetupContext<z.infer<TEnv>>) => unknown) | undefined = undefined,
		TCommands extends Record<string, CommandDefinition> = Record<string, never>,
	>(config: PluginConfig<TEnv, TSetup, TCommands>): CompiledPlugin<TEnv, TSetup, TCommands> {
		return { config };
	},
};

// =============================================================================
// TYPE INFERENCE UTILITIES (Zod-like pattern)
// =============================================================================

/**
 * Namespace for type inference utilities.
 * Merges with the ClaudeBinaryPlugin const to enable Zod-like patterns.
 *
 * @example
 * ```ts
 * // In plugin.ts
 * const plugin = ClaudeBinaryPlugin.create({
 *   prefix: "MY_PLUGIN",
 *   schema: z.object({ DEBUG: z.boolean().default(false) }),
 *   hooks: { ... }
 * });
 *
 * export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
 * export default plugin;
 *
 * // In hooks/my-hook.hook.ts
 * import type { Pipeline } from "../plugin.js";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input, options, computed }) => {
 *   // input, options, and computed are fully typed!
 *   return { permissionDecision: "allow" };
 * };
 * export default handler;
 * ```
 */
export namespace ClaudeBinaryPlugin {
	/**
	 * Extract the inferred Options type from a CompiledPlugin.
	 *
	 * @example
	 * ```ts
	 * type Options = ClaudeBinaryPlugin.InferOptions<typeof plugin>;
	 * ```
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Need any to match CompiledPlugin with any setup/commands
	export type InferOptions<T> = T extends CompiledPlugin<infer TSchema, any, any> ? z.infer<TSchema> : never;

	/**
	 * Extract the inferred State type from a CompiledPlugin's setup function.
	 * State is merged with BaseEnv to form the full PluginEnv passed to handlers.
	 *
	 * @example
	 * ```ts
	 * type State = ClaudeBinaryPlugin.InferState<typeof plugin>;
	 * // { packageManager: string; typeChecker: string; ... }
	 * ```
	 */
	export type InferState<T> =
		// biome-ignore lint/suspicious/noExplicitAny: Need any to match CompiledPlugin with any commands
		T extends CompiledPlugin<infer _TSchema, infer TSetup, any>
			? TSetup extends undefined
				? Record<string, unknown>
				: ExtractSetupReturn<TSetup>
			: Record<string, unknown>;

	/**
	 * @deprecated Use InferOptions instead
	 */
	export type InferEnv<T> = InferOptions<T>;

	/**
	 * Infer all pipeline and handler types from a plugin.
	 * Returns an interface with typed handlers for each hook event.
	 *
	 * @example
	 * ```ts
	 * export type Pipeline = ClaudeBinaryPlugin.InferPipeline<typeof plugin>;
	 *
	 * // Pipeline handlers (pure transformation)
	 * const handler: Pipeline["PreToolUse"] = ({ input, options, env }) => { ... };
	 *
	 * // Raw handlers (full event access)
	 * const handler: Pipeline["PreToolUseRaw"] = ({ event, options, env }) => { ... };
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
	 * Extract the commands map from a CompiledPlugin.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Need any to match CompiledPlugin with any type parameters
	export type InferCommandsMap<T> = T extends CompiledPlugin<any, any, infer TCommands> ? TCommands : never;

	/**
	 * Infer command handler types from a plugin.
	 * Returns an interface with typed handlers for each command.
	 *
	 * @example
	 * ```ts
	 * export type Commands = ClaudeBinaryPlugin.InferCommands<typeof plugin>;
	 *
	 * // In commands/lint.cmd.ts
	 * const handler: Commands["lint"] = async ({ args, options, env }) => {
	 *   // args, options, and env are fully typed!
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

// =============================================================================
// HELPER FUNCTIONS FOR BUILDER
// =============================================================================

/**
 * Check if a hook definition uses pipeline mode.
 */
export function isPipelineHook<TInput, TOutput, TEvent, TOptions, TState = Record<string, string>>(
	hook: HookDefinition<TInput, TOutput, TEvent, TOptions, TState>,
): hook is PipelineHookDefinition<TInput, TOutput, TOptions> {
	return "pipeline" in hook && hook.pipeline !== undefined;
}

/**
 * Check if a hook definition uses raw handler mode.
 */
export function isRawHook<TInput, TOutput, TEvent, TOptions, TState = Record<string, string>>(
	hook: HookDefinition<TInput, TOutput, TEvent, TOptions, TState>,
): hook is RawHookDefinition<TEvent, TOptions, TState> {
	return "handler" in hook && hook.handler !== undefined;
}

/**
 * Get the output schema for a hook event type.
 */
export function getOutputSchema(hookType: keyof typeof OutputSchemas): z.ZodType {
	return OutputSchemas[hookType];
}
