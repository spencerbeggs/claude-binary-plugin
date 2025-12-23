import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
	GeneratePipelinePluginOptions,
	MarketplaceManifest,
	PipelineHookEntry,
	PluginCommandConfig,
	PluginHookConfig,
	PluginManifest,
	ShellExecutor,
	ShellResult,
} from "./builder.js";
import {
	buildPlugin,
	extractPassthroughHookEntries,
	generateHooksJson,
	generatePipelinePluginEntrypoint,
	generatePluginEntrypoint,
	getPluginCachePath,
	readMarketplaceManifest,
	readPluginManifest,
	syncPluginToCache,
} from "./builder.js";
import type { MockEnvContext } from "./mocks.js";
import { mockEnv } from "./mocks.js";

// Test directory for build tests
const TEST_DIR = join(Bun.env.TMPDIR || "/tmp", `builder-test-${Date.now()}`);

/**

* Create a mock shell result
 */
function createMockShellResult(exitCode: number, stdout = "", stderr = ""): ShellResult {
	return { exitCode, stdout, stderr };
}

/**

* Create a mock shell executor that tracks commands and returns success
 */
function createMockShell(): { shell: ShellExecutor; commands: string[] } {
	const commands: string[] = [];
	const shell: ShellExecutor = async (cmd: string): Promise<ShellResult> => {
		commands.push(cmd);
		// Return success for all commands
		return createMockShellResult(0);
	};
	return { shell, commands };
}

/**

* Create a mock shell executor that fails for bun build commands
 */
function createFailingBuildShell(errorMessage: string): ShellExecutor {
	return async (cmd: string): Promise<ShellResult> => {
		if (cmd.startsWith("bun build")) {
			return createMockShellResult(1, "", errorMessage);
		}
		return createMockShellResult(0);
	};
}

describe("generatePluginEntrypoint", () => {
	test("generates valid TypeScript with hooks and commands", () => {
		const hooks: PluginHookConfig[] = [
			{ name: "pre-edit-code", path: "./hooks/pre-edit.js", description: "Pre-edit validation" },
			{ name: "post-edit-code", path: "./hooks/post-edit.js", description: "Post-edit check" },
		];

		const commands: PluginCommandConfig[] = [
			{ name: "lint", path: "./commands/lint.js", description: "Run linting" },
			{ name: "test", path: "./commands/test.js", description: "Run tests" },
		];

		const result = generatePluginEntrypoint(hooks, commands, "my-plugin", "1.0.0");

		// Check shebang
		expect(result).toContain("#!/usr/bin/env bun");

		// Check type definitions
		expect(result).toContain('"pre-edit-code" | "post-edit-code"');
		expect(result).toContain('"lint" | "test"');

		// Check hook cases
		expect(result).toContain('case "pre-edit-code"');
		expect(result).toContain('await import("./hooks/pre-edit.js")');
		expect(result).toContain('case "post-edit-code"');

		// Check command cases
		expect(result).toContain('case "lint"');
		expect(result).toContain('await import("./commands/lint.js")');
		expect(result).toContain('case "test"');

		// Check help text
		expect(result).toContain("my-plugin - Unified Binary");
		expect(result).toContain("Pre-edit validation");
		expect(result).toContain("Run linting");

		// Check CLI parsing
		expect(result).toContain("parseArgs");
		expect(result).toContain('hook: { type: "string"');
		expect(result).toContain('cmd: { type: "string"');
	});

	test("generates valid TypeScript with only hooks", () => {
		const hooks: PluginHookConfig[] = [{ name: "session-start", path: "./hooks/session.js" }];
		const commands: PluginCommandConfig[] = [];

		const result = generatePluginEntrypoint(hooks, commands, "hooks-only", "1.0.0");

		expect(result).toContain('"session-start"');
		expect(result).toContain("type CommandName = never");
		expect(result).toContain("hooks-only - Unified Binary");
	});

	test("generates valid TypeScript with only commands", () => {
		const hooks: PluginHookConfig[] = [];
		const commands: PluginCommandConfig[] = [{ name: "build", path: "./commands/build.js" }];

		const result = generatePluginEntrypoint(hooks, commands, "commands-only", "1.0.0");

		expect(result).toContain("type HookName = never");
		expect(result).toContain('"build"');
		expect(result).toContain("commands-only - Unified Binary");
	});

	test("handles hooks without descriptions", () => {
		const hooks: PluginHookConfig[] = [{ name: "my-hook", path: "./hooks/my-hook.js" }];
		const commands: PluginCommandConfig[] = [];

		const result = generatePluginEntrypoint(hooks, commands, "test-plugin", "1.0.0");

		// Should still generate valid code with empty description
		expect(result).toContain("my-hook");
		expect(result).toContain("./hooks/my-hook.js");
	});

	test("generates arrays for validation", () => {
		const hooks: PluginHookConfig[] = [
			{ name: "hook-a", path: "./a.js" },
			{ name: "hook-b", path: "./b.js" },
		];
		const commands: PluginCommandConfig[] = [{ name: "cmd-a", path: "./cmd-a.js" }];

		const result = generatePluginEntrypoint(hooks, commands, "test", "1.0.0");

		expect(result).toContain('const validHooks: HookName[] = ["hook-a", "hook-b"]');
		expect(result).toContain('const validCommands: CommandName[] = ["cmd-a"]');
	});

	test("calls setPluginInfo with plugin name and version", () => {
		const hooks: PluginHookConfig[] = [{ name: "my-hook", path: "./hooks/my-hook.js" }];
		const commands: PluginCommandConfig[] = [];

		const result = generatePluginEntrypoint(hooks, commands, "workflow", "2.1.0");

		expect(result).toContain('const PLUGIN_NAME = "workflow"');
		expect(result).toContain('const PLUGIN_VERSION = "2.1.0"');
		expect(result).toContain("setPluginInfo({ name: PLUGIN_NAME, version: PLUGIN_VERSION })");
	});
});

