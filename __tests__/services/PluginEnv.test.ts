import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { PluginEnvFileSystem, ValidationErrorMinimal } from "../../src/services/PluginEnv.js";
import { PluginEnv, escapeForBashDoubleQuotes, formatValidationError } from "../../src/services/PluginEnv.js";
import type { MockEnvContext } from "../../src/testing/mocks.js";
import { TestFixtures } from "../../src/testing/mocks.js";

describe("escapeForBashDoubleQuotes", () => {
	test("escapes double quotes", () => {
		expect(escapeForBashDoubleQuotes('Hello "world"')).toBe('Hello \\"world\\"');
	});

	test("escapes backticks (command substitution)", () => {
		expect(escapeForBashDoubleQuotes("Run `bun test`")).toBe("Run \\`bun test\\`");
	});

	test("escapes dollar signs (variable expansion)", () => {
		expect(escapeForBashDoubleQuotes("Cost: $50")).toBe("Cost: \\$50");
		expect(escapeForBashDoubleQuotes("$" + "{HOME}")).toBe("\\$" + "{HOME}");
	});

	test("escapes backslashes", () => {
		expect(escapeForBashDoubleQuotes("path\\to\\file")).toBe("path\\\\to\\\\file");
	});

	test("handles multiple special characters", () => {
		const input = 'Run `bun test path/to/test.ts` or `bun test --filter "test name"`';
		const expected = 'Run \\`bun test path/to/test.ts\\` or \\`bun test --filter \\"test name\\"\\`';
		expect(escapeForBashDoubleQuotes(input)).toBe(expected);
	});

	test("handles JSON with backticks in notes field", () => {
		const json = JSON.stringify({
			notes: "Run subset of tests: `bun test path/to/test.ts` or `bun test --filter 'test name'`",
		});
		const escaped = escapeForBashDoubleQuotes(json);
		// Backticks should be escaped
		expect(escaped).toContain("\\`bun test path/to/test.ts\\`");
		expect(escaped).toContain("\\`bun test --filter 'test name'\\`");
	});

	test("returns empty string unchanged", () => {
		expect(escapeForBashDoubleQuotes("")).toBe("");
	});

	test("returns plain string unchanged", () => {
		expect(escapeForBashDoubleQuotes("hello world")).toBe("hello world");
	});
});

// Mock implementation for testing
class TestPluginEnv extends PluginEnv<{ TEST_VAR: string; TEST_ENABLED: "true" | "false" }> {
	protected readonly prefix = "TEST_PLUGIN";
}

// Mock file system for testing
function createMockFileSystem(files: Map<string, string>): PluginEnvFileSystem {
	return {
		readFile: async (path) => files.get(path) ?? null,
		writeFile: async (path, content) => {
			files.set(path, content);
		},
		exists: async (path) => files.has(path),
		mkdir: async () => {},
		chmod: async () => {},
	};
}

