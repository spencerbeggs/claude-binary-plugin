import { afterEach, beforeEach, describe, test } from "bun:test";
import type { HookEventBase } from "../index.js";
import { HookEventName } from "../index.js";
import type { MockEnvContext } from "../testing/mocks.js";
import { mockEnv } from "../testing/mocks.js";
import { clearSidecarClients } from "./client.js";
import { setPluginInfo } from "./index.js";
import { recordCounter, recordGauge, recordHistogram, recordHookDecision, recordHookExecution } from "./metrics.js";

// Mock HookEventBase for testing
function createMockEvent(overrides: Partial<HookEventBase> = {}): HookEventBase {
	return {
		session_id: "test-session-123",
		hook_event_name: HookEventName.PreToolUse,
		transcript_path: "/tmp/transcript.json",
		cwd: "/test/cwd",
		permission_mode: "default",
		...overrides,
	};
}

describe("metrics", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		// Full isolation - tests only see env vars they explicitly set
		env = mockEnv({});
	});

	afterEach(() => {
		env.restore();
		clearSidecarClients();
	});

	describe("recordHookExecution", () => {
		test("does nothing when OTEL is disabled", () => {
			const event = createMockEvent();

			// Should not throw
			recordHookExecution(event, "test-hook", 100, true);
		});

		test("records successful execution", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookExecution(event, "test-hook", 100, true);
		});

		test("records failed execution", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookExecution(event, "test-hook", 50, false);
		});

		test("respects OTEL_METRICS_INCLUDE_SESSION_ID=false", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			env.set("OTEL_METRICS_INCLUDE_SESSION_ID", "false");
			const event = createMockEvent();

			recordHookExecution(event, "test-hook", 100, true);
		});

		test("includes plugin version when OTEL_METRICS_INCLUDE_PLUGIN_VERSION=true", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			env.set("OTEL_METRICS_INCLUDE_PLUGIN_VERSION", "true");
			setPluginInfo({ name: "test-plugin", version: "1.0.0" });
			const event = createMockEvent();

			recordHookExecution(event, "test-hook", 100, true);
		});

		test("handles OTEL_METRICS_INCLUDE_MARKETPLACE_VERSION flag", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			env.set("OTEL_METRICS_INCLUDE_MARKETPLACE_VERSION", "true");
			// Note: Marketplace version now comes from plugin info, not env vars
			const event = createMockEvent();

			recordHookExecution(event, "test-hook", 100, true);
		});
	});

	describe("recordHookDecision", () => {
		test("does nothing when OTEL is disabled", () => {
			const event = createMockEvent();

			recordHookDecision(event, "test-hook", "allow");
		});

		test("records allow decision", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookDecision(event, "test-hook", "allow", "Write");
		});

		test("records block decision", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookDecision(event, "test-hook", "block", "Bash");
		});

		test("records modify decision", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookDecision(event, "test-hook", "modify", "Edit");
		});

		test("works without tool name", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHookDecision(event, "test-hook", "allow");
		});
	});

	describe("recordCounter", () => {
		test("does nothing when OTEL is disabled", () => {
			const event = createMockEvent();

			recordCounter(event, "custom.counter");
		});

		test("records counter with default value", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordCounter(event, "custom.counter");
		});

		test("records counter with custom value", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordCounter(event, "custom.counter", 5);
		});

		test("records counter with attributes", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordCounter(event, "custom.counter", 1, { "custom.attr": "value" });
		});
	});

	describe("recordHistogram", () => {
		test("does nothing when OTEL is disabled", () => {
			const event = createMockEvent();

			recordHistogram(event, "custom.histogram", 100);
		});

		test("records histogram value", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHistogram(event, "custom.histogram", 100);
		});

		test("records histogram with unit", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHistogram(event, "custom.histogram", 100, "ms");
		});

		test("records histogram with attributes", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordHistogram(event, "custom.histogram", 100, "ms", { "custom.attr": "value" });
		});
	});

	describe("recordGauge", () => {
		test("does nothing when OTEL is disabled", () => {
			const event = createMockEvent();

			recordGauge(event, "custom.gauge", 42);
		});

		test("records gauge value", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordGauge(event, "custom.gauge", 42);
		});

		test("records gauge with attributes", () => {
			env.set("CLAUDE_CODE_ENABLE_TELEMETRY", "1");
			const event = createMockEvent();

			recordGauge(event, "custom.gauge", 42, { "custom.attr": "value" });
		});
	});
});