describe("readPluginManifest", () => {
	const MANIFEST_DIR = join(TEST_DIR, "manifest-test");

	beforeEach(async () => {
		await mkdir(join(MANIFEST_DIR, ".claude-plugin"), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("reads valid plugin.json manifest", async () => {
		const manifest: PluginManifest = {
			name: "my-plugin",
			version: "1.0.0",
			description: "A test plugin",
		};
		await Bun.write(join(MANIFEST_DIR, ".claude-plugin/plugin.json"), JSON.stringify(manifest));

		const result = await readPluginManifest(MANIFEST_DIR);

		expect(result).not.toBeNull();
		expect(result?.name).toBe("my-plugin");
		expect(result?.version).toBe("1.0.0");
		expect(result?.description).toBe("A test plugin");
	});

	test("returns null when plugin.json does not exist", async () => {
		const result = await readPluginManifest(MANIFEST_DIR);

		expect(result).toBeNull();
	});

	test("returns null when plugin.json is invalid JSON", async () => {
		await Bun.write(join(MANIFEST_DIR, ".claude-plugin/plugin.json"), "not valid json");

		const result = await readPluginManifest(MANIFEST_DIR);

		expect(result).toBeNull();
	});

	test("reads plugin.json when given direct path to file", async () => {
		const manifest: PluginManifest = { name: "direct-path", version: "2.0.0" };
		await Bun.write(join(MANIFEST_DIR, ".claude-plugin/plugin.json"), JSON.stringify(manifest));

		const result = await readPluginManifest(join(MANIFEST_DIR, ".claude-plugin/plugin.json"));

		expect(result?.name).toBe("direct-path");
	});
});

describe("readMarketplaceManifest", () => {
	const MANIFEST_DIR = join(TEST_DIR, "marketplace-test");

	beforeEach(async () => {
		await mkdir(join(MANIFEST_DIR, ".claude-plugin"), { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("reads valid marketplace.json manifest", async () => {
		const manifest: MarketplaceManifest = {
			name: "my-marketplace",
			owner: { name: "Test Owner" },
			plugins: [{ name: "plugin-a", source: "./plugins/a" }],
		};
		await Bun.write(join(MANIFEST_DIR, ".claude-plugin/marketplace.json"), JSON.stringify(manifest));

		const result = await readMarketplaceManifest(MANIFEST_DIR);

		expect(result).not.toBeNull();
		expect(result?.name).toBe("my-marketplace");
		expect(result?.plugins).toHaveLength(1);
	});

	test("returns null when marketplace.json does not exist", async () => {
		const result = await readMarketplaceManifest(MANIFEST_DIR);

		expect(result).toBeNull();
	});

	test("reads marketplace.json when given direct path to file", async () => {
		const manifest: MarketplaceManifest = { name: "direct-marketplace" };
		await Bun.write(join(MANIFEST_DIR, ".claude-plugin/marketplace.json"), JSON.stringify(manifest));

		const result = await readMarketplaceManifest(join(MANIFEST_DIR, ".claude-plugin/marketplace.json"));

		expect(result?.name).toBe("direct-marketplace");
	});
});

describe("buildPlugin", () => {
	const PLUGIN_DIR = join(TEST_DIR, "plugin");

	beforeEach(async () => {
		await mkdir(PLUGIN_DIR, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("fails when entrypoint not found (no hooks/commands)", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const { shell } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			entrypoint: "nonexistent.ts",
			shell,
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("Entrypoint not found");
		expect(result.duration).toBeGreaterThanOrEqual(0);

		console.log = originalLog;
	});

	test("compiles plugin with manual entrypoint", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		// Create a manual entrypoint
		const entrypointContent = 'console.log("plugin"); process.exit(0);';
		await Bun.write(join(PLUGIN_DIR, "plugin.ts"), entrypointContent);

		const { shell, commands } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			entrypoint: "plugin.ts",
			outputName: "test.plugin",
			minify: false,
			sourcemap: false,
			shell,
		});

		expect(result.success).toBe(true);
		expect(result.entrypoint).toBe("plugin.ts");
		expect(result.output).toBe("test.plugin");

		// Verify build command
		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toBeDefined();
		expect(buildCmd).toContain("--compile");

		console.log = originalLog;
	});

	test("auto-generates entrypoint when hooks provided", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "test-hook", path: "./hooks/test.js" }];

		const { shell, commands } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			outputName: "auto.plugin",
			minify: false,
			sourcemap: false,
			shell,
		});

		expect(result.success).toBe(true);
		expect(result.entrypoint).toBe("(auto-generated)");

		// Verify build command was called
		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toBeDefined();

		console.log = originalLog;
	});

	test("auto-generates entrypoint when commands provided", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const commands: PluginCommandConfig[] = [{ name: "my-cmd", path: "./commands/cmd.js" }];

		const { shell } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			commands,
			outputName: "cmd.plugin",
			minify: false,
			sourcemap: false,
			shell,
		});

		expect(result.success).toBe(true);
		expect(result.entrypoint).toBe("(auto-generated)");

		console.log = originalLog;
	});

	test("applies minify and sourcemap options", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			minify: true,
			sourcemap: true,
			shell,
		});

		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toContain("--minify");
		expect(buildCmd).toContain("--sourcemap");

		console.log = originalLog;
	});

	test("applies target option for cross-compilation", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			target: "bun-linux-arm64",
			minify: false,
			sourcemap: false,
			shell,
		});

		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toContain("--target");
		expect(buildCmd).toContain("bun-linux-arm64");

		console.log = originalLog;
	});

	test("handles build failure", async () => {
		const originalLog = console.log;
		const originalError = console.error;
		console.log = mock(() => {});
		console.error = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const shell = createFailingBuildShell("Plugin compilation failed");
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			shell,
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("Plugin compilation failed");
		expect(result.entrypoint).toBe("(auto-generated)");

		console.log = originalLog;
		console.error = originalError;
	});

	test("cleans existing plugin binary when clean is true", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			outputName: "clean-test.plugin",
			clean: true,
			minify: false,
			sourcemap: false,
			shell,
		});

		// Verify rm command was called for the plugin binary
		const rmCmd = commands.find((cmd) => cmd.includes("rm -f") && cmd.includes("clean-test.plugin"));
		expect(rmCmd).toBeDefined();

		console.log = originalLog;
	});

	test("cleans temp files after build", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			cleanupTempFiles: true,
			minify: false,
			sourcemap: false,
			shell,
		});

		// Verify cleanup commands were called
		const cleanupCmd = commands.find((cmd) => cmd.includes(".bun-build"));
		expect(cleanupCmd).toBeDefined();

		// Verify generated entrypoint cleanup
		const entrypointCleanup = commands.find((cmd) => cmd.includes(".plugin-entrypoint.ts"));
		expect(entrypointCleanup).toBeDefined();

		console.log = originalLog;
	});

	test("handles exception during build", async () => {
		const originalLog = console.log;
		const originalError = console.error;
		console.log = mock(() => {});
		console.error = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		// Create a shell that throws an exception only during the build command
		// but succeeds for other commands (clean, temp file cleanup)
		const throwingShell: ShellExecutor = async (cmd: string) => {
			// Let initial commands pass, throw on the build command
			if (cmd.startsWith("bun build")) {
				throw new Error("Unexpected shell error");
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		};

		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			shell: throwingShell,
		});

		expect(result.success).toBe(false);
		expect(result.error?.message).toBe("Unexpected shell error");
		expect(result.entrypoint).toBe("(auto-generated)");

		console.log = originalLog;
		console.error = originalError;
	});

	test("applies bytecode option", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			bytecode: true,
			minify: false,
			sourcemap: false,
			shell,
		});

		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toContain("--bytecode");

		console.log = originalLog;
	});

	test("applies external packages option", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			external: ["@commitlint/load", "some-other-pkg"],
			minify: false,
			sourcemap: false,
			shell,
		});

		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toContain("--external @commitlint/load");
		expect(buildCmd).toContain("--external some-other-pkg");

		console.log = originalLog;
	});

	test("warns when persistLocal is true but marketplaceName is missing", async () => {
		const originalLog = console.log;
		const originalWarn = console.warn;
		const warnCalls: string[] = [];
		console.log = mock(() => {});
		console.warn = mock((msg: string) => warnCalls.push(msg));

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			persistLocal: true,
			// marketplaceName not provided
			minify: false,
			sourcemap: false,
			shell,
		});

		expect(result.success).toBe(true);
		expect(warnCalls.some((msg) => msg.includes("persistLocal requires marketplaceName"))).toBe(true);

		console.log = originalLog;
		console.warn = originalWarn;
	});

	test("bundles without compile when compile is false", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		const hooks: PluginHookConfig[] = [{ name: "hook", path: "./h.js" }];

		const { shell, commands } = createMockShell();
		const result = await buildPlugin({
			rootDir: PLUGIN_DIR,
			hooks,
			compile: false,
			outputName: "test.plugin",
			minify: false,
			sourcemap: false,
			shell,
		});

		expect(result.success).toBe(true);
		// When compile=false, output gets .js extension
		expect(result.output).toBe("test.plugin.js");

		const buildCmd = commands.find((cmd) => cmd.startsWith("bun build"));
		expect(buildCmd).toBeDefined();
		expect(buildCmd).not.toContain("--compile");
		// Should have default target=bun when bundling
		expect(buildCmd).toContain("--target bun");

		console.log = originalLog;
	});
});

