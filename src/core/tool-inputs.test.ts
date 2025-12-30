import { describe, expect, test } from "bun:test";

import { ToolInputGuard } from "./tool-inputs.js";

describe("ToolInputGuard.isWrite", () => {
	test("returns true for valid WriteToolInput", () => {
		const input = { file_path: "/path/to/file.ts", content: "const x = 1;" };
		expect(ToolInputGuard.isWrite(input)).toBe(true);
	});

	test("returns false when file_path is missing", () => {
		const input = { content: "const x = 1;" };
		expect(ToolInputGuard.isWrite(input)).toBe(false);
	});

	test("returns false when content is missing", () => {
		const input = { file_path: "/path/to/file.ts" };
		expect(ToolInputGuard.isWrite(input)).toBe(false);
	});

	test("returns false for null", () => {
		expect(ToolInputGuard.isWrite(null)).toBe(false);
	});

	test("returns false for non-object", () => {
		expect(ToolInputGuard.isWrite("string")).toBe(false);
		expect(ToolInputGuard.isWrite(123)).toBe(false);
	});
});

describe("ToolInputGuard.isEdit", () => {
	test("returns true for valid EditToolInput", () => {
		const input = {
			file_path: "/path/to/file.ts",
			old_string: "const x = 1;",
			new_string: "const y = 2;",
		};
		expect(ToolInputGuard.isEdit(input)).toBe(true);
	});

	test("returns true with optional replace_all", () => {
		const input = {
			file_path: "/path/to/file.ts",
			old_string: "foo",
			new_string: "bar",
			replace_all: true,
		};
		expect(ToolInputGuard.isEdit(input)).toBe(true);
	});

	test("returns false when old_string is missing", () => {
		const input = { file_path: "/path/to/file.ts", new_string: "const y = 2;" };
		expect(ToolInputGuard.isEdit(input)).toBe(false);
	});

	test("returns false when new_string is missing", () => {
		const input = { file_path: "/path/to/file.ts", old_string: "const x = 1;" };
		expect(ToolInputGuard.isEdit(input)).toBe(false);
	});
});

describe("ToolInputGuard.isRead", () => {
	test("returns true for valid ReadToolInput", () => {
		const input = { file_path: "/path/to/file.ts" };
		expect(ToolInputGuard.isRead(input)).toBe(true);
	});

	test("returns true with optional offset and limit", () => {
		const input = { file_path: "/path/to/file.ts", offset: 10, limit: 100 };
		expect(ToolInputGuard.isRead(input)).toBe(true);
	});

	test("returns false when file_path is missing", () => {
		const input = { offset: 10 };
		expect(ToolInputGuard.isRead(input)).toBe(false);
	});
});

describe("ToolInputGuard.isBash", () => {
	test("returns true for valid BashToolInput", () => {
		const input = { command: "ls -la" };
		expect(ToolInputGuard.isBash(input)).toBe(true);
	});

	test("returns true with optional fields", () => {
		const input = {
			command: "npm test",
			timeout: 60000,
			description: "Run tests",
			run_in_background: true,
		};
		expect(ToolInputGuard.isBash(input)).toBe(true);
	});

	test("returns false when command is missing", () => {
		const input = { timeout: 60000 };
		expect(ToolInputGuard.isBash(input)).toBe(false);
	});
});

describe("ToolInputGuard.isGlob", () => {
	test("returns true for valid GlobToolInput", () => {
		const input = { pattern: "**/*.ts" };
		expect(ToolInputGuard.isGlob(input)).toBe(true);
	});

	test("returns true with optional path", () => {
		const input = { pattern: "*.md", path: "/docs" };
		expect(ToolInputGuard.isGlob(input)).toBe(true);
	});

	test("returns false when pattern is missing", () => {
		const input = { path: "/src" };
		expect(ToolInputGuard.isGlob(input)).toBe(false);
	});
});

describe("ToolInputGuard.isGrep", () => {
	test("returns true for valid GrepToolInput", () => {
		const input = { pattern: "TODO" };
		expect(ToolInputGuard.isGrep(input)).toBe(true);
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
		expect(ToolInputGuard.isGrep(input)).toBe(true);
	});
});

