import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Claude account information data.
 * @public
 */
export interface ClaudeAccountInfoData {
	/** User account UUID */
	accountUuid: string | null;
	/** Organization UUID */
	organizationUuid: string | null;
	/** User email address */
	emailAddress: string | null;
	/** Display name */
	displayName: string | null;
	/** Organization name */
	organizationName: string | null;
	/** Whether this account info has any valid data (at least one UUID is present) */
	isValid: boolean;
}

/**
 * Cached instance to avoid repeated file reads.
 * @internal
 */
let _cached: ClaudeAccountInfoData | null = null;

/**
 * Detect Claude account info from ~/.claude.json.
 *
 * @remarks
 * Reads the oauthAccount fields from the Claude config file.
 * Results are cached for the lifetime of the process.
 *
 * @returns Account info data (with null values if file doesn't exist)
 *
 * @example
 * ```typescript
 * const info = detectClaudeAccountInfo();
 * if (info.accountUuid) {
 *   console.log(`Logged in as: ${info.displayName}`);
 * } else {
 *   console.log("Not logged in");
 * }
 * ```
 *
 * @public
 */
export function detectClaudeAccountInfo(): ClaudeAccountInfoData {
	if (_cached) {
		return _cached;
	}

	const emptyInfo: ClaudeAccountInfoData = {
		accountUuid: null,
		organizationUuid: null,
		emailAddress: null,
		displayName: null,
		organizationName: null,
		isValid: false,
	};

	try {
		const configPath = join(homedir(), ".claude.json");

		// Synchronous read - we cache this so it only happens once
		const content = readFileSync(configPath, "utf-8");
		const config = JSON.parse(content) as {
			oauthAccount?: {
				accountUuid?: string;
				organizationUuid?: string;
				emailAddress?: string;
				displayName?: string;
				organizationName?: string;
			};
		};

		if (config.oauthAccount) {
			const accountUuid = config.oauthAccount.accountUuid ?? null;
			const organizationUuid = config.oauthAccount.organizationUuid ?? null;
			_cached = {
				accountUuid,
				organizationUuid,
				emailAddress: config.oauthAccount.emailAddress ?? null,
				displayName: config.oauthAccount.displayName ?? null,
				organizationName: config.oauthAccount.organizationName ?? null,
				isValid: !!(accountUuid || organizationUuid),
			};
			return _cached;
		}
	} catch {
		// File doesn't exist or is invalid - return empty info
	}

	_cached = emptyInfo;
	return _cached;
}

/**
 * Clear the cached account info.
 *
 * @remarks
 * Useful for testing or when the config file changes.
 *
 * @public
 */
export function clearClaudeAccountInfoCache(): void {
	_cached = null;
}
