import { describe, expect, test } from "bun:test";

import {
	getTypedToolInput,
	isBashToolInput,
	isEditToolInput,
	isGlobToolInput,
	isGrepToolInput,
	isNotebookEditToolInput,
	isReadToolInput,
	isTaskToolInput,
	isTodoWriteToolInput,
	isWebFetchToolInput,
	isWebSearchToolInput,
	isWriteToolInput,
} from "./tool-inputs.js";

describe("isWriteToolInput", () => {
	test("returns true for valid WriteToolInput", () => {
		const input = { file_path: "/path/to/file.ts", content: "const x = 1;" };
		expect(isWriteToolInput(input)).toBe(true);
	});

	test("returns false when file_path is missing", () => {
		const input = { content: "const x = 1;" };
		expect(isWriteToolInput(input)).toBe(false);
	});

	test("returns false when content is missing", () => {
		const input = { file_path: "/path/to/file.ts" };
		expect(isWriteToolInput(input)).toBe(false);
	});

	test("returns false for null", () => {
		expect(isWriteToolInput(null)).toBe(false);
	});

	test("returns false for non-object", () => {
		expect(isWriteToolInput("string")).toBe(false);
		expect(isWriteToolInput(123)).toBe(false);
	});
});

describe("isEditToolInput", () => {
	test("returns true for valid EditToolInput", () => {
		const input = {
			file_path: "/path/to/file.ts",
			old_string: "const x = 1;",
			new_string: "const y = 2;",
		};
		expect(isEditToolInput(input)).toBe(true);
	});

	test("returns true with optional replace_all", () => {
		const input = {
			file_path: "/path/to/file.ts",
			old_string: "foo",
			new_string: "bar",
			replace_all: true,
		};
		expect(isEditToolInput(input)).toBe(true);
	});

	test("returns false when old_string is missing", () => {
		const input = { file_path: "/path/to/file.ts", new_string: "const y = 2;" };
		expect(isEditToolInput(input)).toBe(false);
	});

	test("returns false when new_string is missing", () => {
		const input = { file_path: "/path/to/file.ts", old_string: "const x = 1;" };
		expect(isEditToolInput(input)).toBe(false);
	});
});

describe("isReadToolInput", () => {
	test("returns true for valid ReadToolInput", () => {
		const input = { file_path: "/path/to/file.ts" };
		expect(isReadToolInput(input)).toBe(true);
	});

	test("returns true with optional offset and limit", () => {
		const input = { file_path: "/path/to/file.ts", offset: 10, limit: 100 };
		expect(isReadToolInput(input)).toBe(true);
	});

	test("returns false when file_path is missing", () => {
		const input = { offset: 10 };
		expect(isReadToolInput(input)).toBe(false);
	});
});

describe("isBashToolInput", () => {
	test("returns true for valid BashToolInput", () => {
		const input = { command: "ls -la" };
		expect(isBashToolInput(input)).toBe(true);
	});

	test("returns true with optional fields", () => {
		const input = {
			command: "npm test",
			timeout: 60000,
			description: "Run tests",
			run_in_background: true,
		};
		expect(isBashToolInput(input)).toBe(true);
	});

	test("returns false when command is missing", () => {
		const input = { timeout: 60000 };
		expect(isBashToolInput(input)).toBe(false);
	});
});

describe("isGlobToolInput", () => {
	test("returns true for valid GlobToolInput", () => {
		const input = { pattern: "**/*.ts" };
		expect(isGlobToolInput(input)).toBe(true);
	});

	test("returns true with optional path", () => {
		const input = { pattern: "*.md", path: "/docs" };
		expect(isGlobToolInput(input)).toBe(true);
	});

	test("returns false when pattern is missing", () => {
		const input = { path: "/src" };
		expect(isGlobToolInput(input)).toBe(false);
	});
});

describe("isGrepToolInput", () => {
	test("returns true for valid GrepToolInput", () => {
		const input = { pattern: "TODO" };
		expect(isGrepToolInput(input)).toBe(true);
	});

	test("returns true with all optional fields", () => {
		const input = {
			pattern: "function\\s+\\w+",
			path: "/src",
			glob: "*.ts",
			output_mode: "content" as const,
			"-i": true,
			"-C": 3,
		};
		expect(isGrepToolInput(input)).toBe(true);
	});
});

