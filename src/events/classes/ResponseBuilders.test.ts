import { describe, expect, test } from "bun:test";
import {
	HookResponse,
	PermissionRequestResponse,
	PostToolUseResponse,
	PreToolUseResponse,
	SessionStartResponse,
	StopResponse,
	UserPromptSubmitResponse,
} from "./ResponseBuilders.js";

describe("HookResponse", () => {
	test("is exported", () => {
		expect(HookResponse).toBeDefined();
		expect(typeof HookResponse).toBe("function");
	});

	test("summary() sets and getSummary() returns custom summary", () => {
		const r = new HookResponse();
		r.summary("test summary");
		expect(r.getSummary()).toBe("test summary");
	});

	test("continue() sets continue field", () => {
		const r = new HookResponse();
		r.continue(true);
		expect(r.build().continue).toBe(true);
	});

	test("continue() defaults to true when called without args", () => {
		const r = new HookResponse();
		r.continue();
		expect(r.build().continue).toBe(true);
	});

	test("stop() sets continue=false and stopReason", () => {
		const r = new HookResponse();
		r.stop("done");
		const data = r.build();
		expect(data.continue).toBe(false);
		expect(data.stopReason).toBe("done");
	});

	test("suppressOutput() sets suppressOutput", () => {
		const r = new HookResponse();
		r.suppressOutput();
		expect(r.build().suppressOutput).toBe(true);
	});

	test("suppressOutput(false) unsets suppressOutput", () => {
		const r = new HookResponse();
		r.suppressOutput(false);
		expect(r.build().suppressOutput).toBe(false);
	});

	test("systemMessage() sets systemMessage", () => {
		const r = new HookResponse();
		r.systemMessage("warning");
		expect(r.build().systemMessage).toBe("warning");
	});

	test("hookSpecificOutput() sets hook output", () => {
		const r = new HookResponse();
		r.hookSpecificOutput({ foo: "bar" });
		expect(r.build().hookSpecificOutput).toEqual({ foo: "bar" });
	});

	test("block() sets decision and reason", () => {
		const r = new HookResponse();
		r.block("not allowed");
		const data = r.build();
		expect(data.decision).toBe("block");
		expect(data.reason).toBe("not allowed");
	});

	test("toJSON() returns valid JSON string", () => {
		const r = new HookResponse();
		r.block("test");
		const json = r.toJSON();
		const parsed = JSON.parse(json);
		expect(parsed.decision).toBe("block");
		expect(parsed.reason).toBe("test");
	});

	test("fluent chaining returns this", () => {
		const r = new HookResponse();
		const result = r.summary("s").continue(true).suppressOutput().systemMessage("m").block("b");
		expect(result).toBe(r);
	});

	describe("getSummary() auto-generation", () => {
		test("returns 'allowed' for permissionDecision=allow", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "allow" });
			expect(r.getSummary()).toBe("allowed");
		});

		test("returns 'denied: reason' for deny with reason", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "deny", permissionDecisionReason: "unsafe" });
			expect(r.getSummary()).toBe("denied: unsafe");
		});

		test("returns 'denied' for deny without reason", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "deny" });
			expect(r.getSummary()).toBe("denied");
		});

		test("returns 'ask user' for ask decision", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "ask" });
			expect(r.getSummary()).toBe("ask user");
		});

		test("returns 'blocked: reason' for block decision", () => {
			const r = new HookResponse();
			r.block("too risky");
			expect(r.getSummary()).toBe("blocked: too risky");
		});

		test("returns 'blocked: no reason' when block has no reason", () => {
			const r = new HookResponse();
			// Manually set decision without reason
			const data = r.build();
			data.decision = "block";
			expect(r.getSummary()).toBe("blocked: no reason");
		});

		test("returns 'stopped: reason' for continue=false with stopReason", () => {
			const r = new HookResponse();
			r.stop("tests complete");
			expect(r.getSummary()).toBe("stopped: tests complete");
		});

		test("returns 'stopped' for continue=false without stopReason", () => {
			const r = new HookResponse();
			r.continue(false);
			expect(r.getSummary()).toBe("stopped");
		});

		test("returns 'context: ...' for additionalContext", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ additionalContext: "Some context for Claude" });
			expect(r.getSummary()).toBe("context: Some context for Claude");
		});

		test("truncates long additionalContext in summary", () => {
			const r = new HookResponse();
			const longContext = "A".repeat(100);
			r.hookSpecificOutput({ additionalContext: longContext });
			const summary = r.getSummary();
			expect(summary).toContain("...");
			expect(summary.length).toBeLessThan(100);
		});

		test("returns 'completed' as default", () => {
			const r = new HookResponse();
			expect(r.getSummary()).toBe("completed");
		});
	});

	describe("getAdditionalContext()", () => {
		test("returns undefined when no hookSpecificOutput", () => {
			const r = new HookResponse();
			expect(r.getAdditionalContext()).toBeUndefined();
		});

		test("returns undefined when no additionalContext in hookSpecificOutput", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ foo: "bar" });
			expect(r.getAdditionalContext()).toBeUndefined();
		});

		test("returns additionalContext from hookSpecificOutput", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ additionalContext: "project uses bun" });
			expect(r.getAdditionalContext()).toBe("project uses bun");
		});
	});

	describe("outcome() and getOutcome()", () => {
		test("getOutcome() returns undefined by default", () => {
			const r = new HookResponse();
			expect(r.getOutcome()).toBeUndefined();
		});

		test("outcome() sets and getOutcome() retrieves it", () => {
			const r = new HookResponse();
			r.outcome("allowed");
			expect(r.getOutcome()).toBe("allowed");
		});

		test("outcome() returns this for chaining", () => {
			const r = new HookResponse();
			expect(r.outcome("denied")).toBe(r);
		});
	});

	describe("metrics() and metric()", () => {
		test("metrics() merges into existing metrics", () => {
			const r = new HookResponse();
			r.metrics({ filesScanned: 5 });
			r.metrics({ contextTokens: 100 });
			const data = r.getTelemetryData();
			expect(data.metrics).toEqual({ filesScanned: 5, contextTokens: 100 });
		});

		test("metric() sets a single metric key", () => {
			const r = new HookResponse();
			r.metric("durationMs", 42);
			const data = r.getTelemetryData();
			expect(data.metrics).toEqual({ durationMs: 42 });
		});

		test("metrics() returns this for chaining", () => {
			const r = new HookResponse();
			expect(r.metrics({ filesScanned: 1 })).toBe(r);
		});

		test("metric() returns this for chaining", () => {
			const r = new HookResponse();
			expect(r.metric("x", 1)).toBe(r);
		});
	});

	describe("context()", () => {
		test("sets context key-value pairs", () => {
			const r = new HookResponse();
			r.context({ toolName: "Bash", isBackground: true });
			const data = r.getTelemetryData();
			expect(data.context).toEqual({ toolName: "Bash", isBackground: true });
		});

		test("merges into existing context", () => {
			const r = new HookResponse();
			r.context({ toolName: "Bash" });
			r.context({ exitCode: 0 });
			const data = r.getTelemetryData();
			expect(data.context).toEqual({ toolName: "Bash", exitCode: 0 });
		});

		test("returns this for chaining", () => {
			const r = new HookResponse();
			expect(r.context({ a: 1 })).toBe(r);
		});
	});

	describe("getTelemetryData()", () => {
		test("returns empty data for default response", () => {
			const r = new HookResponse();
			const data = r.getTelemetryData();
			expect(data.permissionDecision).toBeUndefined();
			expect(data.permissionDecisionReason).toBeUndefined();
			expect(data.hasUpdatedInput).toBe(false);
			expect(data.decision).toBeUndefined();
			expect(data.reason).toBeUndefined();
			expect(data.outcome).toBeUndefined();
			expect(data.metrics).toBeUndefined();
			expect(data.context).toBeUndefined();
		});

		test("includes permissionDecision from hookSpecificOutput", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "allow" });
			const data = r.getTelemetryData();
			expect(data.permissionDecision).toBe("allow");
		});

		test("includes permissionDecisionReason", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ permissionDecision: "deny", permissionDecisionReason: "blocked" });
			const data = r.getTelemetryData();
			expect(data.permissionDecisionReason).toBe("blocked");
		});

		test("detects updatedInput presence", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ updatedInput: { command: "safe-cmd" } });
			const data = r.getTelemetryData();
			expect(data.hasUpdatedInput).toBe(true);
		});

		test("includes block decision and reason", () => {
			const r = new HookResponse();
			r.block("forbidden");
			const data = r.getTelemetryData();
			expect(data.decision).toBe("block");
			expect(data.reason).toBe("forbidden");
		});

		test("includes outcome when set", () => {
			const r = new HookResponse();
			r.outcome("context_added");
			const data = r.getTelemetryData();
			expect(data.outcome).toBe("context_added");
		});

		test("auto-calculates contextTokens from additionalContext", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ additionalContext: "Some context text for Claude" });
			const data = r.getTelemetryData();
			expect(data.metrics).toBeDefined();
			expect(data.metrics?.contextTokens).toBeGreaterThan(0);
		});

		test("does not override manually set contextTokens", () => {
			const r = new HookResponse();
			r.hookSpecificOutput({ additionalContext: "Some context text" });
			r.metrics({ contextTokens: 999 });
			const data = r.getTelemetryData();
			expect(data.metrics?.contextTokens).toBe(999);
		});

		test("omits metrics when empty", () => {
			const r = new HookResponse();
			expect(r.getTelemetryData().metrics).toBeUndefined();
		});

		test("omits context when empty", () => {
			const r = new HookResponse();
			expect(r.getTelemetryData().context).toBeUndefined();
		});
	});
});

