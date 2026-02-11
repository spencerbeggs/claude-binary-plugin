/**
 * Shared template utilities for plugin and marketplace scaffolding.
 *
 * These generators produce file contents used by both single-plugin
 * and marketplace template generators.
 */

import type { ScaffoldConfig } from "../scaffold.js";

// =============================================================================
// STRING CONVERSION HELPERS
// =============================================================================

/** Convert a string to SCREAMING_SNAKE_CASE for environment variable prefixes. */
export function toScreamingSnake(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1_$2")
		.replace(/[\s\-.]+/g, "_")
		.toUpperCase();
}

/** Convert a string to kebab-case for file and package names. */
export function toKebabCase(name: string): string {
	return name
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[\s_.]+/g, "-")
		.toLowerCase();
}

// =============================================================================
// HOOK TYPE → NAME/FILE MAPPING
// =============================================================================

/** Maps hook types to their default handler names and filenames. */
export const HOOK_NAME_MAP: Record<string, { name: string; file: string; tools?: string[] }> = {
	SessionStart: { name: "context", file: "context" },
	PreToolUse: { name: "security", file: "security", tools: ["Bash"] },
	PostToolUse: { name: "post-tool", file: "post-tool", tools: ["Bash"] },
	Stop: { name: "stop-guard", file: "stop-guard" },
	SubagentStop: { name: "subagent-guard", file: "subagent-guard" },
	UserPromptSubmit: { name: "prompt-filter", file: "prompt-filter" },
	Notification: { name: "notification", file: "notification" },
	PermissionRequest: { name: "permission", file: "permission" },
};

// =============================================================================
// PROJECT FILE GENERATORS
// =============================================================================

/** Generate .claude-plugin/plugin.json manifest. */
export function generatePluginJson(config: ScaffoldConfig, pluginName?: string): string {
	const manifest = {
		name: pluginName ?? config.name,
		version: "0.1.0",
		description: config.description,
	};
	return `${JSON.stringify(manifest, null, "\t")}\n`;
}

/** Generate package.json for a plugin or workspace root. */
export function generatePackageJson(
	config: ScaffoldConfig,
	opts?: { workspace?: boolean; pluginName?: string },
): string {
	const name = opts?.pluginName ?? config.name;
	const pkg: Record<string, unknown> = {
		name,
		version: "0.1.0",
		description: opts?.workspace ? "Example plugin" : config.description,
		type: "module",
		scripts: {
			build: "claude-binary-plugin build",
			test: "bun test",
			lint: "biome check --write",
			typecheck: "bun x tsc --noEmit",
		},
		dependencies: {
			"claude-binary-plugin": "^1.0.0",
		},
		peerDependencies: {
			zod: "^4.0.0",
		},
		devDependencies: {
			"@types/bun": "^1.3.0",
			zod: "^4.3.0",
			...(opts?.workspace ? {} : { "@biomejs/biome": "^1.9.0", typescript: "^5.9.0" }),
		},
	};
	return `${JSON.stringify(pkg, null, "\t")}\n`;
}

/** Generate tsconfig.json with strict ESNext bundler settings. */
export function generateTsConfig(opts?: { extends?: string; composite?: boolean }): string {
	if (opts?.extends) {
		const tsconfig = {
			extends: opts.extends,
			compilerOptions: {
				composite: true,
				rootDir: ".",
				outDir: "dist",
			},
			include: ["**/*.ts"],
			exclude: ["node_modules", "dist"],
		};
		return `${JSON.stringify(tsconfig, null, "\t")}\n`;
	}
	const tsconfig = {
		compilerOptions: {
			target: "ESNext",
			module: "ESNext",
			moduleResolution: "bundler",
			strict: true,
			noEmit: true,
			esModuleInterop: true,
			skipLibCheck: true,
			forceConsistentCasingInFileNames: true,
			resolveJsonModule: true,
			declaration: true,
			declarationMap: true,
			sourceMap: true,
			types: ["bun-types"],
		},
		include: ["**/*.ts"],
		exclude: ["node_modules", "dist"],
	};
	return `${JSON.stringify(tsconfig, null, "\t")}\n`;
}

