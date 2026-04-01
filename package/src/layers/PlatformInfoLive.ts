import { existsSync } from "node:fs";
import { platform } from "node:os";
import { Effect, Layer, Option, Ref } from "effect";
import type { PlatformType } from "../services/PlatformInfo.js";
import { MAX_SOCKET_PATH_LENGTH, PlatformInfo } from "../services/PlatformInfo.js";

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

export const PlatformInfoLive = Layer.effect(
	PlatformInfo,
	Effect.gen(function* () {
		const currentPlatform = platform() as PlatformType;
		const isSupported = currentPlatform === "darwin" || currentPlatform === "linux";
		const terminalType = detectTerminalType();
		const claudeVersionCache = yield* Ref.make<Option.Option<string>>(Option.none());

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

		const socketExists = (path: string): Effect.Effect<boolean> => Effect.sync(() => existsSync(path));

		const claudeVersion: Effect.Effect<string> = Effect.gen(function* () {
			const cached = yield* Ref.get(claudeVersionCache);
			if (Option.isSome(cached)) {
				return cached.value;
			}
			const version = yield* Effect.sync(() => {
				try {
					const result = Bun.spawnSync(["claude", "--version"]);
					if (result.exitCode === 0) {
						const output = result.stdout.toString().trim();
						const match = output.match(/\d+\.\d+\.\d+/);
						if (match) {
							return match[0];
						}
					}
				} catch {
					// Command failed or not found
				}
				return "unknown";
			});
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
