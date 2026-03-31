import { describe, expect, test } from "bun:test";

/**
 * Verify that the public API exports from src/index.ts are accessible.
 * This is a smoke test — it imports key exports and verifies they exist.
 */
describe("Public API exports", () => {
	test("exports Plugin factory", async () => {
		const mod = await import("../src/index.js");
		expect(mod.Plugin).toBeDefined();
		expect(typeof mod.Plugin).toBe("function");
	});

	test("exports error types", async () => {
		const mod = await import("../src/index.js");
		expect(mod.SchemaValidationError).toBeDefined();
		expect(mod.PipelineError).toBeDefined();
		expect(mod.EnvLoadError).toBeDefined();
		expect(mod.EnvPersistError).toBeDefined();
		expect(mod.SessionLookupError).toBeDefined();
		expect(mod.CommandParseError).toBeDefined();
		expect(mod.StdinError).toBeDefined();
		expect(mod.ShellError).toBeDefined();
	});

	test("exports Schema.Class event types", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PreToolUseEvent).toBeDefined();
		expect(mod.PostToolUseEvent).toBeDefined();
		expect(mod.SessionStartEvent).toBeDefined();
		expect(mod.SessionEndEvent).toBeDefined();
		expect(mod.StopEvent).toBeDefined();
		expect(mod.SubagentStopEvent).toBeDefined();
		expect(mod.UserPromptSubmitEvent).toBeDefined();
		expect(mod.PreCompactEvent).toBeDefined();
		expect(mod.NotificationEvent).toBeDefined();
		expect(mod.PermissionRequestEvent).toBeDefined();
	});

	test("exports HookEventSchemas facade", async () => {
		const mod = await import("../src/index.js");
		expect(mod.HookEventSchemas).toBeDefined();
		expect(typeof mod.HookEventSchemas.parse).toBe("function");
		expect(mod.HookEventSchemas.PreToolUse).toBeDefined();
		expect(mod.HookEventSchema).toBeDefined();
	});

	test("exports service tags", async () => {
		const mod = await import("../src/index.js");
		expect(mod.StdinReader).toBeDefined();
		expect(mod.EnvLoader).toBeDefined();
		expect(mod.EnvPersister).toBeDefined();
		expect(mod.SessionStore).toBeDefined();
		expect(mod.Telemetry).toBeDefined();
		expect(mod.CommandRunner).toBeDefined();
	});

	test("exports Live layers", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PipelineLive).toBeDefined();
		expect(mod.StdinReaderLive).toBeDefined();
		expect(mod.EnvLoaderLive).toBeDefined();
		expect(mod.TelemetryLive).toBeDefined();
		expect(mod.SchemaValidatorLive).toBeDefined();
		expect(mod.CommandRunnerLive).toBeDefined();
	});

	test("exports pipeline output schemas", async () => {
		const mod = await import("../src/index.js");
		expect(mod.ExecutionStatusSchema).toBeDefined();
		expect(mod.HookActionSchema).toBeDefined();
		expect(mod.PreToolUseOutputSchema).toBeDefined();
		expect(mod.PostToolUseOutputSchema).toBeDefined();
	});

	test("exports HookType enum", async () => {
		const mod = await import("../src/index.js");
		expect(mod.HookType).toBeDefined();
		expect(mod.HookType.PreToolUse).toBe("PreToolUse");
		expect(mod.HookType.SessionStart).toBe("SessionStart");
	});

	test("exports PluginEnv", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PluginEnv).toBeDefined();
	});

	test("exports PipelineRuntime", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PipelineRuntime).toBeDefined();
	});

	test("exports OtelConfig", async () => {
		const mod = await import("../src/index.js");
		expect(mod.OtelConfig).toBeDefined();
	});

	test("exports PluginBuilder", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PluginBuilder).toBeDefined();
	});

	test("exports makePluginLoggerLive and resolveLogLevel", async () => {
		const mod = await import("../src/index.js");
		expect(mod.makePluginLoggerLive).toBeDefined();
		expect(typeof mod.makePluginLoggerLive).toBe("function");
		expect(mod.resolveLogLevel).toBeDefined();
	});

	test("exports getSchemaMetadata", async () => {
		const mod = await import("../src/index.js");
		expect(mod.getSchemaMetadata).toBeDefined();
		expect(typeof mod.getSchemaMetadata).toBe("function");
	});

	test("exports pipeline utilities", async () => {
		const mod = await import("../src/index.js");
		expect(mod.isPipelineOutput).toBeDefined();
		expect(mod.Pipeline).toBeDefined();
		expect(mod.TokenMetrics).toBeDefined();
	});

	test("exports Input Schema.Classes", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PreToolUseInput).toBeDefined();
		expect(mod.PostToolUseInput).toBeDefined();
		expect(mod.SessionStartInput).toBeDefined();
		expect(mod.SessionEndInput).toBeDefined();
		expect(mod.StopInput).toBeDefined();
		expect(mod.SubagentStopInput).toBeDefined();
		expect(mod.UserPromptSubmitInput).toBeDefined();
		expect(mod.PreCompactInput).toBeDefined();
		expect(mod.NotificationInput).toBeDefined();
		expect(mod.PermissionRequestInput).toBeDefined();
	});

	test("exports Response Schema.Classes", async () => {
		const mod = await import("../src/index.js");
		expect(mod.PreToolUseResponse).toBeDefined();
		expect(mod.PostToolUseResponse).toBeDefined();
		expect(mod.SessionStartResponse).toBeDefined();
		expect(mod.StopResponse).toBeDefined();
		expect(mod.UserPromptSubmitResponse).toBeDefined();
		expect(mod.PermissionRequestResponse).toBeDefined();
		expect(mod.PassthroughResponse).toBeDefined();
	});

	test("exports toResponse functions", async () => {
		const mod = await import("../src/index.js");
		expect(typeof mod.toPreToolUseResponse).toBe("function");
		expect(typeof mod.toPostToolUseResponse).toBe("function");
		expect(typeof mod.toSessionStartResponse).toBe("function");
		expect(typeof mod.toStopResponse).toBe("function");
		expect(typeof mod.toUserPromptSubmitResponse).toBe("function");
		expect(typeof mod.toPermissionRequestResponse).toBe("function");
		expect(typeof mod.toPassthroughResponse).toBe("function");
	});
});

describe("testing.ts exports", () => {
	test("exports test layer factories", async () => {
		const mod = await import("../src/testing.js");
		expect(mod.makeStdinReaderTest).toBeDefined();
		expect(mod.EnvLoaderTest).toBeDefined();
		expect(mod.makeEnvPersisterTest).toBeDefined();
		expect(mod.makeSessionStoreTest).toBeDefined();
		expect(mod.makeTelemetryTest).toBeDefined();
		expect(mod.makeShellExecutorTest).toBeDefined();
		expect(mod.makeCommandRunnerTest).toBeDefined();
		expect(mod.makePluginLoggerTest).toBeDefined();
	});
});
