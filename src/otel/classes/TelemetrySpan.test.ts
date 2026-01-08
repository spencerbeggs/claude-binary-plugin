import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { HookType } from "../../events/enums.js";
import type { HookEventBase } from "../../events/types.js";
import type { MockEnvContext } from "../../testing/mocks.js";
import { mockEnv } from "../../testing/mocks.js";
import { clearSidecarClients } from "./SidecarClient.js";
import { TelemetrySpan } from "./TelemetrySpan.js";

// Mock HookEventBase for testing
function createMockEvent(overrides: Partial<HookEventBase> = {}): HookEventBase {
	return {
		session_id: "test-session-123",
		hook_event_name: HookType.PreToolUse,
		transcript_path: "/tmp/transcript.json",
		cwd: "/test/cwd",
		permission_mode: "default",
		...overrides,
	};
}

describe("TelemetrySpan", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		// Full isolation - tests only see env vars they explicitly set
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
		clearSidecarClients();
	});

	describe("withHookSpan", () => {
		test("executes handler when OTEL is disabled", async () => {
			const event = createMockEvent();
			const handler = mock(async () => "result");

			const result = await TelemetrySpan.withHookSpan(event, "test-span", handler);

			expect(result).toBe("result");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("returns handler result when OTEL is enabled", async () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();
			const handler = mock(async () => "result");

			const result = await TelemetrySpan.withHookSpan(event, "test-span", handler);

			expect(result).toBe("result");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("propagates errors from handler", async () => {
			const event = createMockEvent();
			const error = new Error("test error");
			const handler = mock(async () => {
				throw error;
			});

			await expect(TelemetrySpan.withHookSpan(event, "test-span", handler)).rejects.toThrow("test error");
		});

		test("accepts custom attributes", async () => {
			const event = createMockEvent();
			const handler = mock(async () => "result");

			const result = await TelemetrySpan.withHookSpan(event, "test-span", handler, {
				"custom.attr": "value",
			});

			expect(result).toBe("result");
		});
	});

	describe("instrumentHook", () => {
		test("creates a wrapped handler function", () => {
			const handler = mock(async (_event: HookEventBase) => "result");
			const wrapped = TelemetrySpan.instrumentHook("test-hook", handler);

			expect(typeof wrapped).toBe("function");
		});

		test("wrapped handler calls original handler", async () => {
			const handler = mock(async (_event: HookEventBase) => "result");
			const wrapped = TelemetrySpan.instrumentHook("test-hook", handler);
			const event = createMockEvent();

			const result = await wrapped(event);

			expect(result).toBe("result");
			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith(event);
		});

		test("propagates errors from original handler", async () => {
			const handler = mock(async (_event: HookEventBase) => {
				throw new Error("handler error");
			});
			const wrapped = TelemetrySpan.instrumentHook("test-hook", handler);
			const event = createMockEvent();

			await expect(wrapped(event)).rejects.toThrow("handler error");
		});
	});

	describe("instrumentToolHook", () => {
		test("creates a wrapped handler function for tool hooks", () => {
			const handler = mock(async (_event: HookEventBase & { tool_name: string; tool_input: unknown }) => "result");
			const wrapped = TelemetrySpan.instrumentToolHook("test-tool-hook", handler);

			expect(typeof wrapped).toBe("function");
		});

		test("wrapped handler calls original handler", async () => {
			const handler = mock(async (_event: HookEventBase & { tool_name: string; tool_input: unknown }) => "result");
			const wrapped = TelemetrySpan.instrumentToolHook("test-tool-hook", handler);
			const event = {
				...createMockEvent(),
				tool_name: "Write",
				tool_input: { file_path: "/test/file.ts" },
			};

			const result = await wrapped(event);

			expect(result).toBe("result");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("includes tool input when OTEL_PLUGIN_INCLUDE_TOOL_INPUT is set", async () => {
			env.set("OTEL_PLUGIN_INCLUDE_TOOL_INPUT", "1");
			const handler = mock(async (_event: HookEventBase & { tool_name: string; tool_input: unknown }) => "result");
			const wrapped = TelemetrySpan.instrumentToolHook("test-tool-hook", handler);
			const event = {
				...createMockEvent(),
				tool_name: "Write",
				tool_input: { file_path: "/test/file.ts" },
			};

			const result = await wrapped(event);

			expect(result).toBe("result");
		});

		test("truncates tool input based on OTEL_PLUGIN_MAX_TOOL_INPUT_LENGTH", async () => {
			env.set("OTEL_PLUGIN_INCLUDE_TOOL_INPUT", "1");
			env.set("OTEL_PLUGIN_MAX_TOOL_INPUT_LENGTH", "50");
			const handler = mock(async (_event: HookEventBase & { tool_name: string; tool_input: unknown }) => "result");
			const wrapped = TelemetrySpan.instrumentToolHook("test-tool-hook", handler);
			const event = {
				...createMockEvent(),
				tool_name: "Write",
				tool_input: { file_path: "/very/long/path/to/some/file/that/exceeds/the/limit.ts" },
			};

			const result = await wrapped(event);

			expect(result).toBe("result");
		});
	});

	describe("withChildSpan", () => {
		test("executes handler and returns result", async () => {
			const event = createMockEvent();
			const handler = mock(async () => "child-result");

			const result = await TelemetrySpan.withChildSpan(event, "child-span", handler);

			expect(result).toBe("child-result");
			expect(handler).toHaveBeenCalledTimes(1);
		});

		test("accepts custom attributes", async () => {
			const event = createMockEvent();
			const handler = mock(async () => "result");

			const result = await TelemetrySpan.withChildSpan(event, "child-span", handler, {
				"custom.child.attr": "value",
			});

			expect(result).toBe("result");
		});

		test("propagates errors from handler", async () => {
			const event = createMockEvent();
			const handler = mock(async () => {
				throw new Error("child error");
			});

			await expect(TelemetrySpan.withChildSpan(event, "child-span", handler)).rejects.toThrow("child error");
		});
	});
});
