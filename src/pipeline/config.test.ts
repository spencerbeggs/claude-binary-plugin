import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ClaudeBinaryPlugin } from "./config.js";
import { Pipeline } from "./pipeline.js";
import type { PreToolUsePipelineOutput, SessionStartPipelineOutput } from "./types.js";
import {
	PostToolUseOutputSchema,
	PreToolUseOutputSchema,
	SessionStartOutputSchema,
	StopOutputSchema,
} from "./types.js";

describe("Pipeline Output Schemas", () => {
	describe("SessionStartOutputSchema", () => {
		test("accepts executed/context output", () => {
			const result = SessionStartOutputSchema.safeParse({
				status: "executed",
				action: "context",
				summary: "provided project context",
				claudeContext: "Project uses TypeScript",
			});
			expect(result.success).toBe(true);
			if (result.success && result.data.status === "executed") {
				expect(result.data.claudeContext).toBe("Project uses TypeScript");
			}
		});

		test("accepts executed/none output (passthrough)", () => {
			const result = SessionStartOutputSchema.safeParse({
				status: "executed",
				action: "none",
				summary: "no context to add",
			});
			expect(result.success).toBe(true);
		});

		test("accepts disabled output", () => {
			const result = SessionStartOutputSchema.safeParse({
				status: "disabled",
				summary: "disabled: detection failed",
			});
			expect(result.success).toBe(true);
		});

		test("rejects executed without action", () => {
			const result = SessionStartOutputSchema.safeParse({
				status: "executed",
				summary: "missing action",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("PreToolUseOutputSchema", () => {
		test("accepts executed/allow output", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "executed",
				action: "allow",
				summary: "allowed: safe command",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/deny output with reason", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "executed",
				action: "deny",
				summary: "denied: dangerous command",
				reason: "Command would delete files",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/ask output", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "executed",
				action: "ask",
				summary: "ask: needs confirmation",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/modify output with updatedInput", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "executed",
				action: "modify",
				summary: "modified: added timeout",
				updatedInput: { timeout: 5000 },
			});
			expect(result.success).toBe(true);
			if (result.success && result.data.status === "executed") {
				expect(result.data.updatedInput).toEqual({ timeout: 5000 });
			}
		});

		test("accepts skipped output", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "skipped",
				summary: "skipped: tool not in filter",
			});
			expect(result.success).toBe(true);
		});

		test("rejects executed without action", () => {
			const result = PreToolUseOutputSchema.safeParse({
				status: "executed",
				summary: "missing action",
			});
			expect(result.success).toBe(false);
		});

		test("rejects missing status", () => {
			const result = PreToolUseOutputSchema.safeParse({
				action: "allow",
				summary: "missing status",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("PostToolUseOutputSchema", () => {
		test("accepts executed/none output (passthrough)", () => {
			const result = PostToolUseOutputSchema.safeParse({
				status: "executed",
				action: "none",
				summary: "no action needed",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/context output", () => {
			const result = PostToolUseOutputSchema.safeParse({
				status: "executed",
				action: "context",
				summary: "added context",
				claudeContext: "File contains sensitive data",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/block output", () => {
			const result = PostToolUseOutputSchema.safeParse({
				status: "executed",
				action: "block",
				summary: "blocked: validation failed",
				reason: "Tool failed validation",
			});
			expect(result.success).toBe(true);
		});

		test("accepts skipped output", () => {
			const result = PostToolUseOutputSchema.safeParse({
				status: "skipped",
				summary: "skipped: not applicable",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("StopOutputSchema", () => {
		test("accepts executed/continue output (passthrough)", () => {
			const result = StopOutputSchema.safeParse({
				status: "executed",
				action: "continue",
				summary: "allowing stop",
			});
			expect(result.success).toBe(true);
		});

		test("accepts executed/block output with reason", () => {
			const result = StopOutputSchema.safeParse({
				status: "executed",
				action: "block",
				summary: "blocking stop",
				reason: "Please run the tests",
			});
			expect(result.success).toBe(true);
		});

		test("accepts skipped output", () => {
			const result = StopOutputSchema.safeParse({
				status: "skipped",
				summary: "skipped: hook not active",
			});
			expect(result.success).toBe(true);
		});
	});
});

describe("ClaudeBinaryPlugin", () => {
	test("create() returns compiled plugin config", () => {
		const envSchema = z.object({
			VERBOSE: z.boolean().default(false),
		});

		const plugin = ClaudeBinaryPlugin.create({
			prefix: "TEST_PLUGIN",
			options: envSchema,
			hooks: {
				SessionStart: [
					{
						name: "test-context",
						pipeline: async (): Promise<SessionStartPipelineOutput> => {
							return {
								status: "executed",
								action: "context",
								summary: "provided context",
								claudeContext: "Test context",
							};
						},
					},
				],
			},
		});

		expect(plugin.config).toBeDefined();
		expect(plugin.config.prefix).toBe("TEST_PLUGIN");
		expect(plugin.config.hooks.SessionStart).toHaveLength(1);
	});

	test("create() accepts multiple hooks per event type", () => {
		const plugin = ClaudeBinaryPlugin.create({
			prefix: "MULTI",
			options: z.object({}),
			hooks: {
				PreToolUse: [
					{
						name: "allowlist",
						tools: ["Bash"],
						pipeline: (): PreToolUsePipelineOutput => ({
							status: "executed",
							action: "allow",
							summary: "allowed: allowlist",
						}),
					},
					{
						name: "security",
						tools: ["Write", "Edit"],
						pipeline: (): PreToolUsePipelineOutput => ({
							status: "executed",
							action: "ask",
							summary: "ask: security check",
						}),
					},
				],
			},
		});

		const hooks = plugin.config.hooks.PreToolUse;
		expect(hooks).toBeDefined();
		expect(hooks).toHaveLength(2);
		const first = hooks?.[0];
		const second = hooks?.[1];
		expect(first?.name).toBe("allowlist");
		expect(second?.name).toBe("security");
	});

	test("create() accepts raw handler mode", () => {
		const plugin = ClaudeBinaryPlugin.create({
			prefix: "RAW",
			options: z.object({}),
			hooks: {
				PreToolUse: [
					{
						name: "raw-handler",
						handler: async (ctx) => {
							// Raw handler has full control
							ctx.event.end(ctx.event.response().allow());
						},
					},
				],
			},
		});

		expect(plugin.config.hooks.PreToolUse).toHaveLength(1);
	});

	test("type safety: pipeline return must match output schema", () => {
		// This is a compile-time test - if types are wrong, this won't compile
		const plugin = ClaudeBinaryPlugin.create({
			prefix: "TYPED",
			options: z.object({}),
			hooks: {
				SessionStart: [
					{
						name: "typed-hook",
						pipeline: (): SessionStartPipelineOutput => {
							// Must return SessionStartPipelineOutput shape
							return {
								status: "executed",
								action: "context",
								summary: "typed context",
								claudeContext: "typed",
							};
						},
					},
				],
				PreToolUse: [
					{
						name: "typed-pretool",
						pipeline: (): PreToolUsePipelineOutput => {
							// Must return PreToolUsePipelineOutput shape
							return {
								status: "executed",
								action: "allow",
								summary: "allowed",
							};
						},
					},
				],
			},
		});

		expect(plugin.config).toBeDefined();
	});
});

describe("Helper functions", () => {
	test("Pipeline.isPipelineHook identifies pipeline hooks", () => {
		const pipelineHook = {
			name: "test",
			pipeline: () => ({
				status: "executed" as const,
				action: "context" as const,
				summary: "test",
			}),
		};
		const rawHook = {
			name: "test",
			handler: () => {},
		};

		expect(Pipeline.isPipelineHook(pipelineHook)).toBe(true);
		expect(Pipeline.isPipelineHook(rawHook)).toBe(false);
	});

	test("Pipeline.isRawHook identifies raw hooks", () => {
		const pipelineHook = {
			name: "test",
			pipeline: () => ({
				status: "executed" as const,
				action: "context" as const,
				summary: "test",
			}),
		};
		const rawHook = {
			name: "test",
			handler: () => {},
		};

		expect(Pipeline.isRawHook(rawHook)).toBe(true);
		expect(Pipeline.isRawHook(pipelineHook)).toBe(false);
	});
});
