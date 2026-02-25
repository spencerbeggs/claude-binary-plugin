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