describe("getPluginCachePath", () => {
	const PLUGIN_DIR = join(TEST_DIR, "cache-test-plugin");
	let env: MockEnvContext;

	beforeEach(async () => {
		await mkdir(join(PLUGIN_DIR, ".claude-plugin"), { recursive: true });
		env = mockEnv({ HOME: "/test/home" });
	});

	afterEach(async () => {
		env.restore();
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("throws when plugin.json not found", async () => {
		const { shell } = createMockShell();

		await expect(
			getPluginCachePath({
				rootDir: PLUGIN_DIR,
				marketplaceName: "test-marketplace",
				shell,
			}),
		).rejects.toThrow("plugin.json not found");
	});

	test("throws when plugin.json missing name or version", async () => {
		await Bun.write(join(PLUGIN_DIR, ".claude-plugin/plugin.json"), JSON.stringify({ name: "test" }));

		const { shell } = createMockShell();

		await expect(
			getPluginCachePath({
				rootDir: PLUGIN_DIR,
				marketplaceName: "test-marketplace",
				shell,
			}),
		).rejects.toThrow("missing name or version");
	});

	test("returns cache path using HOME when CLAUDE_CONFIG_DIR not set", async () => {
		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "my-plugin", version: "1.0.0" }),
		);

		const { shell } = createMockShell();

		const paths = await getPluginCachePath({
			rootDir: PLUGIN_DIR,
			marketplaceName: "test-marketplace",
			shell,
		});

		expect(paths.length).toBe(1);
		expect(paths[0]).toBe("/test/home/.claude/plugins/cache/test-marketplace/my-plugin/1.0.0");
	});

	test("returns cache path using CLAUDE_CONFIG_DIR when set", async () => {
		env.set("CLAUDE_CONFIG_DIR", "/custom/claude/config");
		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "my-plugin", version: "2.0.0" }),
		);

		const { shell } = createMockShell();

		const paths = await getPluginCachePath({
			rootDir: PLUGIN_DIR,
			marketplaceName: "my-marketplace",
			shell,
		});

		expect(paths.length).toBe(1);
		expect(paths[0]).toBe("/custom/claude/config/plugins/cache/my-marketplace/my-plugin/2.0.0");
	});

	test("throws on invalid JSON in plugin.json", async () => {
		await Bun.write(join(PLUGIN_DIR, ".claude-plugin/plugin.json"), "not valid json");

		const { shell } = createMockShell();

		await expect(
			getPluginCachePath({
				rootDir: PLUGIN_DIR,
				marketplaceName: "test-marketplace",
				shell,
			}),
		).rejects.toThrow("failed to parse plugin.json");
	});
});

