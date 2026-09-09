import { Effect, Layer } from "effect";
import type { ClaudeAccountInfoData } from "../services/ClaudeAccountInfo.js";
import { ClaudeAccountInfo } from "../services/ClaudeAccountInfo.js";

const defaultData: ClaudeAccountInfoData = {
	accountUuid: null,
	organizationUuid: null,
	emailAddress: null,
	displayName: null,
	organizationName: null,
	isValid: false,
};

export const makeClaudeAccountInfoTest = (overrides?: Partial<ClaudeAccountInfoData>) => {
	const data: ClaudeAccountInfoData = { ...defaultData, ...overrides };
	return Layer.succeed(ClaudeAccountInfo, {
		detect: Effect.succeed(data),
	});
};
