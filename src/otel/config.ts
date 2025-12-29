/**
 * OTEL configuration parsing utilities.
 *
 * Reads OTEL configuration from environment variables and provides
 * utilities for checking if telemetry is enabled.
 *
 * @module
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULTS, ENV_VARS } from "./constants.js";
import { isPlatformSupported } from "./platform.js";
import type { OTELConfig } from "./protocol.js";

/**
 * Claude account info from ~/.claude.json
 */
export interface ClaudeAccountInfo {
	/** User account UUID */
	accountUuid: string | null;
	/** Organization UUID */
	organizationUuid: string | null;
	/** User email address */
	emailAddress: string | null;
	/** Display name */
	displayName: string | null;
	/** Organization name */
	organizationName: string | null;
}

/** Cached account info to avoid repeated file reads */
let cachedAccountInfo: ClaudeAccountInfo | null = null;

/**
 * Read Claude account info from ~/.claude.json
 *
 * This reads the oauthAccount fields that contain user and organization identifiers.
 * Results are cached for the lifetime of the process.
 *
 * @returns Account info, or null values if file doesn't exist or is invalid
 */
export function getClaudeAccountInfo(): ClaudeAccountInfo {
	if (cachedAccountInfo) {
		return cachedAccountInfo;
	}

	const emptyInfo: ClaudeAccountInfo = {
		accountUuid: null,
		organizationUuid: null,
		emailAddress: null,
		displayName: null,
		organizationName: null,
	};

	try {
		const configPath = join(homedir(), ".claude.json");

		// Synchronous read - we cache this so it only happens once
		// Use sync approach to avoid async complexity in parseOTELConfig
		const content = require("node:fs").readFileSync(configPath, "utf-8") as string;
		const config = JSON.parse(content) as {
			oauthAccount?: {
				accountUuid?: string;
				organizationUuid?: string;
				emailAddress?: string;
				displayName?: string;
				organizationName?: string;
			};
		};

		if (config.oauthAccount) {
			cachedAccountInfo = {
				accountUuid: config.oauthAccount.accountUuid ?? null,
				organizationUuid: config.oauthAccount.organizationUuid ?? null,
				emailAddress: config.oauthAccount.emailAddress ?? null,
				displayName: config.oauthAccount.displayName ?? null,
				organizationName: config.oauthAccount.organizationName ?? null,
			};
			return cachedAccountInfo;
		}
	} catch {
		// File doesn't exist or is invalid - return empty info
	}

	cachedAccountInfo = emptyInfo;
	return cachedAccountInfo;
}

/**
 * Clear the cached account info.
 * Useful for testing or when the config file changes.
 */
export function clearAccountInfoCache(): void {
	cachedAccountInfo = null;
}

/**
 * Check if OTEL telemetry is enabled.
 *
 * Telemetry is enabled when:
 * 1. CLAUDE_CODE_ENABLE_TELEMETRY=1
 * 2. Platform supports Unix sockets (darwin/linux)
 *
 * @returns true if telemetry should be collected
 * @public
 */
export function isOTELEnabled(): boolean {
	return Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1" && isPlatformSupported();
}

/**
 * Parse OTEL configuration from environment variables.
 *
 * @returns Parsed OTEL configuration
 * @public
 */
export function parseOTELConfig(): OTELConfig {
	const config: OTELConfig = {};

	// Endpoint
	const endpoint = Bun.env[ENV_VARS.OTEL_EXPORTER_ENDPOINT];
	if (endpoint) {
		config.endpoint = endpoint;
	}

	// Protocol
	const protocol = Bun.env[ENV_VARS.OTEL_EXPORTER_PROTOCOL];
	if (protocol === "http" || protocol === "grpc") {
		config.protocol = protocol;
	}

	// Service name
	const serviceName = Bun.env[ENV_VARS.OTEL_SERVICE_NAME];
	if (serviceName) {
		config.serviceName = serviceName;
	}

	// Plugin name is set via setPluginInfo() at startup, not from env vars
	// See getPluginInfo() for the current plugin info

	// Headers (comma-separated key=value pairs)
	const headersStr = Bun.env[ENV_VARS.OTEL_EXPORTER_HEADERS];
	if (headersStr) {
		config.headers = parseHeaders(headersStr);
	}

	// Add Claude account info as resource attributes
	// These align with Anthropic's native OTEL schema (organization.id, user.account_uuid)
	const accountInfo = getClaudeAccountInfo();
	const resourceAttrs: Record<string, string> = {};

	if (accountInfo.organizationUuid) {
		resourceAttrs["organization.id"] = accountInfo.organizationUuid;
	}
	if (accountInfo.accountUuid) {
		resourceAttrs["user.account_uuid"] = accountInfo.accountUuid;
	}

	// Only add resourceAttributes if we have any
	if (Object.keys(resourceAttrs).length > 0) {
		config.resourceAttributes = {
			...config.resourceAttributes,
			...resourceAttrs,
		};
	}

	return config;
}

