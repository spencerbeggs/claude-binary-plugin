/**
 * Scaffold engine — creates directories and writes generated files.
 *
 * Delegates to template generators for file content, then handles
 * post-scaffold steps (bun install, git init).
 */

import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import { generateMarketplaceProject } from "./templates/marketplace.js";
import { generatePluginProject } from "./templates/plugin.js";

export interface ScaffoldConfig {
	directory: string;
	name: string;
	type: "plugin" | "marketplace";
	prefix: string;
	description: string;
	hooks: string[];
	includeCommands: boolean;
	includeOtel: boolean;
	initGit: boolean;
	runInstall: boolean;
}

export interface GeneratedFile {
	path: string;
	content: string;
	executable?: boolean;
}

export async function scaffold(config: ScaffoldConfig): Promise<void> {
	const files = config.type === "plugin" ? generatePluginProject(config) : generateMarketplaceProject(config);

	const s = p.spinner();

	// Create directories and write files
	s.start("Creating project structure...");
	const dirs = new Set<string>();
	for (const file of files) {
		const fullPath = join(config.directory, file.path);
		const dir = dirname(fullPath);
		if (!dirs.has(dir)) {
			await Bun.$`mkdir -p ${dir}`.quiet();
			dirs.add(dir);
		}
		await Bun.write(fullPath, file.content);
		if (file.executable) {
			await Bun.$`chmod +x ${fullPath}`.quiet();
		}
	}
	s.stop(`Created ${files.length} files.`);

	// Post-scaffold steps
	if (config.runInstall) {
		s.start("Installing dependencies...");
		await Bun.$`bun install --cwd ${config.directory}`.quiet();
		s.stop("Dependencies installed.");
	}

	if (config.initGit) {
		s.start("Initializing git repository...");
		await Bun.$`git init ${config.directory}`.quiet();
		s.stop("Git repository initialized.");
	}
}
