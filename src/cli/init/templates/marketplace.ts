/**
 * Marketplace (multi-plugin) project template generator.
 *
 * Generates a monorepo structure with workspace configuration,
 * Turborepo orchestration, and an example plugin with hooks/commands.
 */

import type { GeneratedFile, ScaffoldConfig } from "../scaffold.js";
import {
	HOOK_NAME_MAP,
	generateBiomeConfig,
	generateCommandHandler,
	generateCommandTest,
	generateGitignore,
	generateHookHandler,
	generateHookTest,
	generatePackageJson,
	generatePluginConfig,
	generatePluginJson,
	generateSkillMd,
	generateTsConfig,
} from "./shared.js";

export function generateMarketplaceProject(config: ScaffoldConfig): GeneratedFile[] {
	const files: GeneratedFile[] = [];
	const pluginName = `${config.name}-plugin`;
	const pluginDir = `plugins/${pluginName}`;

	// Ensure SessionStart is always included (required for cross-platform distribution)
	const hooks = config.hooks.includes("SessionStart") ? config.hooks : ["SessionStart", ...config.hooks];

	// --- ROOT LEVEL FILES ---

	files.push({
		path: ".claude-plugin/marketplace.json",
		content: generateMarketplaceJson(config, pluginName),
	});

	files.push({
		path: "package.json",
		content: generateRootPackageJson(config),
	});

	files.push({
		path: "tsconfig.json",
		content: generateRootTsConfig(pluginName),
	});

	files.push({
		path: "biome.jsonc",
		content: generateBiomeConfig({ root: true }),
	});

	files.push({
		path: "turbo.json",
		content: generateTurboJson(),
	});

	files.push({
		path: ".gitignore",
		content: generateGitignore({ marketplace: true }),
	});

	files.push({
		path: "CLAUDE.md",
		content: generateMarketplaceClaudeMd(config, pluginName, hooks),
	});

	// --- PLUGIN-LEVEL FILES ---

	files.push({
		path: `${pluginDir}/.claude-plugin/plugin.json`,
		content: generatePluginJson(config, pluginName),
	});

	files.push({
		path: `${pluginDir}/plugin.config.ts`,
		content: generatePluginConfig({ ...config, name: pluginName }),
	});

	files.push({
		path: `${pluginDir}/package.json`,
		content: generatePackageJson(config, { workspace: true, pluginName }),
	});

	files.push({
		path: `${pluginDir}/tsconfig.json`,
		content: generateTsConfig({ extends: "../../tsconfig.json", composite: true }),
	});

	files.push({
		path: `${pluginDir}/biome.jsonc`,
		content: generateBiomeConfig({ root: false }),
	});

	files.push({
		path: `${pluginDir}/turbo.json`,
		content: generatePluginTurboJson(),
	});

	// Hook handler and test files
	for (const hookType of hooks) {
		const mapping = HOOK_NAME_MAP[hookType];
		if (!mapping) continue;

		files.push({
			path: `${pluginDir}/hooks/${mapping.file}.hook.ts`,
			content: generateHookHandler(hookType, mapping.name, config.prefix),
		});

		files.push({
			path: `${pluginDir}/tests/${mapping.file}.hook.test.ts`,
			content: generateHookTest(hookType, mapping.name),
		});
	}

	// Command, skill, and test files
	if (config.includeCommands) {
		files.push({
			path: `${pluginDir}/commands/example.cmd.ts`,
			content: generateCommandHandler("example", config.prefix, pluginName),
		});

		files.push({
			path: `${pluginDir}/skills/example.md`,
			content: generateSkillMd("example", config.prefix, pluginName),
		});

		files.push({
			path: `${pluginDir}/tests/example.cmd.test.ts`,
			content: generateCommandTest("example"),
		});
	}

	return files;
}

function generateMarketplaceJson(config: ScaffoldConfig, pluginName: string): string {
	const manifest = {
		name: config.name,
		owner: { name: "", email: "" },
		metadata: {
			description: config.description,
			version: "0.1.0",
			pluginRoot: "./plugins",
		},
		strict: true,
		plugins: [
			{
				name: pluginName,
				source: `./plugins/${pluginName}`,
				description: "Example plugin",
			},
		],
	};
	return `${JSON.stringify(manifest, null, "\t")}\n`;
}

function generateRootPackageJson(config: ScaffoldConfig): string {
	const pkg = {
		name: config.name,
		version: "0.1.0",
		private: true,
		description: config.description,
		type: "module",
		workspaces: ["plugins/*"],
		scripts: {
			build: "turbo run build",
			test: "turbo run test",
			lint: "turbo run lint",
			typecheck: "turbo run typecheck",
		},
		devDependencies: {
			"@biomejs/biome": "^1.9.0",
			"@types/bun": "^1.3.0",
			turbo: "^2.8.0",
			typescript: "^5.9.0",
		},
	};
	return `${JSON.stringify(pkg, null, "\t")}\n`;
}

