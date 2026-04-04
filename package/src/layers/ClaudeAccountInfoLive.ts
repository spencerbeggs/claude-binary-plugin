import { homedir } from "node:os";
import { join } from "node:path";
import { FileSystem } from "@effect/platform";
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

const readAccountInfo = (fs: FileSystem.FileSystem): Effect.Effect<ClaudeAccountInfoData> => {
	const configPath = join(homedir(), ".claude.json");
	return fs.readFileString(configPath, "utf-8").pipe(
		Effect.flatMap((content) =>
			Effect.try(
				() =>
					JSON.parse(content) as {
						oauthAccount?: {
							accountUuid?: string;
							organizationUuid?: string;
							emailAddress?: string;
							displayName?: string;
							organizationName?: string;
						};
					},
			),
		),
		Effect.map((config) => {
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
				} satisfies ClaudeAccountInfoData;
			}
			return emptyInfo;
		}),
		Effect.catchAll(() => Effect.succeed(emptyInfo)),
	);
};

export const ClaudeAccountInfoLive: Layer.Layer<ClaudeAccountInfo, never, FileSystem.FileSystem> = Layer.effect(
	ClaudeAccountInfo,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const cache = yield* Ref.make<Option.Option<ClaudeAccountInfoData>>(Option.none());

		return {
			detect: Effect.gen(function* () {
				const cached = yield* Ref.get(cache);
				if (Option.isSome(cached)) {
					return cached.value;
				}
				const info = yield* readAccountInfo(fs);
				yield* Ref.set(cache, Option.some(info));
				return info;
			}),
		};
	}),
);
