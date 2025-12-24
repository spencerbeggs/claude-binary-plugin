import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Glob } from "bun";

/**
 * Publishing protocol - determines how packages are published
 */
type PublishProtocol = "npm" | "jsr";

/**
 * A publish target configuration
 */
interface PublishTarget {
	/** Publishing protocol */
	protocol: PublishProtocol;
	/** Registry URL for npm-compatible targets */
	registry?: string;
	/** Directory to publish from (relative to package root) */
	directory?: string;
	/** Access level for the package */
	access?: "public" | "restricted";
	/** Enable provenance attestation */
	provenance?: boolean;
	/** Publish tag (e.g., "latest", "next", "beta") */
	tag?: string;
}

/**
 * Shorthand forms for common targets
 */
type TargetShorthand = "npm" | "github" | "jsr" | `https://${string}` | `http://${string}`;

/**
 * A target can be a full object or a shorthand string
 */
type Target = PublishTarget | TargetShorthand;

/**
 * The publishConfig section of package.json
 */
interface PublishConfig {
	/** Directory to publish from */
	directory?: string;
	/** Whether to symlink the directory during local development (pnpm) */
	linkDirectory?: boolean;
	/** Default access level */
	access?: "public" | "restricted";
	/** Legacy: single registry URL */
	registry?: string;
	/** Publish targets */
	targets?: Target[];
}

/**
 * Package.json structure
 */
interface PackageJson {
	name: string;
	version: string;
	private?: boolean;
	bin?: Record<string, string>;
	exports?: Record<string, string>;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	publishConfig?: PublishConfig;
	[key: string]: unknown;
}

/**
 * Fully resolved target with all values filled in
 */
interface ResolvedTarget {
	protocol: PublishProtocol;
	registry: string | null;
	directory: string;
	access: "public" | "restricted";
	provenance: boolean;
	tag: string;
}

/**
 * Known shorthands that expand to full targets
 */
const KNOWN_SHORTHANDS = {
	npm: {
		protocol: "npm",
		registry: "https://registry.npmjs.org/",
		provenance: true,
		directory: "dist/npm",
	},
	github: {
		protocol: "npm",
		registry: "https://npm.pkg.github.com/",
		provenance: true,
		directory: "dist/github",
	},
	jsr: {
		protocol: "jsr",
		provenance: false,
		directory: "dist/jsr",
	},
} as const satisfies Record<string, PublishTarget>;

/**
 * Registry-specific defaults
 */
const REGISTRY_DEFAULTS: Record<string, { provenance: boolean; access: "public" | "restricted" }> = {
	"https://registry.npmjs.org/": {
		provenance: true,
		access: "restricted",
	},
	"https://npm.pkg.github.com/": {
		provenance: true,
		access: "restricted",
	},
};

/**
 * Get defaults for a registry URL
 */
function getRegistryDefaults(registry: string | null): {
	provenance: boolean;
	access: "public" | "restricted";
} {
	if (!registry) {
		return { provenance: false, access: "restricted" };
	}
	const defaults = REGISTRY_DEFAULTS[registry];
	if (defaults) {
		return defaults;
	}
	return {
		provenance: false,
		access: "restricted",
	};
}

/**
 * Expand a shorthand target to a full PublishTarget object
 */
function expandShorthand(target: Target): PublishTarget {
	if (typeof target === "object") {
		return target;
	}

	if (target in KNOWN_SHORTHANDS) {
		return { ...KNOWN_SHORTHANDS[target as keyof typeof KNOWN_SHORTHANDS] };
	}

	if (target.startsWith("https://") || target.startsWith("http://")) {
		return {
			protocol: "npm",
			registry: target,
			provenance: false,
		};
	}

	throw new Error(`Unknown target shorthand: ${target}`);
}

/**
 * Package.json transformer function
 */
type PackageJsonTransformer = (context: { pkg: PackageJson; directory: string; target: ResolvedTarget }) => PackageJson;

/**
 * BunPackage configuration options
 */
interface BunPackageOptions {
	/** Project root directory (defaults to process.cwd()) */
	root?: string;
	/** Binary entries to build: { "src/cli/index.ts": "bin/cli.js" } */
	bin?: Record<string, string>;
	/** Package.json transformer callback */
	packageJson?: PackageJsonTransformer;
	/** Additional files to always include (glob patterns) */
	include?: string[];
	/** Additional files to always exclude (glob patterns) */
	exclude?: string[];
	/** Whether to minify binary outputs */
	minify?: boolean;
	/** Build target for binaries */
	target?: "bun" | "node" | "browser";
}

