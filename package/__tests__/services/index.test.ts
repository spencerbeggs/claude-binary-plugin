import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { OtelConfigError } from "../../src/errors/OtelConfigError.js";
import { SidecarError } from "../../src/errors/SidecarError.js";
import { EnvLoaderLive } from "../../src/layers/EnvLoaderLive.js";
import { EnvLoaderTest } from "../../src/layers/EnvLoaderTest.js";
import { EnvWriterLive } from "../../src/layers/EnvWriterLive.js";
import { makeEnvWriterTest } from "../../src/layers/EnvWriterTest.js";
import { OtelConfigLive } from "../../src/layers/OtelConfigLive.js";
import { makeOtelConfigTest } from "../../src/layers/OtelConfigTest.js";
import { PluginLive } from "../../src/layers/PluginLive.js";
import { SchemaValidatorLive } from "../../src/layers/SchemaValidatorLive.js";
import { SessionStoreLive } from "../../src/layers/SessionStoreLive.js";
import { makeSessionStoreTest } from "../../src/layers/SessionStoreTest.js";
import { ShellExecutorLive } from "../../src/layers/ShellExecutorLive.js";
import { makeShellExecutorTest } from "../../src/layers/ShellExecutorTest.js";
import { makeSidecarConnectionTest } from "../../src/layers/SidecarConnectionTest.js";
import { StdinReaderLive } from "../../src/layers/StdinReaderLive.js";
import { makeStdinReaderTest } from "../../src/layers/StdinReaderTest.js";
import { TelemetryLive, withErrorTelemetry } from "../../src/layers/TelemetryLive.js";
import { makeTelemetryTest } from "../../src/layers/TelemetryTest.js";
import { EnvLoader } from "../../src/services/EnvLoader.js";
import { EnvWriter } from "../../src/services/EnvWriter.js";
import { OtelConfig } from "../../src/services/OtelConfig.js";
import { SchemaValidator } from "../../src/services/SchemaValidator.js";
import { SessionStore } from "../../src/services/SessionStore.js";
import { ShellExecutor } from "../../src/services/ShellExecutor.js";
import { StdinReader } from "../../src/services/StdinReader.js";
import { Telemetry } from "../../src/services/Telemetry.js";

// =============================================================================
// Service Tags
// =============================================================================

describe("Service Tags", () => {
	test("all service tags are defined", () => {
		expect(StdinReader).toBeDefined();
		expect(SchemaValidator).toBeDefined();
		expect(EnvLoader).toBeDefined();
		expect(EnvWriter).toBeDefined();
		expect(SessionStore).toBeDefined();
		expect(Telemetry).toBeDefined();
		expect(ShellExecutor).toBeDefined();
		expect(OtelConfig).toBeDefined();
	});
});

// =============================================================================
// Live Layers — constructability
// =============================================================================

describe("Live Layers", () => {
	test("all Live layers are defined", () => {
		expect(StdinReaderLive).toBeDefined();
		expect(SchemaValidatorLive).toBeDefined();
		expect(EnvLoaderLive).toBeDefined();
		expect(EnvWriterLive).toBeDefined();
		expect(SessionStoreLive).toBeDefined();
		expect(TelemetryLive).toBeDefined();
		expect(ShellExecutorLive).toBeDefined();
		expect(OtelConfigLive).toBeDefined();
	});

	test("PluginLive is defined and composed from all services", () => {
		expect(PluginLive).toBeDefined();
	});
});

// =============================================================================
// Error Types
// =============================================================================

describe("Error Types", () => {
	test("SidecarError is a tagged error", () => {
		const err = new SidecarError({ stage: "connect", message: "failed" });
		expect(err._tag).toBe("SidecarError");
		expect(err.stage).toBe("connect");
		expect(err.message).toBe("failed");
	});

	test("OtelConfigError is a tagged error", () => {
		const err = new OtelConfigError({ message: "bad config", variable: "OTEL_EXPORTER_OTLP_ENDPOINT" });
		expect(err._tag).toBe("OtelConfigError");
		expect(err.message).toBe("bad config");
		expect(err.variable).toBe("OTEL_EXPORTER_OTLP_ENDPOINT");
	});
});