describe("PreToolUseResponse", () => {
	test("is exported", () => {
		expect(PreToolUseResponse).toBeDefined();
		expect(typeof PreToolUseResponse).toBe("function");
	});

	test("allow() sets permissionDecision to allow", () => {
		const r = new PreToolUseResponse();
		r.allow();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.permissionDecision).toBe("allow");
		expect(output.hookEventName).toBe("PreToolUse");
	});

	test("deny() without reason sets permissionDecision to deny", () => {
		const r = new PreToolUseResponse();
		r.deny();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.permissionDecision).toBe("deny");
		expect(output.permissionDecisionReason).toBeUndefined();
	});

	test("deny() with reason sets permissionDecisionReason", () => {
		const r = new PreToolUseResponse();
		r.deny("dangerous command");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.permissionDecision).toBe("deny");
		expect(output.permissionDecisionReason).toBe("dangerous command");
	});

	test("ask() sets permissionDecision to ask", () => {
		const r = new PreToolUseResponse();
		r.ask();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.permissionDecision).toBe("ask");
	});

	test("updateInput() sets updatedInput", () => {
		const r = new PreToolUseResponse();
		r.updateInput({ command: "safe-cmd" });
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.updatedInput).toEqual({ command: "safe-cmd" });
	});

	test("chaining updateInput then allow", () => {
		const r = new PreToolUseResponse();
		r.updateInput({ command: "modified" }).allow();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.permissionDecision).toBe("allow");
		expect(output.updatedInput).toEqual({ command: "modified" });
	});

	test("allow() returns this", () => {
		const r = new PreToolUseResponse();
		expect(r.allow()).toBe(r);
	});

	test("deny() returns this", () => {
		const r = new PreToolUseResponse();
		expect(r.deny()).toBe(r);
	});

	test("ask() returns this", () => {
		const r = new PreToolUseResponse();
		expect(r.ask()).toBe(r);
	});

	test("updateInput() returns this", () => {
		const r = new PreToolUseResponse();
		expect(r.updateInput({})).toBe(r);
	});
});

