/**
 * Branded types for compile-time type safety in Claude Code hooks.
 *
 * @remarks
 * Branded types use TypeScript's structural typing system to create nominally-typed
 * primitives that cannot be accidentally mixed. The `__brand` property exists only
 * at compile-time - there is zero runtime overhead.
 *
 * This pattern is useful for:
 * - Distinguishing between different kinds of strings (file paths, session IDs)
 * - Preventing accidental mixing of semantically different values
 * - Adding documentation about the expected format at the type level
 *
 * All branded types are interchangeable with their base types at runtime since
 * the brand is purely a TypeScript construct. Use the `to*` functions to brand
 * values without validation, or `parse*` functions for validated branding.
 *
 * @example
 * ```typescript
 * import { FilePath, ConfigPath, toFilePath, toConfigPath } from "claude-binary-plugin";
 *
 * const userFile: FilePath = toFilePath("/home/user/code.ts");
 * const config: ConfigPath = toConfigPath("/etc/biome.json");
 *
 * // Compile-time error! Can't assign ConfigPath to FilePath
 * const badAssignment: FilePath = config;
 *
 * // But you can still use them as strings at runtime
 * console.log(userFile.startsWith("/home")); // true
 * ```
 *
 * @see {@link Brand} - The generic branding helper type
 * @see {@link Unbrand} - Extract the base type from a branded type
 * @module
 */

// =============================================================================
// BRAND HELPER TYPE
// =============================================================================

/**
 * Creates a branded type from a base type with a unique string brand.
 *
 * @remarks
 * The brand property (`__brand`) is phantom - it exists only at compile-time
 * and has zero runtime overhead. This enables TypeScript to distinguish between
 * structurally identical types.
 *
 * @typeParam T - The base type to brand (e.g., `string`, `number`)
 * @typeParam B - The brand identifier string (e.g., `"FilePath"`, `"SessionId"`)
 *
 * @example
 * ```typescript
 * // Define a custom branded type
 * type UserId = Brand<string, "UserId">;
 * type OrderId = Brand<string, "OrderId">;
 *
 * function getUser(id: UserId) { ... }
 *
 * const userId = "abc" as UserId;
 * const orderId = "abc" as OrderId;
 *
 * getUser(userId);   // OK
 * getUser(orderId);  // Type error - OrderId is not assignable to UserId
 * ```
 *
 * @see {@link Unbrand} - Extract the base type
 * @see {@link IsBranded} - Check if a type is branded
 * @public
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// =============================================================================
// PATH TYPES
// =============================================================================

/**
 * A branded string representing an absolute file path.
 *
 * @remarks
 * Use for paths that point to user/project files, as distinguished from
 * directories, config files, or temporary files. This helps prevent
 * accidentally mixing different path types.
 *
 * @see {@link toFilePath} - Create without validation
 * @see {@link parseAbsoluteFilePath} - Create with validation
 * @see {@link DirectoryPath} - For directory paths
 * @see {@link ConfigPath} - For configuration files
 * @public
 */
export type FilePath = Brand<string, "FilePath">;

/**
 * A branded string representing an absolute directory path.
 *
 * @remarks
 * Use for paths that point to directories rather than files.
 * Helps distinguish directory operations from file operations at the type level.
 *
 * @see {@link toDirectoryPath} - Create without validation
 * @see {@link parseAbsoluteDirectoryPath} - Create with validation
 * @see {@link FilePath} - For file paths
 * @public
 */
export type DirectoryPath = Brand<string, "DirectoryPath">;

/**
 * A branded string representing a path to a configuration file.
 *
 * @remarks
 * Use for paths to configuration files like `biome.json`, `tsconfig.json`,
 * `.eslintrc`, etc. Distinguishes config files from regular source files.
 *
 * @see {@link toConfigPath} - Create without validation
 * @see {@link FilePath} - For regular file paths
 * @public
 */
