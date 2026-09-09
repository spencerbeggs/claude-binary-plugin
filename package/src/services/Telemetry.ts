import type { Effect } from "effect";
import { Context, Schema } from "effect";

export class HookExecutionData extends Schema.Class<HookExecutionData>("HookExecutionData")({
	hookType: Schema.String,
	hookName: Schema.String,
	pluginName: Schema.String,
	pluginVersion: Schema.String,
	durationMs: Schema.Number,
	success: Schema.Boolean,
	outcome: Schema.optional(Schema.String),
	summary: Schema.optional(Schema.String),
	metrics: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class FatalErrorData extends Schema.Class<FatalErrorData>("FatalErrorData")({
	hookName: Schema.String,
	errorType: Schema.String,
	errorMessage: Schema.String,
	errorStack: Schema.optional(Schema.String),
}) {}

export class Telemetry extends Context.Tag("Telemetry")<
	Telemetry,
	{
		readonly emitHookExecution: (data: HookExecutionData) => Effect.Effect<void>;
		readonly emitError: (error: unknown) => Effect.Effect<void>;
		readonly emitFatalError: (data: FatalErrorData) => Effect.Effect<boolean>;
		readonly preconnect: Effect.Effect<void>;
		readonly flush: (timeoutMs?: number) => Effect.Effect<boolean>;
	}
>() {}
