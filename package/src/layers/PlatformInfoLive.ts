import { platform } from "node:os";
import { FileSystem } from "@effect/platform";
import { Effect, Layer, Option, Ref } from "effect";
import type { PlatformType } from "../services/PlatformInfo.js";
import { MAX_SOCKET_PATH_LENGTH, PlatformInfo } from "../services/PlatformInfo.js";
import { ShellExecutor } from "../services/ShellExecutor.js";

const TERMINAL_TYPE_MAP: Record<string, string> = {
	iTerm: "iTerm",
	"iTerm.app": "iTerm",
	Apple_Terminal: "Terminal",
	vscode: "VSCode",
	cursor: "Cursor",
	Hyper: "Hyper",
	Alacritty: "Alacritty",
	WezTerm: "WezTerm",
	kitty: "kitty",
};

function detectTerminalType(): string {
	if (Bun.env.TMUX) return "tmux";
	if (Bun.env.STY) return "screen";
	const termProgram = Bun.env.TERM_PROGRAM;
	if (termProgram) {
		return TERMINAL_TYPE_MAP[termProgram] ?? termProgram;
	}
	if (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.VSCODE_INJECTION) return "VSCode";
	if (Bun.env.CURSOR_TRACE_ID) return "Cursor";
	return "unknown";
}

export const PlatformInfoLive: Layer.Layer<PlatformInfo, never, ShellExecutor | FileSystem.FileSystem> = Layer.effect(
	PlatformInfo,
	Effect.gen(function* () {
		const currentPlatform = platform() as PlatformType;
		const isSupported = currentPlatform === "darwin" || currentPlatform === "linux";
		const terminalType = detectTerminalType();
		const claudeVersionCache = yield* Ref.make<Option.Option<string>>(Option.none());
		const fs = yield* FileSystem.FileSystem;
		const shell = yield* ShellExecutor;

		const getSocketPath = (sessionEnvDir: string): string => `${sessionEnvDir}/otel.sock`;

		const getSocketPathWithFallback = (sessionEnvDir: string, sessionId: string): string => {
			const preferredPath = getSocketPath(sessionEnvDir);
			if (preferredPath.length <= MAX_SOCKET_PATH_LENGTH) {
				return preferredPath;
			}
			const prefix = "/tmp/claude-otel-";
			const suffix = ".sock";
			const maxIdLength = MAX_SOCKET_PATH_LENGTH - prefix.length - suffix.length;
			const truncatedId = sessionId.slice(0, maxIdLength);
			return `${prefix}${truncatedId}${suffix}`;
		};

		const socketExists = (path: string): Effect.Effect<boolean> =>
			fs.exists(path).pipe(Effect.catchAll(() => Effect.succeed(false)));

		const claudeVersion: Effect.Effect<string> = Effect.gen(function* () {
			const cached = yield* Ref.get(claudeVersionCache);
			if (Option.isSome(cached)) return cached.value;
			const version = yield* shell.exec("claude --version").pipe(
				Effect.map((result) => {
					const match = result.stdout.match(/\d+\.\d+\.\d+/);
					return match ? match[0] : "unknown";
				}),
				Effect.catchAll(() => Effect.succeed("unknown")),
			);
			yield* Ref.set(claudeVersionCache, Option.some(version));
			return version;
		});

		return {
			platform: currentPlatform,
			isSupported,
			getSocketPath,
			getSocketPathWithFallback,
			socketExists,
			claudeVersion,
			terminalType,
		};
	}),
);
