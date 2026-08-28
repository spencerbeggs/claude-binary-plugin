import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { makePlatformInfoTest } from "../../src/layers/PlatformInfoTest.js";
import { makeSidecarConnectionTest } from "../../src/layers/SidecarConnectionTest.js";
import { TelemetryLive, withErrorTelemetry } from "../../src/layers/TelemetryLive.js";
import { makeTelemetryTest } from "../../src/layers/TelemetryTest.js";
import {
	OTEL_ATTRS,
	OTEL_EVENT_NAMES,
	OTEL_SCOPE,
	buildErrorEvent,
	buildFatalErrorEvent,
	buildHookExecutionEvent,
} from "../../src/otel/message-builders.js";
import { OtelConfig, OtelConfigData } from "../../src/services/OtelConfig.js";
import { FatalErrorData, HookExecutionData, Telemetry } from "../../src/services/Telemetry.js";

// =============================================================================
// Telemetry Service Interface
// =============================================================================

describe("Telemetry service interface", () => {
	test("new methods exist on Telemetry service", async () => {
		const { layer } = makeTelemetryTest();

		const program = Effect.gen(function* () {
			const t = yield* Telemetry;
			expect(typeof t.emitHookExecution).toBe("function");
			expect(typeof t.emitError).toBe("function");
			expect(typeof t.emitFatalError).toBe("function");
			expect(typeof t.flush).toBe("function");
			expect(t.preconnect).toBeDefined();
		});
		await Effect.runPromise(program.pipe(Effect.provide(layer)));
	});
});

// =============================================================================
// TelemetryTest layer
// =============================================================================

describe("TelemetryTest", () => {
	test("emitFatalError captures to fatalErrors array", async () => {
		const { fatalErrors, layer } = makeTelemetryTest();

		const data = new FatalErrorData({
			hookName: "pre-bash",
			errorType: "uncaughtException",
			errorMessage: "boom",
			errorStack: "Error: boom\n    at test.ts:1",
		});

		const program = Effect.flatMap(Telemetry, (t) => t.emitFatalError(data));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(result).toBe(true);
		expect(fatalErrors).toHaveLength(1);
		expect(fatalErrors[0]!.hookName).toBe("pre-bash");
		expect(fatalErrors[0]!.errorType).toBe("uncaughtException");
	});

	test("preconnect tracks call count", async () => {
		const telemetryTest = makeTelemetryTest();

		const program = Effect.flatMap(Telemetry, (t) => t.preconnect);
		await Effect.runPromise(program.pipe(Effect.provide(telemetryTest.layer)));

		expect(telemetryTest.preconnectCount).toBe(1);
	});

	test("flush tracks call count", async () => {
		const telemetryTest = makeTelemetryTest();

		const program = Effect.flatMap(Telemetry, (t) => t.flush(1000));
		const result = await Effect.runPromise(program.pipe(Effect.provide(telemetryTest.layer)));

		expect(result).toBe(true);
		expect(telemetryTest.flushCount).toBe(1);
	});
});

// =============================================================================
// TelemetryLive with SidecarConnection
// =============================================================================

