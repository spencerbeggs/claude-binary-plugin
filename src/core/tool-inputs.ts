/**
 * Strongly-typed interfaces for Claude Code tool inputs.
 *
 * This module provides type-safe access to tool parameters in PreToolUse and
 * PostToolUse hooks, eliminating unsafe type casting when inspecting or
 * modifying tool inputs.
 *
 * @remarks
 * Use the {@link ToolInputGuard} namespace methods to validate and narrow tool inputs:
 * - `ToolInputGuard.isWrite(input)` - Check if input is a {@link WriteToolInput}
 * - `ToolInputGuard.isBash(input)` - Check if input is a {@link BashToolInput}
 * - `ToolInputGuard.is("Bash", input)` - Generic check for any tool type
 * - `ToolInputGuard.getTyped("Bash", input)` - Get typed input or undefined
 *
 * @example
 * ```typescript
 * import { ToolInputGuard } from "claude-binary-plugin";
 * import type { Pipeline } from "../plugin.config.js";
 *
 * const handler: Pipeline["PreToolUse"] = ({ input }) => {
 *   // Type-safe access to Bash command
 *   if (input.tool_name === "Bash" && ToolInputGuard.isBash(input.tool_input)) {
 *     const { command, timeout } = input.tool_input;
 *     if (command.includes("rm -rf")) {
 *       return { status: "executed", action: "deny", summary: "blocked rm -rf" };
 *     }
 *   }
 *
 *   // Type-safe access to Write file path
 *   if (input.tool_name === "Write" && ToolInputGuard.isWrite(input.tool_input)) {
 *     const { file_path, content } = input.tool_input;
 *     console.log(`Writing ${content.length} bytes to ${file_path}`);
 *   }
 *
 *   // Generic helper for multiple tools
 *   const bashInput = ToolInputGuard.getTyped("Bash", input.tool_input);
 *   if (bashInput) {
 *     console.log(`Command: ${bashInput.command}`);
 *   }
 *
 *   return { status: "executed", action: "allow", summary: "allowed" };
 * };
 * ```
 *
 * @see {@link ToolInputGuard} - Namespace with type guards and helpers
 * @see {@link ToolInputMap} - Maps tool names to their input types
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#pretooluse | PreToolUse Hook Documentation}
 */

// =============================================================================
// FILE OPERATION TOOLS
// =============================================================================

/**
 * Input for the Write tool - creates or overwrites a file.
 *
 * @remarks
 * The Write tool creates new files or completely replaces existing file contents.
 * Unlike {@link EditToolInput}, Write does not perform partial modifications.
 *
 * Common security considerations for PreToolUse hooks:
 * - Check `file_path` against allowlists for sensitive locations
 * - Validate `content` for secrets, credentials, or malicious payloads
 * - Consider blocking writes to configuration files (`.env`, `package.json`)
 *
 * @example
 * ```typescript
 * if (isWriteToolInput(input.tool_input)) {
 *   const { file_path, content } = input.tool_input;
 *   if (file_path.endsWith('.env')) {
 *     return { status: "executed", action: "deny", summary: "blocked .env write" };
 *   }
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isWrite} - Type guard for runtime validation
 * @see {@link EditToolInput} - For partial file modifications
 * @public
 */
export interface WriteToolInput {
	/** Absolute path to the file to write */
	file_path: string;
	/** Content to write to the file */
	content: string;
}

/**
 * Input for the Edit tool - performs string replacement in a file.
 *
 * @remarks
 * The Edit tool performs surgical text replacements within files. It locates
 * `old_string` in the file and replaces it with `new_string`. By default,
 * only the first occurrence is replaced unless `replace_all` is true.
 *
 * Key behaviors:
 * - The edit fails if `old_string` is not found in the file
 * - The edit fails if `old_string` appears multiple times (unless unique context is provided)
 * - Whitespace and indentation must match exactly
 *
 * Security considerations for PreToolUse hooks:
 * - Validate that `new_string` doesn't introduce vulnerabilities
 * - Check for command injection in shell script edits
 * - Monitor for credential or secret modifications
 *
 * @example
 * ```typescript
 * if (isEditToolInput(input.tool_input)) {
 *   const { file_path, old_string, new_string } = input.tool_input;
 *   console.log(`Editing ${file_path}: replacing ${old_string.length} chars`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isEdit} - Type guard for runtime validation
 * @see {@link WriteToolInput} - For complete file replacement
 * @public
 */
