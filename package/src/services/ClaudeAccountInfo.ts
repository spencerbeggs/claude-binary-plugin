import type { Effect } from "effect";
import { Context } from "effect";

export interface ClaudeAccountInfoData {
	accountUuid: string | null;
	organizationUuid: string | null;
	emailAddress: string | null;
	displayName: string | null;
	organizationName: string | null;
	isValid: boolean;
}

export class ClaudeAccountInfo extends Context.Tag("ClaudeAccountInfo")<
	ClaudeAccountInfo,
	{
		readonly detect: Effect.Effect<ClaudeAccountInfoData>;
	}
>() {}
