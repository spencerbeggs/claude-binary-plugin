import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { GitInfoLive } from "../../src/layers/GitInfoLive.js";
import { makeGitInfoTest } from "../../src/layers/GitInfoTest.js";
import { makeShellExecutorTest } from "../../src/layers/ShellExecutorTest.js";
import {
	GitInfo,
	getGitInfoDisplayName,
	gitInfoToAttributes,
	isGitInfoValid,
	parseGitRemoteUrl,
} from "../../src/services/GitInfo.js";
import { ShellResult } from "../../src/services/ShellExecutor.js";

// ============================================================================
// parseGitRemoteUrl
// ============================================================================

describe("parseGitRemoteUrl", () => {
	describe("GitHub URLs", () => {
		test("parses SSH format", () => {
			const result = parseGitRemoteUrl("git@github.com:anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses SSH format without .git suffix", () => {
			const result = parseGitRemoteUrl("git@github.com:anthropics/claude-code");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS format", () => {
			const result = parseGitRemoteUrl("https://github.com/anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS format without .git suffix", () => {
			const result = parseGitRemoteUrl("https://github.com/anthropics/claude-code");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS with user auth", () => {
			const result = parseGitRemoteUrl("https://user@github.com/anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});
	});

	describe("GitLab URLs", () => {
		test("parses SSH format", () => {
			const result = parseGitRemoteUrl("git@gitlab.com:myorg/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});

		test("parses HTTPS format", () => {
			const result = parseGitRemoteUrl("https://gitlab.com/myorg/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});

		test("parses nested groups (takes first as owner, last as repo)", () => {
			const result = parseGitRemoteUrl("git@gitlab.com:myorg/subgroup/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});
	});

	describe("Bitbucket URLs", () => {
		test("parses SSH format", () => {
			const result = parseGitRemoteUrl("git@bitbucket.org:myteam/myrepo.git");
			expect(result).toEqual({
				provider: "bitbucket",
				owner: "myteam",
				repo: "myrepo",
			});
		});

		test("parses HTTPS format", () => {
			const result = parseGitRemoteUrl("https://bitbucket.org/myteam/myrepo.git");
			expect(result).toEqual({
				provider: "bitbucket",
				owner: "myteam",
				repo: "myrepo",
			});
		});
	});

	describe("Unknown providers", () => {
		test("parses self-hosted git with unknown provider", () => {
			const result = parseGitRemoteUrl("git@git.mycompany.com:team/project.git");
			expect(result).toEqual({
				provider: "unknown",
				owner: "team",
				repo: "project",
			});
		});

		test("parses HTTPS self-hosted with unknown provider", () => {
			const result = parseGitRemoteUrl("https://git.mycompany.com/team/project.git");
			expect(result).toEqual({
				provider: "unknown",
				owner: "team",
				repo: "project",
			});
		});
	});

	describe("Edge cases", () => {
		test("returns empty object for empty string", () => {
			expect(parseGitRemoteUrl("")).toEqual({});
		});

		test("returns empty object for invalid URL", () => {
			expect(parseGitRemoteUrl("not-a-url")).toEqual({});
		});

		test("handles git:// protocol", () => {
			const result = parseGitRemoteUrl("git://github.com/owner/repo.git");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});

		test("handles URLs with trailing whitespace", () => {
			const result = parseGitRemoteUrl("  git@github.com:owner/repo.git  ");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});

		test("handles case-insensitive hostnames", () => {
			const result = parseGitRemoteUrl("git@GITHUB.COM:owner/repo.git");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});
	});
});

// ============================================================================
// isGitInfoValid
// ============================================================================

describe("isGitInfoValid", () => {
	test("returns true when all fields are present", () => {
		const info = {
			branch: "main",
			provider: "github" as const,
			owner: "anthropics",
			repo: "claude-code",
		};
		expect(isGitInfoValid(info)).toBe(true);
	});

	test("returns true when only branch is present", () => {
		expect(isGitInfoValid({ branch: "main" })).toBe(true);
	});

	test("returns true when only provider is present", () => {
		expect(isGitInfoValid({ provider: "github" })).toBe(true);
	});

	test("returns true when only owner is present", () => {
		expect(isGitInfoValid({ owner: "anthropics" })).toBe(true);
	});

	test("returns true when only repo is present", () => {
		expect(isGitInfoValid({ repo: "claude-code" })).toBe(true);
	});

	test("returns false when no fields are present", () => {
		expect(isGitInfoValid({})).toBe(false);
	});

	test("returns false for empty object", () => {
		expect(isGitInfoValid({})).toBe(false);
	});
});

// ============================================================================
// getGitInfoDisplayName
// ============================================================================

describe("getGitInfoDisplayName", () => {
	test("returns owner/repo when both are present", () => {
		expect(getGitInfoDisplayName({ owner: "anthropics", repo: "claude-code" })).toBe("anthropics/claude-code");
	});

	test("returns 'unknown' when only owner is present", () => {
		expect(getGitInfoDisplayName({ owner: "anthropics" })).toBe("unknown");
	});

	test("returns 'unknown' when only repo is present", () => {
		expect(getGitInfoDisplayName({ repo: "claude-code" })).toBe("unknown");
	});

	test("returns 'unknown' when neither owner nor repo is present", () => {
		expect(getGitInfoDisplayName({ branch: "main", provider: "github" })).toBe("unknown");
	});

	test("returns 'unknown' for empty object", () => {
		expect(getGitInfoDisplayName({})).toBe("unknown");
	});
});

// ============================================================================
// gitInfoToAttributes
// ============================================================================

describe("gitInfoToAttributes", () => {
	test("converts full git info to attributes", () => {
		const info = {
			branch: "main",
			provider: "github" as const,
			owner: "anthropics",
			repo: "claude-code",
		};
		expect(gitInfoToAttributes(info)).toEqual({
			"git.branch": "main",
			"git.provider": "github",
			"git.owner": "anthropics",
			"git.repo": "claude-code",
		});
	});

	test("omits undefined fields", () => {
		expect(gitInfoToAttributes({ branch: "main" })).toEqual({
			"git.branch": "main",
		});
	});

	test("returns empty object for empty git info", () => {
		expect(gitInfoToAttributes({})).toEqual({});
	});

	test("handles git info with only provider", () => {
		expect(gitInfoToAttributes({ provider: "unknown" })).toEqual({
			"git.provider": "unknown",
		});
	});
});

// ============================================================================
// GitInfoLive
// ============================================================================

describe("GitInfoLive", () => {
	test("detects branch and remote from shell commands", async () => {
		const responses = new Map([
			["branch --show-current", new ShellResult({ exitCode: 0, stdout: "main\n", stderr: "" })],
			[
				"remote get-url origin",
				new ShellResult({ exitCode: 0, stdout: "git@github.com:owner/repo.git\n", stderr: "" }),
			],
		]);
		const { layer: shellLayer, commands } = makeShellExecutorTest(responses);

		const program = Effect.flatMap(GitInfo, (svc) => svc.detect);
		const result = await Effect.runPromise(program.pipe(Effect.provide(GitInfoLive), Effect.provide(shellLayer)));

		expect(result.branch).toBe("main");
		expect(result.provider).toBe("github");
		expect(result.owner).toBe("owner");
		expect(result.repo).toBe("repo");
		expect(commands.length).toBeGreaterThan(0);
	});

	test("handles failed git commands gracefully (exitCode 128)", async () => {
		const responses = new Map([
			["branch --show-current", new ShellResult({ exitCode: 128, stdout: "", stderr: "not a git repo" })],
			["remote get-url origin", new ShellResult({ exitCode: 128, stdout: "", stderr: "not a git repo" })],
		]);
		const { layer: shellLayer } = makeShellExecutorTest(responses);

		const program = Effect.flatMap(GitInfo, (svc) => svc.detect);
		const result = await Effect.runPromise(program.pipe(Effect.provide(GitInfoLive), Effect.provide(shellLayer)));

		expect(result.branch).toBeUndefined();
		expect(result.provider).toBeUndefined();
		expect(result.owner).toBeUndefined();
		expect(result.repo).toBeUndefined();
	});

	test("caches results — shell commands only called once for two detect calls", async () => {
		const responses = new Map([
			["branch --show-current", new ShellResult({ exitCode: 0, stdout: "main\n", stderr: "" })],
			[
				"remote get-url origin",
				new ShellResult({ exitCode: 0, stdout: "git@github.com:owner/repo.git\n", stderr: "" }),
			],
		]);
		const { layer: shellLayer, commands } = makeShellExecutorTest(responses);

		const program = Effect.gen(function* () {
			const svc = yield* GitInfo;
			const first = yield* svc.detect;
			const second = yield* svc.detect;
			return { first, second };
		});

		const { first, second } = await Effect.runPromise(
			program.pipe(Effect.provide(GitInfoLive), Effect.provide(shellLayer)),
		);

		// Results should be identical
		expect(first).toEqual(second);

		// Shell should only have been called twice total (branch + remote), not 4 times
		expect(commands.length).toBe(2);
	});
});

// ============================================================================
// makeGitInfoTest
// ============================================================================

describe("makeGitInfoTest", () => {
	test("returns empty info when no data provided", async () => {
		const { layer } = makeGitInfoTest();
		const program = Effect.flatMap(GitInfo, (svc) => svc.detect);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toEqual({});
	});

	test("returns provided data", async () => {
		const data = {
			branch: "feat/test",
			provider: "github" as const,
			owner: "myorg",
			repo: "myrepo",
		};
		const { layer } = makeGitInfoTest(data);
		const program = Effect.flatMap(GitInfo, (svc) => svc.detect);
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toEqual(data);
	});

	test("toAttributes delegates to gitInfoToAttributes", async () => {
		const data = {
			branch: "main",
			provider: "github" as const,
			owner: "myorg",
			repo: "myrepo",
		};
		const { layer } = makeGitInfoTest(data);
		const program = Effect.flatMap(GitInfo, (svc) => Effect.succeed(svc.toAttributes(data)));
		const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
		expect(result).toEqual({
			"git.branch": "main",
			"git.provider": "github",
			"git.owner": "myorg",
			"git.repo": "myrepo",
		});
	});
});
