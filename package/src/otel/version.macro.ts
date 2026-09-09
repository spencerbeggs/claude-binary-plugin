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