export interface EditToolInput {
	/** Absolute path to the file to modify */
	file_path: string;
	/** The text to replace (must be found exactly in the file) */
	old_string: string;
	/** The replacement text */
	new_string: string;
	/** Replace all occurrences instead of just the first (default: false) */
	replace_all?: boolean;
}

/**
 * Input for the Read tool - reads file content.
 *
 * @remarks
 * The Read tool retrieves file contents, optionally with line offset and limit
 * for reading specific portions of large files. This is one of the most commonly
 * used tools and is typically safe to allow without restriction.
 *
 * By default, the tool reads up to 2000 lines from the beginning of the file.
 * Use `offset` and `limit` to read specific sections of larger files.
 *
 * PostToolUse hooks can inspect read results to add contextual information,
 * such as documentation links or related file suggestions.
 *
 * @example
 * ```typescript
 * if (isReadToolInput(input.tool_input)) {
 *   const { file_path, offset, limit } = input.tool_input;
 *   console.log(`Reading ${file_path}${offset ? ` from line ${offset}` : ''}`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isRead} - Type guard for runtime validation
 * @public
 */
export interface ReadToolInput {
	/** Absolute path to the file to read */
	file_path: string;
	/** Line number to start reading from (1-indexed, optional) */
	offset?: number;
	/** Maximum number of lines to read (optional, default: 2000) */
	limit?: number;
}

/**
 * Input for the NotebookEdit tool - edits Jupyter notebook cells.
 *
 * @remarks
 * The NotebookEdit tool modifies Jupyter notebook (.ipynb) cells. It can
 * replace cell contents, insert new cells, or delete existing ones.
 *
 * Edit modes:
 * - `"replace"` (default) - Replace the content of an existing cell
 * - `"insert"` - Insert a new cell after the specified cell ID
 * - `"delete"` - Remove a cell entirely
 *
 * Cell types:
 * - `"code"` - Executable code cells
 * - `"markdown"` - Documentation/text cells
 *
 * @example
 * ```typescript
 * if (isNotebookEditToolInput(input.tool_input)) {
 *   const { notebook_path, edit_mode, cell_type } = input.tool_input;
 *   console.log(`${edit_mode ?? 'replace'} ${cell_type ?? 'code'} cell in ${notebook_path}`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isNotebookEdit} - Type guard for runtime validation
 * @public
 */
export interface NotebookEditToolInput {
	/** Absolute path to the Jupyter notebook file (.ipynb) */
	notebook_path: string;
	/** New source content for the cell */
	new_source: string;
	/** Cell ID to target for editing (optional, uses first cell if not specified) */
	cell_id?: string;
	/** Cell type: "code" for executable cells, "markdown" for documentation */
	cell_type?: "code" | "markdown";
	/** Edit mode: "replace" (default), "insert" new cell, or "delete" existing */
	edit_mode?: "replace" | "insert" | "delete";
}

// =============================================================================
// SEARCH TOOLS
// =============================================================================

/**
 * Input for the Glob tool - finds files by pattern matching.
 *
 * @remarks
 * The Glob tool searches for files matching a glob pattern. It's commonly used
 * to discover files before reading or editing them. Results are sorted by
 * modification time (most recent first).
 *
 * Common patterns:
 * - `"**\/*.ts"` - All TypeScript files recursively
 * - `"src/**\/*.{ts,tsx}"` - TypeScript/TSX files in src
 * - `"*.json"` - JSON files in current directory only
 *
 * This tool is typically safe to allow without restrictions as it only
 * returns file paths, not contents.
 *
 * @example
 * ```typescript
 * if (isGlobToolInput(input.tool_input)) {
 *   const { pattern, path } = input.tool_input;
 *   console.log(`Searching for ${pattern} in ${path ?? 'cwd'}`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isGlob} - Type guard for runtime validation
 * @see {@link GrepToolInput} - For searching file contents
 * @public
 */
