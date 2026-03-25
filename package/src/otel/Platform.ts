import { existsSync } from "node:fs";
import { platform } from "node:os";

/**
 * Supported platforms for the OTEL sidecar.
 * @public
 */
export type SupportedPlatform = "darwin" | "linux";

/**
 * All known platform values from Node.js.
 * @public
 */
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

/**
 * Maximum socket path length for Unix sockets.
 *
 * @remarks
 * Unix socket paths are limited to ~104-108 bytes depending on the OS.
 * If the session-env path is too long, we fall back to /tmp.
 *
 * @public
 */
export const MAX_SOCKET_PATH_LENGTH = 100;

/**
 * Get the current platform identifier.
 *
 * @returns The platform string (e.g., "darwin", "linux", "win32")
 *
 * @public
 */
export function getPlatform(): PlatformType {
	return platform() as PlatformType;
}

/**
 * Check if the current platform supports the OTEL sidecar.
 *
 * @returns `true` if the platform supports Unix sockets (darwin or linux)
 *
 * @public
 */
export function isPlatformSupported(): boolean {
	const p = platform();
	return p === "darwin" || p === "linux";
}

/**
 * Assert that the current platform is supported.
 *
 * @throws Error if the platform does not support Unix sockets
 *
 * @public
 */
export function assertPlatformSupported(): void {
	if (!isPlatformSupported()) {
		const p = platform();

		let message: string;
		if (p === "win32") {
			message = "OTEL sidecar is not supported on Windows. Unix sockets are required for IPC.";
		} else {
			message = `OTEL sidecar is not supported on platform "${p}". Only macOS (darwin) and Linux are supported.`;
		}

		throw new Error(message);
	}
}

/**
 * Get the default socket path for a session.
 *
 * @param sessionEnvDir - The session environment directory path
 * @returns The full path to the socket file
 *
 * @public
 */
export function getSocketPath(sessionEnvDir: string): string {
	return `${sessionEnvDir}/otel.sock`;
}

/**
 * Get a socket path with fallback for long paths.
 *
 * @remarks
 * Unix socket paths are limited to ~100 bytes. If the session-env path
 * would exceed this limit, we fall back to /tmp with a truncated session ID.
 *
 * @param sessionEnvDir - The session environment directory path
 * @param sessionId - The session ID for fallback naming
 * @returns The socket path (session-env or /tmp fallback)
 *
 * @public
 */
export function getSocketPathWithFallback(sessionEnvDir: string, sessionId: string): string {
	const preferredPath = getSocketPath(sessionEnvDir);

	if (preferredPath.length <= MAX_SOCKET_PATH_LENGTH) {
		return preferredPath;
	}

	// Fallback to /tmp with session ID
	// Truncate session ID if needed to stay within limits
	const prefix = "/tmp/claude-otel-";
	const suffix = ".sock";
	const maxIdLength = MAX_SOCKET_PATH_LENGTH - prefix.length - suffix.length;
	const truncatedId = sessionId.slice(0, maxIdLength);

	return `${prefix}${truncatedId}${suffix}`;
}

/**
 * Check if a socket file exists.
 *
 * @param socketPath - Path to the socket file
 * @returns `true` if the socket file exists
 *
 * @public
 */
export async function socketExists(socketPath: string): Promise<boolean> {
	return existsSync(socketPath);
}
