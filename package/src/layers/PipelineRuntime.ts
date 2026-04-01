import type { Layer, Schema } from "effect";
import type { PipelineHandler, PluginState, SetupFunction } from "../plugin/config.js";
import type { PluginEnv } from "../services/PluginEnv.js";

/**
 * Union of all hook event type names.
 * @public
 */
export type HookEventType =
	| "PreToolUse"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "StopFailure"
	| "SubagentStart"
	| "SubagentStop"
	| "TaskCreated"
	| "TaskCompleted"
	| "TeammateIdle"
	| "InstructionsLoaded"
	| "ConfigChange"
	| "CwdChanged"
	| "FileChanged"
	| "WorktreeCreate"
	| "WorktreeRemove"
	| "UserPromptSubmit"
	| "PreCompact"
	| "PostCompact"
	| "Elicitation"
	| "ElicitationResult"
	| "Notification"
	| "PermissionRequest";

/**
 * I/O dependencies for pipeline execution.
 * Allows injection for testing without mocking process globals.
 * @public
 */
export interface IODependencies {
	stdin?: NodeJS.ReadableStream;
	stdout?: NodeJS.WritableStream;
	stderr?: NodeJS.WritableStream;
	exit?: (code: number) => never;
	cwd?: () => string;
	/**
	 * Pre-loaded input text, bypasses stdin reading.
	 * Useful for testing without mocking Bun.stdin.
	 */
	inputText?: string;
}

/**
 * Options for running a pipeline hook.
 * @public
 */
export interface PipelineConfig<TOptions = unknown, TState = Record<string, string>> {
	hookType: HookEventType;
	hookName: string;
	pluginName: string;
	pluginVersion: string;
	handler: PipelineHandler<unknown, unknown, TOptions, TState>;
	stateClass: new () => PluginEnv<TOptions>;
	tools?: string[];
	optionsSchema?: Schema.Schema<TOptions, any, never>;
	stateSchema?: Schema.Schema<TState, any, never>;
	setup?: SetupFunction<TOptions>;
	// biome-ignore lint/suspicious/noExplicitAny: Layer type is intentionally broad to accept any service requirements
	handlerLayer?: Layer.Layer<any>;
	io?: IODependencies;
}
