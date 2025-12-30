import { describe, expect, test } from "bun:test";
import type {
	BinaryPath,
	ConfigPath,
	DirectoryPath,
	FilePath,
	SemanticVersion,
	SessionId,
	ShellCommand,
	TempFilePath,
	ToolUseId,
} from "./branded-types.js";
import { BrandedTypes } from "./branded-types.js";

// =============================================================================
// BRANDED TYPES NAMESPACE TESTS
// =============================================================================

describe("BrandedTypes namespace", () => {
	describe("path constructors", () => {
		test("toFilePath creates FilePath", () => {
			const path: FilePath = BrandedTypes.toFilePath("/home/user/file.ts");
			expect(path as string).toBe("/home/user/file.ts");
			expect(typeof path).toBe("string");
		});

		test("toDirectoryPath creates DirectoryPath", () => {
			const path: DirectoryPath = BrandedTypes.toDirectoryPath("/home/user");
			expect(path as string).toBe("/home/user");
		});

		test("toConfigPath creates ConfigPath", () => {
			const path: ConfigPath = BrandedTypes.toConfigPath("/etc/biome.json");
			expect(path as string).toBe("/etc/biome.json");
		});

		test("toTempFilePath creates TempFilePath", () => {
			const path: TempFilePath = BrandedTypes.toTempFilePath("/tmp/test.ts");
			expect(path as string).toBe("/tmp/test.ts");
		});

		test("toBinaryPath creates BinaryPath", () => {
			const path: BinaryPath = BrandedTypes.toBinaryPath("/usr/bin/shellcheck");
			expect(path as string).toBe("/usr/bin/shellcheck");
		});
	});

	describe("identifier constructors", () => {
		test("toSessionId creates SessionId", () => {
			const id: SessionId = BrandedTypes.toSessionId("550e8400-e29b-41d4-a716-446655440000");
			expect(id as string).toBe("550e8400-e29b-41d4-a716-446655440000");
		});

		test("toToolUseId creates ToolUseId", () => {
			const id: ToolUseId = BrandedTypes.toToolUseId("tool-use-abc123");
			expect(id as string).toBe("tool-use-abc123");
		});
	});

	describe("version constructors", () => {
		test("toSemanticVersion creates SemanticVersion", () => {
			const version: SemanticVersion = BrandedTypes.toSemanticVersion("1.2.3");
			expect(version as string).toBe("1.2.3");
		});
	});

	describe("shell constructors", () => {
		test("toShellCommand creates ShellCommand", () => {
			const cmd: ShellCommand = BrandedTypes.toShellCommand("ls -la");
			expect(cmd as string).toBe("ls -la");
		});
	});
});

// =============================================================================
// VALIDATION FUNCTION TESTS
// =============================================================================

describe("BrandedTypes validation functions", () => {
	describe("parseSemanticVersion", () => {
		test("returns SemanticVersion for valid semver", () => {
			const version = BrandedTypes.parseSemanticVersion("1.2.3");
			expect(version as string | undefined).toBe("1.2.3");
		});

		test("extracts version from string with suffix", () => {
			const version = BrandedTypes.parseSemanticVersion("1.2.3-beta");
			expect(version as string | undefined).toBe("1.2.3");
		});

		test("returns undefined for version with prefix", () => {
			expect(BrandedTypes.parseSemanticVersion("v1.2.3")).toBeUndefined();
		});

		test("returns undefined for invalid semver", () => {
			expect(BrandedTypes.parseSemanticVersion("not-a-version")).toBeUndefined();
			expect(BrandedTypes.parseSemanticVersion("1.2")).toBeUndefined();
			expect(BrandedTypes.parseSemanticVersion("abc")).toBeUndefined();
		});
	});

	describe("parseAbsoluteFilePath", () => {
		test("returns FilePath for absolute path", () => {
			const path = BrandedTypes.parseAbsoluteFilePath("/home/user/file.ts");
			expect(path as string | undefined).toBe("/home/user/file.ts");
		});

		test("returns undefined for relative path", () => {
			expect(BrandedTypes.parseAbsoluteFilePath("relative/path.ts")).toBeUndefined();
			expect(BrandedTypes.parseAbsoluteFilePath("./file.ts")).toBeUndefined();
			expect(BrandedTypes.parseAbsoluteFilePath("file.ts")).toBeUndefined();
		});
	});

	describe("parseAbsoluteDirectoryPath", () => {
		test("returns DirectoryPath for absolute path", () => {
			const path = BrandedTypes.parseAbsoluteDirectoryPath("/home/user");
			expect(path as string | undefined).toBe("/home/user");
		});

		test("returns undefined for relative path", () => {
			expect(BrandedTypes.parseAbsoluteDirectoryPath("relative/dir")).toBeUndefined();
		});
	});
});

// =============================================================================
// COMPILE-TIME TYPE SAFETY TESTS
// =============================================================================

describe("compile-time type safety", () => {
	test("branded types are assignable to their base type", () => {
		const filePath: FilePath = BrandedTypes.toFilePath("/path");
		const baseString: string = filePath;
		expect(baseString).toBe("/path");
	});

	test("branded types can use string methods", () => {
		const filePath: FilePath = BrandedTypes.toFilePath("/home/user/file.ts");
		expect(filePath.startsWith("/home")).toBe(true);
		expect(filePath.endsWith(".ts")).toBe(true);
		expect(filePath.split("/")).toEqual(["", "home", "user", "file.ts"]);
	});

	test("branded types work with template literals", () => {
		const dir: DirectoryPath = BrandedTypes.toDirectoryPath("/home/user");
		const file = "config.json";
		const fullPath = `${dir}/${file}`;
		expect(fullPath).toBe("/home/user/config.json");
	});
});

// The following would cause compile-time errors if uncommented:
// This demonstrates the type safety that branded types provide

/*
// ERROR: Cannot assign ConfigPath to FilePath
const config: ConfigPath = BrandedTypes.toConfigPath("/etc/config");
const file: FilePath = config; // Type error!

// ERROR: Cannot assign plain string to FilePath without constructor
const badPath: FilePath = "/some/path"; // Type error!

// ERROR: Cannot mix different branded string types
function processFile(path: FilePath) { }
const tempPath: TempFilePath = BrandedTypes.toTempFilePath("/tmp/file");
processFile(tempPath); // Type error!
*/
