import { describe, expect, test } from "bun:test";
import type { GeneratedFile, ScaffoldConfig } from "./scaffold.js";
import { generateMarketplaceProject } from "./templates/marketplace.js";
import { generatePluginProject } from "./templates/plugin.js";
import { HOOK_NAME_MAP, toKebabCase, toScreamingSnake } from "./templates/shared.js";

const baseConfig: ScaffoldConfig = {
	directory: "/tmp/test-plugin",
	name: "test-plugin",
	type: "plugin",
	prefix: "TEST_PLUGIN",
	description: "A test plugin",
	hooks: ["SessionStart", "PreToolUse"],
	includeCommands: true,
	includeOtel: false,
	includeLintStaged: true,
	includeCommitlint: true,
	includeChangesets: true,
	initGit: false,
	runInstall: false,
	author: { name: "Test Author", email: "test@example.com" },
	githubOwner: "test-owner",
	license: "MIT",
};

/** Find a file by path and assert it exists, returning a non-undefined value. */
function findFile(files: GeneratedFile[], path: string): GeneratedFile {
	const file = files.find((f) => f.path === path);
	if (!file) throw new Error(`Expected file not found: ${path}`);
	return file;
}

// =============================================================================
// SHARED TEMPLATE UTILITIES
// =============================================================================

describe("toScreamingSnake", () => {
	test("converts kebab-case to SCREAMING_SNAKE_CASE", () => {
		expect(toScreamingSnake("my-cool-plugin")).toBe("MY_COOL_PLUGIN");
	});

	test("converts camelCase to SCREAMING_SNAKE_CASE", () => {
		expect(toScreamingSnake("myCoolPlugin")).toBe("MY_COOL_PLUGIN");
	});

	test("converts space-separated to SCREAMING_SNAKE_CASE", () => {
		expect(toScreamingSnake("my cool plugin")).toBe("MY_COOL_PLUGIN");
	});

	test("converts dot-separated to SCREAMING_SNAKE_CASE", () => {
		expect(toScreamingSnake("my.cool.plugin")).toBe("MY_COOL_PLUGIN");
	});

	test("handles already uppercase input", () => {
		expect(toScreamingSnake("MY_PLUGIN")).toBe("MY_PLUGIN");
	});

	test("handles single word", () => {
		expect(toScreamingSnake("plugin")).toBe("PLUGIN");
	});
});

describe("toKebabCase", () => {
	test("converts camelCase to kebab-case", () => {
		expect(toKebabCase("myCoolPlugin")).toBe("my-cool-plugin");
	});

	test("converts SCREAMING_SNAKE_CASE to kebab-case", () => {
		expect(toKebabCase("MY_COOL_PLUGIN")).toBe("my-cool-plugin");
	});

	test("converts space-separated to kebab-case", () => {
		expect(toKebabCase("my cool plugin")).toBe("my-cool-plugin");
	});

	test("converts dot-separated to kebab-case", () => {
		expect(toKebabCase("my.cool.plugin")).toBe("my-cool-plugin");
	});

	test("handles already kebab-case input", () => {
		expect(toKebabCase("my-plugin")).toBe("my-plugin");
	});

	test("handles single word", () => {
		expect(toKebabCase("Plugin")).toBe("plugin");
	});
});

// =============================================================================
// SINGLE PLUGIN TEMPLATE GENERATION
// =============================================================================