export interface GlobToolInput {
	/** Glob pattern to match files (e.g., "**\/*.ts") */
	pattern: string;
	/** Directory to search in (optional, defaults to current working directory) */
	path?: string;
}

/**
 * Input for the Grep tool - searches file content using ripgrep.
 *
 * @remarks
 * The Grep tool searches file contents using regular expressions, powered by
 * ripgrep for fast, efficient searching. It supports various output modes
 * and filtering options.
 *
 * Output modes:
 * - `"files_with_matches"` (default) - Only return matching file paths
 * - `"content"` - Return matching lines with optional context
 * - `"count"` - Return match counts per file
 *
 * Pattern syntax uses ripgrep regex, which differs slightly from JavaScript:
 * - Literal braces need escaping: `interface\{\}` to match `interface{}`
 * - Use `multiline: true` for patterns spanning multiple lines
 *
 * This tool is typically safe to allow without restrictions as it only
 * reads file contents for searching.
 *
 * @example
 * ```typescript
 * if (isGrepToolInput(input.tool_input)) {
 *   const { pattern, path, output_mode } = input.tool_input;
 *   console.log(`Searching for "${pattern}" (${output_mode ?? 'files_with_matches'})`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isGrep} - Type guard for runtime validation
 * @see {@link GlobToolInput} - For finding files by name pattern
 * @public
 */
export interface GrepToolInput {
	/** Regular expression pattern to search for (ripgrep syntax) */
	pattern: string;
	/** File or directory to search in (optional, defaults to cwd) */
	path?: string;
	/** Glob pattern to filter which files to search (e.g., "*.ts") */
	glob?: string;
	/** File type to search (e.g., "ts", "js", "rust") - more efficient than glob for standard types */
	type?: string;
	/** Output mode: "files_with_matches" (default), "content", or "count" */
	output_mode?: "content" | "files_with_matches" | "count";
	/** Case insensitive search (ripgrep -i flag) */
	"-i"?: boolean;
	/** Lines of context after each match (ripgrep -A flag) */
	"-A"?: number;
	/** Lines of context before each match (ripgrep -B flag) */
	"-B"?: number;
	/** Lines of context around each match (ripgrep -C flag) */
	"-C"?: number;
	/** Show line numbers in output (ripgrep -n flag, default: true for content mode) */
	"-n"?: boolean;
	/** Enable multiline mode where `.` matches newlines (ripgrep -U --multiline-dotall) */
	multiline?: boolean;
	/** Limit output to first N lines/entries */
	head_limit?: number;
	/** Skip first N entries before applying head_limit */
	offset?: number;
}

// =============================================================================
// EXECUTION TOOLS
// =============================================================================

/**
 * Input for the Bash tool - executes shell commands.
 *
 * @remarks
 * The Bash tool executes shell commands in a persistent shell session. This is
 * one of the most powerful and potentially dangerous tools, requiring careful
 * security consideration in PreToolUse hooks.
 *
 * **Security considerations:**
 * - Validate `command` against allowlists/blocklists for dangerous patterns
 * - Watch for command injection via semicolons, pipes, backticks, `$()`
 * - Block destructive commands: `rm -rf`, `chmod 777`, `curl | bash`
 * - Consider blocking network access: `curl`, `wget`, `ssh`, `nc`
 * - Validate working directory if security-sensitive
 *
 * **Sandbox mode:**
 * Commands run in a sandbox by default. The `dangerouslyDisableSandbox` option
 * bypasses this protection and should be blocked in most PreToolUse hooks.
 *
 * **Background execution:**
 * When `run_in_background` is true, the command runs asynchronously and
 * can be monitored via TaskOutput.
 *
 * @example
 * ```typescript
 * if (isBashToolInput(input.tool_input)) {
 *   const { command, dangerouslyDisableSandbox } = input.tool_input;
 *
 *   // Block sandbox bypass
 *   if (dangerouslyDisableSandbox) {
 *     return { status: "executed", action: "deny", summary: "sandbox bypass blocked" };
 *   }
 *
 *   // Block dangerous commands
 *   if (command.includes("rm -rf /")) {
 *     return { status: "executed", action: "deny", summary: "destructive command blocked" };
 *   }
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isBash} - Type guard for runtime validation
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/hooks#pretooluse | PreToolUse Hook Documentation}
 * @public
 */
