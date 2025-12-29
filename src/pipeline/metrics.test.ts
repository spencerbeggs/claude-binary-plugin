import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TOKEN_BUDGET,
	checkTokenBudget,
	createSessionTokenState,
	detectContentType,
	estimateTokenCount,
	extractAutoMetrics,
	extractTokenMetrics,
	extractToolTokenMetrics,
	getSessionTokenAttributes,
	updateSessionTokens,
} from "./pipeline-metrics.js";
import type { AnyPipelineOutput } from "./pipeline-types.js";

describe("estimateTokenCount", () => {
	test("returns 0 for null/undefined/empty", () => {
		expect(estimateTokenCount(null)).toBe(0);
		expect(estimateTokenCount(undefined)).toBe(0);
		expect(estimateTokenCount("")).toBe(0);
	});

	test("estimates prose with ~4 chars/token", () => {
		const text = "This is a sample text for testing token estimation.";
		const tokens = estimateTokenCount(text, "prose");
		expect(tokens).toBe(Math.ceil(text.length / 4));
	});

	test("estimates markdown with ~4 chars/token", () => {
		const text = "# Heading\n\nSome **bold** text.";
		const tokens = estimateTokenCount(text, "markdown");
		expect(tokens).toBe(Math.ceil(text.length / 4));
	});

	test("estimates code with ~3.5 chars/token", () => {
		const text = "const x = () => { return 42; };";
		const tokens = estimateTokenCount(text, "code");
		expect(tokens).toBe(Math.ceil(text.length / 3.5));
	});

	test("estimates json with ~3 chars/token", () => {
		const text = '{"key": "value", "num": 42}';
		const tokens = estimateTokenCount(text, "json");
		expect(tokens).toBe(Math.ceil(text.length / 3));
	});

	test("defaults to prose estimation for unknown content type", () => {
		const text = "Some random text here.";
		const tokens = estimateTokenCount(text);
		expect(tokens).toBe(Math.ceil(text.length / 4));
	});
});

describe("detectContentType", () => {
	test("detects TypeScript files as code", () => {
		expect(detectContentType({ file_path: "src/index.ts" })).toBe("code");
		expect(detectContentType({ file_path: "component.tsx" })).toBe("code");
	});

	test("detects JavaScript files as code", () => {
		expect(detectContentType({ file_path: "app.js" })).toBe("code");
		expect(detectContentType({ file_path: "component.jsx" })).toBe("code");
	});

	test("detects other programming languages as code", () => {
		expect(detectContentType({ file_path: "main.py" })).toBe("code");
		expect(detectContentType({ file_path: "main.go" })).toBe("code");
		expect(detectContentType({ file_path: "lib.rs" })).toBe("code");
		expect(detectContentType({ file_path: "App.java" })).toBe("code");
		expect(detectContentType({ file_path: "main.c" })).toBe("code");
		expect(detectContentType({ file_path: "main.cpp" })).toBe("code");
		expect(detectContentType({ file_path: "header.h" })).toBe("code");
		expect(detectContentType({ file_path: "app.rb" })).toBe("code");
		expect(detectContentType({ file_path: "index.php" })).toBe("code");
		expect(detectContentType({ file_path: "app.swift" })).toBe("code");
	});

	test("detects JSON files", () => {
		expect(detectContentType({ file_path: "package.json" })).toBe("json");
		expect(detectContentType({ file_path: "tsconfig.jsonc" })).toBe("json");
		expect(detectContentType({ file_path: "config.json5" })).toBe("json");
	});

	test("detects markdown files", () => {
		expect(detectContentType({ file_path: "README.md" })).toBe("markdown");
		expect(detectContentType({ file_path: "docs.mdx" })).toBe("markdown");
		expect(detectContentType({ file_path: "CHANGELOG.markdown" })).toBe("markdown");
	});

	test("detects shell scripts as code", () => {
		expect(detectContentType({ file_path: "build.sh" })).toBe("code");
		expect(detectContentType({ file_path: "setup.bash" })).toBe("code");
		expect(detectContentType({ file_path: "install.zsh" })).toBe("code");
		expect(detectContentType({ file_path: "config.fish" })).toBe("code");
	});

	test("detects config files as code", () => {
		expect(detectContentType({ file_path: "config.yaml" })).toBe("code");
		expect(detectContentType({ file_path: "config.yml" })).toBe("code");
		expect(detectContentType({ file_path: "Cargo.toml" })).toBe("code");
		expect(detectContentType({ file_path: "app.ini" })).toBe("code");
		expect(detectContentType({ file_path: "nginx.conf" })).toBe("code");
	});

	test("detects JSON content by heuristic", () => {
		expect(detectContentType({ content: '{"key": "value"}' })).toBe("json");
		expect(detectContentType({ content: '  {"key": "value"}' })).toBe("json");
		expect(detectContentType({ content: '["item1", "item2"]' })).toBe("json");
		expect(detectContentType({ content: "  [1, 2, 3]" })).toBe("json");
	});

	test("defaults to prose for unknown files", () => {
		expect(detectContentType({ file_path: "document.txt" })).toBe("prose");
		expect(detectContentType({ file_path: "notes" })).toBe("prose");
		expect(detectContentType({})).toBe("prose");
	});

	test("falls back to content heuristic for unknown extensions", () => {
		// .txt is not a known extension, so content heuristic applies
		expect(
			detectContentType({
				file_path: "data.txt",
				content: '{"key": "value"}',
			}),
		).toBe("json");
	});

	test("known extension takes precedence over content", () => {
		// .ts is a known code extension
		expect(
			detectContentType({
				file_path: "config.ts",
				content: '{"key": "value"}',
			}),
		).toBe("code");
	});
});

