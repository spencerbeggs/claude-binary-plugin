// =============================================================================
// STATE TYPES
// =============================================================================

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