export interface BashToolInput {
	/** The shell command to execute */
	command: string;
	/** Timeout in milliseconds (max 600000 / 10 minutes, default: 120000 / 2 minutes) */
	timeout?: number;
	/** Short description of what the command does (5-10 words) */
	description?: string;
	/** Run command in background, monitor via TaskOutput */
	run_in_background?: boolean;
	/** Bypass sandbox mode - DANGEROUS, should typically be blocked by hooks */
	dangerouslyDisableSandbox?: boolean;
}

/**
 * Input for the Task tool - spawns autonomous subagents.
 *
 * @remarks
 * The Task tool launches specialized agents to handle complex, multi-step tasks
 * autonomously. Each agent type has specific capabilities and tools available to it.
 *
 * Common agent types:
 * - `"general-purpose"` - Multi-step tasks, code search, research
 * - `"Explore"` - Fast codebase exploration with different thoroughness levels
 * - `"Plan"` - Architecture and implementation planning
 *
 * Agents can be resumed using the `resume` parameter to continue from a previous
 * execution, preserving their full context.
 *
 * @example
 * ```typescript
 * if (isTaskToolInput(input.tool_input)) {
 *   const { subagent_type, prompt, model } = input.tool_input;
 *   console.log(`Launching ${subagent_type} agent${model ? ` with ${model}` : ''}`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isTask} - Type guard for runtime validation
 * @public
 */
export interface TaskToolInput {
	/** Detailed task description for the agent to execute */
	prompt: string;
	/** Short description summarizing the task (3-5 words) */
	description: string;
	/** Type of specialized agent (e.g., "general-purpose", "Explore", "Plan") */
	subagent_type: string;
	/** Model to use: "sonnet" (default), "opus" (powerful), or "haiku" (fast/cheap) */
	model?: "sonnet" | "opus" | "haiku";
	/** Agent ID from previous invocation to resume with preserved context */
	resume?: string;
}

// =============================================================================
// WEB TOOLS
// =============================================================================

/**
 * Input for the WebFetch tool - fetches and processes web content.
 *
 * @remarks
 * The WebFetch tool retrieves content from a URL and processes it using a
 * smaller, faster AI model. HTML is automatically converted to markdown.
 * Results may be summarized if the content is very large.
 *
 * Key behaviors:
 * - HTTP URLs are automatically upgraded to HTTPS
 * - Includes a 15-minute cache for faster repeated access
 * - For redirects to different hosts, returns the redirect URL
 *
 * Security considerations for PreToolUse hooks:
 * - Consider domain allowlists/blocklists
 * - Watch for SSRF (Server-Side Request Forgery) patterns
 * - Monitor for credential exfiltration via URL parameters
 *
 * @example
 * ```typescript
 * if (isWebFetchToolInput(input.tool_input)) {
 *   const { url, prompt } = input.tool_input;
 *   const domain = new URL(url).hostname;
 *   console.log(`Fetching ${domain}: "${prompt}"`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isWebFetch} - Type guard for runtime validation
 * @see {@link WebSearchToolInput} - For web search queries
 * @public
 */
