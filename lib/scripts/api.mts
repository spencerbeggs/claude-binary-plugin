/**
 * API Extractor build script
 *
 * Generates API model (.api.json) for documentation:
 * 1. Ensures output directories exist
 * 2. Compiles TypeScript declarations
 * 3. Runs API Extractor to generate .api.json
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const ROOT_DIR = join(import.meta.dirname, "../..");
const CONFIG_PATH = join(ROOT_DIR, "lib/configs/api-extractor.json");
const TSCONFIG_PATH = join(ROOT_DIR, "lib/configs/tsconfig.declarations.json");
const OUTPUT_DIRS = [join(ROOT_DIR, "dist/types"), join(ROOT_DIR, "lib/api")];

const isCI = process.env.CI === "true";
const isLocal = !isCI && !process.argv.includes("--ci");

async function ensureDirectories(): Promise<void> {
	for (const dir of OUTPUT_DIRS) {
		await mkdir(dir, { recursive: true });
	}
}

async function compileDeclarations(): Promise<boolean> {
	console.log("📝 Compiling TypeScript declarations...");

	const result = Bun.spawnSync(["tsgo", "-p", TSCONFIG_PATH], {
		cwd: ROOT_DIR,
		stdio: ["inherit", "inherit", "inherit"],
	});

	if (result.exitCode !== 0) {
		console.error("❌ TypeScript compilation failed");
		return false;
	}

	console.log("✓ Declarations compiled");
	return true;
}

function runApiExtractor(): boolean {
	console.log("📦 Running API Extractor...");

	const extractorConfig = ExtractorConfig.loadFileAndPrepare(CONFIG_PATH);

	const result = Extractor.invoke(extractorConfig, {
		localBuild: isLocal,
		showVerboseMessages: true,
	});

	if (result.succeeded) {
		console.log("✓ API Extractor completed successfully");
		return true;
	}

	console.error(`❌ API Extractor completed with ${result.errorCount} errors and ${result.warningCount} warnings`);
	return false;
}

async function main(): Promise<void> {
	console.log(`\n🔧 API Extractor Build (${isLocal ? "local" : "CI"} mode)\n`);

	await ensureDirectories();

	if (!(await compileDeclarations())) {
		process.exit(1);
	}

	if (!runApiExtractor()) {
		process.exit(1);
	}

	console.log("\n✅ API build complete\n");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
