import type { Effect } from "effect";
import { Schema } from "effect";
import type { ReadonlyDeep } from "type-fest";
import type { PluginBuildResult } from "../build/builder.js";
import type { AnyOutcome } from "../outcomes/types.js";
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
import type { ToolName } from "../schemas/hook-literals.js";
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
} from "../schemas/pipeline-outputs.js";
import type { PluginTester } from "../testing/builder.js";

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
		readonly hooks: HooksMap<unknown>,
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
		hooks: HooksMap<unknown>,
		options: PluginBuildOptions = {},
	): Promise<PluginBuildResult> {
		return new ClaudePlugin(config, hooks).build(options);
	}
}

// =============================================================================
// I/O TYPES
// =============================================================================

/**
 * Standard I/O streams used by hook events.
 * @public
 */
export interface IO {
	stdin: typeof process.stdin;
	stdout: typeof process.stdout;
	stderr: typeof process.stderr;
	/**
	 * Pre-loaded input text, bypasses stdin reading.
	 * Useful for testing without mocking Bun.stdin.
	 */
	inputText?: string;
	/**
	 * Custom exit function, bypasses process.exit().
	 * Useful for testing without terminating the process.
	 */
	exit?: (code: number) => never;
}

/**
 * Options for creating a HookEvent.
 * @public
 */
export interface HookEventOptions<TState = unknown> extends IO {
	/** Name for the debug logger (e.g., "workflow-context", "code-check") */
	name?: string;
	/**
	 * Plugin name for telemetry and debug logging.
	 * Passed explicitly from compiled entrypoint to avoid env var cross-contamination.
	 */
	pluginName?: string;
	/**
	 * Plugin version for telemetry.
	 * Passed explicitly from compiled entrypoint to avoid env var cross-contamination.
	 */
	pluginVersion?: string;
	/**
	 * PluginEnv subclass for type-safe state loading.
	 */
	stateClass: new () => TState;
}

// =============================================================================
// HANDLER TYPES
// =============================================================================

/**
 * Context provided to pipeline handlers.
 *
 * @typeParam TInput - Hook event input type (e.g., PreToolUseEvent)
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed variables from setup function
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
) => TOutput | AnyOutcome | Promise<TOutput | AnyOutcome> | Effect.Effect<TOutput | AnyOutcome>;

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
export type SessionStartHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	SessionStartInput,
	SessionStartPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SessionEnd hooks.
 * @public
 */
export type SessionEndHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
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
export type PreToolUseHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreToolUseInput,
	PreToolUsePipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PostToolUse hooks.
 * @public
 */
export type PostToolUseHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	PostToolUseInput,
	PostToolUsePipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Stop hooks.
 * @public
 */
export type StopHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	StopInput,
	StopPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for SubagentStop hooks.
 * @public
 */
export type SubagentStopHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	SubagentStopInput,
	StopPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	UserPromptSubmitInput,
	UserPromptSubmitPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PreCompact hooks.
 * @public
 */
export type PreCompactHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	PreCompactInput,
	PassthroughPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for Notification hooks.
 * @public
 */
export type NotificationHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	NotificationInput,
	NotificationPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed pipeline handler for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestHandler<TOptions, TState = Record<string, string>> = PipelineHandler<
	PermissionRequestInput,
	PermissionRequestPipelineOutput,
	TOptions,
	TState
>;

/**
 * Typed raw handler for SessionStart hooks.
 * @public
 */
export type SessionStartRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for SessionEnd hooks.
 * @public
 */
export type SessionEndRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for PreToolUse hooks.
 * @public
 */
export type PreToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for PostToolUse hooks.
 * @public
 */
export type PostToolUseRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for Stop hooks.
 * @public
 */
export type StopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for SubagentStop hooks.
 * @public
 */
export type SubagentStopRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for UserPromptSubmit hooks.
 * @public
 */
export type UserPromptSubmitRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	unknown,
	TOptions,
	TState
>;

/**
 * Typed raw handler for PreCompact hooks.
 * @public
 */
export type PreCompactRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for Notification hooks.
 * @public
 */
export type NotificationRawHandler<TOptions, TState = Record<string, string>> = RawHandler<unknown, TOptions, TState>;

/**
 * Typed raw handler for PermissionRequest hooks.
 * @public
 */
