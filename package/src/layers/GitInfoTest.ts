import { Effect, Layer } from "effect";
import type { GitInfoData } from "../services/GitInfo.js";
import { GitInfo, gitInfoToAttributes } from "../services/GitInfo.js";

export const makeGitInfoTest = (data?: GitInfoData) => {
	const info: GitInfoData = data ?? {};
	return {
		info,
		layer: Layer.succeed(GitInfo, {
			detect: Effect.succeed(info),
			toAttributes: gitInfoToAttributes,
		}),
	};
};