/**
 * BunPackage - Multi-target package builder for Bun projects
 *
 * Builds binaries and creates distribution directories for multiple
 * publish targets (npm, GitHub Packages, JSR, etc.)
 */
export class BunPackage {
	private root: string;
	private options: BunPackageOptions;
	private packageJson: PackageJson;
	private ignorePatterns: string[] = [];

	private constructor(options: BunPackageOptions) {
		this.root = options.root ?? process.cwd();
		this.options = options;
		this.packageJson = {} as PackageJson;
	}

	/**
	 * Create and execute a package build
	 */
	static async create(options: BunPackageOptions): Promise<void> {
		const builder = new BunPackage(options);
		await builder.build();
	}

	/**
	 * Execute the full build pipeline
	 */
	private async build(): Promise<void> {
		await this.loadPackageJson();
		await this.loadIgnorePatterns();

		// Build binaries first (into bin/ directory)
		if (this.options.bin) {
			await this.buildBinaries();
		}

		// Resolve publish targets
		const targets = this.resolveTargets();

		if (targets.length === 0) {
			console.log("No publish targets found in package.json");
			return;
		}

		// Process each target
		for (const target of targets) {
			await this.processTarget(target);
		}

		console.log(`✅ Built ${targets.length} target(s) successfully`);
	}

	/**
	 * Resolve all publish targets for this package
	 */
	private resolveTargets(): ResolvedTarget[] {
		const { publishConfig } = this.packageJson;

		// No publishConfig - not publishable or default to npm
		if (!publishConfig) {
			if (this.packageJson.private === true) {
				return [];
			}
			return [
				{
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: this.root,
					access: "restricted",
					provenance: true,
					tag: "latest",
				},
			];
		}

		// publishConfig without targets (legacy mode)
		if (!publishConfig.targets || publishConfig.targets.length === 0) {
			const registry = publishConfig.registry || "https://registry.npmjs.org/";
			const defaults = getRegistryDefaults(registry);

			return [
				{
					protocol: "npm",
					registry,
					directory: publishConfig.directory ? resolve(this.root, publishConfig.directory) : this.root,
					access: publishConfig.access || defaults.access,
					provenance: defaults.provenance,
					tag: "latest",
				},
			];
		}

		// publishConfig with targets
		return publishConfig.targets.map((target) => {
			const expanded = expandShorthand(target);

			const registry = expanded.protocol === "npm" ? expanded.registry || "https://registry.npmjs.org/" : null;

			const registryDefaults = getRegistryDefaults(registry);

			const directory = expanded.directory
				? resolve(this.root, expanded.directory)
				: publishConfig.directory
					? resolve(this.root, publishConfig.directory)
					: this.root;

			return {
				protocol: expanded.protocol,
				registry,
				directory,
				access: expanded.access ?? publishConfig.access ?? registryDefaults.access,
				provenance: expanded.provenance ?? registryDefaults.provenance,
				tag: expanded.tag ?? "latest",
			};
		});
	}

	/**
	 * Load and parse package.json
	 */
	private async loadPackageJson(): Promise<void> {
		const pkgPath = join(this.root, "package.json");
		const content = await Bun.file(pkgPath).text();
		this.packageJson = JSON.parse(content) as PackageJson;
	}