/**
 * Parse headers from comma-separated key=value string.
 *
 * @param headersStr - Comma-separated key=value pairs (e.g., "Authorization=Bearer token,X-Custom=value")
 * @returns Parsed headers object
 */
function parseHeaders(headersStr: string): Record<string, string> {
	const headers: Record<string, string> = {};

	for (const pair of headersStr.split(",")) {
		const [key, ...valueParts] = pair.split("=");
		if (key && valueParts.length > 0) {
			// Rejoin value parts in case value contains '='
			headers[key.trim()] = valueParts.join("=").trim();
		}
	}

	return headers;
}

/**
 * Get the session environment directory path.
 *
 * This is where the sidecar socket file will be placed,
 * alongside debug logs and other session-specific files.
 *
 * Discovers the session env directory by looking for any plugin-namespaced
 * `*_SESSION_ENV_FILE` env var (e.g., `SAVVY_WORKFLOW_SESSION_ENV_FILE`)
 * and extracting the directory path.
 *
 * @returns Session env directory path, or null if not available
 * @public
 */
export function getSessionEnvDir(): string | null {
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
 * The session env directory is typically:
 * `/Users/x/.claude/session-env/{session-id}`
 *
 * @param sessionEnvDir - Session env directory path
 * @returns Session ID, or null if path doesn't match expected pattern
 */
export function extractSessionIdFromPath(sessionEnvDir: string): string | null {
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
 * @returns true if session ID should be included
 */
export function shouldIncludeSessionId(): boolean {
	return Bun.env[ENV_VARS.OTEL_INCLUDE_SESSION_ID] === "true";
}

/**
 * Get the sidecar idle timeout from environment.
 *
 * @returns Idle timeout in milliseconds
 */
export function getSidecarIdleTimeout(): number {
	const envValue = Bun.env[ENV_VARS.OTEL_SIDECAR_IDLE_TIMEOUT_MS];
	if (!envValue) return DEFAULTS.IDLE_TIMEOUT_MS;

	const parsed = Number.parseInt(envValue, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return DEFAULTS.IDLE_TIMEOUT_MS;
	}

	return parsed;
}

/** Cached Claude Code version to avoid repeated subprocess calls */
let cachedClaudeVersion: string | null = null;

/**
 * Detect the Claude Code binary version.
 *
 * Parses output from `claude --version` to extract the version number.
 * Results are cached for the lifetime of the process.
 *
 * @returns Claude Code version (e.g., "1.0.30"), or "unknown" if detection fails
 */
export function getClaudeVersion(): string {
	if (cachedClaudeVersion !== null) {
		return cachedClaudeVersion;
	}

	try {
		// Synchronous subprocess call - we cache this so it only happens once
		const result = Bun.spawnSync(["claude", "--version"]);
		if (result.exitCode === 0) {
			const output = result.stdout.toString().trim();
			// Extract version number (e.g., "1.0.30" from "claude 1.0.30")
			const match = output.match(/\d+\.\d+\.\d+/);
			if (match) {
				cachedClaudeVersion = match[0];
				return cachedClaudeVersion;
			}
		}
	} catch {
		// Command failed or not found
	}

	cachedClaudeVersion = "unknown";
	return cachedClaudeVersion;
}

/**
 * Clear the cached Claude version.
 * Useful for testing.
 */
export function clearClaudeVersionCache(): void {
	cachedClaudeVersion = null;
}

/**
 * Known terminal type mappings from TERM_PROGRAM values.
 * Values should match Anthropic's native telemetry casing.
 */
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

/**
 * Detect the terminal type from environment variables.
 *
 * Checks TERM_PROGRAM and other indicators to determine the terminal.
 * Aligns with Anthropic's terminal.type attribute values.
 *
 * @returns Terminal type (e.g., "iTerm", "vscode", "cursor", "tmux"), or "unknown"
 */
export function getTerminalType(): string {
	// Check for tmux first (can be nested in any terminal)
	if (Bun.env.TMUX) {
		return "tmux";
	}

	// Check for screen
	if (Bun.env.STY) {
		return "screen";
	}

	// Check TERM_PROGRAM for common terminals
	const termProgram = Bun.env.TERM_PROGRAM;
	if (termProgram) {
		const mapped = TERMINAL_TYPE_MAP[termProgram];
		if (mapped) {
			return mapped;
		}
		// Return the value as-is if not in map (preserve original casing)
		return termProgram;
	}

	// Check for VS Code specific indicators
	if (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.VSCODE_INJECTION) {
		return "VSCode";
	}

	// Check for Cursor specific indicators
	if (Bun.env.CURSOR_TRACE_ID) {
		return "Cursor";
	}

	return "unknown";
}