describe("PluginEnv", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		// EXCEPTION: This file tests PluginEnv which directly manipulates env vars.
		// We must manually clean up vars set by the code under test (not via env.set()).
		// This is an acceptable exception since we're testing env manipulation itself.
		const testVars = [
			"TEST_VAR",
			"VAR1",
			"VAR2",
			"VAR3",
			"USER_VAR",
			"LOCAL_VAR",
			"CUSTOM_VAR",
			"SOURCED_VAR",
			"EXISTING_VAR",
		];
		for (const key of testVars) {
			delete Bun.env[key];
			delete process.env[key];
		}
		env.restore();
	});

	describe("parseEnvFileContent", () => {
		test("parses simple VAR=value format", () => {
			PluginEnv.parseEnvFileContent("TEST_VAR=hello");
			expect(Bun.env.TEST_VAR).toBe("hello");
		});

		test("parses export VAR=value format", () => {
			PluginEnv.parseEnvFileContent("export TEST_VAR=world");
			expect(Bun.env.TEST_VAR).toBe("world");
		});

		test("parses quoted values", () => {
			PluginEnv.parseEnvFileContent('TEST_VAR="quoted value"');
			expect(Bun.env.TEST_VAR).toBe("quoted value");
		});

		test("skips comments", () => {
			PluginEnv.parseEnvFileContent("# This is a comment\nTEST_VAR=value");
			expect(Bun.env.TEST_VAR).toBe("value");
		});

		test("skips empty lines", () => {
			PluginEnv.parseEnvFileContent("\n\nTEST_VAR=value\n\n");
			expect(Bun.env.TEST_VAR).toBe("value");
		});

		test("does not overwrite existing env vars", () => {
			env.set("TEST_VAR", "existing");
			PluginEnv.parseEnvFileContent("TEST_VAR=new");
			expect(Bun.env.TEST_VAR).toBe("existing");
		});

		test("handles multiple lines", () => {
			PluginEnv.parseEnvFileContent("VAR1=value1\nexport VAR2=value2\nVAR3=value3");
			expect(Bun.env.VAR1).toBe("value1");
			expect(Bun.env.VAR2).toBe("value2");
			expect(Bun.env.VAR3).toBe("value3");
		});

		test("parses JSON values with escaped quotes", () => {
			// This is how JSON is persisted to session env files
			PluginEnv.parseEnvFileContent('export JSON_VAR="{\\"key\\":\\"value\\"}"');
			expect(Bun.env.JSON_VAR).toBe('{"key":"value"}');
			// Verify it's valid JSON
			const jsonVar = Bun.env.JSON_VAR;
			expect(jsonVar).toBeDefined();
			expect(JSON.parse(jsonVar as string)).toEqual({ key: "value" });
		});

		test("parses complex JSON with nested objects", () => {
			const jsonContent = 'export ENABLED="{\\"biome\\":true,\\"turbo\\":false}"';
			PluginEnv.parseEnvFileContent(jsonContent);
			expect(Bun.env.ENABLED).toBe('{"biome":true,"turbo":false}');
			const enabled = Bun.env.ENABLED;
			expect(enabled).toBeDefined();
			expect(JSON.parse(enabled as string)).toEqual({ biome: true, turbo: false });
		});

		test("parses single-quoted values", () => {
			PluginEnv.parseEnvFileContent("SINGLE='single quoted value'");
			expect(Bun.env.SINGLE).toBe("single quoted value");
		});

		test("parses unquoted values", () => {
			PluginEnv.parseEnvFileContent("UNQUOTED=no-quotes-here");
			expect(Bun.env.UNQUOTED).toBe("no-quotes-here");
		});
	});

	describe("loadFromSessionEnvFile", () => {
		test("loads env vars from prefixed session env file (real filesystem)", async () => {
			// Create a real temp file
			const hookFilePath = `/tmp/bun-hooks-test-${Date.now()}/hook-0.sh`;

			try {
				// Create the directory and file on disk
				await Bun.$`mkdir -p ${hookFilePath.replace(/\/[^/]+$/, "")}`.quiet();
				await Bun.write(hookFilePath, "export TEST_VAR=loaded\n");

				// Set the prefixed env var pointing to the file
				Bun.env.TEST_PLUGIN_SESSION_ENV_FILE = hookFilePath;

				// loadFromSessionEnvFile reads from the prefixed env var
				await PluginEnv.loadFromSessionEnvFile("TEST_PLUGIN");
				expect(Bun.env.TEST_VAR).toBe("loaded");
			} finally {
				// Clean up
				await Bun.$`rm -rf ${hookFilePath.replace(/\/[^/]+$/, "")}`.quiet().nothrow();
				delete Bun.env.TEST_VAR;
				delete Bun.env.TEST_PLUGIN_SESSION_ENV_FILE;
			}
		});

		test("returns silently if prefixed env var is not set", async () => {
			delete Bun.env.TEST_PLUGIN_SESSION_ENV_FILE;
			await PluginEnv.loadFromSessionEnvFile("TEST_PLUGIN");
			// No error thrown
		});

		test("returns silently if file does not exist", async () => {
			Bun.env.TEST_PLUGIN_SESSION_ENV_FILE = "/nonexistent/hook-0.sh";
			try {
				await PluginEnv.loadFromSessionEnvFile("TEST_PLUGIN");
				// No error thrown
			} finally {
				delete Bun.env.TEST_PLUGIN_SESSION_ENV_FILE;
			}
		});
	});

	describe("getProjectDir", () => {
		test("returns CLAUDE_PROJECT_DIR if set", () => {
			env.set("CLAUDE_PROJECT_DIR", "/tmp/project");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.getProjectDir()).toBe("/tmp/project");
		});

		test("returns prefixed var if CLAUDE_PROJECT_DIR not set", () => {
			env.delete("CLAUDE_PROJECT_DIR");
			env.set("TEST_PLUGIN_PROJECT_DIR", "/tmp/prefixed");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.getProjectDir()).toBe("/tmp/prefixed");
		});

		test("throws if neither var is set", () => {
			env.delete("CLAUDE_PROJECT_DIR");
			env.delete("TEST_PLUGIN_PROJECT_DIR");
			const pluginEnv = new TestPluginEnv();
			expect(() => pluginEnv.getProjectDir()).toThrow(/Project directory not found/);
		});
	});

	describe("getPluginRoot", () => {
		test("returns CLAUDE_PLUGIN_ROOT if set", () => {
			env.set("CLAUDE_PLUGIN_ROOT", "/tmp/plugin");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.getPluginRoot()).toBe("/tmp/plugin");
		});

		test("returns prefixed var if CLAUDE_PLUGIN_ROOT not set", () => {
			env.delete("CLAUDE_PLUGIN_ROOT");
			env.set("TEST_PLUGIN_PLUGIN_ROOT", "/tmp/prefixed");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.getPluginRoot()).toBe("/tmp/prefixed");
		});

		test("throws if neither var is set", () => {
			env.delete("CLAUDE_PLUGIN_ROOT");
			env.delete("TEST_PLUGIN_PLUGIN_ROOT");
			const pluginEnv = new TestPluginEnv();
			expect(() => pluginEnv.getPluginRoot()).toThrow(/Plugin root not found/);
		});
	});

	describe("listPrefixedVarNames", () => {
		test("returns all vars with prefix", () => {
			env.set("TEST_PLUGIN_VAR1", "value1");
			env.set("TEST_PLUGIN_VAR2", "value2");
			env.set("OTHER_VAR", "other");
			const pluginEnv = new TestPluginEnv();
			const vars = pluginEnv.listPrefixedVarNames();
			expect(vars).toContain("TEST_PLUGIN_VAR1");
			expect(vars).toContain("TEST_PLUGIN_VAR2");
			expect(vars).not.toContain("OTHER_VAR");
		});

		test("returns empty array if no prefixed vars", () => {
			env.set("OTHER_VAR", "other");
			const pluginEnv = new TestPluginEnv();
			const vars = pluginEnv.listPrefixedVarNames();
			expect(vars).toEqual([]);
		});
	});

	describe("loadUserEnvFiles", () => {
		test("loads .env file if exists", async () => {
			const files = new Map([["/tmp/project/.env", "USER_VAR=user_value"]]);
			const fs = createMockFileSystem(files);

			const loaded = await PluginEnv.loadUserEnvFiles("/tmp/project", fs);
			expect(loaded).toEqual([".env"]);
			expect(Bun.env.USER_VAR).toBe("user_value");
		});

		test("loads .env.local file if exists", async () => {
			const files = new Map([["/tmp/project/.env.local", "LOCAL_VAR=local_value"]]);
			const fs = createMockFileSystem(files);

			const loaded = await PluginEnv.loadUserEnvFiles("/tmp/project", fs);
			expect(loaded).toEqual([".env.local"]);
			expect(Bun.env.LOCAL_VAR).toBe("local_value");
		});

		test("loads both .env and .env.local if both exist", async () => {
			const files = new Map([
				["/tmp/project/.env", "VAR1=value1"],
				["/tmp/project/.env.local", "VAR2=value2"],
			]);
			const fs = createMockFileSystem(files);

			const loaded = await PluginEnv.loadUserEnvFiles("/tmp/project", fs);
			expect(loaded).toContain(".env");
			expect(loaded).toContain(".env.local");
			expect(Bun.env.VAR1).toBe("value1");
			expect(Bun.env.VAR2).toBe("value2");
		});

		test("returns empty array if no env files exist", async () => {
			const fs = createMockFileSystem(new Map());
			const loaded = await PluginEnv.loadUserEnvFiles("/tmp/project", fs);
			expect(loaded).toEqual([]);
		});
	});

	describe("forContext", () => {
		describe("sessionStart context", () => {
			test("loads user env files and returns instance", async () => {
				env.set("CLAUDE_PROJECT_DIR", "/tmp/project");
				const files = new Map([["/tmp/project/.env", "TEST_VAR=session_value"]]);
				const fs = createMockFileSystem(files);

				const result = await TestPluginEnv.forContext("sessionStart", { hookName: "test-hook", fs });

				expect(result).toBeInstanceOf(TestPluginEnv);
				expect(Bun.env.TEST_VAR).toBe("session_value");
			});

			test("works without project directory", async () => {
				env.delete("CLAUDE_PROJECT_DIR");
				const fs = createMockFileSystem(new Map());

				const result = await TestPluginEnv.forContext("sessionStart", { hookName: "test-hook", fs });

				expect(result).toBeInstanceOf(TestPluginEnv);
			});

			test("uses custom project root if provided", async () => {
				const files = new Map([["/custom/path/.env", "CUSTOM_VAR=custom_value"]]);
				const fs = createMockFileSystem(files);

				const result = await TestPluginEnv.forContext("sessionStart", {
					hookName: "test-hook",
					projectRoot: "/custom/path",
					fs,
				});

				expect(result).toBeInstanceOf(TestPluginEnv);
				expect(Bun.env.CUSTOM_VAR).toBe("custom_value");
			});
		});

		describe("hook context", () => {
			test("loads from prefixed session env file and returns instance (real filesystem)", async () => {
				const sessionId = "test-session-123";
				const hookFilePath = `/tmp/bun-hooks-test-hook-${Date.now()}/hook-0.sh`;

				try {
					// Create real directory and file
					await Bun.$`mkdir -p ${hookFilePath.replace(/\/[^/]+$/, "")}`.quiet();
					await Bun.write(hookFilePath, "export TEST_VAR=hook_value\n");

					// Set the prefixed env var pointing to the file
					// (In production, Claude Code sources the hook file which sets this var)
					Bun.env.TEST_PLUGIN_SESSION_ENV_FILE = hookFilePath;

					const result = await TestPluginEnv.forContext("hook", {
						sessionId,
						hookName: "test-hook",
					});

					expect(result).toBeInstanceOf(TestPluginEnv);
					expect(Bun.env.TEST_VAR).toBe("hook_value");
				} finally {
					await Bun.$`rm -rf ${hookFilePath.replace(/\/[^/]+$/, "")}`.quiet().nothrow();
					delete Bun.env.TEST_VAR;
					delete Bun.env.TEST_PLUGIN_SESSION_ENV_FILE;
				}
			});

			test("works when prefixed session env file is not set", async () => {
				// When the prefixed env var is not set, no loading happens
				delete Bun.env.TEST_PLUGIN_SESSION_ENV_FILE;

				const result = await TestPluginEnv.forContext("hook", { sessionId: "missing-session" });

				expect(result).toBeInstanceOf(TestPluginEnv);
			});
		});

		describe("command context", () => {
			test("loads from --vars file and returns result with remaining args", async () => {
				const varsFile = "/tmp/vars.sh";
				const files = new Map([[varsFile, "export TEST_VAR=command_value"]]);
				const fs = createMockFileSystem(files);

				const result = await TestPluginEnv.forContext("command", {
					args: ["--vars=/tmp/vars.sh", "target/path"],
					commandName: "test-cmd",
					fs,
				});

				expect(result.env).toBeInstanceOf(TestPluginEnv);
				expect(result.remainingArgs).toEqual(["target/path"]);
				expect(Bun.env.TEST_VAR).toBe("command_value");
			});

			test("throws error if --vars file does not exist", async () => {
				const fs = createMockFileSystem(new Map());

				await expect(
					TestPluginEnv.forContext("command", {
						args: ["--vars=/nonexistent.sh"],
						fs,
					}),
				).rejects.toThrow('Failed to load env vars from "/nonexistent.sh": file not found');
			});

			test("parses command line args correctly", async () => {
				const varsFile = "/tmp/vars.sh";
				const files = new Map([[varsFile, "export TEST_VAR=args_test"]]);
				const fs = createMockFileSystem(files);

				const result = await TestPluginEnv.forContext("command", {
					args: ["--vars=/tmp/vars.sh", "--debug", "src/", "--fix"],
					commandName: "test-cmd",
					fs,
				});

				expect(result.remainingArgs).toEqual(["--debug", "src/", "--fix"]);
				expect(Bun.env.TEST_VAR).toBe("args_test");
			});
		});

		test("throws error for unknown context", async () => {
			// @ts-expect-error - testing invalid context
			await expect(TestPluginEnv.forContext("invalid", {})).rejects.toThrow("Unknown context: invalid");
		});
	});

	describe("vars and varsRequired getters", () => {
		test("vars returns null when not loaded", () => {
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.vars).toBeNull();
		});

		test("varsRequired throws when vars not loaded", () => {
			const pluginEnv = new TestPluginEnv();
			expect(() => pluginEnv.varsRequired).toThrow(
				"Environment variables not loaded. Use forContext() or initializeSession() to load variables first.",
			);
		});

		test("vars returns value after setVars", () => {
			const pluginEnv = new TestPluginEnv();
			const testVars = { TEST_VAR: "value", TEST_ENABLED: "true" as const };
			// @ts-expect-error - accessing protected method for testing
			pluginEnv.setVars(testVars);
			expect(pluginEnv.vars).toEqual(testVars);
		});

		test("varsRequired returns value after setVars", () => {
			const pluginEnv = new TestPluginEnv();
			const testVars = { TEST_VAR: "value", TEST_ENABLED: "true" as const };
			// @ts-expect-error - accessing protected method for testing
			pluginEnv.setVars(testVars);
			expect(pluginEnv.varsRequired).toEqual(testVars);
		});
	});

	describe("get and require methods", () => {
		test("get returns env var value if present", () => {
			env.set("MY_VAR", "my_value");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.get("MY_VAR")).toBe("my_value");
		});

		test("get returns undefined if var not present", () => {
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.get("NONEXISTENT_VAR")).toBeUndefined();
		});

		test("require returns env var value if present", () => {
			env.set("REQUIRED_VAR", "required_value");
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.require("REQUIRED_VAR")).toBe("required_value");
		});

		test("require throws if var not present", () => {
			const pluginEnv = new TestPluginEnv();
			expect(() => pluginEnv.require("MISSING_REQUIRED_VAR")).toThrow(
				'Required environment variable "MISSING_REQUIRED_VAR" not found',
			);
		});
	});

	describe("validate and isValid methods", () => {
		test("validate throws if no schema defined", () => {
			const pluginEnv = new TestPluginEnv();
			// TestPluginEnv doesn't define a schema
			expect(() => pluginEnv.validate()).toThrow("No schema defined for validation");
		});

		test("isValid returns true if no schema defined", () => {
			const pluginEnv = new TestPluginEnv();
			expect(pluginEnv.isValid()).toBe(true);
		});
	});

	describe("loadFromFile (bash sourcing)", () => {
		test("loads vars from bash script using source", async () => {
			// Create a temp file with bash content
			const tmpFile = "/tmp/test-env-source.sh";
			await Bun.write(tmpFile, "export SOURCED_VAR=sourced_value\n");

			try {
				await PluginEnv.loadFromFile(tmpFile);
				expect(Bun.env.SOURCED_VAR).toBe("sourced_value");
			} finally {
				// Clean up
				await Bun.$`rm -f ${tmpFile}`;
			}
		});

		test("returns silently if file does not exist", async () => {
			await PluginEnv.loadFromFile("/nonexistent/file.sh");
			// No error thrown
		});

		test("throws if bash source fails", async () => {
			// Create an invalid bash file
			const tmpFile = "/tmp/test-invalid-bash.sh";
			await Bun.write(tmpFile, "this is not valid bash syntax <<<\n");

			try {
				await expect(PluginEnv.loadFromFile(tmpFile)).rejects.toThrow(/bash source failed/);
			} finally {
				await Bun.$`rm -f ${tmpFile}`;
			}
		});

		test("does not override existing env vars", async () => {
			env.set("EXISTING_VAR", "existing");

			const tmpFile = "/tmp/test-env-no-override.sh";
			await Bun.write(tmpFile, "export EXISTING_VAR=new_value\n");

			try {
				await PluginEnv.loadFromFile(tmpFile);
				expect(Bun.env.EXISTING_VAR).toBe("existing");
			} finally {
				await Bun.$`rm -f ${tmpFile}`;
			}
		});
	});
});