describe("PostToolUseResponse", () => {
	test("is exported", () => {
		expect(PostToolUseResponse).toBeDefined();
		expect(typeof PostToolUseResponse).toBe("function");
	});

	test("additionalContext() sets context with PostToolUse hookEventName", () => {
		const r = new PostToolUseResponse();
		r.additionalContext("This file was formatted");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.hookEventName).toBe("PostToolUse");
		expect(output.additionalContext).toBe("This file was formatted");
	});

	test("additionalContext() returns this", () => {
		const r = new PostToolUseResponse();
		expect(r.additionalContext("ctx")).toBe(r);
	});
});

describe("SessionStartResponse", () => {
	test("is exported", () => {
		expect(SessionStartResponse).toBeDefined();
		expect(typeof SessionStartResponse).toBe("function");
	});

	test("additionalContext() sets context with SessionStart hookEventName", () => {
		const r = new SessionStartResponse();
		r.additionalContext("# Project Context\nPackage manager: bun");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.hookEventName).toBe("SessionStart");
		expect(output.additionalContext).toBe("# Project Context\nPackage manager: bun");
	});

	test("additionalContext() returns this", () => {
		const r = new SessionStartResponse();
		expect(r.additionalContext("ctx")).toBe(r);
	});
});

describe("StopResponse", () => {
	test("is exported", () => {
		expect(StopResponse).toBeDefined();
		expect(typeof StopResponse).toBe("function");
	});

	test("additionalContext() sets context with Stop hookEventName", () => {
		const r = new StopResponse();
		r.additionalContext("3 tests failing");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.hookEventName).toBe("Stop");
		expect(output.additionalContext).toBe("3 tests failing");
	});

	test("block() + additionalContext() chain works", () => {
		const r = new StopResponse();
		r.block("tests must pass").additionalContext("2 failing tests remain");
		const data = r.build();
		expect(data.decision).toBe("block");
		expect(data.reason).toBe("tests must pass");
		const output = data.hookSpecificOutput as Record<string, unknown>;
		expect(output.additionalContext).toBe("2 failing tests remain");
	});

	test("additionalContext() returns this", () => {
		const r = new StopResponse();
		expect(r.additionalContext("ctx")).toBe(r);
	});
});

