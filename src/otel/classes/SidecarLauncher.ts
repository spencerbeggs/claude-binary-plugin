import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { OtelConfigData } from "./OtelConfig.js";
import { OtelConfig } from "./OtelConfig.js";
import { Platform } from "./Platform.js";
import { PluginInfo } from "./PluginInfo.js";
import { SessionEnv } from "./SessionEnv.js";

/**
 * Result of attempting to spawn the sidecar.
 * @public
 */
export interface SpawnResult {
	/** Whether the spawn was successful */
	success: boolean;
	/** Error message if spawn failed */
	error?: string;
	/** Path to the socket file */
	socketPath?: string;
}

/**
 * Sidecar process spawning utilities.
 *
 * @remarks
 * The sidecar is spawned as a detached process that:
 * - Listens on a Unix socket for IPC messages
 * - Auto-terminates after idle timeout
 * - Handles SIGTERM/SIGINT for graceful shutdown
 *
 * @example
 * ```typescript
 * // Spawn a sidecar
 * const result = await SidecarLauncher.spawn(sessionId, config);
 *
 * // Check if binary exists
 * const binaryPath = SidecarLauncher.getBinaryPath();
 * if (binaryPath) {
 *   console.log(`Plugin binary: ${binaryPath}`);
 * }
 * ```
 *
 * @public
 */
export class SidecarLauncher {
	/**
	 * Spawn the OTEL sidecar process.
	 *
	 * @remarks
	 * The sidecar is spawned as a detached process that:
	 * - Listens on a Unix socket for IPC messages
	 * - Auto-terminates after idle timeout (default: 5 minutes)
	 * - Handles SIGTERM/SIGINT for graceful shutdown
	 *
	 * @param sessionId - The Claude Code session ID
	 * @param config - OTEL configuration
	 * @returns Spawn result with socket path if successful
	 *
	 * @example
	 * ```typescript
	 * const result = await SidecarLauncher.spawn(sessionId, config);
	 * if (result.success) {
	 *   console.log(`Socket: ${result.socketPath}`);
	 * } else {
	 *   console.error(`Spawn failed: ${result.error}`);
	 * }
	 * ```
	 *
	 * @public
	 */
	static async spawn(sessionId: string, config: OtelConfigData): Promise<SpawnResult> {
		// Find the plugin binary (sidecar is now part of the unified binary)
		const pluginPath = SidecarLauncher.getBinaryPath();
		if (!pluginPath) {
			return {
				success: false,
				error: "Plugin binary not found",
			};
		}

		// Determine socket path - use session env dir if available, otherwise fallback to /tmp
		const sessionEnvDir = SessionEnv.getDir();
		const socketPath = sessionEnvDir
			? Platform.getSocketPathWithFallback(sessionEnvDir, sessionId)
			: `/tmp/claude-otel-${sessionId}.sock`;

		// Build environment for sidecar
		const sidecarEnv = SidecarLauncher.buildSidecarEnv(sessionId, socketPath, config);

		try {
			const proc = Bun.spawn({
				cmd: [pluginPath, "--sidecar"],
				env: sidecarEnv,
				stdio: ["ignore", "ignore", "ignore"],
			});

			// Unref so the hook process can exit without waiting for sidecar
			proc.unref();

			return {
				success: true,
				socketPath,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to spawn sidecar: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Get the path to the plugin binary.
	 *
	 * @remarks
	 * The plugin binary can run in sidecar mode with `--sidecar` flag.
	 * Requires `CLAUDE_PLUGIN_ROOT` to be set and plugin info to be initialized.
	 *
	 * @returns Path to plugin binary, or null if not found
	 *
	 * @example
	 * ```typescript
	 * const path = SidecarLauncher.getBinaryPath();
	 * if (path) {
	 *   console.log(`Binary: ${path}`);
	 * }
	 * ```
	 *
	 * @public
	 */
	static getBinaryPath(): string | null {
		const pluginRoot = Bun.env.CLAUDE_PLUGIN_ROOT;
		const pluginInfo = PluginInfo.get();

		if (!pluginRoot || pluginInfo.name === "unknown") {
			return null;
		}

		// Use plugin name from PluginInfo (set at startup)
		const pluginPath = resolve(pluginRoot, `${pluginInfo.name}.plugin`);

		// Check if file exists
		if (existsSync(pluginPath)) {
			return pluginPath;
		}

		return null;
	}

	/**
	 * Build environment variables for the sidecar process.
	 *
	 * @param sessionId - Session ID for correlation
	 * @param socketPath - Path to Unix socket
	 * @param config - OTEL configuration
	 * @returns Environment variables object
	 *
	 * @internal
	 */
	private static buildSidecarEnv(
		sessionId: string,
		socketPath: string,
		config: OtelConfigData,
	): Record<string, string | undefined> {
		const env: Record<string, string | undefined> = {
			// Inherit current environment
			...process.env,
			// Sidecar-specific vars
			[OtelConfig.ENV_VARS.OTEL_SIDECAR_SOCKET]: socketPath,
			[OtelConfig.ENV_VARS.OTEL_SIDECAR_SESSION_ID]: sessionId,
			[OtelConfig.ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS]: String(SessionEnv.getIdleTimeout()),
		};

		// Pass OTEL config as env vars
		if (config.endpoint) {
			env[OtelConfig.ENV_VARS.OTEL_EXPORTER_ENDPOINT] = config.endpoint;
		}
		if (config.protocol) {
			env[OtelConfig.ENV_VARS.OTEL_EXPORTER_PROTOCOL] = config.protocol;
		}
		if (config.serviceName) {
			env[OtelConfig.ENV_VARS.OTEL_SERVICE_NAME] = config.serviceName;
		}
		if (config.headers) {
			// Convert headers object to comma-separated string
			const headerStr = Object.entries(config.headers)
				.map(([k, v]) => `${k}=${v}`)
				.join(",");
			env[OtelConfig.ENV_VARS.OTEL_EXPORTER_HEADERS] = headerStr;
		}

		return env;
	}

	// Private constructor prevents instantiation
	private constructor() {}
}