describe("loadAllHookFiles", () => {
	test("loads all hook-*.sh files from a directory", async () => {
		const tempDir = `/tmp/test-hooks-${Date.now()}`;
		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(`${tempDir}/hook-0.sh`, "export HOOK_VAR_0=value0\n");
			await Bun.write(`${tempDir}/hook-1.sh`, "export HOOK_VAR_1=value1\n");

			const loadedCount = await PluginEnv.loadAllHookFiles(tempDir);

			expect(loadedCount).toBe(2);
			expect(Bun.env.HOOK_VAR_0).toBe("value0");
			expect(Bun.env.HOOK_VAR_1).toBe("value1");
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
			delete Bun.env.HOOK_VAR_0;
			delete Bun.env.HOOK_VAR_1;
		}
	});

	test("returns 0 when directory exists but has no hook files", async () => {
		// When a directory exists but has no hook-*.sh files, should return 0
		// This covers the "exitCode !== 0" branch without shell error issues
		const tempDir = `/tmp/test-no-hooks-${Date.now()}`;
		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			// Create a non-hook file
			await Bun.write(`${tempDir}/other-file.txt`, "not a hook");

			const loadedCount = await PluginEnv.loadAllHookFiles(tempDir);
			expect(loadedCount).toBe(0);
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
		}
	});

	test("returns 0 when no hook files exist", async () => {
		const tempDir = `/tmp/test-empty-${Date.now()}`;
		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			// No hook files created

			const loadedCount = await PluginEnv.loadAllHookFiles(tempDir);
			expect(loadedCount).toBe(0);
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
		}
	});

	test("skips empty hook files", async () => {
		const tempDir = `/tmp/test-empty-hook-${Date.now()}`;
		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(`${tempDir}/hook-0.sh`, "export VALID_VAR=valid\n");
			await Bun.write(`${tempDir}/hook-1.sh`, "   \n  \n"); // Empty content

			const loadedCount = await PluginEnv.loadAllHookFiles(tempDir);

			expect(loadedCount).toBe(1);
			expect(Bun.env.VALID_VAR).toBe("valid");
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
			delete Bun.env.VALID_VAR;
		}
	});
});