	/**
	 * Load .npmignore patterns
	 */
	private async loadIgnorePatterns(): Promise<void> {
		const ignorePath = join(this.root, ".npmignore");

		if (!existsSync(ignorePath)) {
			this.ignorePatterns = ["node_modules", ".git", "*.log"];
			return;
		}

		const content = await Bun.file(ignorePath).text();
		this.ignorePatterns = content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));

		this.ignorePatterns.push("node_modules", ".git");
	}

	/**
	 * Build binary entries using Bun.build
	 */
	private async buildBinaries(): Promise<void> {
		const binEntries = this.options.bin ?? {};

		for (const [source, output] of Object.entries(binEntries)) {
			const sourcePath = join(this.root, source);
			const outdir = join(this.root, dirname(output));
			const outname = basename(output);

			console.log(`📦 Building binary: ${source} → ${output}`);

			const result = await Bun.build({
				entrypoints: [sourcePath],
				outdir,
				target: this.options.target ?? "bun",
				minify: this.options.minify ?? false,
				naming: outname,
			});

			if (!result.success) {
				console.error(`Failed to build ${source}:`, result.logs);
				process.exit(1);
			}

			const outPath = join(outdir, outname);
			await Bun.$`chmod +x ${outPath}`;
		}
	}

	/**
	 * Process a single publish target
	 */
	private async processTarget(target: ResolvedTarget): Promise<void> {
		// Skip if directory is root (no copying needed)
		if (target.directory === this.root) {
			console.log(`📁 Target "${target.registry || target.protocol}" uses root directory, skipping copy`);
			return;
		}

		const targetName = target.registry?.replace(/^https?:\/\//, "").replace(/\/$/, "") || target.protocol;
		console.log(`📁 Processing target: ${targetName} → ${target.directory}`);

		// Clean and create target directory
		if (existsSync(target.directory)) {
			await Bun.$`rm -rf ${target.directory}`;
		}
		await Bun.$`mkdir -p ${target.directory}`;

		// Copy files respecting .npmignore
		await this.copyFiles(target.directory);

		// Transform and write package.json
		await this.writePackageJson(target);

		console.log(`   ✓ Created ${target.directory}`);
	}

	/**
	 * Copy files to target directory, respecting ignore patterns
	 */
	private async copyFiles(targetDir: string): Promise<void> {
		const allFiles = await this.getAllFiles();
		const filesToCopy = allFiles.filter((file) => !this.shouldIgnore(file));

		// Filter out all dist directories
		const allTargetDirs = this.resolveTargets()
			.map((t) => t.directory)
			.filter((d) => d !== this.root)
			.map((d) => d.replace(this.root, "").replace(/^\//, ""));

		const finalFiles = filesToCopy.filter((file) => {
			return !allTargetDirs.some((dir) => file.startsWith(`${dir}/`) || file === dir);
		});

		for (const file of finalFiles) {
			const sourcePath = join(this.root, file);
			const destPath = join(targetDir, file);
			const destDir = dirname(destPath);

			if (!existsSync(destDir)) {
				await Bun.$`mkdir -p ${destDir}`;
			}

			await Bun.$`cp ${sourcePath} ${destPath}`;
		}
	}

	/**
	 * Get all files in the project
	 */
	private async getAllFiles(): Promise<string[]> {
		const files: string[] = [];
		const glob = new Glob("**/*");

		for await (const file of glob.scan({
			cwd: this.root,
			onlyFiles: true,
			dot: true,
		})) {
			if (file.startsWith("node_modules/") || file.startsWith(".git/")) {
				continue;
			}
			files.push(file);
		}

		return files;
	}

	/**
	 * Check if a file should be ignored
	 */
	private shouldIgnore(filePath: string): boolean {
		const allPatterns = [...this.ignorePatterns, ...(this.options.exclude ?? [])];

		const includePatterns = this.options.include ?? [];
		for (const pattern of includePatterns) {
			if (this.matchPattern(filePath, pattern)) {
				return false;
			}
		}

		for (const pattern of allPatterns) {
			if (this.matchPattern(filePath, pattern)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Match a file path against a pattern
	 */
	private matchPattern(filePath: string, pattern: string): boolean {
		if (pattern.endsWith("/")) {
			const dir = pattern.slice(0, -1);
			return filePath.startsWith(`${dir}/`) || filePath === dir;
		}

		if (filePath === pattern) {
			return true;
		}

		if (!pattern.includes("*") && !pattern.includes("?")) {
			if (filePath.startsWith(`${pattern}/`)) {
				return true;
			}
			const parts = filePath.split("/");
			if (parts.includes(pattern)) {
				return true;
			}
		}

		try {
			const glob = new Glob(pattern);
			return glob.match(filePath);
		} catch {
			if (pattern.startsWith("*")) {
				return filePath.endsWith(pattern.slice(1));
			}
			if (pattern.endsWith("*")) {
				return filePath.startsWith(pattern.slice(0, -1));
			}
			return false;
		}
	}

	/**
	 * Transform and write package.json to target directory
	 */
	private async writePackageJson(target: ResolvedTarget): Promise<void> {
		let pkg = JSON.parse(JSON.stringify(this.packageJson)) as PackageJson;

		// Remove devDependencies
		delete pkg.devDependencies;

		// Remove scripts except essential ones
		if (pkg.scripts) {
			const keepScripts = ["postinstall", "preinstall", "prepare"];
			const newScripts: Record<string, string> = {};
			for (const script of keepScripts) {
				if (pkg.scripts[script]) {
					newScripts[script] = pkg.scripts[script];
				}
			}
			pkg.scripts = Object.keys(newScripts).length > 0 ? newScripts : undefined;
		}

		// Apply custom transformer if provided
		if (this.options.packageJson) {
			pkg = this.options.packageJson({
				pkg,
				directory: target.directory,
				target,
			});
		}

		const pkgPath = join(target.directory, "package.json");
		await Bun.write(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	}
}

export type {
	BunPackageOptions,
	PackageJson,
	PackageJsonTransformer,
	PublishConfig,
	PublishProtocol,
	PublishTarget,
	ResolvedTarget,
	Target,
	TargetShorthand,
};