// =============================================================================
// OtelConfig Service
// =============================================================================

describe("OtelConfig", () => {
	test("makeOtelConfigTest returns disabled config by default", async () => {
		const { config, layer } = makeOtelConfigTest();
		const program = Effect.map(OtelConfig, (c) => c.enabled);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe(false);
		expect(config.enabled).toBe(false);
	});

	test("makeOtelConfigTest accepts overrides", async () => {
		const { layer } = makeOtelConfigTest({ enabled: true, endpoint: "http://localhost:4318" });
		const program = Effect.map(OtelConfig, (c) => ({ enabled: c.enabled, endpoint: c.endpoint }));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result.enabled).toBe(true);
		expect(result.endpoint).toBe("http://localhost:4318");
	});

	test("OtelConfigLive is defined", () => {
		expect(OtelConfigLive).toBeDefined();
	});
});

// =============================================================================
// SidecarConnection test layer
// =============================================================================

describe("SidecarConnection", () => {
	test("makeSidecarConnectionTest captures messages", () => {
		const { messages, layer } = makeSidecarConnectionTest();
		expect(messages).toHaveLength(0);
		expect(layer).toBeDefined();
	});
});

// =============================================================================
// StdinReader
// =============================================================================

describe("StdinReader", () => {
	test("test layer returns canned input", async () => {
		const program = Effect.flatMap(StdinReader, (s) => s.read());
		const result = await Effect.runPromise(program.pipe(Effect.provide(makeStdinReaderTest("hello world"))));
		expect(result).toBe("hello world");
	});

	test("test layer with JSON input", async () => {
		const json = JSON.stringify({ hook: "PreToolUse" });
		const program = Effect.flatMap(StdinReader, (s) => s.read());
		const result = await Effect.runPromise(program.pipe(Effect.provide(makeStdinReaderTest(json))));
		expect(result).toBe(json);
	});
});

// =============================================================================
// SchemaValidator
// =============================================================================

describe("SchemaValidator", () => {
	const TestSchema = Schema.Struct({ name: Schema.String, age: Schema.Number });

	test("decode valid JSON succeeds", async () => {
		const program = Effect.flatMap(SchemaValidator, (sv) =>
			sv.decode(JSON.stringify({ name: "Alice", age: 30 }), TestSchema),
		);
		const result = await Effect.runPromise(program.pipe(Effect.provide(SchemaValidatorLive)));
		expect(result).toEqual({ name: "Alice", age: 30 });
	});

	test("decode invalid JSON fails with SchemaValidationError", async () => {
		const program = Effect.flatMap(SchemaValidator, (sv) => sv.decode("not json", TestSchema));
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(SchemaValidatorLive)));
		expect(exit._tag).toBe("Failure");
	});

	test("decode valid JSON but wrong schema fails", async () => {
		const program = Effect.flatMap(SchemaValidator, (sv) => sv.decode(JSON.stringify({ name: 123 }), TestSchema));
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(SchemaValidatorLive)));
		expect(exit._tag).toBe("Failure");
	});
});

// =============================================================================
// EnvLoader
// =============================================================================

describe("EnvLoader", () => {
	test("test layer methods are no-ops", async () => {
		const program = Effect.gen(function* () {
			const loader = yield* EnvLoader;
			yield* loader.loadUserEnvFiles("/tmp");
			yield* loader.loadSessionEnvFiles("/tmp");
			yield* loader.loadFromVarsFile("/tmp/vars.env");
		});
		await Effect.runPromise(program.pipe(Effect.provide(EnvLoaderTest)));
	});
});

// =============================================================================
// EnvWriter
// =============================================================================

