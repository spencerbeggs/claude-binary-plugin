/**
 * Git repository information detection for OTEL resource attributes.
 *
 * Detects git branch, provider (github/gitlab/bitbucket), owner, and repo
 * from the current working directory. Gracefully handles non-git directories.
 *
 * @module
 */

/**
 * Supported git providers.
 */
export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

/**
 * Git repository information.
 */
export interface GitInfo {
	/** Current branch name */
	branch?: string;
	/** Git provider (github, gitlab, bitbucket, unknown) */
	provider?: GitProvider;
	/** Repository owner/organization */
	owner?: string;
	/** Repository name */
	repo?: string;
}

/**
 * Known git provider hostnames.
 */
const PROVIDER_HOSTS: Record<string, GitProvider> = {
	"github.com": "github",
	"gitlab.com": "gitlab",
	"bitbucket.org": "bitbucket",
};

/**
 * Parse a git remote URL to extract provider, owner, and repo.
 *
 * Handles various URL formats:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS with auth: https://user@github.com/owner/repo.git
 * - Git protocol: git://github.com/owner/repo.git
 *
 * @param remoteUrl - The git remote URL
 * @returns Parsed git info or empty object if parsing fails
 */
export function parseGitRemoteUrl(remoteUrl: string): Pick<GitInfo, "provider" | "owner" | "repo"> {
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
 * Parse host and path to extract provider, owner, and repo.
 */
function parseHostAndPath(host: string, path: string): Pick<GitInfo, "provider" | "owner" | "repo"> {
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
 * Get the current git branch name.
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Branch name or undefined if not in a git repo
 */
export async function getGitBranch(cwd?: string): Promise<string | undefined> {
	try {
		const result = await Bun.$`git -C ${cwd ?? "."} branch --show-current`.quiet().nothrow();
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
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Remote URL or undefined if not available
 */
export async function getGitRemoteUrl(cwd?: string): Promise<string | undefined> {
	try {
		const result = await Bun.$`git -C ${cwd ?? "."} remote get-url origin`.quiet().nothrow();
		if (result.exitCode !== 0) return undefined;

		const url = result.stdout.toString().trim();
		return url || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Detect git information for the current working directory.
 *
 * This is the main entry point for git detection. It runs git commands
 * to detect the current branch and parses the remote URL to extract
 * provider, owner, and repo information.
 *
 * @param cwd - Working directory (defaults to CLAUDE_PROJECT_DIR or process.cwd())
 * @returns Git information, with undefined fields for missing data
 */
export async function detectGitInfo(cwd?: string): Promise<GitInfo> {
	const projectDir = cwd ?? Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();

	// Run both commands in parallel
	const [branch, remoteUrl] = await Promise.all([getGitBranch(projectDir), getGitRemoteUrl(projectDir)]);

	// Parse remote URL for provider/owner/repo
	const remoteInfo = remoteUrl ? parseGitRemoteUrl(remoteUrl) : {};

	return {
		branch,
		...remoteInfo,
	};
}

/**
 * Convert GitInfo to OTEL resource attributes.
 *
 * Only includes attributes that have values (no undefined/empty strings).
 *
 * @param gitInfo - Git information from detectGitInfo()
 * @returns Record of attribute name to value
 */
export function gitInfoToAttributes(gitInfo: GitInfo): Record<string, string> {
	const attrs: Record<string, string> = {};

	if (gitInfo.branch) {
		attrs["git.branch"] = gitInfo.branch;
	}
	if (gitInfo.provider) {
		attrs["git.provider"] = gitInfo.provider;
	}
	if (gitInfo.owner) {
		attrs["git.owner"] = gitInfo.owner;
	}
	if (gitInfo.repo) {
		attrs["git.repo"] = gitInfo.repo;
	}

	return attrs;
}