export interface WebFetchToolInput {
	/** Fully-formed URL to fetch content from (HTTPS preferred) */
	url: string;
	/** Prompt describing what information to extract from the page */
	prompt: string;
}

/**
 * Input for the WebSearch tool - searches the web for current information.
 *
 * @remarks
 * The WebSearch tool performs web searches and returns results with source links.
 * Use for accessing information beyond the model's knowledge cutoff, such as
 * current events, recent API documentation, or package versions.
 *
 * Domain filtering:
 * - `allowed_domains` - Only return results from specified domains
 * - `blocked_domains` - Exclude results from specified domains
 *
 * After answering, responses should include a "Sources:" section with
 * markdown hyperlinks to the search results.
 *
 * @example
 * ```typescript
 * if (isWebSearchToolInput(input.tool_input)) {
 *   const { query, allowed_domains, blocked_domains } = input.tool_input;
 *   console.log(`Searching: "${query}"`);
 *   if (allowed_domains?.length) console.log(`  Allowed: ${allowed_domains.join(', ')}`);
 * }
 * ```
 *
 * @see {@link ToolInputGuard.isWebSearch} - Type guard for runtime validation
 * @see {@link WebFetchToolInput} - For fetching specific URLs
 * @public
 */
export interface WebSearchToolInput {
	/** Search query string (minimum 2 characters) */
	query: string;
	/** Only include results from these domains (e.g., ["docs.anthropic.com"]) */
	allowed_domains?: string[];
	/** Never include results from these domains */
	blocked_domains?: string[];
}

// =============================================================================
// TODO TOOLS
// =============================================================================

/**
 * Todo item structure for the {@link TodoWriteToolInput}.
 *
 * @remarks
 * Each todo item has two forms of its description:
 * - `content` - Imperative form: "Run tests", "Build the project"
 * - `activeForm` - Present continuous: "Running tests", "Building the project"
 *
 * Task states:
 * - `"pending"` - Not yet started
 * - `"in_progress"` - Currently being worked on (limit to ONE at a time)
 * - `"completed"` - Task finished successfully
 *
 * @example
 * ```typescript
 * const item: TodoItem = {
 *   content: "Fix lint errors",
 *   activeForm: "Fixing lint errors",
 *   status: "in_progress"
 * };
 * ```
 *
 * @see {@link TodoWriteToolInput} - The containing tool input type
 * @public
 */
export interface TodoItem {
	/** Task description in imperative form (e.g., "Run tests") */
	content: string;
	/** Task status: "pending", "in_progress", or "completed" */
	status: "pending" | "in_progress" | "completed";
	/** Task description in present continuous form (e.g., "Running tests") */
	activeForm: string;
}

/**
 * Input for the TodoWrite tool - manages structured task lists.
 *
 * @remarks
 * The TodoWrite tool helps track progress on multi-step tasks. It provides
 * visibility to users about what Claude is working on and helps organize
 * complex tasks into manageable steps.
 *
 * Best practices:
 * - Use for tasks with 3+ steps
 * - Mark tasks complete immediately after finishing
 * - Keep exactly ONE task in_progress at a time
 * - Break complex tasks into smaller, actionable items
 *
 * @example
 * ```typescript
 * if (isTodoWriteToolInput(input.tool_input)) {
 *   const { todos } = input.tool_input;
 *   const inProgress = todos.filter(t => t.status === 'in_progress');
 *   const completed = todos.filter(t => t.status === 'completed');
 *   console.log(`Progress: ${completed.length}/${todos.length} tasks`);
 * }
 * ```
 *
 * @see {@link TodoItem} - Structure of individual todo items
 * @see {@link ToolInputGuard.isTodoWrite} - Type guard for runtime validation
 * @public
 */
export interface TodoWriteToolInput {
	/** The complete todo list (replaces previous list) */
	todos: TodoItem[];
}

// =============================================================================
// TOOL INPUT MAP
// =============================================================================