/** Generate biome.jsonc for linting and formatting. */
export function generateBiomeConfig(opts?: { root?: boolean }): string {
	if (opts?.root === false) {
		return `${JSON.stringify({ extends: ["//"] }, null, "\t")}\n`;
	}
	const config = {
		$schema: "https://biomejs.dev/schemas/1.9.0/schema.json",
		organizeImports: {
			enabled: true,
		},
		formatter: {
			indentStyle: "tab",
			lineWidth: 120,
		},
		linter: {
			enabled: true,
			rules: {
				recommended: true,
			},
		},
	};
	return `${JSON.stringify(config, null, "\t")}\n`;
}

/** Generate .gitignore for plugin projects. */
export function generateGitignore(opts?: { marketplace?: boolean }): string {
	const lines = [
		"# Dependencies",
		"node_modules/",
		"",
		"# Plugin binary (platform-specific, built on each machine)",
		"*.plugin",
		"",
		"# Build artifacts",
		".plugin-entrypoint.ts",
		".build-lock/",
		"",
		"# Environment",
		".env.local",
		"",
		"# OS files",
		".DS_Store",
	];
	if (opts?.marketplace) {
		lines.push("", "# Turborepo", ".turbo/");
	}
	return `${lines.join("\n")}\n`;
}

/** Generate CLAUDE.md context file for the project. */
export function generateClaudeMd(config: ScaffoldConfig): string {
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	const hookRows = hooks
		.map((hookType) => {
			const mapping = HOOK_NAME_MAP[hookType];
			if (!mapping) return null;
			return `| ${hookType}/${mapping.name} | hooks/${mapping.file}.hook.ts | ${hookType} handler |`;
		})
		.filter(Boolean)
		.join("\n");

	const commandSection = config.includeCommands
		? `\n## Commands\n\n| Command | File | Purpose |\n| ------- | ---- | ------- |\n| example | commands/example.cmd.ts | Example command |\n`
		: "";

	return `# ${config.name}

${config.description}

## Development

\`\`\`bash
# Build the plugin
claude-binary-plugin build

# Run tests
bun test

# Lint and format
bun run lint

# Type-check
bun run typecheck
\`\`\`

## Architecture

This plugin uses the \`claude-binary-plugin\` SDK to compile hooks and
commands into a single Bun executable.

## Hooks

| Hook | File | Purpose |
| ---- | ---- | ------- |
${hookRows}
${commandSection}
## Testing

Tests use the \`PluginTester\` fluent API from \`claude-binary-plugin\`.
Run \`bun test\` to execute all tests.
`;
}

// =============================================================================
// PLUGIN CONFIG GENERATOR
// =============================================================================

/** Generate plugin.config.ts with typed hooks and optional commands. */
export function generatePluginConfig(config: ScaffoldConfig): string {
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	// Build hook entries grouped by type
	const hookEntries = hooks
		.map((hookType) => {
			const mapping = HOOK_NAME_MAP[hookType];
			if (!mapping) return null;
			const toolsLine = mapping.tools ? `\n\t\t\ttools: ${JSON.stringify(mapping.tools)},` : "";
			return `\t\t${hookType}: [\n\t\t\t{\n\t\t\t\tname: "${mapping.name}",${toolsLine}\n\t\t\t\tpipeline: "./hooks/${mapping.file}.hook.ts",\n\t\t\t},\n\t\t],`;
		})
		.filter(Boolean)
		.join("\n\n");

	const commandsSection = config.includeCommands
		? `

\t// Commands — CLI tools exposed to Claude via skill markdown files.
\t// Invoked with: ./plugin --cmd=<name> [args...]
\tcommands: {
\t\texample: {
\t\t\tdescription: "Run an example command",
\t\t\targs: z.object({
\t\t\t\t_positionals: z.array(z.string()).optional().default([]),
\t\t\t}),
\t\t\tpipeline: "./commands/example.cmd.ts",
\t\t},
\t},`
		: "";

	return `/**
 * Plugin configuration for ${config.name}.
 *
 * This file defines the plugin's options schema, setup function, hooks,
 * and commands. It is the entry point for the build system.
 *
 * Build: claude-binary-plugin build
 * Test:  bun test
 */

import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import type { InferPluginCommands, InferPluginPipeline } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
\t// Environment variable prefix. All options below are read from
\t// env vars like ${config.prefix}_DEBUG, ${config.prefix}_TIMEOUT_MS, etc.
\tprefix: "${config.prefix}",

\t// Options schema — validated at startup from environment variables.
\t// Use z.string().default().transform() for booleans (env vars are strings),
\t// and z.coerce.number().default() for numeric values.
\toptions: z.object({
\t\t// Boolean option: env vars are strings, so parse to boolean
\t\tDEBUG: z
\t\t\t.string()
\t\t\t.default("false")
\t\t\t.transform((v) => v === "true"),

\t\t// Numeric option: coerced from string with a sensible default
\t\tTIMEOUT_MS: z.coerce.number().default(30000),
\t}),

\t// Setup function — runs once at SessionStart to compute derived state.
\t// The returned object is serialized and available in all subsequent
\t// hooks and commands as the \`state\` parameter.
\tsetup: async ({ cwd }) => {
\t\t// Detect project characteristics for use in hook handlers
\t\tconst hasPackageJson = await Bun.file(\`\${cwd}/package.json\`).exists();
\t\tconst hasTsConfig = await Bun.file(\`\${cwd}/tsconfig.json\`).exists();

\t\treturn {
\t\t\thasPackageJson,
\t\t\thasTsConfig,
\t\t};
\t},

\t// Hooks — intercept Claude Code lifecycle events.
\t// Each hook points to a handler file that receives typed context:
\t//   { input, options, state } for pipeline handlers
\thooks: {
${hookEntries}
\t},${commandsSection}
});

// Export inferred types for use in hook and command handler files.
// In your handlers, import these types:
//   import type { Pipeline } from "../plugin.config.js";
//   const handler: Pipeline["PreToolUse"] = ({ input, options, state }) => { ... };
export type Pipeline = InferPluginPipeline<typeof plugin>;
export type Commands = InferPluginCommands<typeof plugin>;

export default plugin;
`;
}

