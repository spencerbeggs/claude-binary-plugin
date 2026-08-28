import { Effect, Layer, Tracer } from "effect";
import type { PlatformContext } from "../otel/message-builders.js";
import { buildErrorEvent, buildFatalErrorEvent, buildHookExecutionEvent } from "../otel/message-builders.js";
import { SidecarSpan } from "../otel/SidecarSpan.js";
import { OtelConfig } from "../services/OtelConfig.js";
import { PlatformInfo } from "../services/PlatformInfo.js";
import { SidecarConnection } from "../services/SidecarConnection.js";
import type { FatalErrorData, HookExecutionData } from "../services/Telemetry.js";
import { Telemetry } from "../services/Telemetry.js";

const TelemetryServiceLive = Layer.effect(
	Telemetry,
	Effect.gen(function* () {
		const conn = yield* SidecarConnection;
		const config = yield* OtelConfig;
		const platformInfo = yield* PlatformInfo;
		const claudeVersion = yield* platformInfo.claudeVersion;
		const ctx: PlatformContext = {
			claudeVersion,
			terminalType: platformInfo.terminalType,
		};

		return {
			emitHookExecution: (data: HookExecutionData) => {
				if (!config.enabled) return Effect.void;
				const eventData = buildHookExecutionEvent(data, "unknown", ctx);
				return conn.emit({
					type: "event",
					sessionId: "unknown",
					data: eventData,
				});
			},

			emitError: (error: unknown) => {
				if (!config.enabled) return Effect.void;
				const eventData = buildErrorEvent(error, "unknown", ctx);
				return conn.emit({
					type: "event",
					sessionId: "unknown",
					data: eventData,
				});
			},

			emitFatalError: (data: FatalErrorData) => {
				if (!config.enabled) return Effect.succeed(false);
				const eventData = buildFatalErrorEvent(data, "unknown", ctx);
				return Effect.flatMap(
					conn.emit({
						type: "event",
						sessionId: "unknown",
						data: eventData,
					}),
					() => conn.flush(500),
				);
			},

			preconnect: config.enabled ? conn.preconnect : Effect.void,

			flush: (timeoutMs?: number) => {
				if (!config.enabled) return Effect.succeed(true);
				return conn.flush(timeoutMs);
			},
		};
	}),
);

/**
 * Scoped layer that installs an Effect Tracer bridging Effect.withSpan to the sidecar IPC.
 * When OTEL is disabled, no tracer is installed (Effect.withSpan becomes a no-op).
 */
const SidecarTracerLive = Layer.scopedDiscard(
	Effect.gen(function* () {
		const conn = yield* SidecarConnection;
		const config = yield* OtelConfig;

		if (!config.enabled) return;

		const sessionId = Bun.env.CLAUDE_SESSION_ID ?? "unknown";

		const sidecarTracer = Tracer.make({
			span: (name, parent, context, links, startTime, kind) => {
				return new SidecarSpan(
					name,
					parent,
					context,
					links,
					startTime,
					kind ?? "internal",
					(msg) => {
						// Fire-and-forget emit
						Effect.runFork(conn.emit(msg).pipe(Effect.ignoreLogged));
					},
					sessionId,
				);
			},
			context: (f, _fiber) => f(),
		});

		yield* Effect.withTracerScoped(sidecarTracer);
	}),
);

/**
 * TelemetryLive provides both the Telemetry service and an Effect Tracer
 * that routes spans through the sidecar IPC connection.
 */
export const TelemetryLive = Layer.merge(TelemetryServiceLive, SidecarTracerLive);

export const withErrorTelemetry = <A, E, R>(effect: Effect.Effect<A, E, R | Telemetry>) =>
	Effect.tapError(effect, (error) => Effect.flatMap(Telemetry, (t) => t.emitError(error)));
