import type { Effect } from "effect";
import type { AnyOutcome } from "../hooks/types.js";
import type { ToolName } from "../schemas/hook-literals.js";
import type { ReadonlyDeep } from "../types/common.js";
import type { BaseState } from "./state.js";

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
 * Plugin handler: pure transformation function.
 * Returns a validated output, a typed outcome, or throws to indicate error.
 *
 * @typeParam TOutcome - The valid outcome union for this hook type.
 *   Each hook type restricts which outcomes are allowed at compile time.
 *   Extended outcomes (via `Outcome.extend()`) are also accepted since
 *   they structurally extend the base outcome class.
 *
 * @public
 */
export type PluginHandler<
	TInput,
	TOutput,
	TOptions,
	TState = Record<string, unknown>,
	TOutcome extends AnyOutcome = AnyOutcome,
> = (
	ctx: HandlerContext<TInput, TOptions, TState>,
) => TOutput | TOutcome | Promise<TOutput | TOutcome> | Effect.Effect<TOutput | TOutcome>;

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
export interface HandlerHookDefinition<
	TInput,
	TOutput,
	TOptions,
	TState = Record<string, unknown>,
	TOutcome extends AnyOutcome = AnyOutcome,
> extends HookDefinitionBase {
	/** Pure transformation function */
	handler: PluginHandler<TInput, TOutput, TOptions, TState, TOutcome>;
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
	handler?: never;
}

/**
 * Hook definition: either an inline handler function or a passthrough entry.
 * @public
 */
export type HookDefinition<
	TInput,
	TOutput,
	_TEvent,
	TOptions,
	TState = Record<string, unknown>,
	TOutcome extends AnyOutcome = AnyOutcome,
> = HandlerHookDefinition<TInput, TOutput, TOptions, TState, TOutcome> | PassthroughHookEntry;
