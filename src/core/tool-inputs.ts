/**

* Typed Tool Input Definitions
*
* This module provides strongly-typed interfaces for Claude Code tool inputs,
* eliminating the need for unsafe type casting when accessing tool parameters.
*
* Two levels of type safety are available:
* 1. **Basic types** (e.g., `WriteToolInput`) - Uses plain strings, works with type guards
* 1. **Branded types** (e.g., `BrandedWriteToolInput`) - Uses branded strings for maximum safety
*
* @example

* ```ts
* import { isWriteToolInput, type WriteToolInput } from "claude-binary-plugin";
*
* if (event.tool_name === "Write" && isWriteToolInput(event.tool_input)) {
* // TypeScript knows these properties exist and are strings
* const { file_path, content } = event.tool_input;
* }

* ```

 */

import type { FilePath, ShellCommand } from "./branded-types.js";

// =============================================================================
// FILE OPERATION TOOLS
// =============================================================================

/**
 * Input for the Write tool - creates or overwrites a file.
 * @public
 */
export interface WriteToolInput {
	/**Absolute path to the file to write */
	file_path: string;
	/** Content to write to the file */
	content: string;
}

/**
 * Branded version of WriteToolInput with FilePath type.
 * @public
 */
export interface BrandedWriteToolInput {
	/**Absolute path to the file to write */
	file_path: FilePath;
	/** Content to write to the file */
	content: string;
}

/**
 * Input for the Edit tool - performs string replacement in a file.
 * @public
 */
export interface EditToolInput {
	/**Absolute path to the file to modify */
	file_path: string;
	/** The text to replace */
	old_string: string;
	/**The replacement text */
	new_string: string;
	/** Replace all occurrences (default: false) */
	replace_all?: boolean;
}

/**
 * Branded version of EditToolInput with FilePath type.
 * @public
 */
export interface BrandedEditToolInput {
	/**Absolute path to the file to modify */
	file_path: FilePath;
	/** The text to replace */
	old_string: string;
	/**The replacement text */
	new_string: string;
	/** Replace all occurrences (default: false) */
	replace_all?: boolean;
}

/**
 * Input for the Read tool - reads file content.
 * @public
 */
export interface ReadToolInput {
	/**Absolute path to the file to read */
	file_path: string;
	/** Line number to start reading from (optional) */
	offset?: number;
	/**Number of lines to read (optional)*/
	limit?: number;
}

/**
 * Branded version of ReadToolInput with FilePath type.
 * @public
 */
export interface BrandedReadToolInput {
	/**Absolute path to the file to read */
	file_path: FilePath;
	/** Line number to start reading from (optional) */
	offset?: number;
	/**Number of lines to read (optional)*/
	limit?: number;
}

/**
 * Input for the NotebookEdit tool - edits Jupyter notebook cells.
 * @public
 */
export interface NotebookEditToolInput {
	/**Absolute path to the notebook file */
	notebook_path: string;
	/** New source content for the cell */
	new_source: string;
	/**Cell ID to edit (optional) */
	cell_id?: string;
	/** Cell type (code or markdown) */
	cell_type?: "code" | "markdown";
	/**Edit mode (replace, insert, delete)*/
	edit_mode?: "replace" | "insert" | "delete";
}

/**
 * Branded version of NotebookEditToolInput with FilePath type.
 * @public
 */
export interface BrandedNotebookEditToolInput {
	/**Absolute path to the notebook file */
	notebook_path: FilePath;
	/** New source content for the cell */
	new_source: string;
	/**Cell ID to edit (optional) */
	cell_id?: string;
	/** Cell type (code or markdown) */
	cell_type?: "code" | "markdown";
	/**Edit mode (replace, insert, delete)*/
	edit_mode?: "replace" | "insert" | "delete";
}

// =============================================================================
// SEARCH TOOLS
// =============================================================================

/**
 * Input for the Glob tool - finds files by pattern.
 * @public
 */
export interface GlobToolInput {
	/**Glob pattern to match files */
	pattern: string;
	/** Directory to search in (optional, defaults to cwd) */
	path?: string;
}

/**
 * Input for the Grep tool - searches file content.
 * @public
 */
