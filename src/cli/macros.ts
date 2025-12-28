/**
 * Bun macros for compile-time code execution.
 * These functions run at bundle time and their return values are inlined.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the package version from package.json at compile time.
 * This macro is evaluated during bundling, so the version is baked into the binary.
 */
export function getPackageVersion(): string {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const packageJsonPath = resolve(__dirname, "../../package.json");
	const content = readFileSync(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(content);
	return packageJson.version ?? "0.0.0";
}