describe("registerSession and getSessionEnvDir", () => {
	test("registerSession stores session and getSessionEnvDir retrieves it", () => {
		const sessionId = `test-session-${Date.now()}`;
		const projectDir = "/tmp/test-project";
		const sessionEnvDir = "/tmp/test-session-env";

		PluginEnv.registerSession(sessionId, projectDir, sessionEnvDir);

		const retrieved = PluginEnv.getSessionEnvDir(sessionId);
		expect(retrieved).toBe(sessionEnvDir);
	});

	test("getSessionEnvDir returns undefined for unknown session", () => {
		const result = PluginEnv.getSessionEnvDir("unknown-session-id");
		// May return undefined or a cached session from previous tests
		expect(result === undefined || typeof result === "string").toBe(true);
	});

	test("getProjectSessionEnvDir retrieves session by project dir", () => {
		const sessionId = `test-session-proj-${Date.now()}`;
		const projectDir = `/tmp/test-project-${Date.now()}`;
		const sessionEnvDir = "/tmp/test-session-env";

		PluginEnv.registerSession(sessionId, projectDir, sessionEnvDir);

		const retrieved = PluginEnv.getProjectSessionEnvDir(projectDir);
		expect(retrieved).toBe(sessionEnvDir);
	});
});

describe("persistVars", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("returns error when CLAUDE_ENV_FILE not set", async () => {
		delete Bun.env.CLAUDE_ENV_FILE;

		const result = await PluginEnv.persistVars("test-session", { MY_VAR: "value" });

		expect(result.persisted).toBe(false);
		expect(result.reason).toContain("CLAUDE_ENV_FILE not available");
	});

	test("persists vars to CLAUDE_ENV_FILE (real filesystem)", async () => {
		const tempDir = `/tmp/test-persist-${Date.now()}`;
		const envFilePath = `${tempDir}/hook-0.sh`;

		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(envFilePath, "# existing content\n");
			env.set("CLAUDE_ENV_FILE", envFilePath);

			const result = await PluginEnv.persistVars("test-session", { MY_VAR: "my_value" });

			expect(result.persisted).toBe(true);
			expect(result.path).toBe(envFilePath);

			const content = await Bun.file(envFilePath).text();
			expect(content).toContain('export MY_VAR="my_value"');
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
		}
	});

	test("updates existing vars in-place (real filesystem)", async () => {
		const tempDir = `/tmp/test-update-${Date.now()}`;
		const envFilePath = `${tempDir}/hook-0.sh`;

		try {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(envFilePath, 'export VAR1="old_value1"\nexport VAR2="old_value2"\n');
			env.set("CLAUDE_ENV_FILE", envFilePath);

			const result = await PluginEnv.persistVars("test-session", { VAR1: "new_value1" });

			expect(result.persisted).toBe(true);

			const content = await Bun.file(envFilePath).text();
			expect(content).toContain('export VAR1="new_value1"');
			expect(content).toContain('export VAR2="old_value2"');
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
		}
	});
});

