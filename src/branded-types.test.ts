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
import {
	parseAbsoluteDirectoryPath,
	parseAbsoluteFilePath,
	parseSemanticVersion,
	toBinaryPath,
	toConfigPath,
	toDirectoryPath,
	toFilePath,
	toSemanticVersion,
	toSessionId,
	toShellCommand,
	toTempFilePath,
	toToolUseId,
} from "./branded-types.js";

describe("branded type constructors", () => {
	describe("path types", () => {
		test("toFilePath creates FilePath", () => {
			const path: FilePath = toFilePath("/home/user/file.ts");
			expect(path as string).toBe("/home/user/file.ts");
			// At runtime, it's still a string
			expect(typeof path).toBe("string");
		});

		test("toDirectoryPath creates DirectoryPath", () => {
			const path: DirectoryPath = toDirectoryPath("/home/user");
			expect(path as string).toBe("/home/user");
		});

		test("toConfigPath creates ConfigPath", () => {
			const path: ConfigPath = toConfigPath("/etc/biome.json");
			expect(path as string).toBe("/etc/biome.json");
		});

		test("toTempFilePath creates TempFilePath", () => {
			const path: TempFilePath = toTempFilePath("/tmp/test-123.ts");
			expect(path as string).toBe("/tmp/test-123.ts");
		});

		test("toBinaryPath creates BinaryPath", () => {
			const path: BinaryPath = toBinaryPath("/usr/bin/shellcheck");
			expect(path as string).toBe("/usr/bin/shellcheck");
		});
	});

	describe("identifier types", () => {
		test("toSessionId creates SessionId", () => {
			const id: SessionId = toSessionId("550e8400-e29b-41d4-a716-446655440000");
			expect(id as string).toBe("550e8400-e29b-41d4-a716-446655440000");
		});

		test("toToolUseId creates ToolUseId", () => {
			const id: ToolUseId = toToolUseId("tool-use-abc123");
			expect(id as string).toBe("tool-use-abc123");
		});
	});

	describe("version types", () => {
		test("toSemanticVersion creates SemanticVersion", () => {
			const version: SemanticVersion = toSemanticVersion("1.2.3");
			expect(version as string).toBe("1.2.3");
		});
	});

	describe("shell types", () => {
		test("toShellCommand creates ShellCommand", () => {
			const cmd: ShellCommand = toShellCommand("ls -la");
			expect(cmd as string).toBe("ls -la");
		});
	});
});

describe("validation constructors", () => {
	describe("parseSemanticVersion", () => {
		test("returns SemanticVersion for valid semver", () => {
			const version = parseSemanticVersion("1.2.3");
			expect(version as string | undefined).toBe("1.2.3");
		});

		test("extracts version from string with suffix", () => {
			const version = parseSemanticVersion("1.2.3-beta");
			expect(version as string | undefined).toBe("1.2.3");
		});

		test("returns undefined for version with prefix", () => {
			// The regex requires the version to start at the beginning
			expect(parseSemanticVersion("v1.2.3")).toBeUndefined();
		});

		test("returns undefined for invalid semver", () => {
			expect(parseSemanticVersion("not-a-version")).toBeUndefined();
			expect(parseSemanticVersion("1.2")).toBeUndefined();
			expect(parseSemanticVersion("abc")).toBeUndefined();
		});
	});

	describe("parseAbsoluteFilePath", () => {
		test("returns FilePath for absolute path", () => {
			const path = parseAbsoluteFilePath("/home/user/file.ts");
			expect(path as string | undefined).toBe("/home/user/file.ts");
		});

		test("returns undefined for relative path", () => {
			expect(parseAbsoluteFilePath("relative/path.ts")).toBeUndefined();
			expect(parseAbsoluteFilePath("./file.ts")).toBeUndefined();
			expect(parseAbsoluteFilePath("file.ts")).toBeUndefined();
		});
	});

	describe("parseAbsoluteDirectoryPath", () => {
		test("returns DirectoryPath for absolute path", () => {
			const path = parseAbsoluteDirectoryPath("/home/user");
			expect(path as string | undefined).toBe("/home/user");
		});

		test("returns undefined for relative path", () => {
			expect(parseAbsoluteDirectoryPath("relative/dir")).toBeUndefined();
		});
	});
});

describe("compile-time type safety", () => {
	// These tests verify that the branded types work at runtime
	// The actual type safety is enforced at compile-time
	// If this file compiles, the types are working correctly

	test("branded types are assignable to their base type", () => {
		const filePath: FilePath = toFilePath("/path");
		const baseString: string = filePath; // Should compile
		expect(baseString).toBe("/path");
	});

	test("branded types can use string methods", () => {
		const filePath: FilePath = toFilePath("/home/user/file.ts");
		expect(filePath.startsWith("/home")).toBe(true);
		expect(filePath.endsWith(".ts")).toBe(true);
		expect(filePath.split("/")).toEqual(["", "home", "user", "file.ts"]);
	});

	test("branded types work with template literals", () => {
		const dir: DirectoryPath = toDirectoryPath("/home/user");
		const file = "config.json";
		const fullPath = `${dir}/${file}`;
		expect(fullPath).toBe("/home/user/config.json");
	});
});

// The following would cause compile-time errors if uncommented:
// This demonstrates the type safety that branded types provide

/*
// ERROR: Cannot assign ConfigPath to FilePath
const config: ConfigPath = toConfigPath("/etc/config");
const file: FilePath = config; // Type error!

// ERROR: Cannot assign plain string to FilePath without constructor
const badPath: FilePath = "/some/path"; // Type error!

// ERROR: Cannot mix different branded string types
function processFile(path: FilePath) { }
const tempPath: TempFilePath = toTempFilePath("/tmp/file");
processFile(tempPath); // Type error!
*/
