import type { Effect } from "effect";
import { Context } from "effect";

export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export interface GitInfoData {
	branch?: string | undefined;
	provider?: GitProvider | undefined;
	owner?: string | undefined;
	repo?: string | undefined;
}

export class GitInfo extends Context.Tag("GitInfo")<
	GitInfo,
	{
		readonly detect: Effect.Effect<GitInfoData>;
		readonly toAttributes: (info: GitInfoData) => Record<string, string>;
	}
>() {}

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
 * @public
 */
export function parseGitRemoteUrl(remoteUrl: string): Pick<GitInfoData, "provider" | "owner" | "repo"> {
	if (!remoteUrl) return {};

	try {
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
