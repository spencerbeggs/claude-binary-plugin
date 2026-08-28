import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import type { PermissionRequestOutput } from "../../src/hooks/PermissionRequest.js";
import { PermissionRequestOutputSchema } from "../../src/hooks/PermissionRequest.js";
import type { PostToolUseOutput } from "../../src/hooks/PostToolUse.js";
import { PostToolUseOutputSchema } from "../../src/hooks/PostToolUse.js";
import type { PreToolUseOutput } from "../../src/hooks/PreToolUse.js";
import { PreToolUseOutputSchema } from "../../src/hooks/PreToolUse.js";
import type { SessionStartOutput } from "../../src/hooks/SessionStart.js";
import { SessionStartOutputSchema } from "../../src/hooks/SessionStart.js";
import type { StopOutput } from "../../src/hooks/Stop.js";
import { StopOutputSchema } from "../../src/hooks/Stop.js";
import { PassthroughOutputSchema } from "../../src/hooks/shared.js";
import type { UserPromptSubmitOutput } from "../../src/hooks/UserPromptSubmit.js";
import { UserPromptSubmitOutputSchema } from "../../src/hooks/UserPromptSubmit.js";
import { TokenMetrics, isHookOutput } from "../../src/types/pipeline.js";

// =============================================================================
// PIPELINE OUTPUT DETECTION
// =============================================================================

describe("isHookOutput", () => {
	test("returns true for pipeline output with status and summary", () => {
		const output = {
			status: "executed",
			action: "allow",
			summary: "allowed: test",
		};
		expect(isHookOutput(output)).toBe(true);
	});

	test("returns false for legacy output (permissionDecision)", () => {
		const output = {
			permissionDecision: "allow",
		};
		expect(isHookOutput(output)).toBe(false);
	});

	test("returns false for legacy output (additionalContext)", () => {
		const output = {
			additionalContext: "some context",
		};
		expect(isHookOutput(output)).toBe(false);
	});

	test("returns false for empty object", () => {
		expect(isHookOutput({})).toBe(false);
	});

	test("returns false for null", () => {
		expect(isHookOutput(null)).toBe(false);
	});

	test("returns false for undefined", () => {
		expect(isHookOutput(undefined)).toBe(false);
	});

	test("returns false for output with only status (missing summary)", () => {
		const output = { status: "executed" };
		expect(isHookOutput(output)).toBe(false);
	});
});

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

describe("PreToolUseOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(PreToolUseOutputSchema);

	test("validates executed/allow output", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed: git status",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/deny output with reason", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "deny",
			summary: "denied: dangerous command",
			reason: "Command would delete files",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/modify output with updatedInput", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "modify",
			summary: "modified: added timeout",
			updatedInput: { command: "git status", timeout: 5000 },
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates skipped output", () => {
		const output: PreToolUseOutput = {
			status: "skipped",
			summary: "skipped: tool not in filter",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates disabled output", () => {
		const output: PreToolUseOutput = {
			status: "disabled",
			summary: "disabled: shellcheck not available",
			reason: "shellcheck binary not found",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates error output", () => {
		const output: PreToolUseOutput = {
			status: "error",
			summary: "error: unexpected failure",
			reason: "Connection timeout",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates output with quality indicators", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed with degraded quality",
			quality: {
				degraded: true,
				degradedReason: "shellcheck unavailable",
			},
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates output with metrics", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "allow",
			summary: "passed linting",
			validation: "passed",
			metrics: {
				issuesFound: 0,
				filesScanned: 5,
			},
		};
		expect(decode(output)).toEqual(output);
	});

	test("rejects executed without action", () => {
		const output = {
			status: "executed",
			summary: "missing action",
		};
		expect(() => decode(output)).toThrow();
	});
});

