/**
 * Supported git providers.
 * @public
 */
export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

/**
 * Git repository information data.
 * @public
 */
export interface GitInfoData {
	/** Current branch name */
	branch?: string | undefined;
	/** Git provider (github, gitlab, bitbucket, unknown) */
	provider?: GitProvider | undefined;
	/** Repository owner/organization */
	owner?: string | undefined;
	/** Repository name */
	repo?: string | undefined;
}

/**
 * Known git provider hostnames.
 * @internal
 */
const PROVIDER_HOSTS: Record<string, GitProvider> = {
	"github.com": "github",
	"gitlab.com": "gitlab",
	"bitbucket.org": "bitbucket",
};

/**
 * Git repository information.
 *
 * @remarks
 * Represents git metadata for a repository. Use the static `detect()` method
 * to automatically discover repository information from a directory.
 *
 * @example
 * ```typescript
 * import { GitInfo } from "claude-binary-plugin";
 *
 * // Detect from specific directory
 * const info = await GitInfo.detect("/path/to/repo");
 *
 * // Parse a remote URL
 * const parsed = GitInfo.parseRemoteUrl("git@github.com:owner/repo.git");
 * // { provider: "github", owner: "owner", repo: "repo" }
 *
 * // Convert to OTEL attributes
 * const attrs = info.toAttributes();
 * ```
 *
 * @public
 */
export class GitInfo {
	/**
	 * Current branch name.
	 * @public
	 */
	readonly branch?: string | undefined;

	/**
	 * Git provider (github, gitlab, bitbucket, unknown).
	 * @public
	 */
	readonly provider?: GitProvider | undefined;

	/**
	 * Repository owner/organization.
	 * @public
	 */
	readonly owner?: string | undefined;

	/**
	 * Repository name.
	 * @public
	 */
	readonly repo?: string | undefined;

	/**
	 * Create a GitInfo instance.
	 *
	 * @param data - Git info data
	 *
	 * @remarks
	 * Typically you should use `GitInfo.detect()` rather than
	 * constructing instances directly.
	 *
	 * @public
	 */
	constructor(data: GitInfoData = {}) {
		this.branch = data.branch;
		this.provider = data.provider;
		this.owner = data.owner;
		this.repo = data.repo;
	}

	/**
	 * Detect git information for a directory.
	 *
	 * @remarks
	 * Runs git commands to detect the current branch and parses the remote URL
	 * to extract provider, owner, and repo information.
	 *
	 * @param cwd - Working directory (defaults to CLAUDE_PROJECT_DIR or process.cwd())
	 * @returns GitInfo instance
	 *
	 * @example
	 * ```typescript
	 * import { GitInfo } from "claude-binary-plugin";
	 * // Detect from current directory
	 * const info = await GitInfo.detect();
	 *
	 * // Detect from specific path
	 * const info = await GitInfo.detect("/path/to/repo");
	 * ```
	 *
	 * @public
	 */
	static async detect(cwd?: string): Promise<GitInfo> {
		const projectDir = cwd ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();

		// Run both commands in parallel
		const [branch, remoteUrl] = await Promise.all([GitInfo.getBranch(projectDir), GitInfo.getRemoteUrl(projectDir)]);

		// Parse remote URL for provider/owner/repo
		const remoteInfo = remoteUrl ? GitInfo.parseRemoteUrl(remoteUrl) : {};

		return new GitInfo({
			branch,
			...remoteInfo,
		});
	}