/**
 * Maps Claude Code tool names to their strongly-typed input interfaces.
 *
 * @remarks
 * This interface enables type-safe access to tool inputs when combined with
 * discriminated unions. Use `ToolInputGuard.getTyped()` for a convenient helper
 * that combines the tool name check and type guard in one call.
 *
 * @example
 * ```typescript
 * // Manual discriminated union
 * function handleTool(name: TypedToolName, input: ToolInputMap[typeof name]) {
 *   if (name === "Bash") {
 *     // input is BashToolInput
 *     console.log(input.command);
 *   }
 * }
 *
 * // Using ToolInputGuard.getTyped helper
 * const bashInput = ToolInputGuard.getTyped("Bash", rawInput);
 * if (bashInput) {
 *   console.log(bashInput.command); // Type-safe access
 * }
 * ```
 *
 * @see {@link TypedToolName} - Union of known tool names
 * @see {@link ToolInputGuard} - Use `ToolInputGuard.getTyped()` for type-safe access
 * @public
 */
export interface ToolInputMap {
	/** File creation/overwrite tool */
	Write: WriteToolInput;
	/** String replacement editing tool */
	Edit: EditToolInput;
	/** File reading tool */
	Read: ReadToolInput;
	/** Jupyter notebook cell editing tool */
	NotebookEdit: NotebookEditToolInput;
	/** File pattern matching tool */
	Glob: GlobToolInput;
	/** Content search tool (ripgrep) */
	Grep: GrepToolInput;
	/** Shell command execution tool */
	Bash: BashToolInput;
	/** Autonomous subagent spawning tool */
	Task: TaskToolInput;
	/** Web page fetching and processing tool */
	WebFetch: WebFetchToolInput;
	/** Web search tool */
	WebSearch: WebSearchToolInput;
	/** Task list management tool */
	TodoWrite: TodoWriteToolInput;
}

/**
 * Union of known tool names that have typed input interfaces.
 *
 * @remarks
 * Use this type to constrain function parameters to only accept valid tool names
 * from the {@link ToolInputMap}.
 *
 * @example
 * ```typescript
 * function logToolUse(toolName: TypedToolName) {
 *   console.log(`Using tool: ${toolName}`);
 * }
 *
 * logToolUse("Bash");  // OK
 * logToolUse("Unknown");  // Type error
 * ```
 *
 * @see {@link ToolInputMap} - Maps these names to input types
 * @public
 */
export type TypedToolName = keyof ToolInputMap;

// =============================================================================
// TOOL INPUT TYPE GUARDS
// =============================================================================

/**
 * Class providing type guards and utilities for Claude Code tool inputs.
 *
 * @remarks
 * The `ToolInputGuard` class consolidates all tool input type guards and helpers
 * into a single, discoverable API. All methods are static - access them via
 * `ToolInputGuard.methodName()`.
 *
 * **Type Guard Methods:**
 * - `ToolInputGuard.isWrite(input)` - Check for {@link WriteToolInput}
 * - `ToolInputGuard.isEdit(input)` - Check for {@link EditToolInput}
 * - `ToolInputGuard.isRead(input)` - Check for {@link ReadToolInput}
 * - `ToolInputGuard.isBash(input)` - Check for {@link BashToolInput}
 * - `ToolInputGuard.isGlob(input)` - Check for {@link GlobToolInput}
 * - `ToolInputGuard.isGrep(input)` - Check for {@link GrepToolInput}
 * - `ToolInputGuard.isTask(input)` - Check for {@link TaskToolInput}
 * - `ToolInputGuard.isWebFetch(input)` - Check for {@link WebFetchToolInput}
 * - `ToolInputGuard.isWebSearch(input)` - Check for {@link WebSearchToolInput}
 * - `ToolInputGuard.isNotebookEdit(input)` - Check for {@link NotebookEditToolInput}
 * - `ToolInputGuard.isTodoWrite(input)` - Check for {@link TodoWriteToolInput}
 *
 * **Generic Methods:**
 * - `ToolInputGuard.is(toolName, input)` - Check for any tool by name
 * - `ToolInputGuard.getTyped(toolName, input)` - Get typed input or undefined
 *
 * @example
 * ```typescript
 * import { ToolInputGuard } from "claude-binary-plugin";
 *
 * // Type guard for specific tool
 * if (ToolInputGuard.isBash(input.tool_input)) {
 *   const { command } = input.tool_input;
 *   if (command.includes("rm -rf")) {
 *     return { status: "executed", action: "deny", summary: "blocked" };
 *   }
 * }
 *
 * // Generic check by tool name
 * if (ToolInputGuard.is("Write", input.tool_input)) {
 *   console.log(input.tool_input.file_path);
 * }
 *
 * // Get typed input or undefined
 * const bashInput = ToolInputGuard.getTyped("Bash", input.tool_input);
 * if (bashInput) {
 *   console.log(bashInput.command);
 * }
 * ```
 *
 * @see {@link ToolInputMap} - Maps tool names to input types
 * @see {@link TypedToolName} - Valid tool names
 * @public
 */