describe("syncPluginToCache", () => {
	const PLUGIN_DIR = join(TEST_DIR, "sync-test-plugin");
	let env: MockEnvContext;

	beforeEach(async () => {
		await mkdir(join(PLUGIN_DIR, ".claude-plugin"), { recursive: true });
		env = mockEnv({ HOME: "/test/home" });
	});

	afterEach(async () => {
		env.restore();
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("syncs plugin to cache successfully with rsync", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "sync-plugin", version: "1.0.0" }),
		);

		const { shell, commands } = createMockShell();

		const result = await syncPluginToCache({
			rootDir: PLUGIN_DIR,
			marketplaceName: "test-marketplace",
			shell,
		});

		expect(result).toBe(true);

		// Should have called rm, mkdir, and rsync
		expect(commands.some((cmd) => cmd.includes("rm -rf"))).toBe(true);
		expect(commands.some((cmd) => cmd.includes("mkdir -p"))).toBe(true);
		expect(commands.some((cmd) => cmd.includes("rsync"))).toBe(true);

		console.log = originalLog;
	});

	test("falls back to cp when rsync fails", async () => {
		const originalLog = console.log;
		console.log = mock(() => {});

		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "fallback-plugin", version: "1.0.0" }),
		);

		const commands: string[] = [];
		const fallbackShell: ShellExecutor = async (cmd: string) => {
			commands.push(cmd);
			if (cmd.includes("rsync")) {
				return { exitCode: 1, stdout: "", stderr: "rsync not found" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		};

		const result = await syncPluginToCache({
			rootDir: PLUGIN_DIR,
			marketplaceName: "test-marketplace",
			shell: fallbackShell,
		});

		expect(result).toBe(true);
		expect(commands.some((cmd) => cmd.includes("cp -R"))).toBe(true);

		console.log = originalLog;
	});

	test("returns false when both rsync and cp fail", async () => {
		const originalLog = console.log;
		const originalError = console.error;
		console.log = mock(() => {});
		console.error = mock(() => {});

		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "fail-plugin", version: "1.0.0" }),
		);

		const failShell: ShellExecutor = async (cmd: string) => {
			if (cmd.includes("rsync") || cmd.includes("cp -R")) {
				return { exitCode: 1, stdout: "", stderr: "copy failed" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		};

		const result = await syncPluginToCache({
			rootDir: PLUGIN_DIR,
			marketplaceName: "test-marketplace",
			shell: failShell,
		});

		expect(result).toBe(false);

		console.log = originalLog;
		console.error = originalError;
	});

	test("handles exception during sync", async () => {
		const originalLog = console.log;
		const originalError = console.error;
		console.log = mock(() => {});
		console.error = mock(() => {});

		await Bun.write(
			join(PLUGIN_DIR, ".claude-plugin/plugin.json"),
			JSON.stringify({ name: "exception-plugin", version: "1.0.0" }),
		);

		let callCount = 0;
		const throwingShell: ShellExecutor = async () => {
			callCount++;
			// Let mkdir succeed, throw on rsync
			if (callCount <= 2) {
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			throw new Error("Sync exception");
		};

		const result = await syncPluginToCache({
			rootDir: PLUGIN_DIR,
			marketplaceName: "test-marketplace",
			shell: throwingShell,
		});

		expect(result).toBe(false);

		console.log = originalLog;
		console.error = originalError;
	});
});