describe("extractTokenMetrics", () => {
	test("extracts tokens from claudeContext", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "test",
			claudeContext: "Some context for Claude to use.",
		};
		const metrics = extractTokenMetrics(output);
		expect(metrics.claudeContext).toBeGreaterThan(0);
		expect(metrics.hookTotal).toBe(metrics.claudeContext);
	});

	test("extracts tokens from userMessage", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "none",
			summary: "test",
			userMessage: "A message for the user.",
		};
		const metrics = extractTokenMetrics(output);
		expect(metrics.userMessage).toBeGreaterThan(0);
		expect(metrics.hookTotal).toBe(metrics.userMessage);
	});

	test("extracts tokens from reason", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			summary: "test",
			action: "deny",
			reason: "This action is not allowed because of policy.",
		};
		const metrics = extractTokenMetrics(output);
		expect(metrics.reason).toBeGreaterThan(0);
		expect(metrics.hookTotal).toBe(metrics.reason);
	});

	test("sums all token sources", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "deny",
			summary: "test",
			claudeContext: "Context here.",
			userMessage: "User message here.",
			reason: "Reason here.",
		};
		const metrics = extractTokenMetrics(output);
		expect(metrics.hookTotal).toBe(metrics.claudeContext + metrics.userMessage + metrics.reason);
	});

	test("returns zeros for output without text fields", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "test",
		};
		const metrics = extractTokenMetrics(output);
		expect(metrics.claudeContext).toBe(0);
		expect(metrics.userMessage).toBe(0);
		expect(metrics.reason).toBe(0);
		expect(metrics.hookTotal).toBe(0);
	});
});

describe("extractToolTokenMetrics", () => {
	test("extracts file content tokens", () => {
		const event = {
			tool_input: {
				file_path: "src/index.ts",
				content: "const x = 42;\nexport { x };",
			},
		};
		const metrics = extractToolTokenMetrics(event);
		expect(metrics.fileContent).toBeGreaterThan(0);
		expect(metrics.toolInput).toBeGreaterThan(0);
	});

	test("extracts tool response tokens for string response", () => {
		const event = {
			tool_response: "Command completed successfully with output.",
		};
		const metrics = extractToolTokenMetrics(event);
		expect(metrics.toolResponse).toBeGreaterThan(0);
	});

	test("extracts tool response tokens for object response", () => {
		const event = {
			tool_response: { success: true, data: { count: 42 } },
		};
		const metrics = extractToolTokenMetrics(event);
		expect(metrics.toolResponse).toBeGreaterThan(0);
	});

	test("returns empty object for event without tool data", () => {
		const event = {};
		const metrics = extractToolTokenMetrics(event);
		expect(metrics.fileContent).toBeUndefined();
		expect(metrics.toolInput).toBeUndefined();
		expect(metrics.toolResponse).toBeUndefined();
	});
});