export type PermissionRequestRawHandler<TOptions, TState = Record<string, string>> = RawHandler<
	unknown,
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
export interface HandlerHookDefinition<TInput, TOutput, TOptions> extends HookDefinitionBase {
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
export interface HandlerFileHookDefinition extends HookDefinitionBase {
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
	matcher?: string | undefined;
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
	| HandlerHookDefinition<TInput, TOutput, TOptions>
	| HandlerFileHookDefinition
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
	unknown,
	TOptions
>;

/**
 * SessionEnd hook definition
 * @public
 */
export type SessionEndHookDefinition<TOptions> = HookDefinition<
	SessionEndInput,
	SessionEndPipelineOutput,
	unknown,
	TOptions
>;

/**
 * PreToolUse hook definition with tool filter
 * @public
 */
export type PreToolUseHookDefinition<TOptions> = HookDefinition<
	PreToolUseInput,
	PreToolUsePipelineOutput,
	unknown,
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
	unknown,
	TOptions
> &
	ToolFilter;

/**
 * Stop hook definition
 * @public
 */
export type StopHookDefinition<TOptions> = HookDefinition<StopInput, StopPipelineOutput, unknown, TOptions>;

/**
 * SubagentStop hook definition
 * @public
 */
export type SubagentStopHookDefinition<TOptions> = HookDefinition<
	SubagentStopInput,
	SubagentStopPipelineOutput,
	unknown,
	TOptions
>;

/**
 * UserPromptSubmit hook definition
 * @public
 */
export type UserPromptSubmitHookDefinition<TOptions> = HookDefinition<
	UserPromptSubmitInput,
	UserPromptSubmitPipelineOutput,
	unknown,
	TOptions
>;

/**
 * PreCompact hook definition
 * @public
 */
export type PreCompactHookDefinition<TOptions> = HookDefinition<
	PreCompactInput,
	PreCompactPipelineOutput,
	unknown,
	TOptions
>;

/**
 * Notification hook definition
 * @public
 */
export type NotificationHookDefinition<TOptions> = HookDefinition<
	NotificationInput,
	NotificationPipelineOutput,
	unknown,
	TOptions
>;

/**
 * PermissionRequest hook definition
 * @public
 */
export type PermissionRequestHookDefinition<TOptions> = HookDefinition<
	PermissionRequestInput,
	PermissionRequestPipelineOutput,
	unknown,
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
 * Command definition with file path for the handler.
 *
 * @typeParam TArgs - Effect Schema type for command arguments
 *
 * @example
 * ```ts
 * commands: {
 *   lint: {
 *     description: "Fix lint errors across the codebase",
 *     args: Schema.Struct({
 *       path: Schema.optionalWith(Schema.String, { default: () => "." }),
 *       fix: Schema.optionalWith(Schema.Boolean, { default: () => true }),
 *     }),
 *     pipeline: "./commands/lint.cmd.ts",
 *   },
 * }
 * ```
 * @public
 */
export interface CommandFileDefinition<TArgs extends Schema.Schema.Any = Schema.Schema.Any> {
	/** Description shown in help text and to LLM */
	description: string;
	/** Effect Schema for validating CLI arguments */
	args?: TArgs;
	/** Path to handler file (relative to plugin root) */
	pipeline: string;
}

/**
 * Command definition with inline handler function.
 *
 * @typeParam TArgs - Effect Schema type for command arguments
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @example
 * ```ts
 * commands: {
 *   status: {
 *     description: "Show project status",
 *     args: Schema.Struct({}),
 *     pipeline: async ({ state }) => ({
 *       exitCode: 0,
 *       output: `# Status\n\nProject: ${state.projectDir}`,
 *     }),
 *   },
 * }
 * ```
 * @public
 */
export interface CommandInlineDefinition<
	TArgs extends Schema.Schema.Any = Schema.Schema.Any,
	TOptions = unknown,
	TState = Record<string, unknown>,
> {
	/** Description shown in help text and to LLM */
	description: string;
	/** Effect Schema for validating CLI arguments */
	args?: TArgs;
	/** Inline handler function */
	pipeline: CommandHandler<Schema.Schema.Type<TArgs>, TOptions, TState>;
}

/**
 * Command definition - either file path or inline handler.
 *
 * @typeParam TArgs - Effect Schema type for command arguments
 * @typeParam TOptions - Validated options from plugin schema
 * @typeParam TState - Computed state from setup function
 *
 * @example File path (production)
 * ```ts
 * {
 *   description: "Fix lint errors",
 *   args: Schema.Struct({ path: Schema.optionalWith(Schema.String, { default: () => "." }) }),
 *   pipeline: "./commands/lint.cmd.ts",
 * }
 * ```
 *
 * @example Inline handler (testing or simple commands)
 * ```ts
 * {
 *   description: "Show status",
 *   args: Schema.Struct({}),
 *   pipeline: async ({ state }) => ({
 *     exitCode: 0,
 *     output: `Project: ${state.projectDir}`,
 *   }),
 * }
 * ```
 * @public
 */
export type CommandDefinition<
	TArgs extends Schema.Schema.Any = Schema.Schema.Any,
	TOptions = unknown,
	TState = Record<string, unknown>,
> = CommandFileDefinition<TArgs> | CommandInlineDefinition<TArgs, TOptions, TState>;

/**
 * Context provided to command handlers.
 *
 * @typeParam TArgs - Validated argument type from Effect Schema
 * @typeParam TOptions - Validated options from plugin schema (Layer 2)
 * @typeParam TState - Computed variables from setup function (Layer 3)
 *
 * @example
 * ```ts
 * import type { Commands } from "./plugin.config.js";
 *
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
 * @typeParam TArgs - Validated argument type from Effect Schema
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
 * Base command definition structure (for type constraints).
 * Uses union types to allow both file paths and inline handlers.
 * @public
 */
export interface CommandDefinitionBase {
	description: string;
	args?: Schema.Schema.Any;
	/** File path (string) or inline handler function */
	pipeline: string | CommandHandlerFn;
}

/**
 * Generic command handler function type for base constraints.
 * Uses `never` in parameters to allow any specific handler signature via contravariance.
 * @public
 */
export type CommandHandlerFn = (ctx: never) => CommandOutput | Promise<CommandOutput>;

/**
 * Map of command names to their definitions.
 * @public
 */
export type CommandsMap = Record<string, CommandDefinitionBase>;

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
// PLUGIN CLASS (removed - use Plugin() factory instead)
// =============================================================================

// =============================================================================
// PLUGIN() FACTORY
// =============================================================================

/**
 * Configuration object passed to `Plugin()` factory.
 *
 * @typeParam TOptionsSchema - Effect Schema for plugin options validation
 * @typeParam TStateSchema - Optional Effect Schema.Class for typed state
 *
 * @public
 */
export interface PluginDefinition<
	TOptionsSchema extends Schema.Schema.Any,
	TStateSchema extends Schema.Schema.Any | undefined = undefined,
> {
	/** Environment variable prefix. Set automatically by Plugin() factory. */
	prefix?: string;
	options: TOptionsSchema;
	state?: TStateSchema;
	setup?: TStateSchema extends Schema.Schema.Any
		? (
				ctx: SetupContext<Schema.Schema.Type<TOptionsSchema>>,
			) => Schema.Schema.Type<TStateSchema> | Promise<Schema.Schema.Type<TStateSchema>>
		: (
				ctx: SetupContext<Schema.Schema.Type<TOptionsSchema>>,
			) => Record<string, unknown> | Promise<Record<string, unknown>>;
	hooks: HooksMap<Schema.Schema.Type<TOptionsSchema>>;
	commands?: Record<string, CommandDefinitionBase>;
	bytecode?: boolean;
	persistLocal?: boolean;
	compile?: boolean;
	minify?: boolean;
	sourcemap?: boolean;
	hooksOutputPath?: string;
}

/**
 * Describes instances created by `Plugin()`.
 *
 * @typeParam TOptionsSchema - Effect Schema for plugin options validation
 * @typeParam TStateSchema - Optional Effect Schema.Class for typed state
 *
 * @public
 */
export interface ClaudePluginInstance<
	TOptionsSchema extends Schema.Schema.Any,
	TStateSchema extends Schema.Schema.Any | undefined = undefined,
> {
	readonly config: PluginDefinition<TOptionsSchema, TStateSchema>;
	readonly prefix: string;
	build(options?: PluginBuildOptions): Promise<PluginBuildResult>;
	test(): PluginTester<
		Schema.Schema.Type<TOptionsSchema>,
		TStateSchema extends Schema.Schema.Any ? Schema.Schema.Type<TStateSchema> : Record<string, unknown>,
		HooksMap<Schema.Schema.Type<TOptionsSchema>>,
		Record<string, CommandDefinitionBase>
	>;
}

/**
 * Factory that returns an extendable base class constructor for defining Claude Code plugins.
 *
 * @remarks
 * Use `Plugin()` to create a base class, then extend it to define your plugin.
 * This pattern enables class-based extensibility while keeping configuration declarative.
 *
 * @param prefix - Environment variable prefix for this plugin
 * @param definition - Plugin configuration (options, hooks, commands, etc.)
 * @returns A class constructor that can be extended
 *
 * @example
 * ```ts
 * import { Plugin } from "claude-binary-plugin";
 * import { Schema } from "effect";
 *
 * class MyPlugin extends Plugin("MY_PLUGIN", {
 *   options: Schema.Struct({ DEBUG: Schema.Boolean }),
 *   hooks: {
 *     PreToolUse: [{ name: "guard", pipeline: "./hooks/guard.hook.ts" }],
 *   },
 * }) {}
 *
 * export default new MyPlugin();
 * ```
 *
 * @public
 */
export function Plugin<
	TOptionsSchema extends Schema.Schema.Any,
	TStateSchema extends Schema.Schema.Any | undefined = undefined,
>(
	prefix: string,
	definition: PluginDefinition<TOptionsSchema, TStateSchema>,
): new () => ClaudePluginInstance<TOptionsSchema, TStateSchema> {
	const config = { ...definition, prefix };

	class ClaudePluginBase {
		readonly config = config;
		readonly prefix = prefix;

		async build(options: PluginBuildOptions = {}): Promise<PluginBuildResult> {
			const { PluginBuilder } = await import("../build/builder.js");
			// biome-ignore lint/suspicious/noExplicitAny: PluginBuilder.fromConfig uses structural typing
			return PluginBuilder.fromConfig(this as any, options);
		}

		test() {
			// biome-ignore lint/suspicious/noExplicitAny: Runtime creation doesn't need strict types
			const { PluginTester: Tester } = require("../testing/builder.js") as any;
			return new Tester(config);
		}
	}

	return ClaudePluginBase as unknown as new () => ClaudePluginInstance<TOptionsSchema, TStateSchema>;
}

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
// TYPE INFERENCE UTILITIES
// =============================================================================

/**
 * Helper type to resolve a class constructor to its instance type.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
type ResolvePlugin<T> = T extends new () => infer I ? I : T;

/**
 * Extract the options Schema from either:
 * - A PluginConfig subclass with static `options` property (new API)
 * - A ClaudePluginInstance (old Plugin() factory API)
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
export type ExtractOptionsSchema<T> =
	// New API: static options on PluginConfig subclass
	T extends { options: infer S extends Schema.Schema.Any }
		? S
		: // Old API: ClaudePluginInstance<TSchema, ...>
			ResolvePlugin<T> extends ClaudePluginInstance<infer TSchema, any>
			? TSchema
			: never;

/**
 * Extract the state Schema from either:
 * - A PluginConfig subclass with static `state` property (new API)
 * - Falls back to never (old API uses ClaudePluginInstance path in InferPluginState)
 * @public
 */
export type ExtractStateSchema<T> = T extends { state: infer S extends Schema.Schema.Any } ? S : never;

/**
 * Extract the setup function type from either:
 * - A PluginConfig subclass with static `setup` property (new API)
 * - A ClaudePluginInstance (old Plugin() factory API)
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
export type ExtractSetup<T> = T extends { setup: infer F }
	? F
	: ResolvePlugin<T> extends ClaudePluginInstance<any, infer TState>
		? TState extends Schema.Schema.Any
			? (ctx: SetupContext<any>) => Schema.Schema.Type<TState>
			: undefined
		: undefined;

/**
 * Helper type to extract commands map from a ClaudePlugin instance.
 * @public
 */
export type ExtractCommands<T> =
	ResolvePlugin<T> extends { config: { commands?: infer C } }
		? C extends Record<string, CommandDefinitionBase>
			? C
			: Record<string, CommandDefinitionBase>
		: Record<string, CommandDefinitionBase>;

/**
 * Extract the inferred Options type from a plugin configuration.
 *
 * @remarks
 * Extracts the TypeScript type from the plugin's Effect options schema.
 * Works with both the new PluginConfig.extend() API (static `options`)
 * and the old Plugin() factory API (ClaudePluginInstance).
 *
 * @example
 * ```ts
 * // New API
 * type Options = InferPluginOptions<typeof MyConfig>;
 * // Old API
 * type Options = InferPluginOptions<MyPlugin>;
 * ```
 * @public
 */
export type InferPluginOptions<T> =
	ExtractOptionsSchema<T> extends Schema.Schema.Any
		? Schema.Schema.Type<ExtractOptionsSchema<T>>
		: Record<string, unknown>;

/**
 * Extract the inferred State type from a plugin configuration.
 *
 * @remarks
 * Works with both the new PluginConfig.extend() API (static `state`)
 * and the old Plugin() factory API (ClaudePluginInstance).
 * If no state schema is defined, returns `Record<string, unknown>`.
 *
 * @example
 * ```ts
 * // New API
 * type State = InferPluginState<typeof MyConfig>;
 * // Old API
 * type State = InferPluginState<MyPlugin>;
 * ```
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Need any for type matching
export type InferPluginState<T> =
	// New API: static state on PluginConfig subclass
	ExtractStateSchema<T> extends Schema.Schema.Any
		? Schema.Schema.Type<ExtractStateSchema<T>>
		: // Old API: from ClaudePluginInstance
			ResolvePlugin<T> extends ClaudePluginInstance<any, infer TState>
			? TState extends Schema.Schema.Any
				? Schema.Schema.Type<TState>
				: Record<string, unknown>
			: Record<string, unknown>;

/**
 * Infer all pipeline and handler types from a plugin configuration.
 *
 * @remarks
 * Returns an interface with typed handlers for each hook event.
 * This is the primary type for defining hook handlers in plugin projects.
 *
 * The interface includes both pipeline handlers (pure transformation functions)
 * and raw handlers (full event access):
 *
 * - `Pipeline["PreToolUse"]` - Pipeline handler receiving `{ input, options, state }`
 * - `Pipeline["PreToolUseRaw"]` - Raw handler receiving `{ event, options, state }`
 *
 * @example
 * ```ts
 * import { Plugin } from "claude-binary-plugin";
 * import type { InferHandlers } from "claude-binary-plugin";
 *
 * class MyPlugin extends Plugin("MY_PLUGIN", { ... }) {}
 * export type Pipeline = InferHandlers<MyPlugin>;
 * export default new MyPlugin();
 *
 * // In hooks/my-hook.hook.ts
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => {
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

	// =========================================================================
	// Raw handlers (full event access)
	// =========================================================================

	/**
	 * Raw handler for session initialization with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link SessionStartRawHandler}
	 */
	SessionStartRaw: SessionStartRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for session cleanup with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link SessionEndRawHandler}
	 */
	SessionEndRaw: SessionEndRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for tool pre-execution with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link PreToolUseRawHandler}
	 */
	PreToolUseRaw: PreToolUseRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for tool post-execution with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link PostToolUseRawHandler}
	 */
	PostToolUseRaw: PostToolUseRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for agent stop events with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link StopRawHandler}
	 */
	StopRaw: StopRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for subagent stop events with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link SubagentStopRawHandler}
	 */
	SubagentStopRaw: SubagentStopRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for user prompt submission with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link UserPromptSubmitRawHandler}
	 */
	UserPromptSubmitRaw: UserPromptSubmitRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for context compaction with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link PreCompactRawHandler}
	 */
	PreCompactRaw: PreCompactRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for notification events with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link NotificationRawHandler}
	 */
	NotificationRaw: NotificationRawHandler<InferPluginOptions<T>, InferPluginState<T>>;

	/**
	 * Raw handler for permission requests with full event access.
	 * Use when you need direct access to the HookEvent object.
	 * @see {@link PermissionRequestRawHandler}
	 */
	PermissionRequestRaw: PermissionRequestRawHandler<InferPluginOptions<T>, InferPluginState<T>>;
}

/**
 * Infer command handler types from a plugin configuration.
 *
 * @remarks
 * Returns an interface with typed handlers for each command defined in the plugin.
 * Use this to define command handlers with full type safety for args, options, and state.
 *
 * @example
 * ```ts
 * import { Plugin } from "claude-binary-plugin";
 * import type { InferPluginCommands } from "claude-binary-plugin";
 *
 * class MyPlugin extends Plugin("MY_PLUGIN", { ... }) {}
 * export type Commands = InferPluginCommands<MyPlugin>;
 *
 * // In commands/lint.cmd.ts
 * import type { Commands } from "../plugin.config.js";
 *
 * const handler: Commands["lint"] = async ({ args, options, state }) => {
 *   // args, options, and state are fully typed!
 *   return { exitCode: 0, output: "# Results\n\n✅ Passed" };
 * };
 * export default handler;
 * ```
 * @public
 */
export type InferPluginCommands<T> = {
	[K in keyof ExtractCommands<T>]: ExtractCommands<T>[K] extends CommandDefinition<infer TArgs>
		? CommandHandler<Schema.Schema.Type<TArgs>, InferPluginOptions<T>, InferPluginState<T>>
		: never;
};
