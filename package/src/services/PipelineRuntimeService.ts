import type { Effect } from "effect";
import { Context } from "effect";
import type { PipelineError } from "../errors/PipelineError.js";
import type { OutcomeTelemetry } from "../outcomes/Outcome.js";

/**
 * The result returned by PipelineRuntimeService.run().
 * @public
 */
export interface RunResult {
	readonly code: number;
	readonly response: Record<string, unknown>;
	readonly telemetry?: OutcomeTelemetry;
}

/**
 * Configuration for a single hook pipeline run.
 * Uses `unknown` for handler/schema/layer types so the service interface
 * stays decoupled from generic constraints — the Live implementation casts as needed.
 * @public
 */
export interface PipelineRunConfig<TOptions = unknown, TState = unknown> {
	hookType: string;
	hookName: string;
	pluginName: string;
	pluginVersion: string;
	handler: (ctx: { input: unknown; options: TOptions; state: TState }) => unknown;
	stateClass: new (...args: any[]) => unknown;
	tools?: string[];
	optionsSchema?: unknown;
	stateSchema?: unknown;
	setup?: (ctx: unknown) => unknown;
	handlerLayer?: unknown;
	/** Pre-loaded stdin text, primarily for testing. */
	inputText?: string;
}

/**
 * Effect service tag for the pipeline runtime.
 * The Live implementation wires up Effect layers, reads stdin, validates
 * schemas, runs the handler, and returns a RunResult instead of calling
 * process.exit().
 * @public
 */
export class PipelineRuntimeService extends Context.Tag("PipelineRuntimeService")<
	PipelineRuntimeService,
	{
		readonly run: <TOptions, TState>(
			config: PipelineRunConfig<TOptions, TState>,
		) => Effect.Effect<RunResult, PipelineError>;
	}
>() {}
