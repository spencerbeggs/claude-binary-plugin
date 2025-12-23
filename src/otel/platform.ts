/**
 * Platform detection utilities for OTEL sidecar.
 *
 * The sidecar uses Unix sockets for IPC, which are only available on
 * macOS and Linux. Windows support may be added later using named pipes.
 *
 * @module
 */

import { platform } from "node:os";

/**
 * Supported platforms for the OTEL sidecar.
 */
export type SupportedPlatform = "darwin" | "linux";

/**
 * All known platform values from Node.js.
 */
export type Platform =
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
 * Check if the current platform supports the OTEL sidecar.
 *
 * @returns true if the platform supports Unix sockets (darwin or linux)
 */
export function isPlatformSupported(): boolean {
	const p = platform();
	return p === "darwin" || p === "linux";
}

/**
 * Get the current platform identifier.
 *
 * @returns The platform string (e.g., "darwin", "linux", "win32")
 */
export function getPlatform(): Platform {
	return platform() as Platform;
}

/**
 * Get a human-readable error message for unsupported platforms.
 *
 * @returns Error message explaining why the platform is unsupported
 */
export function getPlatformError(): string {
	const p = platform();

	if (p === "win32") {
		return "OTEL sidecar is not supported on Windows. Unix sockets are required for IPC.";
	}

	return `OTEL sidecar is not supported on platform "${p}". Only macOS (darwin) and Linux are supported.`;
}

/**
 * Assert that the current platform is supported.
 * Throws an error if the platform is unsupported.
 *
 * @throws Error if the platform does not support Unix sockets
 */
export function assertPlatformSupported(): void {
	if (!isPlatformSupported()) {
		throw new Error(getPlatformError());
	}
}

/**
 * Get the default socket path for a session.
 *
 * The socket is placed in the session's environment directory alongside
 * debug logs and other session-specific files. This ensures automatic
 * cleanup when the session ends.
 *
 * @param sessionEnvDir - The session environment directory path
 * @returns The full path to the socket file
 */
export function getSocketPath(sessionEnvDir: string): string {
	return `${sessionEnvDir}/otel.sock`;
}

/**
 * Maximum socket path length for Unix sockets.
 *
 * Unix socket paths are limited to ~104-108 bytes depending on the OS.
 * If the session-env path is too long, we fall back to /tmp.
 */
export const MAX_SOCKET_PATH_LENGTH = 100;

/**
 * Get a socket path with fallback for long paths.
 *
 * @param sessionEnvDir - The session environment directory path
 * @param sessionId - The session ID for fallback naming
 * @returns The socket path (session-env or /tmp fallback)
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
