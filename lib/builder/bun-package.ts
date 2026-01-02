import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
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
	/**
	 * Whether to symlink the directory during local development.
	 * Note: This field is not used by BunPackage but is included for
	 * compatibility with package managers like pnpm that read this field.
	 */
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
 * API Model generation options for API Extractor
 */
interface ApiModelOptions {
	/**
	 * Path to copy the generated .api.json file to.
	 * If relative, resolved from project root.
	 * If not provided, only generates in the default location (lib/api/).
	 */
	path?: string;
	/**
	 * Path to api-extractor.json config file.
	 * Defaults to lib/configs/api-extractor.json
	 */
	configPath?: string;
	/**
	 * Path to tsconfig for declaration compilation.
	 * Defaults to lib/configs/tsconfig.declarations.json
	 */
	tsconfigPath?: string;
	/**
	 * Whether to run in CI mode (stricter validation).
	 * Defaults to checking process.env.CI
	 */
	ci?: boolean;
}

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
	/**
	 * Link a target for local development after build.
	 * Accepts a shorthand ("npm", "github", "jsr") or registry URL.
	 * Runs `bun unlink` in root, then `bun link` in the target directory.
	 */
	link?: TargetShorthand;
	/**
	 * Install dependencies in dist directories after copying.
	 * Required for local linking when TypeScript needs to resolve types
	 * from the package's own node_modules (e.g., zod schemas).
	 */
	installDeps?: boolean;
	/**
	 * Generate API model documentation using API Extractor.
	 * Compiles TypeScript declarations and generates .api.json.
	 */
	apiModel?: ApiModelOptions | boolean;
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

		// Build API model if requested
		if (this.options.apiModel) {
			await this.buildApiModel();
		}

		// Resolve publish targets
		const targets = this.resolveTargets();

		if (targets.length === 0) {
			console.log("No publish targets found in package.json");
			return;
		}

		// Process each target
		for (const target of targets) {
			await this.processTarget(target, targets);
		}

		console.log(`✅ Built ${targets.length} target(s) successfully`);

		// Link target for local development if requested
		if (this.options.link) {
			await this.linkTarget(this.options.link, targets);
		}
	}

	/**
	 * Link a target directory for local development.
	 *
	 * Note: We create symlinks manually instead of using `bun link` because
	 * bun link doesn't respect globalDir/globalBinDir settings from bunfig.toml.
	 * See: https://github.com/oven-sh/bun/issues/12886
	 */
	private async linkTarget(link: TargetShorthand, targets: ResolvedTarget[]): Promise<void> {
		// Find matching target
		const expanded = expandShorthand(link);
		const matchingTarget = targets.find((t) => {
			if (expanded.registry && t.registry === expanded.registry) return true;
			if (expanded.directory && t.directory.endsWith(expanded.directory)) return true;
			return false;
		});

		if (!matchingTarget) {
			console.log(`⚠️  No target found matching "${link}" for linking`);
			return;
		}

		console.log(`🔗 Linking ${matchingTarget.directory}...`);

		// Get configured paths from bunfig.toml
		const { globalDir, globalBinDir } = await this.getBunfigGlobalPaths();

		// Remove existing global symlinks from all possible locations
		const globalModulesPaths = await this.getGlobalModulesPaths();
		for (const globalModulesPath of globalModulesPaths) {
			const globalLinkPath = join(globalModulesPath, this.packageJson.name);
			try {
				await rm(globalLinkPath, { force: true });
			} catch {
				// Doesn't exist, that's fine
			}
		}

		// Create the package symlink in globalDir
		const globalModulesPath = join(globalDir, "node_modules");
		const globalLinkPath = join(globalModulesPath, this.packageJson.name);

		try {
			// Ensure the node_modules directory exists
			await mkdir(globalModulesPath, { recursive: true });

			// Create symlink to the target directory
			await Bun.$`ln -sf ${matchingTarget.directory} ${globalLinkPath}`.nothrow();
			console.log(`   ✓ Linked ${this.packageJson.name} → ${globalLinkPath}`);
		} catch (error) {
			console.error(`   ✗ Failed to create symlink: ${error}`);
			return;
		}

		// Create bin symlinks if package has bin entries
		if (this.packageJson.bin) {
			await mkdir(globalBinDir, { recursive: true });

			for (const [binName, binPath] of Object.entries(this.packageJson.bin)) {
				const sourceBinPath = join(matchingTarget.directory, binPath);
				const targetBinPath = join(globalBinDir, binName);

				try {
					await rm(targetBinPath, { force: true });
					await Bun.$`ln -sf ${sourceBinPath} ${targetBinPath}`.nothrow();
					console.log(`   ✓ Linked bin/${binName} → ${targetBinPath}`);
				} catch (error) {
					console.error(`   ✗ Failed to link bin/${binName}: ${error}`);
				}
			}
		}
	}

	/**
	 * Get globalDir and globalBinDir from bunfig.toml, with fallbacks.
	 */
	private async getBunfigGlobalPaths(): Promise<{ globalDir: string; globalBinDir: string }> {
		const home = process.env.HOME ?? "";

		// Default paths
		let globalDir = join(home, ".bun/install/global");
		let globalBinDir = join(home, ".bun/bin");

		// Try to read bunfig.toml
		const bunfigPaths = [
			process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, ".bunfig.toml") : null,
			join(home, ".bunfig.toml"),
		].filter(Boolean) as string[];

		for (const bunfigPath of bunfigPaths) {
			try {
				const file = Bun.file(bunfigPath);
				const exists = await file.exists();
				if (!exists) continue;

				const content = await file.text();

				// Parse globalDir
				const globalDirMatch = content.match(/globalDir\s*=\s*["']([^"']+)["']/);
				if (globalDirMatch?.[1]) {
					globalDir = globalDirMatch[1].replace(/^~/, home);
				}

				// Parse globalBinDir
				const globalBinDirMatch = content.match(/globalBinDir\s*=\s*["']([^"']+)["']/);
				if (globalBinDirMatch?.[1]) {
					globalBinDir = globalBinDirMatch[1].replace(/^~/, home);
				}

				// Found a bunfig, use these values
				break;
			} catch {
				// File doesn't exist or can't be read, continue
			}
		}

		return { globalDir, globalBinDir };
	}

	/**
	 * Get all possible global modules paths to clean up before linking.
	 *
	 * Bun can have global modules in different locations depending on:
	 * - bunfig.toml install.globalDir setting
	 * - XDG_DATA_HOME environment variable
	 * - Default ~/.bun/install/global
	 *
	 * We return all possible paths so we can clean up any stale links.
	 */
	private async getGlobalModulesPaths(): Promise<string[]> {
		const home = process.env.HOME ?? "";
		const paths: string[] = [];

		// 1. Try to read bunfig.toml for explicit globalDir
		const bunfigPaths = [
			process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, ".bunfig.toml") : null,
			join(home, ".bunfig.toml"),
		].filter(Boolean) as string[];

		for (const bunfigPath of bunfigPaths) {
			try {
				const content = await Bun.file(bunfigPath).text();
				// Simple TOML parsing for install.globalDir
				const match = content.match(/globalDir\s*=\s*["']([^"']+)["']/);
				if (match?.[1]) {
					const globalDir = match[1].replace(/^~/, home);
					paths.push(join(globalDir, "node_modules"));
				}
			} catch {
				// File doesn't exist or can't be read, continue
			}
		}

		// 2. Add XDG_DATA_HOME path if set
		if (process.env.XDG_DATA_HOME) {
			paths.push(join(process.env.XDG_DATA_HOME, "bun/install/global/node_modules"));
		}

		// 3. Add path derived from bun pm cache
		const cacheResult = await Bun.$`bun pm cache`.text();
		const cachePath = cacheResult.split("\n")[0]?.trim() ?? "";
		if (cachePath) {
			paths.push(join(dirname(cachePath), "global/node_modules"));
		}

		// 4. Always include default ~/.bun path (bun link often uses this regardless of cache location)
		paths.push(join(home, ".bun/install/global/node_modules"));

		// Return unique paths
		return [...new Set(paths)];
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
		try {
			const content = await Bun.file(pkgPath).text();
			this.packageJson = JSON.parse(content) as PackageJson;

			if (!this.packageJson.name || !this.packageJson.version) {
				throw new Error("package.json must have 'name' and 'version' fields");
			}
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new Error(`Invalid JSON in ${pkgPath}: ${error.message}`);
			}
			throw error;
		}
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
			await chmod(outPath, 0o755);
		}
	}

	/**
	 * Build API model using API Extractor
	 */
	private async buildApiModel(): Promise<void> {
		const apiModelOption = this.options.apiModel;
		if (!apiModelOption) return;

		const options: ApiModelOptions = typeof apiModelOption === "boolean" ? {} : apiModelOption;

		const configPath = options.configPath
			? resolve(this.root, options.configPath)
			: join(this.root, "lib/configs/api-extractor.json");

		const tsconfigPath = options.tsconfigPath
			? resolve(this.root, options.tsconfigPath)
			: join(this.root, "lib/configs/tsconfig.declarations.json");

		const isCI = options.ci ?? process.env.CI === "true";
		const isLocal = !isCI;

		// Ensure output directories exist
		const outputDirs = [join(this.root, "dist/types"), join(this.root, "lib/api")];
		for (const dir of outputDirs) {
			await mkdir(dir, { recursive: true });
		}

		// Compile TypeScript declarations
		console.log("📝 Compiling TypeScript declarations...");
		const tscResult = Bun.spawnSync(["tsgo", "-p", tsconfigPath], {
			cwd: this.root,
			stdio: ["inherit", "inherit", "inherit"],
		});

		if (tscResult.exitCode !== 0) {
			console.error("❌ TypeScript declaration compilation failed");
			process.exit(1);
		}
		console.log("   ✓ Declarations compiled");

		// Run API Extractor
		console.log("📦 Running API Extractor...");
		const extractorConfig = ExtractorConfig.loadFileAndPrepare(configPath);

		const extractorResult = Extractor.invoke(extractorConfig, {
			localBuild: isLocal,
			showVerboseMessages: false,
		});

		if (!extractorResult.succeeded) {
			console.error(
				`❌ API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings`,
			);
			if (isCI) {
				process.exit(1);
			}
		} else {
			console.log("   ✓ API model generated");
		}

		// Copy to destination path if specified
		if (options.path) {
			const sourcePath = join(this.root, "lib/api/claude-binary-plugin.api.json");
			const destPath = resolve(this.root, options.path);

			// Ensure destination directory exists
			await mkdir(dirname(destPath), { recursive: true });

			await copyFile(sourcePath, destPath);
			console.log(`   ✓ Copied API model to ${options.path}`);
		}
	}

	/**
	 * Process a single publish target
	 */
	private async processTarget(target: ResolvedTarget, allTargets: ResolvedTarget[]): Promise<void> {
		// Skip if directory is root (no copying needed)
		if (target.directory === this.root) {
			console.log(
				`📁 Target "${target.registry || target.protocol}" (${target.access}) uses root directory, skipping copy`,
			);
			return;
		}

		const targetName = target.registry?.replace(/^https?:\/\//, "").replace(/\/$/, "") || target.protocol;
		console.log(`📁 Processing target: ${targetName} (${target.access}) → ${target.directory}`);

		// Clean and create target directory
		if (existsSync(target.directory)) {
			await rm(target.directory, { recursive: true, force: true });
		}
		await mkdir(target.directory, { recursive: true });

		// Copy files respecting .npmignore
		await this.copyFiles(target.directory, allTargets);

		// Transform and write package.json
		await this.writePackageJson(target);

		// Install dependencies if requested (for local linking)
		if (this.options.installDeps) {
			await this.installDependencies(target);
		}

		console.log(`   ✓ Created ${target.directory}`);
	}

	/**
	 * Install dependencies in a target directory
	 */
	private async installDependencies(target: ResolvedTarget): Promise<void> {
		console.log(`   📦 Installing dependencies...`);
		const result = await Bun.$`bun install --production`.cwd(target.directory).nothrow();
		if (result.exitCode !== 0) {
			console.error(`   ✗ Failed to install dependencies: ${result.stderr.toString()}`);
		}
	}

	/**
	 * Copy files to target directory, respecting ignore patterns
	 */
	private async copyFiles(targetDir: string, allTargets: ResolvedTarget[]): Promise<void> {
		const allFiles = await this.getAllFiles();
		const filesToCopy = allFiles.filter((file) => !this.shouldIgnore(file));

		// Filter out all dist directories
		const allTargetDirs = allTargets
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
				await mkdir(destDir, { recursive: true });
			}

			await copyFile(sourcePath, destPath);
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
