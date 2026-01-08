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
 * Platform detection and socket path utilities.
 *
 * @remarks
 * Provides static methods for platform detection, socket path resolution,
 * and validation. All methods are stateless and can be called directly.
 *
 * @example
 * ```typescript
 * // Check platform support
 * if (Platform.isSupported()) {
 *   Platform.assertSupported(); // Throws on unsupported platforms
 * }
 *
 * // Get socket paths
 * const path = Platform.getSocketPath("/path/to/session-env");
 * const safePath = Platform.getSocketPathWithFallback(sessionEnvDir, sessionId);
 * ```
 *
 * @public
 */
export class Platform {
	/**
	 * Maximum socket path length for Unix sockets.
	 *
	 * @remarks
	 * Unix socket paths are limited to ~104-108 bytes depending on the OS.
	 * If the session-env path is too long, we fall back to /tmp.
	 *
	 * @public
	 */
	static readonly MAX_SOCKET_PATH_LENGTH = 100;

	/**
	 * Get the current platform identifier.
	 *
	 * @returns The platform string (e.g., "darwin", "linux", "win32")
	 *
	 * @example
	 * ```typescript
	 * const p = Platform.get();
	 * console.log(`Running on: ${p}`);
	 * ```
	 *
	 * @public
	 */
	static get(): PlatformType {
		return platform() as PlatformType;
	}

	/**
	 * Check if the current platform supports the OTEL sidecar.
	 *
	 * @returns `true` if the platform supports Unix sockets (darwin or linux)
	 *
	 * @example
	 * ```typescript
	 * if (Platform.isSupported()) {
	 *   // Safe to use sidecar
	 * }
	 * ```
	 *
	 * @public
	 */
	static isSupported(): boolean {
		const p = platform();
		return p === "darwin" || p === "linux";
	}

	/**
	 * Get a human-readable error message for unsupported platforms.
	 *
	 * @returns Error message explaining why the platform is unsupported
	 *
	 * @public
	 */
	static getError(): string {
		const p = platform();

		if (p === "win32") {
			return "OTEL sidecar is not supported on Windows. Unix sockets are required for IPC.";
		}

		return `OTEL sidecar is not supported on platform "${p}". Only macOS (darwin) and Linux are supported.`;
	}

	/**
	 * Assert that the current platform is supported.
	 *
	 * @throws Error if the platform does not support Unix sockets
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   Platform.assertSupported();
	 *   // Safe to proceed with sidecar
	 * } catch (e) {
	 *   console.error("Platform not supported:", e.message);
	 * }
	 * ```
	 *
	 * @public
	 */
	static assertSupported(): void {
		if (!Platform.isSupported()) {
			throw new Error(Platform.getError());
		}
	}

	/**
	 * Get the default socket path for a session.
	 *
	 * @remarks
	 * The socket is placed in the session's environment directory alongside
	 * debug logs and other session-specific files. This ensures automatic
	 * cleanup when the session ends.
	 *
	 * @param sessionEnvDir - The session environment directory path
	 * @returns The full path to the socket file
	 *
	 * @example
	 * ```typescript
	 * const socketPath = Platform.getSocketPath("/home/user/.claude/session-env/abc123");
	 * // Returns: "/home/user/.claude/session-env/abc123/otel.sock"
	 * ```
	 *
	 * @public
	 */
	static getSocketPath(sessionEnvDir: string): string {
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
	 * @example
	 * ```typescript
	 * const path = Platform.getSocketPathWithFallback(
	 *   "/very/long/path/to/session-env",
	 *   "abc-123-def-456"
	 * );
	 * ```
	 *
	 * @public
	 */
	static getSocketPathWithFallback(sessionEnvDir: string, sessionId: string): string {
		const preferredPath = Platform.getSocketPath(sessionEnvDir);

		if (preferredPath.length <= Platform.MAX_SOCKET_PATH_LENGTH) {
			return preferredPath;
		}

		// Fallback to /tmp with session ID
		// Truncate session ID if needed to stay within limits
		const prefix = "/tmp/claude-otel-";
		const suffix = ".sock";
		const maxIdLength = Platform.MAX_SOCKET_PATH_LENGTH - prefix.length - suffix.length;
		const truncatedId = sessionId.slice(0, maxIdLength);

		return `${prefix}${truncatedId}${suffix}`;
	}

	/**
	 * Check if a socket file exists.
	 *
	 * @param socketPath - Path to the socket file
	 * @returns `true` if the socket file exists
	 *
	 * @example
	 * ```typescript
	 * if (await Platform.socketExists(socketPath)) {
	 *   // Socket already exists, can connect
	 * }
	 * ```
	 *
	 * @public
	 */
	static async socketExists(socketPath: string): Promise<boolean> {
		return existsSync(socketPath);
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
