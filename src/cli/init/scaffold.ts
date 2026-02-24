/**
 * Scaffold engine — creates directories and writes generated files.
 *
 * Delegates to template generators for file content, then handles
 * post-scaffold steps (bun install, git init).
 */

import { dirname, join } from "node:path";
import { generateMarketplaceProject } from "./templates/marketplace.js";
import { generatePluginProject } from "./templates/plugin.js";

/** Minimum Bun version required by scaffolded projects. */
const MIN_BUN_VERSION = "1.3.9";

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

export interface ScaffoldResult {
	warnings: string[];
}

/** Progress callback for scaffold phases. */
export type ScaffoldProgress = (phase: string, status: "start" | "done") => void;

/**
 * Check whether bun >= MIN_BUN_VERSION is available.
 * Returns null if OK, or a warning message string if not.
 */
async function checkBunVersion(): Promise<string | null> {
	try {
		const output = await Bun.$`bun --version`.quiet().text();
		const version = output.trim();
		if (compareSemver(version, MIN_BUN_VERSION) < 0) {
			return `Bun ${version} is installed but ${MIN_BUN_VERSION} or later is required. Run \`bun upgrade\` then \`bun install\` in the project directory.`;
		}
		return null;
	} catch {
		return `Bun is not installed. Install bun ${MIN_BUN_VERSION}+ from https://bun.sh then run \`bun install\` in the project directory.`;
	}
}

/** Compare two semver strings. Returns <0, 0, or >0. */
function compareSemver(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

export async function scaffold(config: ScaffoldConfig, onProgress?: ScaffoldProgress): Promise<ScaffoldResult> {
	const warnings: string[] = [];
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
		const bunWarning = await checkBunVersion();
		if (bunWarning) {
			warnings.push(bunWarning);
		} else {
			onProgress?.("Installing dependencies", "start");
			try {
				await Bun.$`bun install --cwd ${config.directory}`.quiet();
				onProgress?.("Installing dependencies", "done");
			} catch {
				warnings.push(
					"bun install failed (claude-binary-plugin may not be published yet). Run `bun link claude-binary-plugin` or `bun install` manually once the package is available.",
				);
			}
		}
	}

	if (config.initGit) {
		onProgress?.("Initializing git repository", "start");
		await Bun.$`git init ${config.directory}`.quiet();
		onProgress?.("Initializing git repository", "done");
	}

	return { warnings };
}