describe("PostToolUseOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(PostToolUseOutputSchema);

	test("validates executed/block output", () => {
		const output: PostToolUseOutput = {
			status: "executed",
			action: "block",
			summary: "blocked: lint errors",
			reason: "Fix lint errors before continuing",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/context output with claudeContext", () => {
		const output: PostToolUseOutput = {
			status: "executed",
			action: "context",
			summary: "added context",
			claudeContext: "The file contains 100 lines of TypeScript code.",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/none output (passthrough)", () => {
		const output: PostToolUseOutput = {
			status: "executed",
			action: "none",
			summary: "analyzed but no action needed",
		};
		expect(decode(output)).toEqual(output);
	});
});

describe("SessionStartOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(SessionStartOutputSchema);

	test("validates executed/context output", () => {
		const output: SessionStartOutput = {
			status: "executed",
			action: "context",
			summary: "provided project context",
			claudeContext: "This is a TypeScript monorepo using Bun.",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/none output", () => {
		const output: SessionStartOutput = {
			status: "executed",
			action: "none",
			summary: "no context to add",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates disabled output", () => {
		const output: SessionStartOutput = {
			status: "disabled",
			summary: "detection failed",
			reason: "Could not detect package manager",
		};
		expect(decode(output)).toEqual(output);
	});
});

describe("StopOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(StopOutputSchema);

	test("validates executed/block output", () => {
		const output: StopOutput = {
			status: "executed",
			action: "block",
			summary: "blocking stop: tests not run",
			reason: "You must run tests before stopping. Run `bun test` to verify your changes.",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/continue output", () => {
		const output: StopOutput = {
			status: "executed",
			action: "continue",
			summary: "allowing stop: all checks passed",
		};
		expect(decode(output)).toEqual(output);
	});
});

describe("UserPromptSubmitOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(UserPromptSubmitOutputSchema);

	test("validates executed/context output", () => {
		const output: UserPromptSubmitOutput = {
			status: "executed",
			action: "context",
			summary: "added context to prompt",
			claudeContext: "User is working on feature X.",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/block output", () => {
		const output: UserPromptSubmitOutput = {
			status: "executed",
			action: "block",
			summary: "blocked prompt",
			reason: "Please clarify your request.",
		};
		expect(decode(output)).toEqual(output);
	});
});

describe("PermissionRequestOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(PermissionRequestOutputSchema);

	test("validates executed/allow output", () => {
		const output: PermissionRequestOutput = {
			status: "executed",
			action: "allow",
			summary: "allowed: safe command",
		};
		expect(decode(output)).toEqual(output);
	});

	test("validates executed/deny output with interrupt", () => {
		const output: PermissionRequestOutput = {
			status: "executed",
			action: "deny",
			summary: "denied: dangerous command",
			reason: "This command would delete the entire project",
			interrupt: true,
		};
		expect(decode(output)).toEqual(output);
	});
});

describe("PassthroughOutputSchema", () => {
	const decode = Schema.decodeUnknownSync(PassthroughOutputSchema);

	test("validates executed/none output", () => {
		const output = {
			status: "executed" as const,
			action: "none" as const,
			summary: "session ended normally",
		};
		expect(decode(output)).toEqual(output);
	});
});

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

describe("TokenMetrics.estimate", () => {
	test("returns 0 for empty string", () => {
		expect(TokenMetrics.estimate("")).toBe(0);
	});

	test("returns 0 for null", () => {
		expect(TokenMetrics.estimate(null)).toBe(0);
	});

	test("returns 0 for undefined", () => {
		expect(TokenMetrics.estimate(undefined)).toBe(0);
	});

	test("estimates prose at ~4 chars/token", () => {
		const text = "Hello world, this is a test."; // 28 chars
		expect(TokenMetrics.estimate(text)).toBe(7); // ceil(28/4) = 7
	});

	test("estimates code at ~3.5 chars/token", () => {
		const code = "const x = 1;"; // 12 chars
		expect(TokenMetrics.estimate(code, "code")).toBe(4); // ceil(12/3.5) = 4
	});

	test("estimates JSON at ~3 chars/token", () => {
		const json = '{"key":"value"}'; // 15 chars
		expect(TokenMetrics.estimate(json, "json")).toBe(5); // ceil(15/3) = 5
	});

	test("estimates markdown same as prose", () => {
		const md = "# Hello World"; // 13 chars
		expect(TokenMetrics.estimate(md, "markdown")).toBe(4); // ceil(13/4) = 4
	});
});

describe("TokenMetrics.detectContentType", () => {
	test("detects TypeScript files as code", () => {
		expect(TokenMetrics.detectContentType({ file_path: "src/index.ts" })).toBe("code");
	});

	test("detects JavaScript files as code", () => {
		expect(TokenMetrics.detectContentType({ file_path: "lib/utils.js" })).toBe("code");
	});

	test("detects Python files as code", () => {
		expect(TokenMetrics.detectContentType({ file_path: "main.py" })).toBe("code");
	});

	test("detects JSON files as json", () => {
		expect(TokenMetrics.detectContentType({ file_path: "package.json" })).toBe("json");
	});

	test("detects Markdown files as markdown", () => {
		expect(TokenMetrics.detectContentType({ file_path: "README.md" })).toBe("markdown");
	});

	test("detects shell scripts as code", () => {
		expect(TokenMetrics.detectContentType({ file_path: "build.sh" })).toBe("code");
	});

	test("detects YAML as code", () => {
		expect(TokenMetrics.detectContentType({ file_path: "config.yaml" })).toBe("code");
	});

	test("falls back to prose for unknown extensions", () => {
		expect(TokenMetrics.detectContentType({ file_path: "notes.txt" })).toBe("prose");
	});

	test("detects JSON content by leading brace", () => {
		expect(TokenMetrics.detectContentType({ content: '{"key": "value"}' })).toBe("json");
	});

	test("detects JSON array content", () => {
		expect(TokenMetrics.detectContentType({ content: "[1, 2, 3]" })).toBe("json");
	});

	test("file extension takes precedence over content detection", () => {
		// Even though content starts with {, file extension wins
		expect(TokenMetrics.detectContentType({ file_path: "data.py", content: '{"key": "value"}' })).toBe("code");
	});
});

// =============================================================================
// TOKEN METRICS EXTRACTION
// =============================================================================

describe("TokenMetrics.extractFromOutput", () => {
	test("extracts tokens from claudeContext", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "allow",
			summary: "test",
			claudeContext: "This is context for Claude.", // 28 chars
		};
		const metrics = TokenMetrics.extractFromOutput(output);
		expect(metrics.claudeContext).toBe(7); // ceil(28/4)
		expect(metrics.hookTotal).toBe(7);
	});

	test("extracts tokens from userMessage", () => {
		const output: SessionStartOutput = {
			status: "executed",
			action: "context",
			summary: "test",
			userMessage: "Hello user!", // 11 chars
		};
		const metrics = TokenMetrics.extractFromOutput(output);
		expect(metrics.userMessage).toBe(3); // ceil(11/4)
	});

	test("extracts tokens from reason", () => {
		const output: PreToolUseOutput = {
			status: "executed",
			action: "deny",
			summary: "denied",
			reason: "Command is dangerous", // 20 chars
		};
		const metrics = TokenMetrics.extractFromOutput(output);
		expect(metrics.reason).toBe(5); // ceil(20/4)
		expect(metrics.hookTotal).toBe(5);
	});

	test("sums all token fields for hookTotal", () => {
		const output: PostToolUseOutput = {
			status: "executed",
			action: "context",
			summary: "test",
			claudeContext: "Context text here.", // 18 chars = 5 tokens
			userMessage: "For user.", // 9 chars = 3 tokens
			reason: "Reason.", // 7 chars = 2 tokens
		};
		const metrics = TokenMetrics.extractFromOutput(output);
		expect(metrics.claudeContext).toBe(5);
		expect(metrics.userMessage).toBe(3);
		expect(metrics.reason).toBe(2);
		expect(metrics.hookTotal).toBe(10);
	});

	test("returns zeros for output with no text fields", () => {
		const output: PreToolUseOutput = {
			status: "skipped",
			summary: "skipped",
		};
		const metrics = TokenMetrics.extractFromOutput(output);
		expect(metrics.claudeContext).toBe(0);
		expect(metrics.userMessage).toBe(0);
		expect(metrics.reason).toBe(0);
		expect(metrics.hookTotal).toBe(0);
	});
});