export interface GrepToolInput {
	/**Regular expression pattern to search for */
	pattern: string;
	/** File or directory to search in (optional) */
	path?: string;
	/**Glob pattern to filter files (optional) */
	glob?: string;
	/** File type to search (optional) */
	type?: string;
	/**Output mode: content, files_with_matches, or count */
	output_mode?: "content" | "files_with_matches" | "count";
	/** Case insensitive search */
	"-i"?: boolean;
	/**Lines of context after match */
	"-A"?: number;
	/** Lines of context before match */
	"-B"?: number;
	/**Lines of context around match */
	"-C"?: number;
	/** Show line numbers */
	"-n"?: boolean;
	/**Enable multiline mode */
	multiline?: boolean;
	/** Limit output lines */
	head_limit?: number;
	/**Skip first N entries*/
	offset?: number;
}

// =============================================================================
// EXECUTION TOOLS
// =============================================================================

/**
 * Input for the Bash tool - executes shell commands.
 * @public
 */
export interface BashToolInput {
	/**The command to execute */
	command: string;
	/** Optional timeout in milliseconds (max 600000) */
	timeout?: number;
	/**Description of what the command does */
	description?: string;
	/** Run command in background */
	run_in_background?: boolean;
	/**Disable sandbox mode (dangerous)*/
	dangerouslyDisableSandbox?: boolean;
}

/**
 * Branded version of BashToolInput with ShellCommand type.
 * @public
 */
export interface BrandedBashToolInput {
	/**The command to execute */
	command: ShellCommand;
	/** Optional timeout in milliseconds (max 600000) */
	timeout?: number;
	/**Description of what the command does */
	description?: string;
	/** Run command in background */
	run_in_background?: boolean;
	/**Disable sandbox mode (dangerous)*/
	dangerouslyDisableSandbox?: boolean;
}

/**
 * Input for the Task tool - spawns subagents.
 * @public
 */
export interface TaskToolInput {
	/**Task description for the agent */
	prompt: string;
	/** Short description (3-5 words) */
	description: string;
	/**Type of specialized agent */
	subagent_type: string;
	/** Model to use (optional) */
	model?: "sonnet" | "opus" | "haiku";
	/**Agent ID to resume (optional)*/
	resume?: string;
}

// =============================================================================
// WEB TOOLS
// =============================================================================

/**
 * Input for the WebFetch tool - fetches and processes web content.
 * @public
 */
export interface WebFetchToolInput {
	/**URL to fetch content from */
	url: string;
	/** Prompt to run on the fetched content */
	prompt: string;
}

/**
 * Input for the WebSearch tool - searches the web.
 * @public
 */
export interface WebSearchToolInput {
	/**Search query */
	query: string;
	/** Only include results from these domains (optional) */
	allowed_domains?: string[];
	/**Never include results from these domains (optional)*/
	blocked_domains?: string[];
}

// =============================================================================
// TODO TOOLS
// =============================================================================

/**
 * Todo item structure for TodoWrite.
 * @public
 */
export interface TodoItem {
	/**Task description */
	content: string;
	/** Task status */
	status: "pending" | "in_progress" | "completed";
	/**Present continuous form of the task*/
	activeForm: string;
}

/**
 * Input for the TodoWrite tool - manages task lists.
 * @public
 */
export interface TodoWriteToolInput {
	/**The updated todo list*/
	todos: TodoItem[];
}

// =============================================================================
// TOOL INPUT MAP
// =============================================================================

/**
 * Maps tool names to their input types.
 * Use this with discriminated unions for type-safe tool input access.
 * @public
 */
export interface ToolInputMap {
	Write: WriteToolInput;
	Edit: EditToolInput;
	Read: ReadToolInput;
	NotebookEdit: NotebookEditToolInput;
	Glob: GlobToolInput;
	Grep: GrepToolInput;
	Bash: BashToolInput;
	Task: TaskToolInput;
	WebFetch: WebFetchToolInput;
	WebSearch: WebSearchToolInput;
	TodoWrite: TodoWriteToolInput;
}

/**
 * Known tool names that have typed inputs.
 * @public
 */
export type TypedToolName = keyof ToolInputMap;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an object is a valid WriteToolInput.
 * @public
 */