	/**
	 * Parse a git remote URL to extract provider, owner, and repo.
	 *
	 * @remarks
	 * Handles various URL formats:
	 * - SSH: `git@github.com:owner/repo.git`
	 * - HTTPS: `https://github.com/owner/repo.git`
	 * - HTTPS with auth: `https://user@github.com/owner/repo.git`
	 * - Git protocol: `git://github.com/owner/repo.git`
	 *
	 * @param remoteUrl - The git remote URL
	 * @returns Parsed git info (provider, owner, repo)
	 *
	 * @example
	 * ```typescript
	 * const info = GitInfo.parseRemoteUrl("git@github.com:owner/repo.git");
	 * // { provider: "github", owner: "owner", repo: "repo" }
	 *
	 * const info = GitInfo.parseRemoteUrl("https://gitlab.com/org/group/repo.git");
	 * // { provider: "gitlab", owner: "org", repo: "repo" }
	 * ```
	 *
	 * @public
	 */
	static parseRemoteUrl(remoteUrl: string): Pick<GitInfoData, "provider" | "owner" | "repo"> {
		if (!remoteUrl) return {};

		try {
			// Normalize the URL for parsing
			const normalized = remoteUrl.trim();

			// Handle SSH format: git@host:owner/repo.git
			const sshMatch = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
			if (sshMatch?.[1] && sshMatch[2]) {
				return GitInfo.parseHostAndPath(sshMatch[1], sshMatch[2]);
			}

			// Handle HTTPS/Git protocol: https://host/owner/repo.git or git://host/owner/repo.git
			// Also handles: https://user@host/owner/repo.git
			const urlMatch = normalized.match(/^(?:https?|git):\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
			if (urlMatch?.[1] && urlMatch[2]) {
				return GitInfo.parseHostAndPath(urlMatch[1], urlMatch[2]);
			}

			return {};
		} catch {
			return {};
		}
	}

	/**
	 * Get the current git branch name.
	 *
	 * @param cwd - Working directory
	 * @returns Branch name or undefined if not in a git repo
	 *
	 * @internal
	 */
	private static async getBranch(cwd: string): Promise<string | undefined> {
		try {
			const result = await Bun.$`git -C ${cwd} branch --show-current`.quiet().nothrow();
			if (result.exitCode !== 0) return undefined;

			const branch = result.stdout.toString().trim();
			return branch || undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Get the git remote URL for the origin remote.
	 *
	 * @param cwd - Working directory
	 * @returns Remote URL or undefined if not available
	 *
	 * @internal
	 */
	private static async getRemoteUrl(cwd: string): Promise<string | undefined> {
		try {
			const result = await Bun.$`git -C ${cwd} remote get-url origin`.quiet().nothrow();
			if (result.exitCode !== 0) return undefined;

			const url = result.stdout.toString().trim();
			return url || undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Parse host and path to extract provider, owner, and repo.
	 *
	 * @internal
	 */
	private static parseHostAndPath(host: string, path: string): Pick<GitInfoData, "provider" | "owner" | "repo"> {
		const provider = PROVIDER_HOSTS[host.toLowerCase()] ?? "unknown";

		// Split path into owner/repo (handle nested groups like gitlab allows)
		const parts = path.split("/");
		if (parts.length < 2) return { provider };

		// For nested paths (gitlab groups), take first as owner, last as repo
		const owner = parts[0];
		const repo = parts[parts.length - 1];

		return { provider, owner, repo };
	}

	/**
	 * Convert to OTEL resource attributes.
	 *
	 * @remarks
	 * Only includes attributes that have values (no undefined/empty strings).
	 *
	 * @returns Record of attribute name to value
	 *
	 * @example
	 * ```typescript
	 * const info = await GitInfo.detect();
	 * const attrs = info.toAttributes();
	 * // { "git.branch": "main", "git.provider": "github", "git.owner": "...", "git.repo": "..." }
	 * ```
	 *
	 * @public
	 */
	toAttributes(): Record<string, string> {
		const attrs: Record<string, string> = {};

		if (this.branch) {
			attrs["git.branch"] = this.branch;
		}
		if (this.provider) {
			attrs["git.provider"] = this.provider;
		}
		if (this.owner) {
			attrs["git.owner"] = this.owner;
		}
		if (this.repo) {
			attrs["git.repo"] = this.repo;
		}

		return attrs;
	}

	/**
	 * Check if this GitInfo has any valid data.
	 *
	 * @returns `true` if at least one field is populated
	 *
	 * @public
	 */
	get isValid(): boolean {
		return !!(this.branch || this.provider || this.owner || this.repo);
	}

	/**
	 * Get a display string for the repository.
	 *
	 * @returns String like "owner/repo" or "unknown"
	 *
	 * @public
	 */
	get displayName(): string {
		if (this.owner && this.repo) {
			return `${this.owner}/${this.repo}`;
		}
		return "unknown";
	}
}