describe("generatePipelinePluginEntrypoint", () => {
	test("generates valid entrypoint with pipeline hooks", () => {
		const hooks: PipelineHookEntry[] = [
			{
				hookType: "SessionStart",
				name: "project-context",
				isPipeline: true,
				description: "Add project context",
			},
			{
				hookType: "PreToolUse",
				name: "security-check",
				isPipeline: true,
				tools: ["Bash", "Write"],
				description: "Check for dangerous commands",
			},
		];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./my-plugin.ts",
			pluginName: "my-plugin",
			pluginVersion: "1.0.0",
			hooks,
			commands: [],
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		// Check that it imports the plugin definition
		expect(entrypoint).toContain('import pluginDefinition from "./my-plugin.ts"');

		// Check that it imports the pipeline runtime
		expect(entrypoint).toContain("@savvy-web/bun-hooks/pipeline-runtime");

		// Check that it has the correct hook cases
		expect(entrypoint).toContain('case "SessionStart/project-context"');
		expect(entrypoint).toContain('case "PreToolUse/security-check"');

		// Check that tools filter is included
		expect(entrypoint).toContain('["Bash", "Write"]');

		// Check for runPipeline call
		expect(entrypoint).toContain("runPipeline(");
	});

	test("generates valid entrypoint with raw handler hooks", () => {
		const hooks: PipelineHookEntry[] = [
			{
				hookType: "PreToolUse",
				name: "raw-handler",
				isPipeline: false,
				description: "Raw handler test",
			},
		];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./raw-plugin.ts",
			pluginName: "raw-plugin",
			pluginVersion: "2.0.0",
			hooks,
			commands: [],
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		// Check for runRawHandler call
		expect(entrypoint).toContain("runRawHandler(");
		expect(entrypoint).toContain('case "PreToolUse/raw-handler"');
	});

	test("generates entrypoint with commands", () => {
		const hooks: PipelineHookEntry[] = [
			{
				hookType: "SessionStart",
				name: "init",
				isPipeline: true,
			},
		];

		const commands = [
			{ name: "lint", path: "./commands/lint.js", description: "Run linter" },
			{ name: "test", path: "./commands/test.js", description: "Run tests" },
		];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./plugin.ts",
			pluginName: "workflow",
			pluginVersion: "1.0.0",
			hooks,
			commands,
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		// Check for command cases
		expect(entrypoint).toContain('case "lint"');
		expect(entrypoint).toContain('case "test"');
		expect(entrypoint).toContain("./commands/lint.js");
		expect(entrypoint).toContain("./commands/test.js");
	});

	test("generates help text with hook descriptions", () => {
		const hooks: PipelineHookEntry[] = [
			{
				hookType: "SessionStart",
				name: "context",
				isPipeline: true,
				description: "Add context to session",
			},
		];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./plugin.ts",
			pluginName: "test-plugin",
			pluginVersion: "1.0.0",
			hooks,
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		// Check help text
		expect(entrypoint).toContain("test-plugin v1.0.0");
		expect(entrypoint).toContain("SessionStart/context");
		expect(entrypoint).toContain("Add context to session");
	});

	test("includes sidecar support", () => {
		const hooks: PipelineHookEntry[] = [{ hookType: "SessionStart", name: "test", isPipeline: true }];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./plugin.ts",
			pluginName: "test",
			pluginVersion: "1.0.0",
			hooks,
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		expect(entrypoint).toContain("--sidecar");
		expect(entrypoint).toContain("runSidecar");
		expect(entrypoint).toContain("@savvy-web/bun-hooks/otel/sidecar");
	});

	test("calls setPluginInfo with plugin name and version", () => {
		const hooks: PipelineHookEntry[] = [{ hookType: "SessionStart", name: "test", isPipeline: true }];

		const options: GeneratePipelinePluginOptions = {
			pluginPath: "./plugin.ts",
			pluginName: "my-plugin",
			pluginVersion: "2.5.0",
			hooks,
		};

		const entrypoint = generatePipelinePluginEntrypoint(options);

		expect(entrypoint).toContain('const PLUGIN_NAME = "my-plugin"');
		expect(entrypoint).toContain('const PLUGIN_VERSION = "2.5.0"');
		expect(entrypoint).toContain("setPluginInfo({ name: PLUGIN_NAME, version: PLUGIN_VERSION })");
	});
});

