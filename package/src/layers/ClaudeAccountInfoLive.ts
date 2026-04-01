import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Option, Ref } from "effect";
import type { ClaudeAccountInfoData } from "../services/ClaudeAccountInfo.js";
import { ClaudeAccountInfo } from "../services/ClaudeAccountInfo.js";

const emptyInfo: ClaudeAccountInfoData = {
	accountUuid: null,
	organizationUuid: null,
	emailAddress: null,
	displayName: null,
	organizationName: null,
	isValid: false,
};

function readAccountInfo(): ClaudeAccountInfoData {
	try {
		const configPath = join(homedir(), ".claude.json");
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
			return {
				accountUuid,
				organizationUuid,
				emailAddress: config.oauthAccount.emailAddress ?? null,
				displayName: config.oauthAccount.displayName ?? null,
				organizationName: config.oauthAccount.organizationName ?? null,
				isValid: !!(accountUuid || organizationUuid),
			};
		}
	} catch {
		// File doesn't exist or is invalid - return empty info
	}

	return emptyInfo;
}

export const ClaudeAccountInfoLive = Layer.effect(
	ClaudeAccountInfo,
	Effect.gen(function* () {
		const cache = yield* Ref.make<Option.Option<ClaudeAccountInfoData>>(Option.none());

		return {
			detect: Effect.gen(function* () {
				const cached = yield* Ref.get(cache);
				if (Option.isSome(cached)) {
					return cached.value;
				}
				const info = yield* Effect.try({
					try: () => readAccountInfo(),
					catch: () => emptyInfo,
				});
				yield* Ref.set(cache, Option.some(info));
				return info;
			}),
		};
	}),
);