export function isWriteToolInput(input: unknown): input is WriteToolInput {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as WriteToolInput).file_path === "string" &&
		typeof (input as WriteToolInput).content === "string"
	);
}

/**
 * Type guard to check if an object is a valid EditToolInput.
 * @public
 */
export function isEditToolInput(input: unknown): input is EditToolInput {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as EditToolInput).file_path === "string" &&
		typeof (input as EditToolInput).old_string === "string" &&
		typeof (input as EditToolInput).new_string === "string"
	);
}

/**
 * Type guard to check if an object is a valid ReadToolInput.
 * @public
 */
export function isReadToolInput(input: unknown): input is ReadToolInput {
	return typeof input === "object" && input !== null && typeof (input as ReadToolInput).file_path === "string";
}

/**
 * Type guard to check if an object is a valid BashToolInput.
 * @public
 */
export function isBashToolInput(input: unknown): input is BashToolInput {
	return typeof input === "object" && input !== null && typeof (input as BashToolInput).command === "string";
}

/**
 * Type guard to check if an object is a valid GlobToolInput.
 * @public
 */
export function isGlobToolInput(input: unknown): input is GlobToolInput {
	return typeof input === "object" && input !== null && typeof (input as GlobToolInput).pattern === "string";
}

/**
 * Type guard to check if an object is a valid GrepToolInput.
 * @public
 */
export function isGrepToolInput(input: unknown): input is GrepToolInput {
	return typeof input === "object" && input !== null && typeof (input as GrepToolInput).pattern === "string";
}

/**
 * Type guard to check if an object is a valid TaskToolInput.
 * @public
 */
export function isTaskToolInput(input: unknown): input is TaskToolInput {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as TaskToolInput).prompt === "string" &&
		typeof (input as TaskToolInput).description === "string" &&
		typeof (input as TaskToolInput).subagent_type === "string"
	);
}

/**
 * Type guard to check if an object is a valid WebFetchToolInput.
 * @public
 */
export function isWebFetchToolInput(input: unknown): input is WebFetchToolInput {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as WebFetchToolInput).url === "string" &&
		typeof (input as WebFetchToolInput).prompt === "string"
	);
}

/**
 * Type guard to check if an object is a valid WebSearchToolInput.
 * @public
 */
export function isWebSearchToolInput(input: unknown): input is WebSearchToolInput {
	return typeof input === "object" && input !== null && typeof (input as WebSearchToolInput).query === "string";
}

/**
 * Type guard to check if an object is a valid NotebookEditToolInput.
 * @public
 */
export function isNotebookEditToolInput(input: unknown): input is NotebookEditToolInput {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as NotebookEditToolInput).notebook_path === "string" &&
		typeof (input as NotebookEditToolInput).new_source === "string"
	);
}

/**
 * Type guard to check if an object is a valid TodoWriteToolInput.
 * @public
 */
export function isTodoWriteToolInput(input: unknown): input is TodoWriteToolInput {
	return typeof input === "object" && input !== null && Array.isArray((input as TodoWriteToolInput).todos);
}

// =============================================================================
// GENERIC TYPED INPUT ACCESS
// =============================================================================

/**
 * Get typed tool input for a specific tool.
 * Returns the input if it matches the expected type, otherwise undefined.
 *
 * @example
 * ```ts
 * const writeInput = getTypedToolInput("Write", event.tool_input);
 * if (writeInput) {
 *   console.log(writeInput.file_path); // Type-safe access
 * }
 * ```
 * @public
 */
export function getTypedToolInput<T extends TypedToolName>(toolName: T, input: unknown): ToolInputMap[T] | undefined {
	const guards: Record<TypedToolName, (input: unknown) => boolean> = {
		Write: isWriteToolInput,
		Edit: isEditToolInput,
		Read: isReadToolInput,
		NotebookEdit: isNotebookEditToolInput,
		Glob: isGlobToolInput,
		Grep: isGrepToolInput,
		Bash: isBashToolInput,
		Task: isTaskToolInput,
		WebFetch: isWebFetchToolInput,
		WebSearch: isWebSearchToolInput,
		TodoWrite: isTodoWriteToolInput,
	};

	const guard = guards[toolName];
	return guard(input) ? (input as ToolInputMap[T]) : undefined;
}
