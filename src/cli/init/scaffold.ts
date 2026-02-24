/**
 * Scaffold engine — creates directories and writes generated files.
 *
 * Delegates to template generators for file content, then handles
 * post-scaffold steps (bun install, git init).
 */

import { dirname, join } from "node:path";
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
	includeLintStaged: boolean;
	includeCommitlint: boolean;
	includeChangesets: boolean;
	initGit: boolean;
	runInstall: boolean;
	author: { name: string; email: string };
	githubOwner: string;
	license: string;
}

export interface GeneratedFile {
	path: string;
	content: string;
	executable?: boolean;
}

/** Progress callback for scaffold phases. */
export type ScaffoldProgress = (phase: string, status: "start" | "done") => void;

export async function scaffold(config: ScaffoldConfig, onProgress?: ScaffoldProgress): Promise<void> {
	const files = config.type === "plugin" ? generatePluginProject(config) : generateMarketplaceProject(config);

	// Create directories and write files
	onProgress?.("Creating project structure", "start");
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
	onProgress?.("Creating project structure", "done");

	// Post-scaffold steps
	if (config.runInstall) {
		onProgress?.("Installing dependencies", "start");
		await Bun.$`bun install --cwd ${config.directory}`.quiet();
		onProgress?.("Installing dependencies", "done");
	}

	if (config.initGit) {
		onProgress?.("Initializing git repository", "start");
		await Bun.$`git init ${config.directory}`.quiet();
		onProgress?.("Initializing git repository", "done");
	}
}