// =============================================================================
// HOOK HANDLER GENERATORS
// =============================================================================

/** Generate a typed hook handler file for the given hook type. */
export function generateHookHandler(hookType: string, hookName: string, _prefix: string): string {
	switch (hookType) {
		case "SessionStart":
			return generateSessionStartHandler(hookName);
		case "PreToolUse":
			return generatePreToolUseHandler(hookName);
		case "PostToolUse":
			return generatePostToolUseHandler(hookName);
		case "Stop":
			return generateStopHandler(hookName);
		case "SubagentStop":
			return generateSubagentStopHandler(hookName);
		case "UserPromptSubmit":
			return generateUserPromptSubmitHandler(hookName);
		case "Notification":
			return generateNotificationHandler(hookName);
		case "PermissionRequest":
			return generatePermissionRequestHandler(hookName);
		default:
			return generateGenericHandler(hookType, hookName);
	}
}

function generateSessionStartHandler(_hookName: string): string {
	return `/**
 * SessionStart hook — "context"
 *
 * Runs once when Claude Code starts a new session. Use this to inject
 * project context that helps Claude understand your codebase.
 *
 * Handler type: Pipeline["SessionStart"]
 * Input:  { source: "startup" | "resume" | "clear" | "compact" }
 * Output: SessionStartPipelineOutput (action: "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SessionStart"] = ({ input, options, state }) => {
\t// Build context lines based on detected project characteristics
\tconst lines: string[] = ["# Project Context"];

\tif (state.hasPackageJson) {
\t\tlines.push("- This project uses Node.js/Bun with a package.json");
\t}

\tif (state.hasTsConfig) {
\t\tlines.push("- TypeScript is configured in this project");
\t}

\tif (options.DEBUG) {
\t\tlines.push(\`- Debug mode is enabled (timeout: \${options.TIMEOUT_MS}ms)\`);
\t}

\t// Only inject context if we have something useful to say
\tif (lines.length <= 1) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "none",
\t\t\tsummary: "no project context to inject",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "context",
\t\tsummary: \`injected \${lines.length - 1} context lines\`,
\t\tclaudeContext: lines.join("\\n"),
\t};
};

export default handler;
`;
}