export class ToolInputGuard {
	private constructor() {}

	/**
	 * Check if input is a valid {@link WriteToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid WriteToolInput
	 */
	static isWrite(input: unknown): input is WriteToolInput {
		return (
			typeof input === "object" &&
			input !== null &&
			typeof (input as WriteToolInput).file_path === "string" &&
			typeof (input as WriteToolInput).content === "string"
		);
	}

	/**
	 * Check if input is a valid {@link EditToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid EditToolInput
	 */
	static isEdit(input: unknown): input is EditToolInput {
		return (
			typeof input === "object" &&
			input !== null &&
			typeof (input as EditToolInput).file_path === "string" &&
			typeof (input as EditToolInput).old_string === "string" &&
			typeof (input as EditToolInput).new_string === "string"
		);
	}

	/**
	 * Check if input is a valid {@link ReadToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid ReadToolInput
	 */
	static isRead(input: unknown): input is ReadToolInput {
		return typeof input === "object" && input !== null && typeof (input as ReadToolInput).file_path === "string";
	}

	/**
	 * Check if input is a valid {@link BashToolInput}.
	 *
	 * @remarks
	 * This is one of the most security-critical type guards - use it in
	 * PreToolUse hooks to safely access command details for validation.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid BashToolInput
	 */
	static isBash(input: unknown): input is BashToolInput {
		return typeof input === "object" && input !== null && typeof (input as BashToolInput).command === "string";
	}

	/**
	 * Check if input is a valid {@link GlobToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid GlobToolInput
	 */
	static isGlob(input: unknown): input is GlobToolInput {
		return typeof input === "object" && input !== null && typeof (input as GlobToolInput).pattern === "string";
	}

	/**
	 * Check if input is a valid {@link GrepToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid GrepToolInput
	 */
	static isGrep(input: unknown): input is GrepToolInput {
		return typeof input === "object" && input !== null && typeof (input as GrepToolInput).pattern === "string";
	}

	/**
	 * Check if input is a valid {@link TaskToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid TaskToolInput
	 */
	static isTask(input: unknown): input is TaskToolInput {
		return (
			typeof input === "object" &&
			input !== null &&
			typeof (input as TaskToolInput).prompt === "string" &&
			typeof (input as TaskToolInput).description === "string" &&
			typeof (input as TaskToolInput).subagent_type === "string"
		);
	}

	/**
	 * Check if input is a valid {@link WebFetchToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid WebFetchToolInput
	 */
	static isWebFetch(input: unknown): input is WebFetchToolInput {
		return (
			typeof input === "object" &&
			input !== null &&
			typeof (input as WebFetchToolInput).url === "string" &&
			typeof (input as WebFetchToolInput).prompt === "string"
		);
	}

	/**
	 * Check if input is a valid {@link WebSearchToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid WebSearchToolInput
	 */
	static isWebSearch(input: unknown): input is WebSearchToolInput {
		return typeof input === "object" && input !== null && typeof (input as WebSearchToolInput).query === "string";
	}

