import { describe, expect, test } from "bun:test";
import { GitInfo } from "./GitInfo.js";

describe("GitInfo.parseRemoteUrl", () => {
	describe("GitHub URLs", () => {
		test("parses SSH format", () => {
			const result = GitInfo.parseRemoteUrl("git@github.com:anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses SSH format without .git suffix", () => {
			const result = GitInfo.parseRemoteUrl("git@github.com:anthropics/claude-code");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS format", () => {
			const result = GitInfo.parseRemoteUrl("https://github.com/anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS format without .git suffix", () => {
			const result = GitInfo.parseRemoteUrl("https://github.com/anthropics/claude-code");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});

		test("parses HTTPS with user auth", () => {
			const result = GitInfo.parseRemoteUrl("https://user@github.com/anthropics/claude-code.git");
			expect(result).toEqual({
				provider: "github",
				owner: "anthropics",
				repo: "claude-code",
			});
		});
	});

	describe("GitLab URLs", () => {
		test("parses SSH format", () => {
			const result = GitInfo.parseRemoteUrl("git@gitlab.com:myorg/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});

		test("parses HTTPS format", () => {
			const result = GitInfo.parseRemoteUrl("https://gitlab.com/myorg/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});

		test("parses nested groups (takes first as owner, last as repo)", () => {
			const result = GitInfo.parseRemoteUrl("git@gitlab.com:myorg/subgroup/myrepo.git");
			expect(result).toEqual({
				provider: "gitlab",
				owner: "myorg",
				repo: "myrepo",
			});
		});
	});

	describe("Bitbucket URLs", () => {
		test("parses SSH format", () => {
			const result = GitInfo.parseRemoteUrl("git@bitbucket.org:myteam/myrepo.git");
			expect(result).toEqual({
				provider: "bitbucket",
				owner: "myteam",
				repo: "myrepo",
			});
		});

		test("parses HTTPS format", () => {
			const result = GitInfo.parseRemoteUrl("https://bitbucket.org/myteam/myrepo.git");
			expect(result).toEqual({
				provider: "bitbucket",
				owner: "myteam",
				repo: "myrepo",
			});
		});
	});

	describe("Unknown providers", () => {
		test("parses self-hosted git with unknown provider", () => {
			const result = GitInfo.parseRemoteUrl("git@git.mycompany.com:team/project.git");
			expect(result).toEqual({
				provider: "unknown",
				owner: "team",
				repo: "project",
			});
		});

		test("parses HTTPS self-hosted with unknown provider", () => {
			const result = GitInfo.parseRemoteUrl("https://git.mycompany.com/team/project.git");
			expect(result).toEqual({
				provider: "unknown",
				owner: "team",
				repo: "project",
			});
		});
	});

	describe("Edge cases", () => {
		test("returns empty object for empty string", () => {
			expect(GitInfo.parseRemoteUrl("")).toEqual({});
		});

		test("returns empty object for invalid URL", () => {
			expect(GitInfo.parseRemoteUrl("not-a-url")).toEqual({});
		});

		test("handles git:// protocol", () => {
			const result = GitInfo.parseRemoteUrl("git://github.com/owner/repo.git");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});

		test("handles URLs with trailing whitespace", () => {
			const result = GitInfo.parseRemoteUrl("  git@github.com:owner/repo.git  ");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});

		test("handles case-insensitive hostnames", () => {
			const result = GitInfo.parseRemoteUrl("git@GITHUB.COM:owner/repo.git");
			expect(result).toEqual({
				provider: "github",
				owner: "owner",
				repo: "repo",
			});
		});
	});
});

describe("GitInfo.isValid", () => {
	test("returns true when all fields are present", () => {
		const info = new GitInfo({
			branch: "main",
			provider: "github",
			owner: "anthropics",
			repo: "claude-code",
		});
		expect(info.isValid).toBe(true);
	});

	test("returns true when only branch is present", () => {
		const info = new GitInfo({ branch: "main" });
		expect(info.isValid).toBe(true);
	});

	test("returns true when only provider is present", () => {
		const info = new GitInfo({ provider: "github" });
		expect(info.isValid).toBe(true);
	});

	test("returns true when only owner is present", () => {
		const info = new GitInfo({ owner: "anthropics" });
		expect(info.isValid).toBe(true);
	});

	test("returns true when only repo is present", () => {
		const info = new GitInfo({ repo: "claude-code" });
		expect(info.isValid).toBe(true);
	});

	test("returns false when no fields are present", () => {
		const info = new GitInfo({});
		expect(info.isValid).toBe(false);
	});

	test("returns false for default constructor", () => {
		const info = new GitInfo();
		expect(info.isValid).toBe(false);
	});
});

describe("GitInfo.displayName", () => {
	test("returns owner/repo when both are present", () => {
		const info = new GitInfo({ owner: "anthropics", repo: "claude-code" });
		expect(info.displayName).toBe("anthropics/claude-code");
	});

	test("returns 'unknown' when only owner is present", () => {
		const info = new GitInfo({ owner: "anthropics" });
		expect(info.displayName).toBe("unknown");
	});

	test("returns 'unknown' when only repo is present", () => {
		const info = new GitInfo({ repo: "claude-code" });
		expect(info.displayName).toBe("unknown");
	});

	test("returns 'unknown' when neither owner nor repo is present", () => {
		const info = new GitInfo({ branch: "main", provider: "github" });
		expect(info.displayName).toBe("unknown");
	});

	test("returns 'unknown' for empty GitInfo", () => {
		const info = new GitInfo({});
		expect(info.displayName).toBe("unknown");
	});
});

describe("GitInfo.toAttributes", () => {
	test("converts full git info to attributes", () => {
		const info = new GitInfo({
			branch: "main",
			provider: "github",
			owner: "anthropics",
			repo: "claude-code",
		});
		expect(info.toAttributes()).toEqual({
			"git.branch": "main",
			"git.provider": "github",
			"git.owner": "anthropics",
			"git.repo": "claude-code",
		});
	});

	test("omits undefined fields", () => {
		const info = new GitInfo({
			branch: "main",
		});
		expect(info.toAttributes()).toEqual({
			"git.branch": "main",
		});
	});

	test("returns empty object for empty git info", () => {
		const info = new GitInfo({});
		expect(info.toAttributes()).toEqual({});
	});

	test("handles git info with only provider", () => {
		const info = new GitInfo({
			provider: "unknown",
		});
		expect(info.toAttributes()).toEqual({
			"git.provider": "unknown",
		});
	});
});