describe("generatePluginProject", () => {
	test("generates correct file list for SessionStart + PreToolUse hooks", () => {
		const files = generatePluginProject(baseConfig);
		const paths = files.map((f) => f.path);

		// Plugin manifest
		expect(paths).toContain(".claude-plugin/plugin.json");

		// Plugin config
		expect(paths).toContain("plugin.config.ts");

		// Hook handlers
		expect(paths).toContain("hooks/context.hook.ts");
		expect(paths).toContain("hooks/security.hook.ts");

		// Hook tests
		expect(paths).toContain("tests/context.hook.test.ts");
		expect(paths).toContain("tests/security.hook.test.ts");

		// Command files
		expect(paths).toContain("commands/example.cmd.ts");
		expect(paths).toContain("skills/example.md");
		expect(paths).toContain("tests/example.cmd.test.ts");

		// Config files
		expect(paths).toContain("package.json");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain("biome.jsonc");
		expect(paths).toContain("bunfig.toml");
		expect(paths).toContain(".gitignore");
		expect(paths).toContain("CLAUDE.md");
	});

	test("always includes SessionStart even when not in hooks array", () => {
		const config: ScaffoldConfig = { ...baseConfig, hooks: ["PreToolUse"] };
		const files = generatePluginProject(config);
		const paths = files.map((f) => f.path);

		expect(paths).toContain("hooks/context.hook.ts");
		expect(paths).toContain("tests/context.hook.test.ts");
		expect(paths).toContain("hooks/security.hook.ts");
		expect(paths).toContain("tests/security.hook.test.ts");
	});

	test("does not duplicate SessionStart when already in hooks array", () => {
		const files = generatePluginProject(baseConfig);
		const contextHooks = files.filter((f) => f.path === "hooks/context.hook.ts");
		expect(contextHooks).toHaveLength(1);
	});

	test("includes command files when includeCommands is true", () => {
		const files = generatePluginProject(baseConfig);
		const paths = files.map((f) => f.path);

		expect(paths).toContain("commands/example.cmd.ts");
		expect(paths).toContain("skills/example.md");
		expect(paths).toContain("tests/example.cmd.test.ts");
	});

	test("excludes command files when includeCommands is false", () => {
		const config: ScaffoldConfig = { ...baseConfig, includeCommands: false };
		const files = generatePluginProject(config);
		const paths = files.map((f) => f.path);

		expect(paths).not.toContain("commands/example.cmd.ts");
		expect(paths).not.toContain("skills/example.md");
		expect(paths).not.toContain("tests/example.cmd.test.ts");
	});

	test("generates valid plugin.config.ts with correct prefix", () => {
		const files = generatePluginProject(baseConfig);
		const configFile = findFile(files, "plugin.config.ts");

		expect(configFile.content).toContain('prefix: "TEST_PLUGIN"');
		expect(configFile.content).toContain("ClaudeBinaryPlugin.create(");
		expect(configFile.content).toContain("export default plugin;");
		expect(configFile.content).toContain("export type Pipeline = InferPluginPipeline<typeof plugin>;");
		expect(configFile.content).toContain("export type Commands = InferPluginCommands<typeof plugin>;");
	});

	test("plugin.config.ts includes hooks section for configured hook types", () => {
		const files = generatePluginProject(baseConfig);
		const configFile = findFile(files, "plugin.config.ts");

		expect(configFile.content).toContain("SessionStart:");
		expect(configFile.content).toContain("PreToolUse:");
		expect(configFile.content).toContain('./hooks/context.hook.ts"');
		expect(configFile.content).toContain('./hooks/security.hook.ts"');
	});

	test("plugin.config.ts includes commands section when includeCommands is true", () => {
		const files = generatePluginProject(baseConfig);
		const configFile = findFile(files, "plugin.config.ts");

		expect(configFile.content).toContain("commands:");
		expect(configFile.content).toContain("example:");
		expect(configFile.content).toContain('./commands/example.cmd.ts"');
	});

	test("plugin.config.ts excludes commands section when includeCommands is false", () => {
		const config: ScaffoldConfig = { ...baseConfig, includeCommands: false };
		const files = generatePluginProject(config);
		const configFile = findFile(files, "plugin.config.ts");

		expect(configFile.content).not.toContain("commands:");
	});

	test("generates valid package.json with correct name and deps", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.name).toBe("test-plugin");
		expect(pkg.type).toBe("module");
		expect(pkg.dependencies["claude-binary-plugin"]).toBeDefined();
		expect(pkg.peerDependencies.zod).toBeDefined();
		expect(pkg.devDependencies["@types/bun"]).toBeDefined();
		expect(pkg.devDependencies["@biomejs/biome"]).toBeDefined();
		expect(pkg.devDependencies.typescript).toBeDefined();
		expect(pkg.scripts.build).toBe("claude-binary-plugin build");
		expect(pkg.scripts.test).toBe("bun test");
	});

	test("generated hook files contain correct Pipeline type annotation", () => {
		const files = generatePluginProject(baseConfig);

		const contextHook = findFile(files, "hooks/context.hook.ts");
		expect(contextHook.content).toContain('import type { Pipeline } from "../plugin.config.js";');
		expect(contextHook.content).toContain('const handler: Pipeline["SessionStart"]');

		const securityHook = findFile(files, "hooks/security.hook.ts");
		expect(securityHook.content).toContain('import type { Pipeline } from "../plugin.config.js";');
		expect(securityHook.content).toContain('const handler: Pipeline["PreToolUse"]');
	});

	test("generates files for all supported hook types", () => {
		const allHooks = Object.keys(HOOK_NAME_MAP);
		const config: ScaffoldConfig = { ...baseConfig, hooks: allHooks };
		const files = generatePluginProject(config);
		const paths = files.map((f) => f.path);

		for (const mapping of Object.values(HOOK_NAME_MAP)) {
			expect(paths).toContain(`hooks/${mapping.file}.hook.ts`);
			expect(paths).toContain(`tests/${mapping.file}.hook.test.ts`);
		}
	});

	test("PreToolUse hook config includes tools array in plugin.config.ts", () => {
		const files = generatePluginProject(baseConfig);
		const configFile = findFile(files, "plugin.config.ts");

		expect(configFile.content).toContain('tools: ["Bash"]');
	});

	test("includes LICENSE and README.md files", () => {
		const files = generatePluginProject(baseConfig);
		const paths = files.map((f) => f.path);

		expect(paths).toContain("LICENSE");
		expect(paths).toContain("README.md");
	});

	test("plugin.json includes author and license", () => {
		const files = generatePluginProject(baseConfig);
		const pluginJson = findFile(files, ".claude-plugin/plugin.json");

		const manifest = JSON.parse(pluginJson.content);
		expect(manifest.author).toEqual({ name: "Test Author", email: "test@example.com" });
		expect(manifest.license).toBe("MIT");
	});

	test("package.json includes author, license, and repository fields", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.author).toEqual({ name: "Test Author", email: "test@example.com" });
		expect(pkg.license).toBe("MIT");
		expect(pkg.repository).toEqual({
			type: "git",
			url: "git+https://github.com/test-owner/test-plugin.git",
		});
		expect(pkg.homepage).toBe("https://github.com/test-owner/test-plugin#readme");
		expect(pkg.bugs).toEqual({ url: "https://github.com/test-owner/test-plugin/issues" });
	});

	test("package.json uses tsgo for typecheck script", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.scripts.typecheck).toBe("tsgo --noEmit");
	});

	test("package.json pins Bun version", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.packageManager).toBe("bun@1.3.9");
		expect(pkg.engines).toEqual({ bun: ">=1.3.9" });
		expect(pkg.engineStrict).toBe(true);
		expect(pkg.devEngines.runtime).toEqual([{ name: "bun", version: "1.3.9", onFail: "ignore" }]);
		expect(pkg.devEngines.packageManager).toEqual({ name: "bun", version: "1.3.9", onFail: "ignore" });
	});

	test("package.json pins @types/bun version", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.devDependencies["@types/bun"]).toBe("1.3.9");
	});

	test("package.json includes tooling deps when enabled", () => {
		const files = generatePluginProject(baseConfig);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.devDependencies["@savvy-web/lint-staged"]).toBe("^0.4.6");
		expect(pkg.devDependencies["@savvy-web/commitlint"]).toBe("^0.3.4");
		expect(pkg.devDependencies["@savvy-web/changesets"]).toBe("^0.1.2");
		expect(pkg.scripts.prepare).toBe("husky");
	});

	test("package.json excludes tooling deps when disabled", () => {
		const config: ScaffoldConfig = {
			...baseConfig,
			includeLintStaged: false,
			includeCommitlint: false,
			includeChangesets: false,
		};
		const files = generatePluginProject(config);
		const pkgFile = findFile(files, "package.json");

		const pkg = JSON.parse(pkgFile.content);
		expect(pkg.devDependencies["@savvy-web/lint-staged"]).toBeUndefined();
		expect(pkg.devDependencies["@savvy-web/commitlint"]).toBeUndefined();
		expect(pkg.devDependencies["@savvy-web/changesets"]).toBeUndefined();
		expect(pkg.scripts.prepare).toBeUndefined();
	});

	test("tsconfig.json extends claude-binary-plugin preset", () => {
		const files = generatePluginProject(baseConfig);
		const tsConfigFile = findFile(files, "tsconfig.json");

		const tsconfig = JSON.parse(tsConfigFile.content);
		expect(tsconfig.extends).toEqual(["claude-binary-plugin/tsconfig/root.json"]);
		expect(tsconfig.compilerOptions).toBeUndefined();
	});

	test("bunfig.toml includes test coverage configuration", () => {
		const files = generatePluginProject(baseConfig);
		const bunfig = findFile(files, "bunfig.toml");

		expect(bunfig.content).toContain("[test]");
		expect(bunfig.content).toContain("coverage = true");
		expect(bunfig.content).toContain("coverageSkipTestFiles = true");
		expect(bunfig.content).toContain("[test.coverageThreshold]");
		expect(bunfig.content).toContain("line = 0.9");
	});

	test("biome.jsonc uses lint-staged preset when enabled", () => {
		const files = generatePluginProject(baseConfig);
		const biomeFile = findFile(files, "biome.jsonc");

		const biome = JSON.parse(biomeFile.content);
		expect(biome.$schema).toContain("2.4.1");
		expect(biome.extends).toEqual(["@savvy-web/lint-staged/biome/silk.jsonc"]);
	});

	test("biome.jsonc uses inline config when lint-staged disabled", () => {
		const config: ScaffoldConfig = { ...baseConfig, includeLintStaged: false };
		const files = generatePluginProject(config);
		const biomeFile = findFile(files, "biome.jsonc");

		const biome = JSON.parse(biomeFile.content);
		expect(biome.$schema).toContain("1.9.0");
		expect(biome.formatter).toBeDefined();
		expect(biome.linter).toBeDefined();
	});
});