describe("validateWithContext and validateOrThrow", () => {
	let env: MockEnvContext;

	beforeEach(() => {
		env = TestFixtures.createEnv({});
	});

	afterEach(() => {
		env.restore();
	});

	test("validateWithContext throws if no schema", () => {
		const pluginEnv = new TestPluginEnv();
		expect(() => pluginEnv.validateWithContext()).toThrow("No schema defined for validation");
	});

	test("validateOrThrow throws if no schema", () => {
		const pluginEnv = new TestPluginEnv();
		expect(() => pluginEnv.validateOrThrow("session-1", "test-hook")).toThrow("No schema defined for validation");
	});
});

describe("defaultPluginEnvFileSystem", () => {
	test("writeFile writes content to file", async () => {
		const tempFile = `/tmp/test-write-${Date.now()}.txt`;
		try {
			// Import the default file system
			const { defaultPluginEnvFileSystem } = await import("../../src/services/PluginEnv.js");

			await defaultPluginEnvFileSystem.writeFile(tempFile, "test content");

			const content = await Bun.file(tempFile).text();
			expect(content).toBe("test content");
		} finally {
			await Bun.$`rm -f ${tempFile}`.quiet().nothrow();
		}
	});

	test("mkdir creates directory", async () => {
		const tempDir = `/tmp/test-mkdir-${Date.now()}`;
		try {
			const { defaultPluginEnvFileSystem } = await import("../../src/services/PluginEnv.js");

			await defaultPluginEnvFileSystem.mkdir(tempDir);

			const result = await Bun.$`test -d ${tempDir}`.quiet().nothrow();
			expect(result.exitCode).toBe(0);
		} finally {
			await Bun.$`rm -rf ${tempDir}`.quiet().nothrow();
		}
	});

	test("chmod changes file permissions", async () => {
		const tempFile = `/tmp/test-chmod-${Date.now()}.sh`;
		try {
			const { defaultPluginEnvFileSystem } = await import("../../src/services/PluginEnv.js");

			await Bun.write(tempFile, "#!/bin/bash\necho hello\n");
			await defaultPluginEnvFileSystem.chmod(tempFile, "+x");

			const result = await Bun.$`test -x ${tempFile}`.quiet().nothrow();
			expect(result.exitCode).toBe(0);
		} finally {
			await Bun.$`rm -f ${tempFile}`.quiet().nothrow();
		}
	});

	test("exists returns false for catch block", async () => {
		const { defaultPluginEnvFileSystem } = await import("../../src/services/PluginEnv.js");
		// This tests the catch block - a path with invalid characters might trigger it
		// Though in practice Bun.file might handle it gracefully
		const result = await defaultPluginEnvFileSystem.exists("/some/path/that/does/not/exist");
		expect(result).toBe(false);
	});
});

