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
 * Parse host and path to extract provider, owner, and repo.
 * @internal
 */
const parseHostAndPath = (host: string, path: string): Pick<GitInfoData, "provider" | "owner" | "repo"> => {
	const provider = PROVIDER_HOSTS[host.toLowerCase()] ?? "unknown";

	// Split path into owner/repo (handle nested groups like gitlab allows)
	const parts = path.split("/");
	if (parts.length < 2) return { provider };

	// For nested paths (gitlab groups), take first as owner, last as repo
	const owner = parts[0];
	const repo = parts[parts.length - 1];

	return { provider, owner, repo };
};

/**
 * Get the current git branch name.
 * @internal
 */
const getBranch = async (cwd: string): Promise<string | undefined> => {
	try {
		const result = await Bun.$`git -C ${cwd} branch --show-current`.quiet().nothrow();
		if (result.exitCode !== 0) return undefined;

		const branch = result.stdout.toString().trim();
		return branch || undefined;
	} catch {
		return undefined;
	}
};

/**
 * Get the git remote URL for the origin remote.
 * @internal
 */
const getRemoteUrl = async (cwd: string): Promise<string | undefined> => {
	try {
		const result = await Bun.$`git -C ${cwd} remote get-url origin`.quiet().nothrow();
		if (result.exitCode !== 0) return undefined;

		const url = result.stdout.toString().trim();
		return url || undefined;
	} catch {
		return undefined;
	}
};

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
 * const info = parseGitRemoteUrl("git@github.com:owner/repo.git");
 * // { provider: "github", owner: "owner", repo: "repo" }
 *
 * const info = parseGitRemoteUrl("https://gitlab.com/org/group/repo.git");
 * // { provider: "gitlab", owner: "org", repo: "repo" }
 * ```
 *
 * @public
 */
export function parseGitRemoteUrl(remoteUrl: string): Pick<GitInfoData, "provider" | "owner" | "repo"> {
	if (!remoteUrl) return {};

	try {
		// Normalize the URL for parsing
		const normalized = remoteUrl.trim();

		// Handle SSH format: git@host:owner/repo.git
		const sshMatch = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
		if (sshMatch?.[1] && sshMatch[2]) {
			return parseHostAndPath(sshMatch[1], sshMatch[2]);
		}

		// Handle HTTPS/Git protocol: https://host/owner/repo.git or git://host/owner/repo.git
		// Also handles: https://user@host/owner/repo.git
		const urlMatch = normalized.match(/^(?:https?|git):\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
		if (urlMatch?.[1] && urlMatch[2]) {
			return parseHostAndPath(urlMatch[1], urlMatch[2]);
		}

		return {};
	} catch {
		return {};
	}
}

/**
 * Detect git information for a directory.
 *
 * @remarks
 * Runs git commands to detect the current branch and parses the remote URL
 * to extract provider, owner, and repo information.
 *
 * @param cwd - Working directory (defaults to CLAUDE_PROJECT_DIR or process.cwd())
 * @returns GitInfoData plain object
 *
 * @example
 * ```typescript
 * import { detectGitInfo } from "claude-binary-plugin";
 * // Detect from current directory
 * const info = await detectGitInfo();
 *
 * // Detect from specific path
 * const info = await detectGitInfo("/path/to/repo");
 * ```
 *
 * @public
 */
export async function detectGitInfo(cwd?: string): Promise<GitInfoData> {
	const projectDir = cwd ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();

	// Run both commands in parallel
	const [branch, remoteUrl] = await Promise.all([getBranch(projectDir), getRemoteUrl(projectDir)]);

	// Parse remote URL for provider/owner/repo
	const remoteInfo = remoteUrl ? parseGitRemoteUrl(remoteUrl) : {};

	return {
		branch,
		...remoteInfo,
	};
}

/**
 * Check if a GitInfoData object has any valid data.
 *
 * @param info - Git info data
 * @returns `true` if at least one field is populated
 *
 * @public
 */
export function isGitInfoValid(info: GitInfoData): boolean {
	return !!(info.branch || info.provider || info.owner || info.repo);
}

/**
 * Get a display string for the repository.
 *
 * @param info - Git info data
 * @returns String like "owner/repo" or "unknown"
 *
 * @public
 */
export function getGitInfoDisplayName(info: GitInfoData): string {
	if (info.owner && info.repo) {
		return `${info.owner}/${info.repo}`;
	}
	return "unknown";
}

/**
 * Convert git info to OTEL resource attributes.
 *
 * @remarks
 * Only includes attributes that have values (no undefined/empty strings).
 *
 * @param info - Git info data
 * @returns Record of attribute name to value
 *
 * @example
 * ```typescript
 * const info = await detectGitInfo();
 * const attrs = gitInfoToAttributes(info);
 * // { "git.branch": "main", "git.provider": "github", "git.owner": "...", "git.repo": "..." }
 * ```
 *
 * @public
 */
export function gitInfoToAttributes(info: GitInfoData): Record<string, string> {
	const attrs: Record<string, string> = {};

	if (info.branch) {
		attrs["git.branch"] = info.branch;
	}
	if (info.provider) {
		attrs["git.provider"] = info.provider;
	}
	if (info.owner) {
		attrs["git.owner"] = info.owner;
	}
	if (info.repo) {
		attrs["git.repo"] = info.repo;
	}

	return attrs;
}