describe("ToolInputGuard.isTask", () => {
	test("returns true for valid TaskToolInput", () => {
		const input = {
			prompt: "Search for authentication code",
			description: "Find auth code",
			subagent_type: "Explore",
		};
		expect(ToolInputGuard.isTask(input)).toBe(true);
	});

	test("returns true with optional model", () => {
		const input = {
			prompt: "Complex analysis",
			description: "Analyze code",
			subagent_type: "general-purpose",
			model: "opus" as const,
		};
		expect(ToolInputGuard.isTask(input)).toBe(true);
	});

	test("returns false when subagent_type is missing", () => {
		const input = { prompt: "Do something", description: "Task" };
		expect(ToolInputGuard.isTask(input)).toBe(false);
	});
});

describe("ToolInputGuard.isWebFetch", () => {
	test("returns true for valid WebFetchToolInput", () => {
		const input = {
			url: "<https://example.com>",
			prompt: "Extract the main content",
		};
		expect(ToolInputGuard.isWebFetch(input)).toBe(true);
	});

	test("returns false when prompt is missing", () => {
		const input = { url: "https://example.com" };
		expect(ToolInputGuard.isWebFetch(input)).toBe(false);
	});
});

describe("ToolInputGuard.isWebSearch", () => {
	test("returns true for valid WebSearchToolInput", () => {
		const input = { query: "TypeScript branded types" };
		expect(ToolInputGuard.isWebSearch(input)).toBe(true);
	});

	test("returns true with optional domain filters", () => {
		const input = {
			query: "React hooks",
			allowed_domains: ["reactjs.org"],
			blocked_domains: ["w3schools.com"],
		};
		expect(ToolInputGuard.isWebSearch(input)).toBe(true);
	});
});

describe("ToolInputGuard.isNotebookEdit", () => {
	test("returns true for valid NotebookEditToolInput", () => {
		const input = {
			notebook_path: "/path/to/notebook.ipynb",
			new_source: "print('hello')",
		};
		expect(ToolInputGuard.isNotebookEdit(input)).toBe(true);
	});

	test("returns true with optional fields", () => {
		const input = {
			notebook_path: "/path/to/notebook.ipynb",
			new_source: "# Markdown cell",
			cell_id: "abc123",
			cell_type: "markdown" as const,
			edit_mode: "replace" as const,
		};
		expect(ToolInputGuard.isNotebookEdit(input)).toBe(true);
	});
});

describe("ToolInputGuard.isTodoWrite", () => {
	test("returns true for valid TodoWriteToolInput", () => {
		const input = {
			todos: [{ content: "Task 1", status: "pending", activeForm: "Working on task 1" }],
		};
		expect(ToolInputGuard.isTodoWrite(input)).toBe(true);
	});

	test("returns true for empty todos array", () => {
		const input = { todos: [] };
		expect(ToolInputGuard.isTodoWrite(input)).toBe(true);
	});

	test("returns false when todos is not an array", () => {
		const input = { todos: "not an array" };
		expect(ToolInputGuard.isTodoWrite(input)).toBe(false);
	});
});

describe("ToolInputGuard.is", () => {
	test("returns true for matching tool type", () => {
		const input = { file_path: "/path/to/file.ts", content: "const x = 1;" };
		expect(ToolInputGuard.is("Write", input)).toBe(true);
	});

	test("returns false for non-matching tool type", () => {
		const input = { file_path: "/path/to/file.ts" }; // missing content
		expect(ToolInputGuard.is("Write", input)).toBe(false);
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
			expect(ToolInputGuard.is(tool, input)).toBe(true);
		}
	});
});

describe("ToolInputGuard.getTyped", () => {
	test("returns typed input for valid Write tool input", () => {
		const input = { file_path: "/path/to/file.ts", content: "const x = 1;" };
		const result = ToolInputGuard.getTyped("Write", input);

		expect(result).toBeDefined();
		expect(result?.file_path).toBe("/path/to/file.ts");
		expect(result?.content).toBe("const x = 1;");
	});

	test("returns undefined for invalid Write tool input", () => {
		const input = { file_path: "/path/to/file.ts" }; // missing content
		const result = ToolInputGuard.getTyped("Write", input);

		expect(result).toBeUndefined();
	});

	test("returns typed input for valid Bash tool input", () => {
		const input = { command: "ls -la", timeout: 5000 };
		const result = ToolInputGuard.getTyped("Bash", input);

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
			const result = ToolInputGuard.getTyped(tool, input);
			expect(result).toBeDefined();
		}
	});
});