function generatePreToolUseHandler(_hookName: string): string {
	return `/**
 * PreToolUse hook — "security"
 *
 * Runs before Claude executes a tool. Use this to allow, deny, or
 * modify tool inputs before they run. This handler is filtered to
 * only fire for Bash tool invocations.
 *
 * Handler type: Pipeline["PreToolUse"]
 * Input:  { tool_name, tool_input: { command?: string }, tool_use_id }
 * Output: PreToolUsePipelineOutput (action: "allow" | "deny" | "ask" | "modify")
 */

import type { Pipeline } from "../plugin.config.js";

// Patterns considered dangerous — add your own as needed
const DANGEROUS_PATTERNS = [
\t/\\brm\\s+(-[a-zA-Z]*f|-[a-zA-Z]*r|--force|--recursive)/,
\t/\\bsudo\\s+rm\\b/,
\t/\\b(chmod|chown)\\s+(-R|--recursive)\\s+\\//,
\t/\\bdd\\s+.*of=\\/dev\\//,
\t/\\bmkfs\\b/,
];

const handler: Pipeline["PreToolUse"] = ({ input }) => {
\tconst command = (input.tool_input as { command?: string }).command ?? "";

\t// Check against dangerous patterns
\tfor (const pattern of DANGEROUS_PATTERNS) {
\t\tif (pattern.test(command)) {
\t\t\treturn {
\t\t\t\tstatus: "executed",
\t\t\t\taction: "deny",
\t\t\t\tsummary: "blocked dangerous command",
\t\t\t\treason: \`This command matches a dangerous pattern and has been blocked: \${command.slice(0, 80)}\`,
\t\t\t};
\t\t}
\t}

\t// Allow all other commands
\treturn {
\t\tstatus: "executed",
\t\taction: "allow",
\t\tsummary: "command allowed",
\t};
};

export default handler;
`;
}

function generatePostToolUseHandler(_hookName: string): string {
	return `/**
 * PostToolUse hook — "post-tool"
 *
 * Runs after Claude executes a tool. Use this to add context based
 * on tool results, or to block continuation if something went wrong.
 *
 * Handler type: Pipeline["PostToolUse"]
 * Input:  { tool_name, tool_input, tool_response, tool_use_id }
 * Output: PostToolUsePipelineOutput (action: "block" | "continue" | "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PostToolUse"] = ({ input }) => {
\tconst response = input.tool_response as { output?: string } | undefined;
\tconst output = response?.output ?? "";

\t// Example: add context when test commands produce failures
\tif (output.includes("FAIL")) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "context",
\t\t\tsummary: "test failures detected",
\t\t\tclaudeContext:
\t\t\t\t"Test failures were detected in the output. " +
\t\t\t\t"Review the failing tests carefully and fix the root cause " +
\t\t\t\t"rather than modifying tests to pass.",
\t\t};
\t}

\t// No action needed for other tool results
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "no post-tool action",
\t};
};

export default handler;
`;
}

function generateStopHandler(_hookName: string): string {
	return `/**
 * Stop hook — "stop-guard"
 *
 * Runs when Claude is about to stop. Use this to block premature
 * stops and require the agent to finish its work.
 *
 * Handler type: Pipeline["Stop"]
 * Input:  { stop_hook_active: boolean }
 * Output: StopPipelineOutput (action: "block" | "continue")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Stop"] = ({ input }) => {
\t// If the stop hook is already active (recursive), allow to prevent loops
\tif (input.stop_hook_active) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "continue",
\t\t\tsummary: "recursive stop — allowing",
\t\t};
\t}

\t// Allow the stop by default — customize this to block when needed.
\t// For example, check if tests are passing or if there are
\t// uncommitted changes that need attention.
\treturn {
\t\tstatus: "executed",
\t\taction: "continue",
\t\tsummary: "stop allowed",
\t};
};

export default handler;
`;
}

function generateSubagentStopHandler(_hookName: string): string {
	return `/**
 * SubagentStop hook — "subagent-guard"
 *
 * Runs when a subagent is about to stop. Similar to Stop but
 * specifically for subagent processes.
 *
 * Handler type: Pipeline["SubagentStop"]
 * Input:  { stop_hook_active: boolean }
 * Output: StopPipelineOutput (action: "block" | "continue")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["SubagentStop"] = ({ input }) => {
\tif (input.stop_hook_active) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "continue",
\t\t\tsummary: "recursive subagent stop — allowing",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "continue",
\t\tsummary: "subagent stop allowed",
\t};
};

export default handler;
`;
}

