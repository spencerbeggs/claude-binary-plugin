import { Effect, Layer } from "effect";
import { ShellError } from "../errors/ShellError.js";
import { ShellExecutor } from "../services/ShellExecutor.js";

export const ShellExecutorLive = Layer.succeed(ShellExecutor, {
	exec: (cmd: string) =>
		Effect.tryPromise({
			try: async () => {
				const result = await Bun.$`${{ raw: cmd }}`.quiet();
				return {
					exitCode: result.exitCode,
					stdout: result.stdout.toString(),
					stderr: result.stderr.toString(),
				};
			},
			catch: (cause) => {
				if (cause && typeof cause === "object" && "exitCode" in cause) {
					const shellErr = cause as { exitCode: number; stderr: { toString(): string } };
					return new ShellError({
						command: cmd,
						exitCode: shellErr.exitCode,
						stderr: shellErr.stderr.toString(),
					});
				}
				return new ShellError({ command: cmd, exitCode: 1, stderr: String(cause) });
			},
		}),
});