describe("isTaskToolInput", () => {
	test("returns true for valid TaskToolInput", () => {
		const input = {
			prompt: "Search for authentication code",
			description: "Find auth code",
			subagent_type: "Explore",
		};
		expect(isTaskToolInput(input)).toBe(true);
	});

	test("returns true with optional model", () => {
		const input = {
			prompt: "Complex analysis",
			description: "Analyze code",
			subagent_type: "general-purpose",
			model: "opus" as const,
		};
		expect(isTaskToolInput(input)).toBe(true);
	});

	test("returns false when subagent_type is missing", () => {
		const input = { prompt: "Do something", description: "Task" };
		expect(isTaskToolInput(input)).toBe(false);
	});
});

describe("isWebFetchToolInput", () => {
	test("returns true for valid WebFetchToolInput", () => {
		const input = {
			url: "<https://example.com>",
			prompt: "Extract the main content",
		};
		expect(isWebFetchToolInput(input)).toBe(true);
	});

	test("returns false when prompt is missing", () => {
		const input = { url: "https://example.com" };
		expect(isWebFetchToolInput(input)).toBe(false);
	});
});

describe("isWebSearchToolInput", () => {
	test("returns true for valid WebSearchToolInput", () => {
		const input = { query: "TypeScript branded types" };
		expect(isWebSearchToolInput(input)).toBe(true);
	});

	test("returns true with optional domain filters", () => {
		const input = {
			query: "React hooks",
			allowed_domains: ["reactjs.org"],
			blocked_domains: ["w3schools.com"],
		};
		expect(isWebSearchToolInput(input)).toBe(true);
	});
});

describe("isNotebookEditToolInput", () => {
	test("returns true for valid NotebookEditToolInput", () => {
		const input = {
			notebook_path: "/path/to/notebook.ipynb",
			new_source: "print('hello')",
		};
		expect(isNotebookEditToolInput(input)).toBe(true);
	});

	test("returns true with optional fields", () => {
		const input = {
			notebook_path: "/path/to/notebook.ipynb",
			new_source: "# Markdown cell",
			cell_id: "abc123",
			cell_type: "markdown" as const,
			edit_mode: "replace" as const,
		};
		expect(isNotebookEditToolInput(input)).toBe(true);
	});
});

describe("isTodoWriteToolInput", () => {
	test("returns true for valid TodoWriteToolInput", () => {
		const input = {
			todos: [{ content: "Task 1", status: "pending", activeForm: "Working on task 1" }],
		};
		expect(isTodoWriteToolInput(input)).toBe(true);
	});

	test("returns true for empty todos array", () => {
		const input = { todos: [] };
		expect(isTodoWriteToolInput(input)).toBe(true);
	});

	test("returns false when todos is not an array", () => {
		const input = { todos: "not an array" };
		expect(isTodoWriteToolInput(input)).toBe(false);
	});
});

describe("getTypedToolInput", () => {
	test("returns typed input for valid Write tool input", () => {
		const input = { file_path: "/path/to/file.ts", content: "const x = 1;" };
		const result = getTypedToolInput("Write", input);

		expect(result).toBeDefined();
		expect(result?.file_path).toBe("/path/to/file.ts");
		expect(result?.content).toBe("const x = 1;");
	});

	test("returns undefined for invalid Write tool input", () => {
		const input = { file_path: "/path/to/file.ts" }; // missing content
		const result = getTypedToolInput("Write", input);

		expect(result).toBeUndefined();
	});

	test("returns typed input for valid Bash tool input", () => {
		const input = { command: "ls -la", timeout: 5000 };
		const result = getTypedToolInput("Bash", input);

		expect(result).toBeDefined();
		expect(result?.command).toBe("ls -la");
		expect(result?.timeout).toBe(5000);
	});

	test("works with all supported tool types", () => {
		const testCases = [
			{ tool: "Write" as const, input: { file_path: "/a", content: "b" } },
			{ tool: "Edit" as const, input: { file_path: "/a", old_string: "b", new_string: "c" } },
			{ tool: "Read" as const, input: { file_path: "/a" } },
			{ tool: "Bash" as const, input: { command: "ls" } },
			{ tool: "Glob" as const, input: { pattern: "*.ts" } },
			{ tool: "Grep" as const, input: { pattern: "TODO" } },
			{ tool: "Task" as const, input: { prompt: "a", description: "b", subagent_type: "c" } },
			{ tool: "WebFetch" as const, input: { url: "http://x", prompt: "y" } },
			{ tool: "WebSearch" as const, input: { query: "test" } },
			{ tool: "NotebookEdit" as const, input: { notebook_path: "/a.ipynb", new_source: "x" } },
			{ tool: "TodoWrite" as const, input: { todos: [] } },
		];

		for (const { tool, input } of testCases) {
			const result = getTypedToolInput(tool, input);
			expect(result).toBeDefined();
		}
	});
});