function generateRootTsConfig(pluginName: string): string {
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
			composite: true,
			types: ["bun-types"],
		},
		references: [{ path: `plugins/${pluginName}` }],
	};
	return `${JSON.stringify(tsconfig, null, "\t")}\n`;
}

function generateTurboJson(): string {
	const turbo = {
		$schema: "https://turbo.build/schema.json",
		tasks: {
			build: {
				dependsOn: ["^build"],
				outputs: ["*.plugin", "hooks/hooks.json", "scripts/setup-proxy.sh"],
			},
			test: {
				dependsOn: ["build"],
			},
			lint: {},
			typecheck: {
				dependsOn: ["^typecheck"],
			},
		},
	};
	return `${JSON.stringify(turbo, null, "\t")}\n`;
}

function generatePluginTurboJson(): string {
	const turbo = {
		extends: ["//"],
		tasks: {
			build: {
				cache: false,
				dependsOn: ["typecheck"],
				outputs: ["*.plugin"],
			},
			test: {
				cache: false,
				outputs: [] as string[],
			},
			typecheck: {
				cache: false,
				dependsOn: ["^build"],
			},
		},
	};
	return `${JSON.stringify(turbo, null, "\t")}\n`;
}

function generateMarketplaceClaudeMd(config: ScaffoldConfig, pluginName: string, hooks: string[]): string {
	const hookRows = hooks
		.map((hookType) => {
			const mapping = HOOK_NAME_MAP[hookType];
			if (!mapping) return null;
			return `| ${hookType}/${mapping.name} | ${pluginName}/hooks/${mapping.file}.hook.ts | ${hookType} handler |`;
		})
		.filter(Boolean)
		.join("\n");

	const commandSection = config.includeCommands
		? `
## Commands

| Command | Plugin | File | Purpose |
| ------- | ------ | ---- | ------- |
| example | ${pluginName} | commands/example.cmd.ts | Example command |
`
		: "";

	return `# ${config.name}

${config.description}

## Overview

This is a multi-plugin marketplace repository. Each plugin is a
separate workspace under \`plugins/\` and compiles to its own
single-file Bun executable.

## Project Structure

\`\`\`text
${config.name}/
\u251c\u2500\u2500 .claude-plugin/
\u2502   \u2514\u2500\u2500 marketplace.json    # Marketplace manifest
\u251c\u2500\u2500 plugins/
\u2502   \u2514\u2500\u2500 ${pluginName}/
\u2502       \u251c\u2500\u2500 .claude-plugin/
\u2502       \u2502   \u2514\u2500\u2500 plugin.json    # Plugin manifest
\u2502       \u251c\u2500\u2500 hooks/             # Hook handlers
\u2502       \u251c\u2500\u2500 commands/          # Command handlers
\u2502       \u251c\u2500\u2500 skills/            # Skill markdown files
\u2502       \u251c\u2500\u2500 tests/             # Tests
\u2502       \u2514\u2500\u2500 plugin.config.ts   # Plugin definition
\u251c\u2500\u2500 package.json               # Workspace root
\u251c\u2500\u2500 turbo.json                 # Task orchestration
\u2514\u2500\u2500 tsconfig.json              # Root TypeScript config
\`\`\`

## Development

All commands run from the repository root via Turborepo:

\`\`\`bash
# Build all plugins
bun run build

# Run all tests
bun run test

# Lint all plugins
bun run lint

# Type-check all plugins
bun run typecheck
\`\`\`

To work on a single plugin, run commands from its directory:

\`\`\`bash
cd plugins/${pluginName}
claude-binary-plugin build
bun test
\`\`\`

## Hooks

| Hook | File | Purpose |
| ---- | ---- | ------- |
${hookRows}
${commandSection}
## Adding a New Plugin

1. Create a new directory under \`plugins/\`:

   \`\`\`bash
   mkdir -p plugins/my-new-plugin
   \`\`\`

2. Add a \`plugin.config.ts\`, \`package.json\`, \`tsconfig.json\`,
   and \`.claude-plugin/plugin.json\` to the new plugin directory.
   Use \`${pluginName}\` as a reference.

3. Add a project reference in the root \`tsconfig.json\`:

   \`\`\`json
   { "path": "plugins/my-new-plugin" }
   \`\`\`

4. Add the plugin to \`.claude-plugin/marketplace.json\`:

   \`\`\`json
   { "name": "my-new-plugin", "source": "./plugins/my-new-plugin" }
   \`\`\`

5. Run \`bun install\` from the root to link the new workspace.

## Testing

Tests use the \`PluginTester\` fluent API from \`claude-binary-plugin\`.
Run \`bun run test\` to execute tests across all plugins.
`;
}