function generateUserPromptSubmitHandler(_hookName: string): string {
	return `/**
 * UserPromptSubmit hook — "prompt-filter"
 *
 * Runs when the user submits a prompt. Use this to add context
 * or block submissions that match certain patterns.
 *
 * Handler type: Pipeline["UserPromptSubmit"]
 * Input:  { prompt: string }
 * Output: UserPromptSubmitPipelineOutput (action: "block" | "continue" | "context" | "none")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["UserPromptSubmit"] = ({ input }) => {
\tconst prompt = input.prompt ?? "";

\t// Example: add context when the user mentions deployment
\tif (/deploy|release|publish/i.test(prompt)) {
\t\treturn {
\t\t\tstatus: "executed",
\t\t\taction: "context",
\t\t\tsummary: "deployment context added",
\t\t\tclaudeContext:
\t\t\t\t"The user is asking about deployment. Ensure all tests pass " +
\t\t\t\t"and the build succeeds before proceeding with any deployment steps.",
\t\t};
\t}

\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "prompt allowed",
\t};
};

export default handler;
`;
}

function generateNotificationHandler(_hookName: string): string {
	return `/**
 * Notification hook — "notification"
 *
 * Runs when Claude sends a notification. This is a passthrough-only
 * hook — use it for logging or observability, not for modifying behavior.
 *
 * Handler type: Pipeline["Notification"]
 * Input:  { message: string, notification_type: string }
 * Output: PassthroughPipelineOutput (action: "none" only)
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["Notification"] = () => {
\t// Notification hooks are passthrough-only.
\t// Use this for logging or metrics, not for changing behavior.
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "notification observed",
\t};
};

export default handler;
`;
}

function generatePermissionRequestHandler(_hookName: string): string {
	return `/**
 * PermissionRequest hook — "permission"
 *
 * Runs when Claude requests permission from the user. Use this to
 * auto-allow or auto-deny specific permission requests.
 *
 * Handler type: Pipeline["PermissionRequest"]
 * Input:  { message: string, notification_type: string }
 * Output: PermissionRequestPipelineOutput (action: "allow" | "deny")
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["PermissionRequest"] = () => {
\t// Example: auto-allow all permission requests.
\t// In practice, inspect the request and selectively
\t// allow or deny based on your security policy.
\treturn {
\t\tstatus: "executed",
\t\taction: "allow",
\t\tsummary: "permission auto-allowed",
\t};
};

export default handler;
`;
}

function generateGenericHandler(hookType: string, _hookName: string): string {
	return `/**
 * ${hookType} hook
 *
 * Handler type: Pipeline["${hookType}"]
 */

import type { Pipeline } from "../plugin.config.js";

const handler: Pipeline["${hookType}"] = () => {
\treturn {
\t\tstatus: "executed",
\t\taction: "none",
\t\tsummary: "hook executed",
\t};
};

export default handler;
`;
}

// =============================================================================
// COMMAND HANDLER GENERATORS
// =============================================================================

/** Generate a command handler file. */
export function generateCommandHandler(commandName: string, prefix: string, pluginName: string): string {
	return `/**
 * Command: ${commandName}
 *
 * Invoked by Claude via: $${prefix}_PLUGIN_DIR/${pluginName}.plugin --cmd=${commandName} [args...]
 * Claude learns about this command from the skill file at skills/${commandName}.md.
 *
 * Commands receive the same three-layer context as hooks:
 *   - args:    Validated CLI arguments (from Zod schema)
 *   - options: Plugin options (from env vars)
 *   - state:   Computed state (from setup function)
 *
 * Commands return markdown output for LLM consumption and an exit code.
 */

import type { CommandOutput } from "claude-binary-plugin";
import type { Commands } from "../plugin.config.js";

const handler: Commands["${commandName}"] = async ({ args, options, state }): Promise<CommandOutput> => {
\tconst positionals = args._positionals;
\tconst targetDesc = positionals.length > 0 ? positionals.join(", ") : "project root";

\tconst lines: string[] = [
\t\t"# Example Results",
\t\t"",
\t\t\`**Target:** \${targetDesc}\`,
\t\t\`**Project:** \${state.projectDir}\`,
\t\t"",
\t\t"## Summary",
\t\t"",
\t\t"Command executed successfully. Replace this handler with your",
\t\t"own logic — run linters, execute tests, generate reports, etc.",
\t];

\tif (options.DEBUG) {
\t\tlines.push("", "## Debug Info", "", \`- Timeout: \${options.TIMEOUT_MS}ms\`);
\t}

\treturn {
\t\texitCode: 0,
\t\toutput: lines.join("\\n"),
\t};
};

export default handler;
`;
}

