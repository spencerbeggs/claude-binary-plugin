/**
 * Session environment utilities for OTEL telemetry.
 *
 * @remarks
 * Provides utilities for discovering session environment directories
 * and extracting session IDs from paths.
 *
 * @example
 * ```typescript
 * import { SessionEnv } from "claude-binary-plugin";
 *
 * const dir = SessionEnv.getDir();
 * if (dir) {
 *   const sessionId = SessionEnv.extractSessionId(dir);
 *   console.log(`Session: ${sessionId}`);
 * }
 * ```
 *
 * @public
 */

import { dirname } from "node:path";
import { OtelConfig } from "./OtelConfig.js";

/**
 * Session environment utilities.
 *
 * @remarks
 * The session environment directory contains session-specific files
 * like debug logs, environment variables, and the OTEL sidecar socket.
 *
 * @example
 * ```typescript
 * // Get session env directory
 * const dir = SessionEnv.getDir();
 * // Returns: "/Users/x/.claude/session-env/abc123"
 *
 * // Extract session ID from path
 * const sessionId = SessionEnv.extractSessionId(dir);
 * // Returns: "abc123"
 * ```
 *
 * @public
 */
export class SessionEnv {
	/**
	 * Get the session environment directory path.
	 *
	 * @remarks
	 * Discovers the session env directory by looking for any plugin-namespaced
	 * `*_SESSION_ENV_FILE` env var (e.g., `SAVVY_WORKFLOW_SESSION_ENV_FILE`)
	 * and extracting the directory path.
	 *
	 * @returns Session env directory path, or null if not available
	 *
	 * @example
	 * ```typescript
	 * const dir = SessionEnv.getDir();
	 * if (dir) {
	 *   const socketPath = Platform.getSocketPath(dir);
	 * }
	 * ```
	 *
	 * @public
	 */
	static getDir(): string | null {
		// Look for any *_SESSION_ENV_FILE env var (plugin-namespaced)
		// e.g., SAVVY_WORKFLOW_SESSION_ENV_FILE=/Users/x/.claude/session-env/abc123/hook-0.sh
		for (const [key, value] of Object.entries(Bun.env)) {
			if (key.endsWith("_SESSION_ENV_FILE") && value) {
				return dirname(value);
			}
		}
		return null;
	}

	/**
	 * Extract session ID from a session env directory path.
	 *
	 * @remarks
	 * The session env directory is typically:
	 * `/Users/x/.claude/session-env/{session-id}`
	 *
	 * Session IDs are UUIDs in the format:
	 * `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
	 *
	 * @param sessionEnvDir - Session env directory path
	 * @returns Session ID, or null if path doesn't match expected pattern
	 *
	 * @example
	 * ```typescript
	 * const id = SessionEnv.extractSessionId("/Users/x/.claude/session-env/abc-123-def");
	 * // Returns: "abc-123-def" if it's a valid UUID, null otherwise
	 * ```
	 *
	 * @public
	 */
	static extractSessionId(sessionEnvDir: string): string | null {
		// Session ID is the last path component
		const parts = sessionEnvDir.split("/").filter(Boolean);
		const lastPart = parts[parts.length - 1];
		// Basic UUID validation (session IDs are UUIDs)
		if (lastPart && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastPart)) {
			return lastPart;
		}
		return null;
	}

	/**
	 * Check if high-cardinality session ID should be included in telemetry.
	 *
	 * @remarks
	 * When enabled via `OTEL_INCLUDE_SESSION_ID=true`, the session ID
	 * will be included in telemetry attributes. This enables per-session
	 * analysis but increases cardinality.
	 *
	 * @returns `true` if session ID should be included
	 *
	 * @public
	 */
	static shouldIncludeSessionId(): boolean {
		return Bun.env[OtelConfig.ENV_VARS.OTEL_INCLUDE_SESSION_ID] === "true";
	}

	/**
	 * Get the sidecar idle timeout from environment.
	 *
	 * @remarks
	 * The sidecar will exit after this many milliseconds of inactivity.
	 * Configurable via `OTEL_SIDECAR_IDLE_TIMEOUT_MS` env var.
	 *
	 * @returns Idle timeout in milliseconds (default: 300000 = 5 minutes)
	 *
	 * @public
	 */
	static getIdleTimeout(): number {
		const envValue = Bun.env[OtelConfig.ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS];
		if (!envValue) return OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS;

		const parsed = Number.parseInt(envValue, 10);
		if (Number.isNaN(parsed) || parsed <= 0) {
			return OtelConfig.DEFAULTS.IDLE_TIMEOUT_MS;
		}

		return parsed;
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
