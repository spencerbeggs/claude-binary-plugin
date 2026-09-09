import { Effect, Layer } from "effect";
import { ShellExecutor, ShellResult } from "../services/ShellExecutor.js";

export const makeShellExecutorTest = (responses?: Map<string, ShellResult>) => {
	const commands: string[] = [];
	return {
		commands,
		layer: Layer.succeed(ShellExecutor, {
			exec: (cmd: string) => {
				commands.push(cmd);
				if (responses) {
					for (const [pattern, result] of responses) {
						if (cmd.includes(pattern)) return Effect.succeed(result);
					}
				}
				return Effect.succeed(new ShellResult({ exitCode: 0, stdout: "", stderr: "" }));
			},
		}),
	};
};
