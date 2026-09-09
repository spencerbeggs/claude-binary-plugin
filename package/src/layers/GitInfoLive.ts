import { Effect, Layer, Option, Ref } from "effect";
import type { GitInfoData } from "../services/GitInfo.js";
import { GitInfo, gitInfoToAttributes, parseGitRemoteUrl } from "../services/GitInfo.js";
import { ShellExecutor } from "../services/ShellExecutor.js";

const getShellOutput = (result: Option.Option<{ exitCode: number; stdout: string }>): string | undefined => {
	if (Option.isNone(result)) return undefined;
	const r = result.value;
	return r.exitCode === 0 ? r.stdout.trim() || undefined : undefined;
};

export const GitInfoLive = Layer.effect(
	GitInfo,
	Effect.gen(function* () {
		const shell = yield* ShellExecutor;
		const cache = yield* Ref.make<Option.Option<GitInfoData>>(Option.none());

		const detectImpl: Effect.Effect<GitInfoData> = Effect.gen(function* () {
			const cached = yield* Ref.get(cache);
			if (Option.isSome(cached)) {
				return cached.value;
			}

			const cwd = Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();

			const branchOpt = yield* shell.exec(`git -C ${cwd} branch --show-current`).pipe(Effect.option);
			const remoteOpt = yield* shell.exec(`git -C ${cwd} remote get-url origin`).pipe(Effect.option);

			const branchResult = getShellOutput(branchOpt);
			const remoteResult = getShellOutput(remoteOpt);

			const remoteInfo = remoteResult ? parseGitRemoteUrl(remoteResult) : {};

			const info: GitInfoData = {
				branch: branchResult,
				...remoteInfo,
			};

			yield* Ref.set(cache, Option.some(info));

			return info;
		});

		return {
			detect: detectImpl,
			toAttributes: gitInfoToAttributes,
		};
	}),
);
