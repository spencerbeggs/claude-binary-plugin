/**
 * Common Zod argument schemas for command argument validation.
 *
 * This module provides reusable, async-validated schemas for common
 * command arguments like file paths, directories, and glob patterns.
 *
 * @example
 * ```ts
 * import { pathArg, fileArg, dirArg, globArg } from "claude-binary-plugin/command-args";
 * import { z } from "zod";
 *
 * const lintArgs = z.object({
 *   path: pathArg({ defaultValue: "." }),
 *   config: fileArg({ optional: true }),
 * });
 * ```
 *
 * @module
 */

import { z } from "zod";

// =============================================================================
// PATH VALIDATION HELPERS
// =============================================================================

/**
 * Check if a path exists on disk.
 */
async function pathExists(path: string): Promise<boolean> {
	try {
		const file = Bun.file(path);
		return await file.exists();
	} catch {
		return false;
	}
}

/**
 * Check if a path is a file.
 */
async function isFile(path: string): Promise<boolean> {
	try {
		const stat = await Bun.file(path).stat();
		return stat?.isFile() ?? false;
	} catch {
		return false;
	}
}

/**
 * Check if a path is a directory.
 */
async function isDirectory(path: string): Promise<boolean> {
	try {
		// Bun.file doesn't work for directories, use node:fs
		const { stat } = await import("node:fs/promises");
		const stats = await stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

// =============================================================================
// ARG SCHEMA OPTIONS
// =============================================================================

/**
 * Options for creating path argument schemas.
 */
export interface PathArgOptions {
	/** Default value if not provided */
	defaultValue?: string;
	/** Whether the argument is optional (defaults to true if defaultValue provided) */
	optional?: boolean;
	/** Description for help text and error messages */
	description?: string;
	/** Whether to validate that the path exists (default: true) */
	validateExists?: boolean;
}

/**
 * Options for creating file argument schemas.
 */
export interface FileArgOptions extends PathArgOptions {
	/** Allowed file extensions (e.g., [".ts", ".js"]) */
	extensions?: string[];
}

/**
 * Options for creating directory argument schemas.
 */
export interface DirArgOptions extends PathArgOptions {
	/** Whether to create the directory if it doesn't exist */
	createIfMissing?: boolean;
}

/**
 * Options for creating glob argument schemas.
 */
export interface GlobArgOptions {
	/** Default value if not provided */
	defaultValue?: string;
	/** Whether the argument is optional */
	optional?: boolean;
	/** Description for help text */
	description?: string;
}

// =============================================================================
// PATH ARG SCHEMA
// =============================================================================

/**
 * Create a path argument schema that validates file or directory paths.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   target: pathArg({ defaultValue: ".", description: "Target path to process" }),
 * });
 * ```
 */
export function pathArg(options: PathArgOptions = {}): z.ZodType<string> {
	const { defaultValue, optional = defaultValue !== undefined, description, validateExists = true } = options;

	let schema = z.string();

	if (description) {
		schema = schema.describe(description);
	}

	// Add existence validation
	if (validateExists) {
		schema = schema.refine(async (path) => await pathExists(path), {
			message: "Path does not exist",
		}) as unknown as z.ZodString;
	}

	// Handle optional/default
	if (defaultValue !== undefined) {
		return schema.default(defaultValue) as unknown as z.ZodType<string>;
	}

	if (optional) {
		return schema.optional().default(".") as unknown as z.ZodType<string>;
	}

	return schema;
}

// =============================================================================
// FILE ARG SCHEMA
// =============================================================================

/**
 * Create a file argument schema that validates the path is an existing file.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   config: fileArg({ extensions: [".json", ".jsonc"], optional: true }),
 * });
 * ```
 */
export function fileArg(options: FileArgOptions = {}): z.ZodType<string | undefined> {
	const { defaultValue, optional = true, description, validateExists = true, extensions } = options;

	let schema = z.string();

	if (description) {
		schema = schema.describe(description);
	}

	// Check extension if specified
	if (extensions && extensions.length > 0) {
		schema = schema.refine(
			(path) => {
				const ext = path.substring(path.lastIndexOf("."));
				return extensions.includes(ext);
			},
			{
				message: `File must have one of these extensions: ${extensions.join(", ")}`,
			},
		) as unknown as z.ZodString;
	}

	// Add file existence and type validation
	if (validateExists) {
		schema = schema.refine(async (path) => await isFile(path), {
			message: "Path must be an existing file",
		}) as unknown as z.ZodString;
	}

	// Handle optional/default
	if (defaultValue !== undefined) {
		return schema.default(defaultValue) as unknown as z.ZodType<string | undefined>;
	}

	if (optional) {
		return schema.optional() as unknown as z.ZodType<string | undefined>;
	}

	return schema as unknown as z.ZodType<string | undefined>;
}

// =============================================================================
// DIRECTORY ARG SCHEMA
// =============================================================================

/**
 * Create a directory argument schema that validates the path is an existing directory.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   output: dirArg({ defaultValue: "./dist", createIfMissing: true }),
 * });
 * ```
 */
export function dirArg(options: DirArgOptions = {}): z.ZodType<string> {
	const { defaultValue, optional = defaultValue !== undefined, description, validateExists = true } = options;

	let schema = z.string();

	if (description) {
		schema = schema.describe(description);
	}

	// Add directory existence and type validation
	if (validateExists) {
		schema = schema.refine(async (path) => await isDirectory(path), {
			message: "Path must be an existing directory",
		}) as unknown as z.ZodString;
	}

	// Handle optional/default
	if (defaultValue !== undefined) {
		return schema.default(defaultValue) as unknown as z.ZodType<string>;
	}

	if (optional) {
		return schema.optional().default(".") as unknown as z.ZodType<string>;
	}

	return schema;
}

// =============================================================================
// GLOB ARG SCHEMA
// =============================================================================

/**
 * Create a glob pattern argument schema.
 * Validates the pattern is a valid glob syntax.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   pattern: globArg({ defaultValue: "**\/*.ts", description: "Files to match" }),
 * });
 * ```
 */
export function globArg(options: GlobArgOptions = {}): z.ZodType<string> {
	const { defaultValue, optional = defaultValue !== undefined, description } = options;

	let schema = z.string();

	if (description) {
		schema = schema.describe(description);
	}

	// Validate glob pattern syntax (basic check)
	schema = schema.refine(
		(pattern) => {
			// Basic glob pattern validation
			// Must not be empty and should not have unmatched brackets
			if (!pattern || pattern.trim() === "") return false;

			// Check for basic glob characters or plain path
			const hasGlobChars = /[*?[\]{}!]/.test(pattern);
			const isPlainPath = /^[a-zA-Z0-9._/-]+$/.test(pattern);

			return hasGlobChars || isPlainPath;
		},
		{
			message: "Invalid glob pattern",
		},
	) as unknown as z.ZodString;

	// Handle optional/default
	if (defaultValue !== undefined) {
		return schema.default(defaultValue) as unknown as z.ZodType<string>;
	}

	if (optional) {
		return schema.optional().default("**/*") as unknown as z.ZodType<string>;
	}

	return schema;
}

// =============================================================================
// COMMON ARG PRESETS
// =============================================================================

/**
 * Common argument presets for frequently used patterns.
 */
export const commonArgs = {
	/**
	 * Target path argument (file or directory, defaults to ".")
	 */
	targetPath: pathArg({
		defaultValue: ".",
		description: "Target path (file or directory)",
	}),

	/**
	 * Optional config file argument
	 */
	configFile: fileArg({
		optional: true,
		description: "Configuration file path",
	}),

	/**
	 * Output directory argument
	 */
	outputDir: dirArg({
		defaultValue: "./dist",
		description: "Output directory",
	}),

	/**
	 * Source files glob pattern
	 */
	sourceGlob: globArg({
		defaultValue: "**/*.{ts,tsx,js,jsx}",
		description: "Source files pattern",
	}),
} as const;

// =============================================================================
// SCHEMA HELPERS
// =============================================================================

/**
 * Create a boolean flag argument.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   fix: boolArg({ defaultValue: true, description: "Auto-fix issues" }),
 *   verbose: boolArg({ defaultValue: false }),
 * });
 * ```
 */
export function boolArg(options: { defaultValue?: boolean; description?: string } = {}): z.ZodType<boolean> {
	const { defaultValue = false, description } = options;

	let schema = z.boolean();

	if (description) {
		schema = schema.describe(description);
	}

	return schema.default(defaultValue);
}

/**
 * Create a string enum argument.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   format: enumArg(["json", "text", "markdown"], { defaultValue: "text" }),
 * });
 * ```
 */
export function enumArg<T extends string>(
	values: readonly [T, ...T[]],
	options: { defaultValue?: T; description?: string } = {},
): z.ZodType<T> {
	const { defaultValue, description } = options;

	let schema = z.enum(values);

	if (description) {
		schema = schema.describe(description);
	}

	if (defaultValue !== undefined) {
		return schema.default(defaultValue) as unknown as z.ZodType<T>;
	}

	return schema as unknown as z.ZodType<T>;
}

/**
 * Create an integer argument with optional min/max bounds.
 *
 * @example
 * ```ts
 * const args = z.object({
 *   limit: intArg({ min: 1, max: 100, defaultValue: 10 }),
 * });
 * ```
 */
export function intArg(
	options: { min?: number; max?: number; defaultValue?: number; description?: string } = {},
): z.ZodType<number> {
	const { min, max, defaultValue, description } = options;

	let schema = z.number().int();

	if (min !== undefined) {
		schema = schema.min(min);
	}

	if (max !== undefined) {
		schema = schema.max(max);
	}

	if (description) {
		schema = schema.describe(description);
	}

	if (defaultValue !== undefined) {
		return schema.default(defaultValue);
	}

	return schema;
}