/** Generate a skill markdown file for a command. */
export function generateSkillMd(commandName: string, prefix: string, pluginName: string): string {
	return `---
allowed-tools: Bash, Read, Edit, TodoWrite
description: Run the ${commandName} command
argument-hint: [path...]
---

# ${commandName.charAt(0).toUpperCase() + commandName.slice(1)} Command

Run the ${commandName} command to execute plugin logic.

## Usage

\`\`\`bash
$${prefix}_PLUGIN_DIR/${pluginName}.plugin --cmd=${commandName} $ARGUMENTS
\`\`\`

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0 | Command executed successfully |
| 1 | Issues found (review output) |
| 2 | Script error (missing tools, config, etc.) |

## Process

1. **Run the command** with the target path(s)
2. **Review output** for any reported issues
3. **Fix issues** using Read/Edit tools
4. **Re-run until clean** to verify fixes
`;
}

// =============================================================================
// TEST FILE GENERATORS
// =============================================================================

/** Generate a test file for a hook handler. */
export function generateHookTest(hookType: string, hookName: string): string {
	switch (hookType) {
		case "SessionStart":
			return generateSessionStartTest(hookName);
		case "PreToolUse":
			return generatePreToolUseTest(hookName);
		case "PostToolUse":
			return generatePostToolUseTest(hookName);
		case "Stop":
			return generateStopTest("Stop", hookName);
		case "SubagentStop":
			return generateStopTest("SubagentStop", hookName);
		case "UserPromptSubmit":
			return generateUserPromptSubmitTest(hookName);
		case "Notification":
			return generateNotificationTest(hookName);
		case "PermissionRequest":
			return generatePermissionRequestTest(hookName);
		default:
			return generateGenericTest(hookType, hookName);
	}
}

function generateSessionStartTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("SessionStart/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("injects context when project has package.json", async () => {
\t\tconst result = await ctx
\t\t\t.withSessionStartInput({ source: "startup" })
\t\t\t.runHook("SessionStart", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("package.json");
\t});

\ttest("returns none when no project characteristics detected", async () => {
\t\tctx.withState({ hasPackageJson: false, hasTsConfig: false });

\t\tconst result = await ctx
\t\t\t.withSessionStartInput({ source: "startup" })
\t\t\t.runHook("SessionStart", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generatePreToolUseTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PreToolUse/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("allows safe commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "git status" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("allow");
\t});

\ttest("blocks dangerous rm -rf commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "rm -rf /" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("deny");
\t\texpect(result.reason).toContain("dangerous");
\t});

\ttest("blocks sudo rm commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "sudo rm /etc/hosts" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("deny");
\t});

\ttest("allows normal file operations", async () => {
\t\tconst result = await ctx
\t\t\t.withPreToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "ls -la src/" },
\t\t\t})
\t\t\t.runHook("PreToolUse", "${hookName}");

\t\texpect(result.action).toBe("allow");
\t});
});
`;
}

function generatePostToolUseTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PostToolUse/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("adds context when test failures detected", async () => {
\t\tconst result = await ctx
\t\t\t.withPostToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "bun test" },
\t\t\t\ttool_response: { output: "FAIL src/index.test.ts" },
\t\t\t})
\t\t\t.runHook("PostToolUse", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("Test failures");
\t});

\ttest("takes no action for successful commands", async () => {
\t\tconst result = await ctx
\t\t\t.withPostToolUseInput({
\t\t\t\ttool_name: "Bash",
\t\t\t\ttool_input: { command: "bun test" },
\t\t\t\ttool_response: { output: "All tests passed" },
\t\t\t})
\t\t\t.runHook("PostToolUse", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateStopTest(hookType: string, hookName: string): string {
	const inputMethod = hookType === "SubagentStop" ? "withSubagentStopInput" : "withStopInput";
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${hookType}/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("allows stop by default", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}({ stop_hook_active: false })
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("continue");
\t});

\ttest("allows recursive stop", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}({ stop_hook_active: true })
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.action).toBe("continue");
\t});
});
`;
}

function generateUserPromptSubmitTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("UserPromptSubmit/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("adds context for deployment-related prompts", async () => {
\t\tconst result = await ctx
\t\t\t.withUserPromptSubmitInput({ prompt: "Deploy to production" })
\t\t\t.runHook("UserPromptSubmit", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("context");
\t\texpect(result.context).toContain("deployment");
\t});