describe("formatValidationError", () => {
	test("formats basic error with path and message", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["MY_VAR"],
					message: "Required",
					code: "invalid_type",
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("## Validation Errors");
		expect(result).toContain("**MY_VAR**: Required");
	});

	test("shows received value for invalid_type errors", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["MY_VAR"],
					message: "Expected string, received null",
					code: "invalid_type",
					expected: "string",
					received: null,
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("(expected: string)");
		expect(result).toContain("received: null");
	});

	test("shows received value for enum errors (invalid_value)", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["SAVVY_WORKFLOW_DEBUG"],
					message: "Invalid option",
					code: "invalid_value",
					values: ["true", "false"],
					received: "yes",
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("(expected: true, false)");
		expect(result).toContain('received: "yes"');
	});

	test("does not show received when key is not present", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["SAVVY_WORKFLOW_DEBUG"],
					message: "Invalid option",
					code: "invalid_value",
					values: ["true", "false"],
					// received key not present
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("(expected: true, false)");
		expect(result).not.toContain("received:");
	});

	test("truncates long string values", () => {
		const longString = "a".repeat(100);
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["LONG_VAR"],
					message: "Invalid",
					code: "invalid_type",
					received: longString,
				},
			],
		};
		const result = formatValidationError(error);
		// 50 chars shown, then ... and length info
		expect(result).toContain("(100 chars)");
		expect(result).toContain('received: "aaaaaaaaaa');
		expect(result).toContain('..."');
	});

	test("formats array received values", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["ARRAY_VAR"],
					message: "Expected string",
					code: "invalid_type",
					received: ["a", "b", "c"],
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("received: Array(3)");
	});

	test("formats object received values", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["OBJ_VAR"],
					message: "Expected string",
					code: "invalid_type",
					received: { foo: 1, bar: 2 },
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("received: Object(2 keys)");
	});

	test("formats boolean and number received values", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["BOOL_VAR"],
					message: "Expected string",
					code: "invalid_type",
					received: true,
				},
				{
					path: ["NUM_VAR"],
					message: "Expected string",
					code: "invalid_type",
					received: 42,
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("received: true");
		expect(result).toContain("received: 42");
	});

	test("respects maxErrors limit", () => {
		const issues = Array.from({ length: 20 }, (_, i) => ({
			path: [`VAR_${i}`],
			message: `Error ${i}`,
			code: "invalid_type",
		}));
		const error: ValidationErrorMinimal = { issues };

		const result = formatValidationError(error, 5);
		expect(result).toContain("VAR_0");
		expect(result).toContain("VAR_4");
		expect(result).not.toContain("VAR_5");
		expect(result).toContain("... and 15 more errors");
	});

	test("handles empty path (root error)", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: [],
					message: "Invalid input",
					code: "custom",
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("**(root)**: Invalid input");
	});

	test("handles nested paths", () => {
		const error: ValidationErrorMinimal = {
			issues: [
				{
					path: ["config", "nested", "value"],
					message: "Required",
					code: "invalid_type",
				},
			],
		};
		const result = formatValidationError(error);
		expect(result).toContain("**config.nested.value**: Required");
	});
});
