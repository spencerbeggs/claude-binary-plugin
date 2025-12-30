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
 * @see {@link BrandedTypes.toFilePath} - Create without validation
 * @see {@link BrandedTypes.parseAbsoluteFilePath} - Create with validation
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
 * @see {@link BrandedTypes.toDirectoryPath} - Create without validation
 * @see {@link BrandedTypes.parseAbsoluteDirectoryPath} - Create with validation
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
 * @see {@link BrandedTypes.toConfigPath} - Create without validation
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
 * @see {@link BrandedTypes.toTempFilePath} - Create without validation
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
 * @see {@link BrandedTypes.toBinaryPath} - Create without validation
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
 * @see {@link BrandedTypes.toSessionId} - Create without validation
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
 * @see {@link BrandedTypes.toToolUseId} - Create without validation
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
 * Use {@link BrandedTypes.parseSemanticVersion} for validated parsing.
 *
 * @see {@link BrandedTypes.toSemanticVersion} - Create without validation
 * @see {@link BrandedTypes.parseSemanticVersion} - Create with validation
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
 * @see {@link BrandedTypes.toShellCommand} - Create without validation
 * @see {@link BashToolInput} - Bash tool input interface
 * @see {@link BrandedBashToolInput} - Branded variant using ShellCommand
 * @public
 */
export type ShellCommand = Brand<string, "ShellCommand">;

// =============================================================================
// INTERNAL CONSTRUCTOR FUNCTIONS
// =============================================================================

/** @internal */
function _toFilePath(path: string): FilePath {
	return path as FilePath;
}

/** @internal */
function _toDirectoryPath(path: string): DirectoryPath {
	return path as DirectoryPath;
}

/** @internal */
function _toConfigPath(path: string): ConfigPath {
	return path as ConfigPath;
}

/** @internal */
function _toTempFilePath(path: string): TempFilePath {
	return path as TempFilePath;
}

/** @internal */
function _toBinaryPath(path: string): BinaryPath {
	return path as BinaryPath;
}

/** @internal */
function _toSessionId(id: string): SessionId {
	return id as SessionId;
}

/** @internal */
function _toToolUseId(id: string): ToolUseId {
	return id as ToolUseId;
}

/** @internal */
function _toSemanticVersion(version: string): SemanticVersion {
	return version as SemanticVersion;
}

/** @internal */
function _toShellCommand(command: string): ShellCommand {
	return command as ShellCommand;
}

// =============================================================================
// INTERNAL VALIDATION FUNCTIONS
// =============================================================================

/** @internal */
function _parseSemanticVersion(input: string): SemanticVersion | undefined {
	const match = input.match(/^(\d+\.\d+\.\d+)/);
	return match ? (match[1] as SemanticVersion) : undefined;
}

/** @internal */
function _parseAbsoluteFilePath(input: string): FilePath | undefined {
	return input.startsWith("/") ? (input as FilePath) : undefined;
}

/** @internal */
function _parseAbsoluteDirectoryPath(input: string): DirectoryPath | undefined {
	return input.startsWith("/") ? (input as DirectoryPath) : undefined;
}

// =============================================================================
// BRANDED TYPES NAMESPACE
// =============================================================================