describe("TelemetryLive", () => {
	const makeEnabledLayer = () => {
		const connTest = makeSidecarConnectionTest();
		const otelConfigLayer = Layer.succeed(OtelConfig, new OtelConfigData({ enabled: true }));
		const platformInfoLayer = makePlatformInfoTest();
		const telemetryLayer = TelemetryLive.pipe(
			Layer.provide(connTest.layer),
			Layer.provide(otelConfigLayer),
			Layer.provide(platformInfoLayer),
		);
		return { connTest, telemetryLayer };
	};

	const makeDisabledLayer = () => {
		const connTest = makeSidecarConnectionTest();
		const otelConfigLayer = Layer.succeed(OtelConfig, new OtelConfigData({ enabled: false }));
		const platformInfoLayer = makePlatformInfoTest();
		const telemetryLayer = TelemetryLive.pipe(
			Layer.provide(connTest.layer),
			Layer.provide(otelConfigLayer),
			Layer.provide(platformInfoLayer),
		);
		return { connTest, telemetryLayer };
	};

	test("emitHookExecution emits event message when enabled", async () => {
		const { connTest, telemetryLayer } = makeEnabledLayer();

		const data = new HookExecutionData({
			hookType: "PreToolUse",
			hookName: "security",
			pluginName: "test-plugin",
			pluginVersion: "1.0.0",
			durationMs: 42,
			success: true,
		});

		const program = Effect.flatMap(Telemetry, (t) => t.emitHookExecution(data));
		await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));

		expect(connTest.messages).toHaveLength(1);
		expect(connTest.messages[0]!.type).toBe("event");
	});

	test("emitError emits event message when enabled", async () => {
		const { connTest, telemetryLayer } = makeEnabledLayer();

		const program = Effect.flatMap(Telemetry, (t) => t.emitError(new Error("test error")));
		await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));

		expect(connTest.messages).toHaveLength(1);
		expect(connTest.messages[0]!.type).toBe("event");
	});

	test("emitFatalError emits and flushes when enabled", async () => {
		const { connTest, telemetryLayer } = makeEnabledLayer();

		const data = new FatalErrorData({
			hookName: "pre-bash",
			errorType: "uncaughtException",
			errorMessage: "fatal boom",
		});

		const program = Effect.flatMap(Telemetry, (t) => t.emitFatalError(data));
		const result = await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));

		expect(result).toBe(true);
		expect(connTest.messages).toHaveLength(1);
	});

	test("preconnect delegates to SidecarConnection when enabled", async () => {
		const { telemetryLayer } = makeEnabledLayer();

		const program = Effect.flatMap(Telemetry, (t) => t.preconnect);
		await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));
		// No error means preconnect succeeded
	});

	test("flush delegates to SidecarConnection when enabled", async () => {
		const { telemetryLayer } = makeEnabledLayer();

		const program = Effect.flatMap(Telemetry, (t) => t.flush(1000));
		const result = await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));

		expect(result).toBe(true);
	});

	test("disabled config produces no-ops for all methods", async () => {
		const { connTest, telemetryLayer } = makeDisabledLayer();

		const program = Effect.gen(function* () {
			const t = yield* Telemetry;

			yield* t.emitHookExecution(
				new HookExecutionData({
					hookType: "PreToolUse",
					hookName: "test",
					pluginName: "p",
					pluginVersion: "1.0.0",
					durationMs: 1,
					success: true,
				}),
			);

			yield* t.emitError(new Error("ignored"));

			const fatalResult = yield* t.emitFatalError(
				new FatalErrorData({
					hookName: "test",
					errorType: "Error",
					errorMessage: "ignored",
				}),
			);
			expect(fatalResult).toBe(false);

			yield* t.preconnect;

			const flushResult = yield* t.flush(100);
			expect(flushResult).toBe(true);
		});

		await Effect.runPromise(program.pipe(Effect.provide(telemetryLayer)));

		// No messages should have been emitted
		expect(connTest.messages).toHaveLength(0);
	});
});

// =============================================================================
// withErrorTelemetry
// =============================================================================

describe("withErrorTelemetry", () => {
	test("taps errors and emits via Telemetry", async () => {
		const { errors, layer } = makeTelemetryTest();

		const failing = Effect.fail(new Error("oops"));
		const program = withErrorTelemetry(failing);
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));

		expect(exit._tag).toBe("Failure");
		expect(errors).toHaveLength(1);
	});

	test("works with effects that have additional requirements", async () => {
		const { errors, layer } = makeTelemetryTest();

		// withErrorTelemetry should accept effects with R | Telemetry
		const failing: Effect.Effect<never, Error, Telemetry> = Effect.fail(new Error("typed"));
		const program = withErrorTelemetry(failing);
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));

		expect(exit._tag).toBe("Failure");
		expect(errors).toHaveLength(1);
	});
});

// =============================================================================
// Message Builders
// =============================================================================

