/**

* Branded Types for Claude Code Hooks
*
* Branded types use TypeScript's structural typing system to create nominally-typed
* primitives that cannot be accidentally mixed. The `__brand` property exists only
* at compile-time — there is zero runtime overhead.
*
* @example

* ```ts
* import { FilePath, ConfigPath, toFilePath, toConfigPath } from "@savvy-web/bun-hooks";
*
* const userFile: FilePath = toFilePath("/home/user/code.ts");
* const config: ConfigPath = toConfigPath("/etc/biome.json");
*
* // Compile-time error! Can't assign ConfigPath to FilePath
* const badAssignment: FilePath = config;
*
* // But you can still use them as strings
* console.log(userFile.startsWith("/home")); // true

* ```

 */

// =============================================================================
// BRAND HELPER TYPE
// =============================================================================

/**

* Creates a branded type from a base type.
* The brand property is phantom — it exists only at compile-time.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// =============================================================================
// PATH TYPES
// =============================================================================

/**

* An absolute file path (not a directory, not a config file).
* Use for paths that point to user/project files.
 */
export type FilePath = Brand<string, "FilePath">;

/**

* An absolute directory path.
 */
export type DirectoryPath = Brand<string, "DirectoryPath">;

/**

* A path to a configuration file (biome.json, tsconfig.json, etc).
 */
export type ConfigPath = Brand<string, "ConfigPath">;

/**

* A path to a temporary file (in /tmp or similar).
 */
export type TempFilePath = Brand<string, "TempFilePath">;

/**

* A path to an executable binary.
 */
export type BinaryPath = Brand<string, "BinaryPath">;

// =============================================================================
// IDENTIFIER TYPES
// =============================================================================

/**

* A UUID session identifier.
 */
export type SessionId = Brand<string, "SessionId">;

/**

* A unique tool use identifier.
 */
export type ToolUseId = Brand<string, "ToolUseId">;

// =============================================================================
// VERSION TYPES
// =============================================================================

/**

* A semantic version string (e.g., "1.2.3").
 */
export type SemanticVersion = Brand<string, "SemanticVersion">;

// =============================================================================
// SHELL TYPES
// =============================================================================

/**

* A shell command string.
 */
export type ShellCommand = Brand<string, "ShellCommand">;

// =============================================================================
// CONSTRUCTOR FUNCTIONS
// =============================================================================

/**

* Creates a FilePath from a string.
* Use for user/project file paths.
 */
export function toFilePath(path: string): FilePath {
	return path as FilePath;
}

/**

* Creates a DirectoryPath from a string.
 */
export function toDirectoryPath(path: string): DirectoryPath {
	return path as DirectoryPath;
}

/**

* Creates a ConfigPath from a string.
* Use for configuration file paths (biome.json, tsconfig.json, etc).
 */
export function toConfigPath(path: string): ConfigPath {
	return path as ConfigPath;
}

/**

* Creates a TempFilePath from a string.
* Use for temporary files in /tmp or similar directories.
 */
export function toTempFilePath(path: string): TempFilePath {
	return path as TempFilePath;
}

/**

* Creates a BinaryPath from a string.
* Use for paths to executable binaries.
 */
export function toBinaryPath(path: string): BinaryPath {
	return path as BinaryPath;
}

/**

* Creates a SessionId from a string.
 */
export function toSessionId(id: string): SessionId {
	return id as SessionId;
}

/**

* Creates a ToolUseId from a string.
 */
export function toToolUseId(id: string): ToolUseId {
	return id as ToolUseId;
}

/**

* Creates a SemanticVersion from a string.
* Does NOT validate the format — use parseSemanticVersion for validation.
 */
export function toSemanticVersion(version: string): SemanticVersion {
	return version as SemanticVersion;
}

/**

* Creates a ShellCommand from a string.
 */
export function toShellCommand(command: string): ShellCommand {
	return command as ShellCommand;
}

// =============================================================================
// VALIDATION CONSTRUCTORS
// =============================================================================

/**

* Parses and validates a semantic version string.
* Returns undefined if the string is not a valid semver.
*
* @example

* ```ts
* const version = parseSemanticVersion("1.2.3"); // SemanticVersion
* const invalid = parseSemanticVersion("not-a-version"); // undefined

* ```

 */
export function parseSemanticVersion(input: string): SemanticVersion | undefined {
	const match = input.match(/^(\d+\.\d+\.\d+)/);
	return match ? (match[1] as SemanticVersion) : undefined;
}

/**

* Validates that a path is absolute (starts with /).
* Returns the branded path type or undefined if invalid.
 */
export function parseAbsoluteFilePath(input: string): FilePath | undefined {
	return input.startsWith("/") ? (input as FilePath) : undefined;
}

/**

* Validates that a path is absolute and returns a DirectoryPath.
 */
export function parseAbsoluteDirectoryPath(input: string): DirectoryPath | undefined {
	return input.startsWith("/") ? (input as DirectoryPath) : undefined;
}

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**

* Extracts the base type from a branded type.
* Useful when you need to pass a branded type to a function that expects the base type.
*
* @example

* ```ts
* type BaseOfFilePath = Unbrand<FilePath>; // string

* ```

 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**

* Checks if a type is branded.
 */
export type IsBranded<T> = T extends Brand<unknown, string> ? true : false;