export type ConfigPath = Brand<string, "ConfigPath">;

/**
 * A branded string representing a path to a temporary file.
 *
 * @remarks
 * Use for paths in `/tmp` or similar temporary directories. Helps track
 * files that should be cleaned up after use.
 *
 * @see {@link toTempFilePath} - Create without validation
 * @see {@link FilePath} - For regular file paths
 * @public
 */
export type TempFilePath = Brand<string, "TempFilePath">;

/**
 * A branded string representing a path to an executable binary.
 *
 * @remarks
 * Use for paths to executable files like compilers, linters, or tools.
 * Helps ensure executable paths are validated before use.
 *
 * @see {@link toBinaryPath} - Create without validation
 * @see {@link FilePath} - For regular file paths
 * @public
 */
export type BinaryPath = Brand<string, "BinaryPath">;

// =============================================================================
// IDENTIFIER TYPES
// =============================================================================

/**
 * A branded string representing a Claude Code session UUID.
 *
 * @remarks
 * Session IDs uniquely identify a Claude Code conversation session. They are
 * used for correlating events, looking up persisted state, and OTEL telemetry.
 *
 * @see {@link toSessionId} - Create without validation
 * @public
 */
export type SessionId = Brand<string, "SessionId">;

/**
 * A branded string representing a unique tool use identifier.
 *
 * @remarks
 * Tool use IDs are assigned by Claude Code to each tool invocation. They enable
 * correlation between PreToolUse and PostToolUse events for the same operation.
 *
 * @see {@link toToolUseId} - Create without validation
 * @public
 */
export type ToolUseId = Brand<string, "ToolUseId">;

// =============================================================================
// VERSION TYPES
// =============================================================================

/**
 * A branded string representing a semantic version (e.g., "1.2.3").
 *
 * @remarks
 * Semantic versions follow the semver specification: MAJOR.MINOR.PATCH.
 * Use {@link parseSemanticVersion} for validated parsing.
 *
 * @see {@link toSemanticVersion} - Create without validation
 * @see {@link parseSemanticVersion} - Create with validation
 * @public
 */
export type SemanticVersion = Brand<string, "SemanticVersion">;

// =============================================================================
// SHELL TYPES
// =============================================================================

/**
 * A branded string representing a shell command.
 *
 * @remarks
 * Use for shell commands that have been validated or come from trusted sources.
 * This brand helps track which commands have passed security checks.
 *
 * @see {@link toShellCommand} - Create without validation
 * @see {@link BashToolInput} - Bash tool input interface
 * @see {@link BrandedBashToolInput} - Branded variant using ShellCommand
 * @public
 */
export type ShellCommand = Brand<string, "ShellCommand">;

// =============================================================================
// CONSTRUCTOR FUNCTIONS
// =============================================================================

/**
 * Creates a {@link FilePath} from a string without validation.
 *
 * @remarks
 * This is a zero-cost type assertion. Use when you have a path from a trusted
 * source and don't need validation. For validated paths, use {@link parseAbsoluteFilePath}.
 *
 * @param path - The file path string to brand
 * @returns The input string branded as FilePath
 *
 * @see {@link FilePath} - The resulting type
 * @see {@link parseAbsoluteFilePath} - Validated version
 * @public
 */
export function toFilePath(path: string): FilePath {
	return path as FilePath;
}

/**
 * Creates a {@link DirectoryPath} from a string without validation.
 *
 * @remarks
 * This is a zero-cost type assertion. Use when you have a directory path from
 * a trusted source. For validated paths, use {@link parseAbsoluteDirectoryPath}.
 *
 * @param path - The directory path string to brand
 * @returns The input string branded as DirectoryPath
 *
 * @see {@link DirectoryPath} - The resulting type
 * @see {@link parseAbsoluteDirectoryPath} - Validated version
 * @public
 */
export function toDirectoryPath(path: string): DirectoryPath {
	return path as DirectoryPath;
}