describe("EnvWriter", () => {
	test("test layer records writes", async () => {
		const { writes, layer } = makeEnvWriterTest();

		const program = Effect.flatMap(EnvWriter, (w) => w.persist({ FOO: "bar", BAZ: "qux" }));
		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(writes).toHaveLength(1);
		expect(writes[0]!.vars).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	test("test layer accumulates multiple writes", async () => {
		const { writes, layer } = makeEnvWriterTest();

		const program = Effect.gen(function* () {
			const w = yield* EnvWriter;
			yield* w.persist({ A: "1" });
			yield* w.persist({ B: "2" });
		});
		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(writes).toHaveLength(2);
	});
});

// =============================================================================
// SessionStore
// =============================================================================

describe("SessionStore", () => {
	test("test layer register and lookup", async () => {
		const { store, layer } = makeSessionStoreTest();
		const sessionId = "550e8400-e29b-41d4-a716-446655440000" as import("../schemas/branded.js").SessionId;

		const program = Effect.gen(function* () {
			const ss = yield* SessionStore;
			yield* ss.register({ sessionId, projectDir: "/tmp/project", sessionEnvDir: "/tmp/sessions/abc" });
			return yield* ss.lookup(sessionId);
		});

		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toBe("/tmp/sessions/abc");
		expect(store.size).toBe(1);
	});

	test("test layer lookup missing session fails", async () => {
		const { layer } = makeSessionStoreTest();
		const sessionId = "00000000-0000-0000-0000-000000000000" as import("../schemas/branded.js").SessionId;

		const program = Effect.flatMap(SessionStore, (ss) => ss.lookup(sessionId));
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));
		expect(exit._tag).toBe("Failure");
	});
});

// =============================================================================
// Telemetry
// =============================================================================

describe("Telemetry", () => {
	test("test layer captures events", async () => {
		const { events, layer } = makeTelemetryTest();

		const data = {
			hookType: "PreToolUse",
			hookName: "security",
			pluginName: "test-plugin",
			pluginVersion: "1.0.0",
			durationMs: 42,
			success: true,
		};

		const program = Effect.flatMap(Telemetry, (t) => t.emitHookExecution(data));
		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(events).toHaveLength(1);
		expect(events[0]!.hookName).toBe("security");
	});

	test("test layer captures errors", async () => {
		const { errors, layer } = makeTelemetryTest();

		const program = Effect.flatMap(Telemetry, (t) => t.emitError(new Error("boom")));
		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(Error);
	});

	test("withErrorTelemetry taps errors", async () => {
		const { errors, layer } = makeTelemetryTest();

		const failing = Effect.fail(new Error("oops"));
		const program = withErrorTelemetry(failing);
		const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));

		expect(exit._tag).toBe("Failure");
		expect(errors).toHaveLength(1);
	});
});

// =============================================================================
// ShellExecutor
// =============================================================================

describe("ShellExecutor", () => {
	test("test layer returns default success", async () => {
		const { commands, layer } = makeShellExecutorTest();

		const program = Effect.flatMap(ShellExecutor, (s) => s.exec("echo hello"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("");
		expect(commands).toEqual(["echo hello"]);
	});

	test("test layer matches patterns", async () => {
		const responses = new Map([["git status", { exitCode: 0, stdout: "clean", stderr: "" }]]);
		const { commands, layer } = makeShellExecutorTest(responses);

		const program = Effect.flatMap(ShellExecutor, (s) => s.exec("git status --short"));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(result.stdout).toBe("clean");
		expect(commands).toEqual(["git status --short"]);
	});

	test("test layer tracks multiple commands", async () => {
		const { commands, layer } = makeShellExecutorTest();

		const program = Effect.gen(function* () {
			const s = yield* ShellExecutor;
			yield* s.exec("cmd1");
			yield* s.exec("cmd2");
			yield* s.exec("cmd3");
		});
		await Effect.runPromise(program.pipe(Effect.provide(layer)));

		expect(commands).toEqual(["cmd1", "cmd2", "cmd3"]);
	});
});
