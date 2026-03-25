import { Effect, Layer } from "effect";
import type { FatalErrorData, HookExecutionData } from "../services/Telemetry.js";
import { Telemetry } from "../services/Telemetry.js";

export const makeTelemetryTest = () => {
	const events: HookExecutionData[] = [];
	const errors: unknown[] = [];
	const fatalErrors: FatalErrorData[] = [];
	let preconnectCount = 0;
	let flushCount = 0;
	const service: Telemetry["Type"] = {
		emitHookExecution: (data) =>
			Effect.sync(() => {
				events.push(data);
			}),
		emitError: (error) =>
			Effect.sync(() => {
				errors.push(error);
			}),
		emitFatalError: (data) =>
			Effect.sync(() => {
				fatalErrors.push(data);
				return true;
			}),
		preconnect: Effect.sync(() => {
			preconnectCount++;
		}),
		flush: () =>
			Effect.sync(() => {
				flushCount++;
				return true;
			}),
	};
	return {
		events,
		errors,
		fatalErrors,
		get preconnectCount() {
			return preconnectCount;
		},
		get flushCount() {
			return flushCount;
		},
		/** The resolved telemetry service object for direct injection into PipelineRuntime */
		service,
		layer: Layer.succeed(Telemetry, service),
	};
};