// =============================================================================
// MARKETPLACE TEMPLATE GENERATION
// =============================================================================

describe("generateMarketplaceProject", () => {
	const marketplaceConfig: ScaffoldConfig = {
		...baseConfig,
		type: "marketplace",
	};

	test("generates root-level files", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const paths = files.map((f) => f.path);

		expect(paths).toContain(".claude-plugin/marketplace.json");
		expect(paths).toContain("package.json");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain("biome.jsonc");
		expect(paths).toContain("bunfig.toml");
		expect(paths).toContain("turbo.json");
		expect(paths).toContain(".gitignore");
		expect(paths).toContain("CLAUDE.md");
	});

	test("generates plugin-level files under plugins/{name}-plugin/", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const paths = files.map((f) => f.path);
		const pluginDir = "plugins/test-plugin-plugin";

		expect(paths).toContain(`${pluginDir}/.claude-plugin/plugin.json`);
		expect(paths).toContain(`${pluginDir}/plugin.config.ts`);
		expect(paths).toContain(`${pluginDir}/package.json`);
		expect(paths).toContain(`${pluginDir}/tsconfig.json`);
		expect(paths).toContain(`${pluginDir}/biome.jsonc`);
		expect(paths).toContain(`${pluginDir}/turbo.json`);
		expect(paths).toContain(`${pluginDir}/hooks/context.hook.ts`);
		expect(paths).toContain(`${pluginDir}/hooks/security.hook.ts`);
		expect(paths).toContain(`${pluginDir}/tests/context.hook.test.ts`);
		expect(paths).toContain(`${pluginDir}/tests/security.hook.test.ts`);
	});

	test("generates command files under plugin dir when includeCommands is true", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const paths = files.map((f) => f.path);
		const pluginDir = "plugins/test-plugin-plugin";

		expect(paths).toContain(`${pluginDir}/commands/example.cmd.ts`);
		expect(paths).toContain(`${pluginDir}/skills/example.md`);
		expect(paths).toContain(`${pluginDir}/tests/example.cmd.test.ts`);
	});

	test("excludes command files under plugin dir when includeCommands is false", () => {
		const config: ScaffoldConfig = { ...marketplaceConfig, includeCommands: false };
		const files = generateMarketplaceProject(config);
		const paths = files.map((f) => f.path);

		const commandFiles = paths.filter((p) => p.includes("commands/") || p.includes("skills/"));
		expect(commandFiles).toHaveLength(0);
	});

	test("root package.json has workspaces config", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.name).toBe("test-plugin");
		expect(pkg.private).toBe(true);
		expect(pkg.workspaces).toEqual(["plugins/*"]);
		expect(pkg.scripts.build).toBe("turbo run build --log-order=grouped");
		expect(pkg.devDependencies.turbo).toBeDefined();
	});

	test("root tsconfig extends claude-binary-plugin preset with references", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootTsConfig = findFile(files, "tsconfig.json");

		const tsconfig = JSON.parse(rootTsConfig.content);
		expect(tsconfig.extends).toEqual(["claude-binary-plugin/tsconfig/root.json"]);
		expect(tsconfig.references).toEqual([{ path: "plugins/test-plugin-plugin" }]);
	});

	test("plugin-level tsconfig extends root", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginTsConfig = findFile(files, "plugins/test-plugin-plugin/tsconfig.json");

		const tsconfig = JSON.parse(pluginTsConfig.content);
		expect(tsconfig.extends).toBe("../../tsconfig.json");
		expect(tsconfig.compilerOptions.composite).toBe(true);
	});

	test("plugin-level biome extends root", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginBiome = findFile(files, "plugins/test-plugin-plugin/biome.jsonc");

		const biome = JSON.parse(pluginBiome.content);
		expect(biome.extends).toEqual(["//"]); // Biome's workspace root shorthand
	});

	test("includes turbo.json at root level", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootTurbo = findFile(files, "turbo.json");

		const turbo = JSON.parse(rootTurbo.content);
		expect(turbo.$schema).toContain("turbo.build");
		expect(turbo.tasks.build).toBeDefined();
		expect(turbo.tasks.test).toBeDefined();
		expect(turbo.tasks.lint).toBeDefined();
		expect(turbo.tasks.typecheck).toBeDefined();
	});

	test("includes simplified turbo.json at plugin level", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginTurbo = findFile(files, "plugins/test-plugin-plugin/turbo.json");

		const turbo = JSON.parse(pluginTurbo.content);
		expect(turbo.extends).toEqual(["//"]); // Turbo workspace root shorthand
		expect(turbo.tasks).toBeUndefined();
	});

	test("always includes SessionStart even when not in hooks array", () => {
		const config: ScaffoldConfig = { ...marketplaceConfig, hooks: ["PreToolUse"] };
		const files = generateMarketplaceProject(config);
		const paths = files.map((f) => f.path);
		const pluginDir = "plugins/test-plugin-plugin";

		expect(paths).toContain(`${pluginDir}/hooks/context.hook.ts`);
		expect(paths).toContain(`${pluginDir}/hooks/security.hook.ts`);
	});

	test("marketplace.json includes plugin entry", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const manifest = findFile(files, ".claude-plugin/marketplace.json");

		const json = JSON.parse(manifest.content);
		expect(json.name).toBe("test-plugin");
		expect(json.plugins).toHaveLength(1);
		expect(json.plugins[0].name).toBe("test-plugin-plugin");
		expect(json.plugins[0].source).toBe("./plugins/test-plugin-plugin");
	});

	test("plugin package.json in workspace omits root-level devDependencies", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginPkg = findFile(files, "plugins/test-plugin-plugin/package.json");

		const pkg = JSON.parse(pluginPkg.content);
		expect(pkg.name).toBe("test-plugin-plugin");
		expect(pkg.dependencies["claude-binary-plugin"]).toBeDefined();
		// Workspace plugin packages don't include root-level deps like biome/typescript
		expect(pkg.devDependencies["@biomejs/biome"]).toBeUndefined();
		expect(pkg.devDependencies.typescript).toBeUndefined();
	});

	test("gitignore includes turbo cache for marketplace projects", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const gitignore = findFile(files, ".gitignore");

		expect(gitignore.content).toContain(".turbo/");
	});

	test("includes LICENSE and README.md at root level", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const paths = files.map((f) => f.path);

		expect(paths).toContain("LICENSE");
		expect(paths).toContain("README.md");
	});

	test("marketplace.json uses config.author for owner", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const manifest = findFile(files, ".claude-plugin/marketplace.json");

		const json = JSON.parse(manifest.content);
		expect(json.owner).toEqual({ name: "Test Author", email: "test@example.com" });
	});

	test("root package.json includes author, license, and repository fields", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.author).toEqual({ name: "Test Author", email: "test@example.com" });
		expect(pkg.license).toBe("MIT");
		expect(pkg.repository).toEqual({
			type: "git",
			url: "git+https://github.com/test-owner/test-plugin.git",
		});
		expect(pkg.homepage).toBe("https://github.com/test-owner/test-plugin#readme");
		expect(pkg.bugs).toEqual({ url: "https://github.com/test-owner/test-plugin/issues" });
	});

	test("root package.json has validate scripts", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.scripts.validate).toBe("turbo run validate --log-prefix=none");
		expect(pkg.scripts["validate:marketplace"]).toBe("claude plugin validate .");
	});

	test("turbo.json has globalPassThroughEnv and validate task", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootTurbo = findFile(files, "turbo.json");

		const turbo = JSON.parse(rootTurbo.content);
		expect(turbo.globalPassThroughEnv).toEqual(["CLAUDE_CONFIG_HOME", "HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"]);
		expect(turbo.tasks.validate).toBeDefined();
		expect(turbo.tasks.validate.cache).toBe(false);
		expect(turbo.tasks["validate:marketplace"]).toBeDefined();
		expect(turbo.tasks["validate:marketplace"].cache).toBe(false);
	});

	test("plugin-level package.json has validate script in workspace mode", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginPkg = findFile(files, "plugins/test-plugin-plugin/package.json");

		const pkg = JSON.parse(pluginPkg.content);
		expect(pkg.scripts.validate).toBe("claude plugin validate .");
	});

	test("plugin-level package.json uses tsgo for typecheck", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const pluginPkg = findFile(files, "plugins/test-plugin-plugin/package.json");

		const pkg = JSON.parse(pluginPkg.content);
		expect(pkg.scripts.typecheck).toBe("tsgo --noEmit");
	});

	test("root package.json pins Bun version", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.packageManager).toBe("bun@1.3.9");
		expect(pkg.engines).toEqual({ bun: ">=1.3.9" });
		expect(pkg.engineStrict).toBe(true);
		expect(pkg.devDependencies["@types/bun"]).toBe("1.3.9");
	});

	test("root package.json includes tooling deps when enabled", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.devDependencies["@savvy-web/lint-staged"]).toBe("^0.4.6");
		expect(pkg.devDependencies["@savvy-web/commitlint"]).toBe("^0.3.4");
		expect(pkg.devDependencies["@savvy-web/changesets"]).toBe("^0.1.2");
		expect(pkg.scripts.prepare).toBe("husky");
	});

	test("root package.json excludes tooling deps when disabled", () => {
		const config: ScaffoldConfig = {
			...marketplaceConfig,
			includeLintStaged: false,
			includeCommitlint: false,
			includeChangesets: false,
		};
		const files = generateMarketplaceProject(config);
		const rootPkg = findFile(files, "package.json");

		const pkg = JSON.parse(rootPkg.content);
		expect(pkg.devDependencies["@savvy-web/lint-staged"]).toBeUndefined();
		expect(pkg.devDependencies["@savvy-web/commitlint"]).toBeUndefined();
		expect(pkg.devDependencies["@savvy-web/changesets"]).toBeUndefined();
		expect(pkg.scripts.prepare).toBeUndefined();
	});

	test("bunfig.toml included at root level", () => {
		const files = generateMarketplaceProject(marketplaceConfig);
		const bunfig = findFile(files, "bunfig.toml");

		expect(bunfig.content).toContain("[test]");
		expect(bunfig.content).toContain("coverage = true");
	});
});