describe("message builders", () => {
	const ctx = { claudeVersion: "1.0.0", terminalType: "iTerm" };

	test("buildHookExecutionEvent produces correct OTEL attributes", () => {
		const data = new HookExecutionData({
			hookType: "PreToolUse",
			hookName: "security",
			pluginName: "test-plugin",
			pluginVersion: "1.0.0",
			durationMs: 42,
			success: true,
			outcome: "allowed",
			summary: "auto-allowed: git status",
		});

		const eventData = buildHookExecutionEvent(data, "session-123", ctx);

		expect(eventData.name).toBe(OTEL_EVENT_NAMES.HOOK_EXECUTION);
		expect(eventData.severity).toBe("info");
		expect(eventData.body).toBe("auto-allowed: git status");
		expect(eventData.attributes![OTEL_ATTRS.SESSION_ID]).toBe("session-123");
		expect(eventData.attributes![OTEL_ATTRS.HOOK_NAME]).toBe("security");
		expect(eventData.attributes![OTEL_ATTRS.HOOK_TYPE]).toBe("PreToolUse");
		expect(eventData.attributes![OTEL_ATTRS.DURATION_MS]).toBe(42);
		expect(eventData.attributes![OTEL_ATTRS.PLUGIN_NAME]).toBe("test-plugin");
		expect(eventData.attributes![OTEL_ATTRS.PLUGIN_VERSION]).toBe("1.0.0");
		expect(eventData.attributes![OTEL_ATTRS.HOOK_OUTCOME]).toBe("allowed");
		expect(eventData.attributes![OTEL_ATTRS.SOURCE]).toBe("hook");
		expect(eventData.scope!.name).toBe(OTEL_SCOPE.NAME);
	});

	test("buildHookExecutionEvent uses fallback body when no summary", () => {
		const data = new HookExecutionData({
			hookType: "PostToolUse",
			hookName: "lint",
			pluginName: "p",
			pluginVersion: "0.1.0",
			durationMs: 10,
			success: false,
		});

		const eventData = buildHookExecutionEvent(data, "s-1", ctx);

		expect(eventData.body).toBe("lint (PostToolUse): failed");
		expect(eventData.severity).toBe("error");
	});

	test("buildErrorEvent produces correct attributes from Error", () => {
		const error = new TypeError("bad input");

		const eventData = buildErrorEvent(error, "session-456", ctx);

		expect(eventData.name).toBe(OTEL_EVENT_NAMES.FATAL_ERROR);
		expect(eventData.severity).toBe("error");
		expect(eventData.attributes![OTEL_ATTRS.ERROR]).toBe("bad input");
		expect(eventData.attributes![OTEL_ATTRS.ERROR_TYPE]).toBe("TypeError");
		expect(eventData.attributes![OTEL_ATTRS.SESSION_ID]).toBe("session-456");
		expect(eventData.body).toContain("Error: bad input");
	});

	test("buildErrorEvent handles non-Error values", () => {
		const eventData = buildErrorEvent("string error", "s-1", ctx);

		expect(eventData.attributes![OTEL_ATTRS.ERROR]).toBe("string error");
		expect(eventData.attributes![OTEL_ATTRS.ERROR_TYPE]).toBe("unknown");
	});

	test("buildFatalErrorEvent produces correct attributes", () => {
		const data = new FatalErrorData({
			hookName: "pre-bash",
			errorType: "uncaughtException",
			errorMessage: "fatal crash",
			errorStack: "Error: fatal crash\n    at main.ts:42",
		});

		const eventData = buildFatalErrorEvent(data, "session-789", ctx);

		expect(eventData.name).toBe(OTEL_EVENT_NAMES.FATAL_ERROR);
		expect(eventData.severity).toBe("fatal");
		expect(eventData.attributes![OTEL_ATTRS.HOOK_NAME]).toBe("pre-bash");
		expect(eventData.attributes![OTEL_ATTRS.ERROR_TYPE]).toBe("uncaughtException");
		expect(eventData.attributes![OTEL_ATTRS.ERROR]).toBe("fatal crash");
		expect(eventData.body).toContain("Fatal error in pre-bash: fatal crash");
		expect(eventData.body).toContain("Stack:");
	});

	test("buildFatalErrorEvent truncates long stack traces", () => {
		const longStack = "x".repeat(2000);
		const data = new FatalErrorData({
			hookName: "test",
			errorType: "Error",
			errorMessage: "boom",
			errorStack: longStack,
		});

		const eventData = buildFatalErrorEvent(data, "s-1", ctx);

		expect(eventData.body!.length).toBeLessThan(2000);
		expect(eventData.body).toContain("(truncated)");
	});

	test("constants are exported correctly", () => {
		expect(OTEL_ATTRS.SESSION_ID).toBe("session.id");
		expect(OTEL_SCOPE.NAME).toBe("systems.savvyweb.claude_code.events");
		expect(OTEL_EVENT_NAMES.HOOK_EXECUTION).toBe("claude_code.hook.execution");
		expect(OTEL_EVENT_NAMES.FATAL_ERROR).toBe("claude_code.hook.fatal_error");
	});
});