/**
 * Creates a {@link ConfigPath} from a string without validation.
 *
 * @remarks
 * Use for configuration file paths like `biome.json`, `tsconfig.json`, etc.
 * This is a zero-cost type assertion with no runtime validation.
 *
 * @param path - The configuration file path string to brand
 * @returns The input string branded as ConfigPath
 *
 * @see {@link ConfigPath} - The resulting type
 * @public
 */
export function toConfigPath(path: string): ConfigPath {
	return path as ConfigPath;
}

/**
 * Creates a {@link TempFilePath} from a string without validation.
 *
 * @remarks
 * Use for temporary file paths in `/tmp` or similar directories.
 * This is a zero-cost type assertion with no runtime validation.
 *
 * @param path - The temporary file path string to brand
 * @returns The input string branded as TempFilePath
 *
 * @see {@link TempFilePath} - The resulting type
 * @public
 */
export function toTempFilePath(path: string): TempFilePath {
	return path as TempFilePath;
}

/**
 * Creates a {@link BinaryPath} from a string without validation.
 *
 * @remarks
 * Use for paths to executable binaries like compilers or linters.
 * This is a zero-cost type assertion with no runtime validation.
 *
 * @param path - The binary path string to brand
 * @returns The input string branded as BinaryPath
 *
 * @see {@link BinaryPath} - The resulting type
 * @public
 */
export function toBinaryPath(path: string): BinaryPath {
	return path as BinaryPath;
}

/**
 * Creates a {@link SessionId} from a string without validation.
 *
 * @remarks
 * Session IDs are UUIDs provided by Claude Code to identify sessions.
 * This is a zero-cost type assertion with no runtime validation.
 *
 * @param id - The session ID string to brand
 * @returns The input string branded as SessionId
 *
 * @see {@link SessionId} - The resulting type
 * @public
 */
export function toSessionId(id: string): SessionId {
	return id as SessionId;
}

/**
 * Creates a {@link ToolUseId} from a string without validation.
 *
 * @remarks
 * Tool use IDs are assigned by Claude Code to each tool invocation.
 * This is a zero-cost type assertion with no runtime validation.
 *
 * @param id - The tool use ID string to brand
 * @returns The input string branded as ToolUseId
 *
 * @see {@link ToolUseId} - The resulting type
 * @public
 */
export function toToolUseId(id: string): ToolUseId {
	return id as ToolUseId;
}

/**
 * Creates a {@link SemanticVersion} from a string without validation.
 *
 * @remarks
 * This does NOT validate the version format. For validated parsing that
 * returns `undefined` for invalid input, use {@link parseSemanticVersion}.
 *
 * @param version - The version string to brand
 * @returns The input string branded as SemanticVersion
 *
 * @see {@link SemanticVersion} - The resulting type
 * @see {@link parseSemanticVersion} - Validated version
 * @public
 */
export function toSemanticVersion(version: string): SemanticVersion {
	return version as SemanticVersion;
}

/**
 * Creates a {@link ShellCommand} from a string without validation.
 *
 * @remarks
 * Use to mark shell commands that have passed security validation or come
 * from trusted sources. This is a zero-cost type assertion.
 *
 * @param command - The shell command string to brand
 * @returns The input string branded as ShellCommand
 *
 * @see {@link ShellCommand} - The resulting type
 * @public
 */
export function toShellCommand(command: string): ShellCommand {
	return command as ShellCommand;
}

// =============================================================================
// VALIDATION CONSTRUCTORS
// =============================================================================

