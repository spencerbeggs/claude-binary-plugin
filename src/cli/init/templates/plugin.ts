/**
 * Single plugin project template generator.
 *
 * Generates a standalone plugin repository with hooks, commands,
 * tests, and all configuration needed for building and distribution.
 */

import type { GeneratedFile, ScaffoldConfig } from "../scaffold.js";
import {
	HOOK_NAME_MAP,
	generateBiomeConfig,
	generateBunfigToml,
	generateClaudeMd,
	generateCommandHandler,
	generateCommandTest,
	generateGitignore,
	generateHookHandler,
	generateHookTest,
	generateLicenseFile,
	generatePackageJson,
	generatePluginConfig,
	generatePluginJson,
	generateReadme,
	generateSkillMd,
	generateTsConfig,
} from "./shared.js";

export function generatePluginProject(config: ScaffoldConfig): GeneratedFile[] {
	const files: GeneratedFile[] = [];

	// Ensure SessionStart is always included (required for cross-platform distribution)
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	// --- Plugin manifest ---

	files.push({
		path: ".claude-plugin/plugin.json",
		content: generatePluginJson(config),
	});

	// --- Plugin configuration ---

	files.push({
		path: "plugin.config.ts",
		content: generatePluginConfig(config),
	});

	// --- Hook handler and test files ---

	for (const hookType of hooks) {
		const mapping = HOOK_NAME_MAP[hookType];
		if (!mapping) continue;

		files.push({
			path: `hooks/${mapping.file}.hook.ts`,
			content: generateHookHandler(hookType, mapping.name, config.prefix),
		});

		files.push({
			path: `tests/${mapping.file}.hook.test.ts`,
			content: generateHookTest(hookType, mapping.name),
		});
	}

	// --- Command, skill, and test files ---

	if (config.includeCommands) {
		files.push({
			path: "commands/example.cmd.ts",
			content: generateCommandHandler("example", config.prefix, config.name),
		});

		files.push({
			path: "skills/example.md",
			content: generateSkillMd("example", config.prefix, config.name),
		});

		files.push({
			path: "tests/example.cmd.test.ts",
			content: generateCommandTest("example"),
		});
	}

	// --- Configuration files ---

	files.push({
		path: "package.json",
		content: generatePackageJson(config),
	});

	files.push({
		path: "tsconfig.json",
		content: generateTsConfig(),
	});

	files.push({
		path: "biome.jsonc",
		content: generateBiomeConfig({ root: true, lintStagedPreset: config.includeLintStaged }),
	});

	files.push({
		path: "bunfig.toml",
		content: generateBunfigToml(),
	});

	files.push({
		path: ".gitignore",
		content: generateGitignore(),
	});

	files.push({
		path: "CLAUDE.md",
		content: generateClaudeMd(config),
	});

	files.push({
		path: "LICENSE",
		content: generateLicenseFile(config),
	});

	files.push({
		path: "README.md",
		content: generateReadme(config),
	});

	return files;
}