	/**
	 * Check if input is a valid {@link NotebookEditToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid NotebookEditToolInput
	 */
	static isNotebookEdit(input: unknown): input is NotebookEditToolInput {
		return (
			typeof input === "object" &&
			input !== null &&
			typeof (input as NotebookEditToolInput).notebook_path === "string" &&
			typeof (input as NotebookEditToolInput).new_source === "string"
		);
	}

	/**
	 * Check if input is a valid {@link TodoWriteToolInput}.
	 *
	 * @param input - Unknown value to check
	 * @returns `true` if the input is a valid TodoWriteToolInput
	 */
	static isTodoWrite(input: unknown): input is TodoWriteToolInput {
		return typeof input === "object" && input !== null && Array.isArray((input as TodoWriteToolInput).todos);
	}

	/**
	 * Generic type guard for any tool input by name.
	 *
	 * @remarks
	 * Use this method when the tool name is dynamic or when you want to
	 * write generic code that handles multiple tools.
	 *
	 * @typeParam T - The tool name, constrained to {@link TypedToolName}
	 * @param toolName - Name of the tool to validate against
	 * @param input - Unknown input value to validate
	 * @returns `true` if the input matches the expected tool structure
	 *
	 * @example
	 * ```typescript
	 * if (ToolInputGuard.is("Bash", input.tool_input)) {
	 *   // input.tool_input is BashToolInput
	 *   console.log(input.tool_input.command);
	 * }
	 * ```
	 */
	static is<T extends TypedToolName>(toolName: T, input: unknown): input is ToolInputMap[T] {
		const guards: Record<TypedToolName, (input: unknown) => boolean> = {
			Write: ToolInputGuard.isWrite,
			Edit: ToolInputGuard.isEdit,
			Read: ToolInputGuard.isRead,
			NotebookEdit: ToolInputGuard.isNotebookEdit,
			Glob: ToolInputGuard.isGlob,
			Grep: ToolInputGuard.isGrep,
			Bash: ToolInputGuard.isBash,
			Task: ToolInputGuard.isTask,
			WebFetch: ToolInputGuard.isWebFetch,
			WebSearch: ToolInputGuard.isWebSearch,
			TodoWrite: ToolInputGuard.isTodoWrite,
		};
		return guards[toolName](input);
	}

	/**
	 * Get typed tool input or undefined.
	 *
	 * @remarks
	 * This method combines tool name lookup with type guard validation in a
	 * single call. It returns the typed input if validation passes, or `undefined`
	 * if the input doesn't match the expected structure for the specified tool.
	 *
	 * This is the recommended pattern for accessing tool inputs in handlers when
	 * you want to avoid manual type guard calls.
	 *
	 * @typeParam T - The tool name, constrained to {@link TypedToolName}
	 * @param toolName - Name of the tool to validate against
	 * @param input - Unknown input value to validate and type
	 * @returns The typed tool input if valid, otherwise `undefined`
	 *
	 * @example
	 * ```typescript
	 * // In a PreToolUse handler
	 * const bashInput = ToolInputGuard.getTyped("Bash", event.tool_input);
	 * if (bashInput) {
	 *   // bashInput is BashToolInput - fully typed
	 *   if (bashInput.command.includes("rm -rf")) {
	 *     return { status: "executed", action: "deny", summary: "blocked" };
	 *   }
	 * }
	 *
	 * // Check multiple tools
	 * const writeInput = ToolInputGuard.getTyped("Write", event.tool_input);
	 * const editInput = ToolInputGuard.getTyped("Edit", event.tool_input);
	 * const filePath = writeInput?.file_path ?? editInput?.file_path;
	 * ```
	 */
	static getTyped<T extends TypedToolName>(toolName: T, input: unknown): ToolInputMap[T] | undefined {
		return ToolInputGuard.is(toolName, input) ? input : undefined;
	}
}
