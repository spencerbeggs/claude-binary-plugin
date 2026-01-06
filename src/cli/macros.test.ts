/**
 * Tests for CLI version utilities.
 *
 * @remarks
 * Stub test file for coverage tracking. Tests to be implemented for:
 * - getPackageVersion() returns valid semver
 * - Version matches package.json at runtime
 */

import { describe, expect, test } from "bun:test";
import { getPackageVersion } from "./macros.js";

describe("getPackageVersion", () => {
	test("returns a version string", () => {
		const version = getPackageVersion();
		expect(typeof version).toBe("string");
		expect(version.length).toBeGreaterThan(0);
	});

	test("version follows semver pattern", () => {
		const version = getPackageVersion();
		// Basic semver pattern check: X.Y.Z or X.Y.Z-prerelease
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});