/**
 * Parses and validates a semantic version string.
 *
 * @remarks
 * Extracts the MAJOR.MINOR.PATCH portion from the input. Returns `undefined`
 * if the input doesn't start with a valid version pattern. This allows parsing
 * versions with additional suffixes like "1.2.3-beta" or "1.2.3+build".
 *
 * @param input - The string to parse as a semantic version
 * @returns The validated SemanticVersion, or `undefined` if invalid
 *
 * @example
 * ```typescript
 * const version = parseSemanticVersion("1.2.3"); // SemanticVersion "1.2.3"
 * const withSuffix = parseSemanticVersion("1.2.3-beta"); // SemanticVersion "1.2.3"
 * const invalid = parseSemanticVersion("not-a-version"); // undefined
 * ```
 *
 * @see {@link SemanticVersion} - The resulting type
 * @see {@link toSemanticVersion} - Non-validating version
 * @public
 */
export function parseSemanticVersion(input: string): SemanticVersion | undefined {
	const match = input.match(/^(\d+\.\d+\.\d+)/);
	return match ? (match[1] as SemanticVersion) : undefined;
}

/**
 * Validates that a path is absolute and returns a branded {@link FilePath}.
 *
 * @remarks
 * Checks that the path starts with "/" (Unix-style absolute path).
 * Returns `undefined` for relative paths.
 *
 * @param input - The path string to validate
 * @returns The validated FilePath, or `undefined` if not absolute
 *
 * @example
 * ```typescript
 * const valid = parseAbsoluteFilePath("/home/user/file.ts"); // FilePath
 * const invalid = parseAbsoluteFilePath("./relative/path"); // undefined
 * ```
 *
 * @see {@link FilePath} - The resulting type
 * @see {@link toFilePath} - Non-validating version
 * @public
 */
export function parseAbsoluteFilePath(input: string): FilePath | undefined {
	return input.startsWith("/") ? (input as FilePath) : undefined;
}

/**
 * Validates that a path is absolute and returns a branded {@link DirectoryPath}.
 *
 * @remarks
 * Checks that the path starts with "/" (Unix-style absolute path).
 * Returns `undefined` for relative paths.
 *
 * @param input - The path string to validate
 * @returns The validated DirectoryPath, or `undefined` if not absolute
 *
 * @example
 * ```typescript
 * const valid = parseAbsoluteDirectoryPath("/home/user/project"); // DirectoryPath
 * const invalid = parseAbsoluteDirectoryPath("./relative"); // undefined
 * ```
 *
 * @see {@link DirectoryPath} - The resulting type
 * @see {@link toDirectoryPath} - Non-validating version
 * @public
 */
export function parseAbsoluteDirectoryPath(input: string): DirectoryPath | undefined {
	return input.startsWith("/") ? (input as DirectoryPath) : undefined;
}

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**
 * Extracts the base type from a branded type.
 *
 * @remarks
 * Useful when you need to pass a branded type to a function that expects
 * the underlying base type. This is a compile-time only utility.
 *
 * @typeParam T - The branded type to unwrap
 *
 * @example
 * ```typescript
 * type BaseOfFilePath = Unbrand<FilePath>; // string
 * type BaseOfSessionId = Unbrand<SessionId>; // string
 *
 * // Useful for generic functions
 * function logPath<T extends Brand<string, string>>(path: T): Unbrand<T> {
 *   console.log(path);
 *   return path;
 * }
 * ```
 *
 * @see {@link Brand} - The branding type
 * @see {@link IsBranded} - Check if a type is branded
 * @public
 */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Type predicate that returns `true` if the type is branded.
 *
 * @remarks
 * Useful for conditional types that need to behave differently for
 * branded vs. unbranded types.
 *
 * @typeParam T - The type to check
 *
 * @example
 * ```typescript
 * type A = IsBranded<FilePath>; // true
 * type B = IsBranded<string>; // false
 *
 * // Use in conditional types
 * type MaybeUnbrand<T> = IsBranded<T> extends true ? Unbrand<T> : T;
 * ```
 *
 * @see {@link Brand} - The branding type
 * @see {@link Unbrand} - Extract the base type
 * @public
 */
export type IsBranded<T> = T extends Brand<unknown, string> ? true : false;
