import { Effect, Layer } from "effect";
import type { PlatformType } from "../services/PlatformInfo.js";
import { PlatformInfo } from "../services/PlatformInfo.js";

export interface PlatformInfoTestOverrides {
	readonly platform?: PlatformType;
	readonly isSupported?: boolean;
	readonly terminalType?: string;
	readonly claudeVersion?: string;
}

export const makePlatformInfoTest = (overrides: PlatformInfoTestOverrides = {}) => {
	const { platform = "darwin", isSupported = true, terminalType = "iTerm", claudeVersion = "1.0.0" } = overrides;

	return Layer.succeed(PlatformInfo, {
		platform,
		isSupported,
		terminalType,
		getSocketPath: (sessionEnvDir: string) => `${sessionEnvDir}/otel.sock`,
		getSocketPathWithFallback: (sessionEnvDir: string, sessionId: string) => {
			const preferredPath = `${sessionEnvDir}/otel.sock`;
			if (preferredPath.length <= 100) {
				return preferredPath;
			}
			const prefix = "/tmp/claude-otel-";
			const suffix = ".sock";
			const maxIdLength = 100 - prefix.length - suffix.length;
			const truncatedId = sessionId.slice(0, maxIdLength);
			return `${prefix}${truncatedId}${suffix}`;
		},
		socketExists: (_path: string) => Effect.succeed(false),
		claudeVersion: Effect.succeed(claudeVersion),
	});
};