describe("extractPassthroughHookEntries", () => {
	test("extracts passthrough hooks from config", () => {
		const config = {
			hooks: {
				SessionStart: [
					{ name: "compiled", pipeline: () => ({}) },
					{ matcher: "startup", hooks: [{ type: "command" as const, command: "bash ./init.sh" }] },
				],
				PreToolUse: [{ hooks: [{ type: "command" as const, command: "echo hello" }] }],
			},
		};

		const result = extractPassthroughHookEntries(config);

		expect(result).toHaveProperty("SessionStart");
		expect(result.SessionStart).toHaveLength(1);
		expect(result.SessionStart?.[0]?.matcher).toBe("startup");
		expect(result.SessionStart?.[0]?.hooks[0]?.command).toBe("bash ./init.sh");

		expect(result).toHaveProperty("PreToolUse");
		expect(result.PreToolUse).toHaveLength(1);
		expect(result.PreToolUse?.[0]?.matcher).toBeUndefined();
	});

	test("returns empty object when no passthrough hooks", () => {
		const config = {
			hooks: {
				SessionStart: [{ name: "compiled", pipeline: () => ({}) }],
			},
		};

		const result = extractPassthroughHookEntries(config);

		expect(Object.keys(result)).toHaveLength(0);
	});

	test("skips non-passthrough hooks", () => {
		const config = {
			hooks: {
				SessionStart: [
					{ name: "pipeline-hook", pipeline: () => ({}) },
					{ name: "handler-hook", handler: () => {} },
				],
			},
		};

		const result = extractPassthroughHookEntries(config);

		expect(Object.keys(result)).toHaveLength(0);
	});
});

