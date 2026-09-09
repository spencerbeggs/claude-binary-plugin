import type { Effect } from "effect";
import { Context } from "effect";

export type SupportedPlatform = "darwin" | "linux";

export type PlatformType =
	| SupportedPlatform
	| "win32"
	| "freebsd"
	| "openbsd"
	| "sunos"
	| "aix"
	| "android"
	| "cygwin"
	| "netbsd"
	| "haiku";

export const MAX_SOCKET_PATH_LENGTH = 100;

export class PlatformInfo extends Context.Tag("PlatformInfo")<
	PlatformInfo,
	{
		readonly platform: PlatformType;
		readonly isSupported: boolean;
		readonly getSocketPath: (sessionEnvDir: string) => string;
		readonly getSocketPathWithFallback: (sessionEnvDir: string, sessionId: string) => string;
		readonly socketExists: (path: string) => Effect.Effect<boolean>;
		readonly claudeVersion: Effect.Effect<string>;
		readonly terminalType: string;
	}
>() {}