/**
 * `BrandedTypes` provides all branded type constructors and validators.
 *
 * @remarks
 * This namespace consolidates all functions for creating and validating branded types.
 * Branded types are compile-time-only type safety constructs - the `__brand` property
 * is phantom and has zero runtime overhead.
 *
 * **Categories of functions:**
 *
 * - **Path constructors** - `toFilePath`, `toDirectoryPath`, `toConfigPath`,
 *   `toTempFilePath`, `toBinaryPath`
 * - **Identifier constructors** - `toSessionId`, `toToolUseId`
 * - **Version constructors** - `toSemanticVersion`
 * - **Shell constructors** - `toShellCommand`
 * - **Validators** - `parseSemanticVersion`, `parseAbsoluteFilePath`,
 *   `parseAbsoluteDirectoryPath`
 *
 * @example Creating branded values
 * ```typescript
 * import { BrandedTypes, FilePath, SessionId } from "claude-binary-plugin";
 *
 * // Path types
 * const file: FilePath = BrandedTypes.toFilePath("/home/user/code.ts");
 * const dir = BrandedTypes.toDirectoryPath("/home/user");
 * const config = BrandedTypes.toConfigPath("/etc/biome.json");
 *
 * // Identifiers
 * const sessionId: SessionId = BrandedTypes.toSessionId("abc-123");
 * const toolUseId = BrandedTypes.toToolUseId("tool-use-456");
 *
 * // Versions
 * const version = BrandedTypes.toSemanticVersion("1.2.3");
 * ```
 *
 * @example Validating values
 * ```typescript
 * import { BrandedTypes } from "claude-binary-plugin";
 *
 * // Returns undefined for invalid input
 * const version = BrandedTypes.parseSemanticVersion("1.2.3"); // SemanticVersion
 * const invalid = BrandedTypes.parseSemanticVersion("abc"); // undefined
 *
 * // Path validation
 * const abs = BrandedTypes.parseAbsoluteFilePath("/home/user"); // FilePath
 * const rel = BrandedTypes.parseAbsoluteFilePath("./relative"); // undefined
 * ```
 *
 * @see {@link Brand} - The generic branding helper type
 * @see {@link Unbrand} - Extract the base type from a branded type
 * @public
 */
export const BrandedTypes = {
	// =========================================================================
	// Path Constructors
	// =========================================================================

	/**
	 * Creates a {@link FilePath} from a string without validation.
	 * @param path - The file path string to brand
	 * @returns The input string branded as FilePath
	 */
	toFilePath: _toFilePath,

	/**
	 * Creates a {@link DirectoryPath} from a string without validation.
	 * @param path - The directory path string to brand
	 * @returns The input string branded as DirectoryPath
	 */
	toDirectoryPath: _toDirectoryPath,

	/**
	 * Creates a {@link ConfigPath} from a string without validation.
	 * @param path - The configuration file path string to brand
	 * @returns The input string branded as ConfigPath
	 */
	toConfigPath: _toConfigPath,

	/**
	 * Creates a {@link TempFilePath} from a string without validation.
	 * @param path - The temporary file path string to brand
	 * @returns The input string branded as TempFilePath
	 */
	toTempFilePath: _toTempFilePath,

	/**
	 * Creates a {@link BinaryPath} from a string without validation.
	 * @param path - The binary path string to brand
	 * @returns The input string branded as BinaryPath
	 */
	toBinaryPath: _toBinaryPath,

	// =========================================================================
	// Identifier Constructors
	// =========================================================================

	/**
	 * Creates a {@link SessionId} from a string without validation.
	 * @param id - The session ID string to brand
	 * @returns The input string branded as SessionId
	 */
	toSessionId: _toSessionId,

	/**
	 * Creates a {@link ToolUseId} from a string without validation.
	 * @param id - The tool use ID string to brand
	 * @returns The input string branded as ToolUseId
	 */
	toToolUseId: _toToolUseId,

	// =========================================================================
	// Version Constructors
	// =========================================================================

	/**
	 * Creates a {@link SemanticVersion} from a string without validation.
	 * @param version - The version string to brand
	 * @returns The input string branded as SemanticVersion
	 */
	toSemanticVersion: _toSemanticVersion,

	// =========================================================================
	// Shell Constructors
	// =========================================================================

	/**
	 * Creates a {@link ShellCommand} from a string without validation.
	 * @param command - The shell command string to brand
	 * @returns The input string branded as ShellCommand
	 */
	toShellCommand: _toShellCommand,

	// =========================================================================
	// Validation Functions
	// =========================================================================

	/**
	 * Parses and validates a semantic version string.
	 * @param input - The string to parse as a semantic version
	 * @returns The validated SemanticVersion, or `undefined` if invalid
	 */
	parseSemanticVersion: _parseSemanticVersion,

	/**
	 * Validates that a path is absolute and returns a branded {@link FilePath}.
	 * @param input - The path string to validate
	 * @returns The validated FilePath, or `undefined` if not absolute
	 */
	parseAbsoluteFilePath: _parseAbsoluteFilePath,

	/**
	 * Validates that a path is absolute and returns a branded {@link DirectoryPath}.
	 * @param input - The path string to validate
	 * @returns The validated DirectoryPath, or `undefined` if not absolute
	 */
	parseAbsoluteDirectoryPath: _parseAbsoluteDirectoryPath,
} as const;

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
