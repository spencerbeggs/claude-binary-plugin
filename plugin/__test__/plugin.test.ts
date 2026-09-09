import { afterEach, describe, expect, test } from "bun:test";
import { AddContext, Allow, ClaudePlugin, Deny, Modify } from "claude-binary-plugin";
import preToolUseHandler from "../hooks/pre-tool-use.js";
import sessionStartHandler from "../hooks/session-start.js";
import TestConfig from "../plugin.config.js";
import { PluginState } from "../plugin.state.js";

const plugin = new ClaudePlugin(TestConfig, {
	SessionStart: [{ name: "init", handler: sessionStartHandler }],
	PreToolUse: [{ name: "guard", handler: preToolUseHandler }],
});

// =============================================================================
// SessionStart hook
// =============================================================================

describe("SessionStart / init", () => {
	afterEach(() => {
		// PluginTester cleanup handled per-test
	});

	test("returns AddContext with environment info", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withSessionStartInput({ cwd: "/tmp/test" })
			.runHook("SessionStart", "init");

		expect(result.outcome).toBeInstanceOf(AddContext);
		expect(result.context).toContain("Package manager: bun (exec: bunx)");
		expect(result.context).toContain("Git available: true");
		expect(result.context).toContain("Bun available: true");
		tester.dispose();
	});

	test("adds git warning when git is unavailable", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: false, bun: true, packageManager: "bun" }))
			.withSessionStartInput({ cwd: "/tmp/test" })
			.runHook("SessionStart", "init");

		expect(result.outcome).toBeInstanceOf(AddContext);
		expect(result.context).toContain("Git is not available");
		tester.dispose();
	});

	test("shows npm when bun is unavailable", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "lenient" })
			.withState(new PluginState({ git: true, bun: false, packageManager: "npm" }))
			.withSessionStartInput({ cwd: "/tmp/test" })
			.runHook("SessionStart", "init");

		expect(result.outcome).toBeInstanceOf(AddContext);
		expect(result.context).toContain("Package manager: npm (exec: npx)");
		tester.dispose();
	});
});

// =============================================================================
// PreToolUse hook
// =============================================================================

describe("PreToolUse / guard", () => {
	test("allows non-Bash tools in strict mode", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({ tool_name: "Read", tool_input: { file_path: "/tmp/foo.ts" } })
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Allow);
		expect(result.action).toBe("allow");
		tester.dispose();
	});

	test("allows safe Bash commands in strict mode", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls -la" } })
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Allow);
		tester.dispose();
	});

	test("denies rm -rf in strict mode", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "rm -rf /" } })
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Deny);
		expect(result.action).toBe("deny");
		expect(result.reason).toContain("Destructive command");
		tester.dispose();
	});

	test("allows rm -rf in lenient mode", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "lenient" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "rm -rf /tmp/junk" } })
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Allow);
		tester.dispose();
	});

	test("modifies Write tool to add header for .ts files", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({
				tool_name: "Write",
				tool_input: { file_path: "src/index.ts", content: "export const x = 1;" },
			})
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Modify);
		// Modify sends permissionDecision: "allow" with updatedInput
		expect(result.action).toBe("allow");
		const updatedInput = result.output.updatedInput as { content: string };
		expect(updatedInput.content).toStartWith("// Generated with bunx");
		expect(updatedInput.content).toContain("export const x = 1;");
		tester.dispose();
	});

	test("uses npx header when packageManager is npm", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: false, bun: false, packageManager: "npm" }))
			.withPreToolUseInput({
				tool_name: "Write",
				tool_input: { file_path: "lib/util.ts", content: "console.log('hi');" },
			})
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Modify);
		const updatedInput = result.output.updatedInput as { content: string };
		expect(updatedInput.content).toStartWith("// Generated with npx");
		tester.dispose();
	});

	test("does not modify Write for non-.ts files", async () => {
		const tester = plugin.test();
		const result = await tester
			.withOptions({ MODE: "strict" })
			.withState(new PluginState({ git: true, bun: true, packageManager: "bun" }))
			.withPreToolUseInput({
				tool_name: "Write",
				tool_input: { file_path: "README.md", content: "# Hello" },
			})
			.runHook("PreToolUse", "guard");

		expect(result.outcome).toBeInstanceOf(Allow);
		tester.dispose();
	});
});
