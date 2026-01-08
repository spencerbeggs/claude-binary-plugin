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
}

/**
 * Claude account information for telemetry.
 *
 * @remarks
 * Represents account info read from ~/.claude.json. Used to add
 * user and organization identifiers to OTEL resource attributes.
 *
 * @example
 * ```typescript
 * // Detect account info (cached)
 * const info = ClaudeAccountInfo.detect();
 *
 * // Use in telemetry
 * if (info.organizationUuid) {
 *   attributes["organization.id"] = info.organizationUuid;
 * }
 * if (info.accountUuid) {
 *   attributes["user.account_uuid"] = info.accountUuid;
 * }
 * ```
 *
 * @public
 */
export class ClaudeAccountInfo {
	/**
	 * User account UUID.
	 * @public
	 */
	readonly accountUuid: string | null;

	/**
	 * Organization UUID.
	 * @public
	 */
	readonly organizationUuid: string | null;

	/**
	 * User email address.
	 * @public
	 */
	readonly emailAddress: string | null;

	/**
	 * Display name.
	 * @public
	 */
	readonly displayName: string | null;

	/**
	 * Organization name.
	 * @public
	 */
	readonly organizationName: string | null;

	/**
	 * Cached instance to avoid repeated file reads.
	 * @internal
	 */
	private static _cached: ClaudeAccountInfo | null = null;

	/**
	 * Create a ClaudeAccountInfo instance.
	 *
	 * @param data - Account info data
	 *
	 * @remarks
	 * Typically you should use `ClaudeAccountInfo.detect()` rather than
	 * constructing instances directly.
	 *
	 * @public
	 */
	constructor(data: ClaudeAccountInfoData) {
		this.accountUuid = data.accountUuid;
		this.organizationUuid = data.organizationUuid;
		this.emailAddress = data.emailAddress;
		this.displayName = data.displayName;
		this.organizationName = data.organizationName;
	}

	/**
	 * Detect Claude account info from ~/.claude.json.
	 *
	 * @remarks
	 * Reads the oauthAccount fields from the Claude config file.
	 * Results are cached for the lifetime of the process.
	 *
	 * @returns Account info instance (with null values if file doesn't exist)
	 *
	 * @example
	 * ```typescript
	 * const info = ClaudeAccountInfo.detect();
	 * if (info.accountUuid) {
	 *   console.log(`Logged in as: ${info.displayName}`);
	 * } else {
	 *   console.log("Not logged in");
	 * }
	 * ```
	 *
	 * @public
	 */
	static detect(): ClaudeAccountInfo {
		if (ClaudeAccountInfo._cached) {
			return ClaudeAccountInfo._cached;
		}

		const emptyInfo: ClaudeAccountInfoData = {
			accountUuid: null,
			organizationUuid: null,
			emailAddress: null,
			displayName: null,
			organizationName: null,
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
				ClaudeAccountInfo._cached = new ClaudeAccountInfo({
					accountUuid: config.oauthAccount.accountUuid ?? null,
					organizationUuid: config.oauthAccount.organizationUuid ?? null,
					emailAddress: config.oauthAccount.emailAddress ?? null,
					displayName: config.oauthAccount.displayName ?? null,
					organizationName: config.oauthAccount.organizationName ?? null,
				});
				return ClaudeAccountInfo._cached;
			}
		} catch {
			// File doesn't exist or is invalid - return empty info
		}

		ClaudeAccountInfo._cached = new ClaudeAccountInfo(emptyInfo);
		return ClaudeAccountInfo._cached;
	}

	/**
	 * Clear the cached account info.
	 *
	 * @remarks
	 * Useful for testing or when the config file changes.
	 *
	 * @public
	 */
	static clearCache(): void {
		ClaudeAccountInfo._cached = null;
	}

	/**
	 * Check if this account info has any valid data.
	 *
	 * @returns `true` if at least one field is populated
	 *
	 * @public
	 */
	get isValid(): boolean {
		return !!(this.accountUuid || this.organizationUuid);
	}
}