describe("extractAutoMetrics", () => {
	test("includes base metrics", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "Test completed",
		};
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", {}, output, 42);

		expect(attrs["hook.duration_ms"]).toBe(42);
		expect(attrs["hook.name"]).toBe("test-hook");
		expect(attrs["hook.type"]).toBe("PreToolUse");
		expect(attrs["hook.status"]).toBe("executed");
		expect(attrs["hook.summary"]).toBe("Test completed");
		expect(attrs["plugin.name"]).toBe("test-plugin");
	});

	test("includes action when present", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			summary: "Allowed",
			action: "allow",
		};
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", {}, output, 10);

		expect(attrs["hook.action"]).toBe("allow");
	});

	test("includes session ID from event", () => {
		const event = { session_id: "session-123" };
		const output: AnyPipelineOutput = { status: "executed", action: "allow", summary: "test" };
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", event, output, 10);

		expect(attrs["session.id"]).toBe("session-123");
	});

	test("includes tool-specific metrics", () => {
		const event = {
			tool_name: "Write",
			tool_use_id: "tool-456",
			tool_input: {
				file_path: "/src/test.ts",
				content: "export const x = 1;",
			},
		};
		const output: AnyPipelineOutput = { status: "executed", action: "allow", summary: "test" };
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", event, output, 10);

		expect(attrs["tool.name"]).toBe("Write");
		expect(attrs["tool.use_id"]).toBe("tool-456");
		expect(attrs["file.path"]).toBe("/src/test.ts");
		expect(attrs["file.extension"]).toBe(".ts");
		expect(attrs["file.content_size_bytes"]).toBe(19);
		expect(attrs["tool.input_size_bytes"]).toBeGreaterThan(0);
		expect(attrs["tool.input_key_count"]).toBe(2);
	});

	test("includes Bash-specific metrics", () => {
		const event = {
			tool_name: "Bash",
			tool_input: {
				command: "npm install --save-dev typescript",
				run_in_background: true,
				timeout: 30000,
			},
		};
		const output: AnyPipelineOutput = { status: "executed", action: "allow", summary: "test" };
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", event, output, 10);

		expect(attrs["bash.command_prefix"]).toBe("npm");
		expect(attrs["bash.is_background"]).toBe(true);
		expect(attrs["bash.timeout_ms"]).toBe(30000);
	});

	test("includes token metrics when present", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "context",
			summary: "test",
			claudeContext: "Context for Claude here.",
		};
		const attrs = extractAutoMetrics("SessionStart", "test-hook", "test-plugin", {}, output, 10);

		expect(attrs["tokens.claude_context"]).toBeGreaterThan(0);
		expect(attrs["tokens.hook_total"]).toBeGreaterThan(0);
	});

	test("includes response flags", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "modify",
			summary: "test",
			claudeContext: "context",
			userMessage: "message",
			updatedInput: { modified: true },
		};
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", {}, output, 10);

		expect(attrs["response.has_claude_context"]).toBe(true);
		expect(attrs["response.has_user_message"]).toBe(true);
		expect(attrs["response.input_modified"]).toBe(true);
	});

	test("includes validation metrics", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "test",
			validation: "passed",
			metrics: {
				issuesFound: 5,
				issuesFixed: 3,
				filesScanned: 10,
				filesWithErrors: 2,
				cacheHit: true,
			},
		};
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", {}, output, 10);

		expect(attrs["validation.result"]).toBe("passed");
		expect(attrs["validation.issues_found"]).toBe(5);
		expect(attrs["validation.issues_fixed"]).toBe(3);
		expect(attrs["validation.files_scanned"]).toBe(10);
		expect(attrs["validation.files_with_errors"]).toBe(2);
		expect(attrs["quality.cache_hit"]).toBe(true);
	});

	test("includes quality metrics", () => {
		const output: AnyPipelineOutput = {
			status: "executed",
			action: "allow",
			summary: "test",
			quality: {
				degraded: true,
				degradedReason: "Timeout exceeded",
				partial: true,
				fallback: true,
			},
		};
		const attrs = extractAutoMetrics("PreToolUse", "test-hook", "test-plugin", {}, output, 10);

		expect(attrs["quality.degraded"]).toBe(true);
		expect(attrs["quality.degraded_reason"]).toBe("Timeout exceeded");
		expect(attrs["quality.partial"]).toBe(true);
		expect(attrs["quality.fallback"]).toBe(true);
	});
});

