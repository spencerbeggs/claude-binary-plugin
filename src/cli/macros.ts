/**
 * Version utilities for the CLI.
 *
 * Uses a static JSON import which Bun resolves at bundle time,
 * embedding the version directly into the compiled binary.
 *
 * @module
 */

// Static import resolved at bundle time relative to this file
// biome-ignore lint/correctness/useImportExtensions: JSON imports use .json extension
import pkg from "../../package.json" with { type: "json" };

/**
 * Get the package version.
 * Works both at runtime (development) and when bundled (production).
 */
export function getPackageVersion(): string {
	return pkg.version;
}