\ttest("allows normal prompts without action", async () => {
\t\tconst result = await ctx
\t\t\t.withUserPromptSubmitInput({ prompt: "Help me fix this bug" })
\t\t\t.runHook("UserPromptSubmit", "${hookName}");

\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generateNotificationTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("Notification/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("observes notifications without action", async () => {
\t\tconst result = await ctx
\t\t\t.withNotificationInput({
\t\t\t\tmessage: "Build completed",
\t\t\t\tnotification_type: "info",
\t\t\t})
\t\t\t.runHook("Notification", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("none");
\t});
});
`;
}

function generatePermissionRequestTest(hookName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("PermissionRequest/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("auto-allows permission requests", async () => {
\t\tconst result = await ctx
\t\t\t.withPermissionRequestInput({
\t\t\t\tmessage: "Allow filesystem access?",
\t\t\t\tnotification_type: "permission",
\t\t\t})
\t\t\t.runHook("PermissionRequest", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.action).toBe("allow");
\t});
});
`;
}

function generateGenericTest(hookType: string, hookName: string): string {
	const inputMethod = getTestInputMethod(hookType);
	const inputArgs = getTestInputArgs(hookType);

	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${hookType}/${hookName}", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("executes successfully", async () => {
\t\tconst result = await ctx
\t\t\t.${inputMethod}(${inputArgs})
\t\t\t.runHook("${hookType}", "${hookName}");

\t\texpect(result.exitCode).toBe(0);
\t});
});
`;
}

/** Generate a test file for a command handler. */
export function generateCommandTest(commandName: string): string {
	return `import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import plugin from "../plugin.config.js";

describe("${commandName} command", () => {
\tlet ctx: ReturnType<typeof plugin.test>;

\tbeforeEach(() => {
\t\tctx = plugin.test()
\t\t\t.withPluginRoot(import.meta.dir + "/..")
\t\t\t.withOptions({ DEBUG: "false", TIMEOUT_MS: "30000" })
\t\t\t.withState({ hasPackageJson: true, hasTsConfig: true });
\t});

\tafterEach(() => ctx.dispose());

\ttest("executes successfully with default args", async () => {
\t\tconst result = await ctx.runCommand("${commandName}", {});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("Example Results");
\t});

\ttest("accepts positional arguments", async () => {
\t\tconst result = await ctx.runCommand("${commandName}", {
\t\t\t_positionals: ["src/"],
\t\t});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("src/");
\t});

\ttest("includes debug info when DEBUG is enabled", async () => {
\t\tctx.withOptions({ DEBUG: "true", TIMEOUT_MS: "5000" });

\t\tconst result = await ctx.runCommand("${commandName}", {});

\t\texpect(result.exitCode).toBe(0);
\t\texpect(result.stdout).toContain("Debug Info");
\t\texpect(result.stdout).toContain("5000");
\t});
});
`;
}

// =============================================================================
// HELPERS
// =============================================================================

function getTestInputMethod(hookType: string): string {
	const map: Record<string, string> = {
		SessionStart: "withSessionStartInput",
		PreToolUse: "withPreToolUseInput",
		PostToolUse: "withPostToolUseInput",
		Stop: "withStopInput",
		SubagentStop: "withSubagentStopInput",
		UserPromptSubmit: "withUserPromptSubmitInput",
		Notification: "withNotificationInput",
		PermissionRequest: "withPermissionRequestInput",
		PreCompact: "withPreCompactInput",
		SessionEnd: "withSessionEndInput",
	};
	return map[hookType] ?? "withSessionStartInput";
}

function getTestInputArgs(hookType: string): string {
	const map: Record<string, string> = {
		SessionStart: '{ source: "startup" }',
		PreToolUse: '{ tool_name: "Bash", tool_input: { command: "git status" } }',
		PostToolUse: '{ tool_name: "Bash", tool_input: { command: "git status" }, tool_response: { output: "clean" } }',
		Stop: "{ stop_hook_active: false }",
		SubagentStop: "{ stop_hook_active: false }",
		UserPromptSubmit: '{ prompt: "test prompt" }',
		Notification: '{ message: "test", notification_type: "info" }',
		PermissionRequest: '{ message: "test", notification_type: "permission" }',
		PreCompact: '{ trigger: "auto" }',
		SessionEnd: '{ reason: "logout" }',
	};
	return map[hookType] ?? '{ source: "startup" }';
}
