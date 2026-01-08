/**
 * Bun compile-time macro for SDK version.
 *
 * This macro reads the package.json version at compile time and injects it
 * into the bundle. This avoids runtime file reads and ensures the version
 * is baked into the compiled binary.
 *
 */

// Static import resolved at compile time relative to this file
// biome-ignore lint/correctness/useImportExtensions: JSON imports use .json extension
import pkg from "../../package.json" with { type: "json" };

/**
 * Get the SDK version at compile time.
 * This is evaluated during bundling, not at runtime.
 */
export function getSdkVersion(): string {
	return pkg.version;
}