describe("generateHooksJson", () => {
	test("generates hooks.json with compiled hooks", () => {
		const hooks: PipelineHookEntry[] = [
			{ hookType: "SessionStart", name: "context", isPipeline: true },
			{ hookType: "PreToolUse", name: "filter", isPipeline: true, tools: ["Bash", "Write"] },
		];

		const result = generateHooksJson({ pluginBinaryName: "my.plugin", hooks });

		// All hooks use CLAUDE_PLUGIN_ROOT (provided by Claude Code)
		expect(result.hooks.SessionStart).toHaveLength(1);
		const sessionCmd = result.hooks.SessionStart?.[0]?.hooks[0]?.command;
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Template literal is intentional - Claude Code variable
		expect(sessionCmd).toBe("${CLAUDE_PLUGIN_ROOT}/my.plugin --hook=SessionStart/context");

		expect(result.hooks.PreToolUse).toHaveLength(1);
		const preToolCmd = result.hooks.PreToolUse?.[0]?.hooks[0]?.command;
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Template literal is intentional - Claude Code variable
		expect(preToolCmd).toBe("${CLAUDE_PLUGIN_ROOT}/my.plugin --hook=PreToolUse/filter");
		expect(result.hooks.PreToolUse?.[0]?.matcher).toBe("Bash|Write");
	});

	test("includes passthrough hooks directly", () => {
		const hooks: PipelineHookEntry[] = [{ hookType: "SessionStart", name: "compiled", isPipeline: true }];

		const passthroughHooks = {
			SessionStart: [{ matcher: "startup", hooks: [{ type: "command" as const, command: "bash init.sh" }] }],
			Stop: [{ hooks: [{ type: "command" as const, command: "bash cleanup.sh" }] }],
		};

		const result = generateHooksJson({ pluginBinaryName: "my.plugin", hooks, passthroughHooks });

		// SessionStart should have both compiled and passthrough
		expect(result.hooks.SessionStart).toHaveLength(2);
		expect(result.hooks.SessionStart?.[0]?.hooks[0]?.command).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: Template literal is intentional - Claude Code variable
			"${CLAUDE_PLUGIN_ROOT}/my.plugin --hook=SessionStart/compiled",
		);
		expect(result.hooks.SessionStart?.[1]?.matcher).toBe("startup");
		expect(result.hooks.SessionStart?.[1]?.hooks[0]?.command).toBe("bash init.sh");

		// Stop should only have passthrough (no compiled hooks)
		expect(result.hooks.Stop).toHaveLength(1);
		expect(result.hooks.Stop?.[0]?.hooks[0]?.command).toBe("bash cleanup.sh");
	});

	test("handles empty hooks gracefully", () => {
		const result = generateHooksJson({ pluginBinaryName: "my.plugin", hooks: [] });

		expect(Object.keys(result.hooks)).toHaveLength(0);
	});
});
