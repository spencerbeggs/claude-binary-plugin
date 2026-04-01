import type { Effect } from "effect";
import { Context } from "effect";
import type { PluginRuntimeError } from "../errors/PluginRuntimeError.js";
import type { OutcomeTelemetry } from "../outcomes/Outcome.js";

export interface RunResult {
	readonly code: number;
	readonly response: Record<string, unknown>;
	readonly telemetry?: OutcomeTelemetry;
}

/**
 * Configuration for a single hook plugin run.
 * Uses `unknown` for handler/schema/layer types so the service interface
 * stays decoupled from generic constraints — the Live implementation casts as needed.
 * @public
 */
export interface PluginRunConfig<TOptions = unknown, TState = unknown> {
	hookType: string;
	hookName: string;
	pluginName: string;
	pluginVersion: string;
	handler: (ctx: { input: unknown; options: TOptions; state: TState }) => unknown;
	tools?: string[];
	optionsSchema?: unknown;
	stateSchema?: unknown;
	prefix?: string;
	setup?: (ctx: unknown) => unknown;
	handlerLayer?: unknown;
	inputText?: string;
}

/**
 * Effect service tag for the plugin runtime.
 * The Live implementation wires up Effect layers, reads stdin, validates
 * schemas, runs the handler, and returns a RunResult instead of calling
 * process.exit().
 * @public
 */
export class PluginRuntimeService extends Context.Tag("PluginRuntimeService")<
	PluginRuntimeService,
	{
		readonly run: <TOptions, TState>(
			config: PluginRunConfig<TOptions, TState>,
		) => Effect.Effect<RunResult, PluginRuntimeError>;
	}
>() {}