describe("UserPromptSubmitResponse", () => {
	test("is exported", () => {
		expect(UserPromptSubmitResponse).toBeDefined();
		expect(typeof UserPromptSubmitResponse).toBe("function");
	});

	test("additionalContext() sets context with UserPromptSubmit hookEventName", () => {
		const r = new UserPromptSubmitResponse();
		r.additionalContext("Branch: main\nLast deploy: 2h ago");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.hookEventName).toBe("UserPromptSubmit");
		expect(output.additionalContext).toBe("Branch: main\nLast deploy: 2h ago");
	});

	test("additionalContext() returns this", () => {
		const r = new UserPromptSubmitResponse();
		expect(r.additionalContext("ctx")).toBe(r);
	});
});

describe("PermissionRequestResponse", () => {
	test("is exported", () => {
		expect(PermissionRequestResponse).toBeDefined();
		expect(typeof PermissionRequestResponse).toBe("function");
	});

	test("allow() sets behavior to allow", () => {
		const r = new PermissionRequestResponse();
		r.allow();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		expect(output.hookEventName).toBe("PermissionRequest");
		const decision = output.decision as Record<string, unknown>;
		expect(decision.behavior).toBe("allow");
	});

	test("deny() sets behavior to deny", () => {
		const r = new PermissionRequestResponse();
		r.deny();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		const decision = output.decision as Record<string, unknown>;
		expect(decision.behavior).toBe("deny");
	});

	test("deny() with message sets message on decision", () => {
		const r = new PermissionRequestResponse();
		r.deny("not allowed");
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		const decision = output.decision as Record<string, unknown>;
		expect(decision.behavior).toBe("deny");
		expect(decision.message).toBe("not allowed");
	});

	test("interrupt() sets interrupt on decision", () => {
		const r = new PermissionRequestResponse();
		r.deny("blocked").interrupt();
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		const decision = output.decision as Record<string, unknown>;
		expect(decision.interrupt).toBe(true);
	});

	test("interrupt(false) sets interrupt to false", () => {
		const r = new PermissionRequestResponse();
		r.deny("blocked").interrupt(false);
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		const decision = output.decision as Record<string, unknown>;
		expect(decision.interrupt).toBe(false);
	});

	test("updateInput() sets updatedInput on decision", () => {
		const r = new PermissionRequestResponse();
		r.allow().updateInput({ command: "safe-cmd", timeout: 30000 });
		const output = r.build().hookSpecificOutput as Record<string, unknown>;
		const decision = output.decision as Record<string, unknown>;
		expect(decision.behavior).toBe("allow");
		expect(decision.updatedInput).toEqual({ command: "safe-cmd", timeout: 30000 });
	});

	test("allow() returns this", () => {
		const r = new PermissionRequestResponse();
		expect(r.allow()).toBe(r);
	});

	test("deny() returns this", () => {
		const r = new PermissionRequestResponse();
		expect(r.deny()).toBe(r);
	});

	test("interrupt() returns this", () => {
		const r = new PermissionRequestResponse();
		expect(r.interrupt()).toBe(r);
	});

	test("updateInput() returns this", () => {
		const r = new PermissionRequestResponse();
		expect(r.updateInput({})).toBe(r);
	});
});
