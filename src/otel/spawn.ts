/**
 * Sidecar process spawning utilities.
 *
 * Handles spawning the OTEL sidecar as a detached background process.
 * The sidecar runs independently and auto-terminates after idle timeout.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getSessionEnvDir, getSidecarIdleTimeout } from "./config.js";
import { ENV_VARS } from "./constants.js";
import { getSocketPathWithFallback } from "./platform.js";
import { getPluginInfo } from "./plugin-info.js";
import type { OTELConfig } from "./protocol.js";

/**
 * Result of attempting to spawn the sidecar.
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
 * Spawn the OTEL sidecar process.
 *
 * The sidecar is spawned as a detached process that:
 * - Listens on a Unix socket for IPC messages
 * - Auto-terminates after idle timeout
 * - Handles SIGTERM/SIGINT for graceful shutdown
 *
 * @param sessionId - The Claude Code session ID
 * @param config - OTEL configuration
 * @returns Spawn result with socket path if successful
 */
export async function spawnSidecar(sessionId: string, config: OTELConfig): Promise<SpawnResult> {
	// Find the plugin binary (sidecar is now part of the unified binary)
	const pluginPath = getPluginBinaryPath();
	if (!pluginPath) {
		return {
			success: false,
			error: "Plugin binary not found",
		};
	}

	// Determine socket path - use session env dir if available, otherwise fallback to /tmp
	const sessionEnvDir = getSessionEnvDir();
	const socketPath = sessionEnvDir
		? getSocketPathWithFallback(sessionEnvDir, sessionId)
		: `/tmp/claude-otel-${sessionId}.sock`;

	// Build environment for sidecar
	const sidecarEnv = buildSidecarEnv(sessionId, socketPath, config);

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
 * The plugin binary can run in sidecar mode with --sidecar flag.
 *
 * @returns Path to plugin binary, or null if not found
 */
export function getPluginBinaryPath(): string | null {
	const pluginRoot = Bun.env.CLAUDE_PLUGIN_ROOT;
	const pluginInfo = getPluginInfo();

	if (!pluginRoot || pluginInfo.name === "unknown") {
		return null;
	}

	// Use plugin name from getPluginInfo() (set at startup)
	const pluginPath = resolve(pluginRoot, `${pluginInfo.name}.plugin`);

	// Check if file exists using fs.existsSync (Bun.file().size doesn't throw for non-existent)
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
 */
function buildSidecarEnv(
	sessionId: string,
	socketPath: string,
	config: OTELConfig,
): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {
		// Inherit current environment
		...process.env,
		// Sidecar-specific vars
		[ENV_VARS.OTEL_SIDECAR_SOCKET]: socketPath,
		[ENV_VARS.OTEL_SIDECAR_SESSION_ID]: sessionId,
		[ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS]: String(getSidecarIdleTimeout()),
	};

	// Pass OTEL config as env vars
	if (config.endpoint) {
		env[ENV_VARS.OTEL_EXPORTER_ENDPOINT] = config.endpoint;
	}
	if (config.protocol) {
		env[ENV_VARS.OTEL_EXPORTER_PROTOCOL] = config.protocol;
	}
	if (config.serviceName) {
		env[ENV_VARS.OTEL_SERVICE_NAME] = config.serviceName;
	}
	if (config.headers) {
		// Convert headers object to comma-separated string
		const headerStr = Object.entries(config.headers)
			.map(([k, v]) => `${k}=${v}`)
			.join(",");
		env[ENV_VARS.OTEL_EXPORTER_HEADERS] = headerStr;
	}

	return env;
}

/**
 * Check if a sidecar socket already exists.
 *
 * @param socketPath - Path to check
 * @returns true if socket file exists
 */
export async function socketExists(socketPath: string): Promise<boolean> {
	const file = Bun.file(socketPath);
	return file.exists();
}
