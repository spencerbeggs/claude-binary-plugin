/**
 * Detect git and GitHub defaults for scaffold prefilling.
 *
 * Fallback chain:
 *   1. git config (user.name, user.email, remote.origin.url)
 *   2. gh CLI (gh api user — requires authentication)
 *   3. Empty strings
 */

export interface DetectedDefaults {
	name: string;
	email: string;
	githubOwner: string;
}

/** Parse GitHub owner from a remote URL (SSH or HTTPS). */
function parseGithubOwner(url: string): string {
	const sshMatch = url.match(/git@github\.com:([^/]+)\//);
	const httpsMatch = url.match(/github\.com\/([^/]+)\//);
	return sshMatch?.[1] ?? httpsMatch?.[1] ?? "";
}

/** Try detecting defaults from git config. */
async function fromGitConfig(): Promise<Partial<DetectedDefaults>> {
	const [nameResult, emailResult, remoteResult] = await Promise.allSettled([
		Bun.$`git config user.name`.quiet().text(),
		Bun.$`git config user.email`.quiet().text(),
		Bun.$`git config --get remote.origin.url`.quiet().text(),
	]);

	return {
		name: nameResult.status === "fulfilled" ? nameResult.value.trim() : undefined,
		email: emailResult.status === "fulfilled" ? emailResult.value.trim() : undefined,
		githubOwner:
			remoteResult.status === "fulfilled" ? parseGithubOwner(remoteResult.value.trim()) || undefined : undefined,
	};
}

/** Try detecting defaults from the GitHub CLI (`gh`). */
async function fromGhCli(): Promise<Partial<DetectedDefaults>> {
	try {
		const json = await Bun.$`gh api user --jq '{login: .login, name: .name, email: .email}'`.quiet().text();
		const user = JSON.parse(json.trim()) as { login?: string; name?: string; email?: string };
		return {
			name: user.name || undefined,
			email: user.email || undefined,
			githubOwner: user.login || undefined,
		};
	} catch {
		// gh not installed or not authenticated
		return {};
	}
}

/**
 * Detect author name, email, and GitHub owner.
 *
 * Prefers git config values since they reflect the user's local setup.
 * Falls back to `gh api user` for any missing fields.
 */
export async function detectDefaults(): Promise<DetectedDefaults> {
	const [gitDefaults, ghDefaults] = await Promise.all([fromGitConfig(), fromGhCli()]);

	return {
		name: gitDefaults.name || ghDefaults.name || "",
		email: gitDefaults.email || ghDefaults.email || "",
		githubOwner: gitDefaults.githubOwner || ghDefaults.githubOwner || "",
	};
}