describe("SessionTokenState", () => {
	test("createSessionTokenState returns initial state", () => {
		const state = createSessionTokenState();

		expect(state.totalContextAdded).toBe(0);
		expect(state.byHook).toEqual({});
		expect(state.byType).toEqual({});
		expect(state.largestSingleContext).toEqual({ hook: "", tokens: 0 });
	});

	test("updateSessionTokens accumulates tokens", () => {
		const state = createSessionTokenState();

		updateSessionTokens(state, "hook-a", "SessionStart", {
			claudeContext: 100,
			userMessage: 0,
			reason: 0,
			hookTotal: 100,
		});

		expect(state.totalContextAdded).toBe(100);
		expect(state.byHook).toHaveProperty("hook-a", 100);
		expect(state.byType).toHaveProperty("SessionStart", 100);
		expect(state.largestSingleContext).toEqual({ hook: "hook-a", tokens: 100 });
	});

	test("updateSessionTokens tracks largest context", () => {
		const state = createSessionTokenState();

		updateSessionTokens(state, "hook-a", "SessionStart", {
			claudeContext: 100,
			userMessage: 0,
			reason: 0,
			hookTotal: 100,
		});
		updateSessionTokens(state, "hook-b", "PreToolUse", {
			claudeContext: 50,
			userMessage: 0,
			reason: 0,
			hookTotal: 50,
		});
		updateSessionTokens(state, "hook-c", "PostToolUse", {
			claudeContext: 200,
			userMessage: 0,
			reason: 0,
			hookTotal: 200,
		});

		expect(state.largestSingleContext).toEqual({ hook: "hook-c", tokens: 200 });
	});

	test("updateSessionTokens aggregates by hook and type", () => {
		const state = createSessionTokenState();

		updateSessionTokens(state, "hook-a", "PreToolUse", {
			claudeContext: 0,
			userMessage: 0,
			reason: 0,
			hookTotal: 50,
		});
		updateSessionTokens(state, "hook-a", "PreToolUse", {
			claudeContext: 0,
			userMessage: 0,
			reason: 0,
			hookTotal: 30,
		});

		expect(state.byHook).toHaveProperty("hook-a", 80);
		expect(state.byType).toHaveProperty("PreToolUse", 80);
		expect(state.totalContextAdded).toBe(80);
	});

	test("getSessionTokenAttributes returns OTEL attributes", () => {
		const state = createSessionTokenState();
		updateSessionTokens(state, "context-hook", "SessionStart", {
			claudeContext: 500,
			userMessage: 0,
			reason: 0,
			hookTotal: 500,
		});
		updateSessionTokens(state, "tool-hook", "PreToolUse", {
			claudeContext: 100,
			userMessage: 0,
			reason: 0,
			hookTotal: 100,
		});

		const attrs = getSessionTokenAttributes(state);

		expect(attrs["session.tokens.total_context_added"]).toBe(600);
		expect(attrs["session.tokens.largest_single_context"]).toBe(500);
		expect(attrs["session.tokens.largest_context_hook"]).toBe("context-hook");
		expect(attrs["session.tokens.by_type.SessionStart"]).toBe(500);
		expect(attrs["session.tokens.by_type.PreToolUse"]).toBe(100);
	});

	test("getSessionTokenAttributes omits largest when zero", () => {
		const state = createSessionTokenState();
		const attrs = getSessionTokenAttributes(state);

		expect(attrs["session.tokens.total_context_added"]).toBe(0);
		expect(attrs["session.tokens.largest_single_context"]).toBeUndefined();
		expect(attrs["session.tokens.largest_context_hook"]).toBeUndefined();
	});
});

describe("checkTokenBudget", () => {
	test("returns ok for low usage", () => {
		const result = checkTokenBudget(50_000); // 25% of 200k
		expect(result.level).toBe("ok");
		expect(result.usagePercent).toBe(25);
	});

	test("returns warning at warning threshold", () => {
		const contextAdded = DEFAULT_TOKEN_BUDGET.contextWindow * DEFAULT_TOKEN_BUDGET.warningThreshold;
		const result = checkTokenBudget(contextAdded);
		expect(result.level).toBe("warning");
		expect(result.usagePercent).toBe(80);
	});

	test("returns critical at critical threshold", () => {
		const contextAdded = DEFAULT_TOKEN_BUDGET.contextWindow * DEFAULT_TOKEN_BUDGET.criticalThreshold;
		const result = checkTokenBudget(contextAdded);
		expect(result.level).toBe("critical");
		expect(result.usagePercent).toBe(95);
	});

	test("uses custom budget", () => {
		const customBudget = {
			contextWindow: 100_000,
			warningThreshold: 0.5,
			criticalThreshold: 0.75,
		};

		expect(checkTokenBudget(40_000, customBudget).level).toBe("ok");
		expect(checkTokenBudget(50_000, customBudget).level).toBe("warning");
		expect(checkTokenBudget(75_000, customBudget).level).toBe("critical");
	});
});
