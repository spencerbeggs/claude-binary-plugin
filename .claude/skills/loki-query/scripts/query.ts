#!/usr/bin/env bun
/**
 * Loki Query CLI - Bun-based tool for querying plugin telemetry
 *
 * Usage:
 *   bun .claude/skills/loki-query/scripts/query.ts <command> [options]
 *
 * Environment:
 *   LOKI_API_KEY - Required API key for authentication
 *   LOKI_URL - Optional URL override (default: https://logs.savvyweb.build)
 */

// =============================================================================
// Types
// =============================================================================

interface LokiQueryResponse {
	status: "success" | "error";
	data: {
		resultType: "streams" | "matrix" | "vector" | "scalar";
		result: LokiStream[];
	};
	error?: string;
}

interface LokiStream {
	stream: Record<string, string>;
	values: [string, string][]; // [timestamp_ns, log_line]
}

interface LokiLabelsResponse {
	status: "success" | "error";
	data: string[];
}

interface HookExecutionEvent {
	// Anthropic-aligned attributes
	session_id: string;
	app_version: string;
	organization_id?: string;
	user_account_uuid?: string;
	terminal_type?: string;
	duration_ms: string;
	source: "hook";

	// Event identification
	event_name: "claude_code.hook.execution";
	event_timestamp: string;
	scope_name: "systems.savvyweb.claude_code.events";

	// Hook-specific
	hook_name: string;
	hook_type: string;
	hook_outcome?: string;

	// Plugin metadata
	plugin_name: string;
	plugin_version: string;
	plugin_marketplace?: string;

	// PreToolUse specific
	tool_name?: string;
	permission_decision?: "allow" | "deny" | "ask";
	permission_decision_reason?: string;
	has_updated_input?: string;

	// PostToolUse specific
	has_additional_context?: string;
	decision?: "block";
	reason?: string;

	// Metrics
	metrics_contextTokens?: string;
	context_tokens?: string;

	// Other stream labels
	[key: string]: string | undefined;
}

// =============================================================================
// Configuration
// =============================================================================

const LOKI_URL = Bun.env.LOKI_URL ?? "https://logs.savvyweb.build";
const LOKI_API_KEY = Bun.env.LOKI_API_KEY;

if (!LOKI_API_KEY) {
	console.error("Error: LOKI_API_KEY not set. Add it to your .env file.");
	process.exit(1);
}

// =============================================================================
// Time Utilities
// =============================================================================

function nowNs(): string {
	return `${Date.now()}000000`;
}

function hoursAgoNs(hours: number): string {
	return `${Date.now() - hours * 60 * 60 * 1000}000000`;
}

function formatTimestamp(nsTimestamp: string): string {
	const ms = Number(nsTimestamp) / 1_000_000;
	return new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");
}

// =============================================================================
// API Functions
// =============================================================================

async function lokiQuery(endpoint: string, params: Record<string, string>): Promise<unknown> {
	const url = new URL(`${LOKI_URL}/loki/api/v1/${endpoint}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url.toString(), {
		headers: { "X-Api-Key": LOKI_API_KEY ?? "" },
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Loki API error (${response.status}): ${text}`);
	}

	return response.json();
}

async function queryRange(query: string, start: string, end: string, limit = 100): Promise<LokiQueryResponse> {
	return lokiQuery("query_range", {
		query,
		start,
		end,
		limit: String(limit),
	}) as Promise<LokiQueryResponse>;
}

async function getLabels(): Promise<LokiLabelsResponse> {
	return lokiQuery("labels", {}) as Promise<LokiLabelsResponse>;
}

async function getLabelValues(label: string): Promise<LokiLabelsResponse> {
	return lokiQuery(`label/${label}/values`, {}) as Promise<LokiLabelsResponse>;
}

// =============================================================================
// Plugin Telemetry Queries
// =============================================================================

const SAVVYWEB_SCOPE = "systems.savvyweb.claude_code.events";

async function getPluginHooks(hours: number, limit = 100): Promise<LokiStream[]> {
	// Loki has a 5000 entry limit, so cap at 4000 to leave room
	const fetchLimit = Math.min(limit * 5, 4000);
	const result = await queryRange('{service_name="claude-code"}', hoursAgoNs(hours), nowNs(), fetchLimit);
	return result.data.result.filter((s) => s.stream.scope_name === SAVVYWEB_SCOPE).slice(0, limit);
}

async function getPluginHooksByPlugin(pluginName: string, hours: number, limit = 100): Promise<LokiStream[]> {
	const hooks = await getPluginHooks(hours, limit * 2);
	return hooks.filter((s) => s.stream.plugin_name === pluginName).slice(0, limit);
}

async function getPluginHooksByType(hookType: string, hours: number, limit = 100): Promise<LokiStream[]> {
	const hooks = await getPluginHooks(hours, limit * 2);
	return hooks.filter((s) => s.stream.hook_type === hookType).slice(0, limit);
}

async function getHookErrors(hours: number, limit = 100): Promise<LokiStream[]> {
	const hooks = await getPluginHooks(hours, limit * 2);
	return hooks
		.filter(
			(s) =>
				s.stream.hook_outcome === "error" ||
				s.stream.severity_text === "ERROR" ||
				s.values.some(([, line]) => line.toLowerCase().includes("error")),
		)
		.slice(0, limit);
}

async function getClaudeCodeEvents(hours: number, limit = 100): Promise<LokiStream[]> {
	const result = await queryRange('{service_name="claude-code"}', hoursAgoNs(hours), nowNs(), limit);
	return result.data.result;
}

async function getSessionEvents(sessionId: string, hours: number, limit = 1000): Promise<LokiStream[]> {
	// First try with session_id label (if indexed)
	const result = await queryRange('{service_name="claude-code"}', hoursAgoNs(hours), nowNs(), limit * 2);
	return result.data.result.filter((s) => s.stream.session_id === sessionId).slice(0, limit);
}

// =============================================================================
// Output Formatters
// =============================================================================

function formatHookExecution(stream: LokiStream): string {
	const s = stream.stream as HookExecutionEvent;
	const duration = s.duration_ms ? `${s.duration_ms}ms` : "?ms";
	const outcome = s.hook_outcome ?? s.permission_decision ?? "completed";
	const tokens = s.metrics_contextTokens ?? s.context_tokens;
	const tokenInfo = tokens ? ` [${tokens} tokens]` : "";
	const tool = s.tool_name ?? "-";

	return `${formatTimestamp(stream.values[0]?.[0] ?? "0")} | ${s.plugin_name}:${s.hook_name} | ${s.hook_type} | ${tool} | ${outcome} | ${duration}${tokenInfo}`;
}

function formatEvent(stream: LokiStream): string {
	const s = stream.stream;
	const eventName = s.event_name ?? "unknown";
	const scope = s.scope_name === SAVVYWEB_SCOPE ? "plugin" : "claude";

	if (eventName === "claude_code.hook.execution") {
		return formatHookExecution(stream);
	}

	const timestamp = formatTimestamp(stream.values[0]?.[0] ?? "0");
	return `${timestamp} | [${scope}] ${eventName} | ${stream.values[0]?.[1]?.slice(0, 80) ?? ""}`;
}

function formatJson(streams: LokiStream[]): string {
	return JSON.stringify(streams, null, 2);
}

function formatTable(streams: LokiStream[]): string {
	if (streams.length === 0) return "No results found.";

	const lines = streams.map(formatEvent);
	return lines.join("\n");
}

function formatStats(streams: LokiStream[]): string {
	const pluginHooks = streams.filter((s) => s.stream.scope_name === SAVVYWEB_SCOPE);
	const byPlugin = new Map<string, number>();
	const byHookType = new Map<string, number>();
	const byTool = new Map<string, number>();
	const byOutcome = new Map<string, number>();
	let totalDuration = 0;
	let hookCount = 0;

	for (const stream of pluginHooks) {
		const s = stream.stream as HookExecutionEvent;
		byPlugin.set(s.plugin_name, (byPlugin.get(s.plugin_name) ?? 0) + 1);
		byHookType.set(s.hook_type, (byHookType.get(s.hook_type) ?? 0) + 1);
		if (s.tool_name) {
			byTool.set(s.tool_name, (byTool.get(s.tool_name) ?? 0) + 1);
		}
		const outcome = s.hook_outcome ?? s.permission_decision ?? "completed";
		byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + 1);
		if (s.duration_ms) {
			totalDuration += Number(s.duration_ms);
			hookCount++;
		}
	}

	const lines = [
		`Total hook executions: ${pluginHooks.length}`,
		`Average duration: ${hookCount > 0 ? (totalDuration / hookCount).toFixed(1) : "N/A"}ms`,
		"",
		"By Plugin:",
		...Array.from(byPlugin.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name, count]) => `  ${name}: ${count}`),
		"",
		"By Hook Type:",
		...Array.from(byHookType.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([type, count]) => `  ${type}: ${count}`),
		"",
		"By Tool:",
		...Array.from(byTool.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([tool, count]) => `  ${tool}: ${count}`),
		"",
		"By Outcome:",
		...Array.from(byOutcome.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([outcome, count]) => `  ${outcome}: ${count}`),
	];

	return lines.join("\n");
}

// =============================================================================
// CLI Commands
// =============================================================================

const commands = {
	// Core queries
	async hooks(args: string[]) {
		const hours = Number(args[0]) || 1;
		const format = args.includes("--json") ? "json" : "table";
		const streams = await getPluginHooks(hours);
		console.log(format === "json" ? formatJson(streams) : formatTable(streams));
	},

	async "hooks-by-plugin"(args: string[]) {
		const plugin = args[0];
		if (!plugin) {
			console.error("Usage: hooks-by-plugin <plugin-name> [hours]");
			process.exit(1);
		}
		const hours = Number(args[1]) || 1;
		const streams = await getPluginHooksByPlugin(plugin, hours);
		console.log(formatTable(streams));
	},

	async "hooks-by-type"(args: string[]) {
		const hookType = args[0];
		if (!hookType) {
			console.error(
				"Usage: hooks-by-type <hook-type> [hours]\nTypes: SessionStart, PreToolUse, PostToolUse, Stop, etc.",
			);
			process.exit(1);
		}
		const hours = Number(args[1]) || 1;
		const streams = await getPluginHooksByType(hookType, hours);
		console.log(formatTable(streams));
	},

	async errors(args: string[]) {
		const hours = Number(args[0]) || 24;
		const streams = await getHookErrors(hours);
		if (streams.length === 0) {
			console.log("No hook errors found in the last", hours, "hours.");
		} else {
			console.log(formatTable(streams));
		}
	},

	async stats(args: string[]) {
		const hours = Number(args[0]) || 24;
		const streams = await getPluginHooks(hours, 500);
		console.log(formatStats(streams));
	},

	async session(args: string[]) {
		const sessionId = args[0];
		if (!sessionId) {
			console.error("Usage: session <session-id> [hours]");
			process.exit(1);
		}
		const hours = Number(args[1]) || 24;
		const streams = await getSessionEvents(sessionId, hours);
		console.log(formatTable(streams));
	},

	async events(args: string[]) {
		const hours = Number(args[0]) || 1;
		const streams = await getClaudeCodeEvents(hours);
		console.log(formatTable(streams));
	},

	// Low-level queries
	async query(args: string[]) {
		const logql = args[0];
		if (!logql) {
			console.error("Usage: query <logql> [hours] [limit]");
			process.exit(1);
		}
		const hours = Number(args[1]) || 1;
		const limit = Number(args[2]) || 100;
		const result = await queryRange(logql, hoursAgoNs(hours), nowNs(), limit);
		console.log(JSON.stringify(result.data.result, null, 2));
	},

	async labels() {
		const result = await getLabels();
		console.log(result.data.join("\n"));
	},

	async "label-values"(args: string[]) {
		const label = args[0];
		if (!label) {
			console.error("Usage: label-values <label>");
			process.exit(1);
		}
		const result = await getLabelValues(label);
		console.log(result.data.join("\n"));
	},

	async help() {
		console.log(`
Loki Query CLI - Plugin Telemetry Tool

Usage:
  bun .claude/skills/loki-query/scripts/query.ts <command> [options]

Plugin Telemetry Commands:
  hooks [hours]                      Recent plugin hook executions (default: 1h)
  hooks --json [hours]               Output as JSON
  hooks-by-plugin <name> [hours]     Filter hooks by plugin name
  hooks-by-type <type> [hours]       Filter by hook type (SessionStart, PreToolUse, etc.)
  errors [hours]                     Hook errors and failures (default: 24h)
  stats [hours]                      Statistics summary (default: 24h)
  session <id> [hours]               All events for a session (default: 24h)
  events [hours]                     All Claude Code events (default: 1h)

Low-Level Commands:
  query <logql> [hours] [limit]      Execute raw LogQL query
  labels                             List all available labels
  label-values <label>               Get values for a label

Examples:
  # Recent hook executions
  bun query.ts hooks 2

  # Filter by plugin
  bun query.ts hooks-by-plugin workflow 24

  # PreToolUse hooks only
  bun query.ts hooks-by-type PreToolUse 1

  # Check for errors
  bun query.ts errors 24

  # Get stats
  bun query.ts stats 24

  # Custom query
  bun query.ts query '{service_name="claude-code"}' 1 50

Environment:
  LOKI_API_KEY    API key (required, loaded from .env)
  LOKI_URL        Loki URL (default: https://logs.savvyweb.build)
`);
	},
};

// =============================================================================
// Main
// =============================================================================

async function main() {
	const [command, ...args] = Bun.argv.slice(2);

	if (!command || command === "help" || command === "--help" || command === "-h") {
		await commands.help();
		process.exit(0);
	}

	const handler = commands[command as keyof typeof commands];
	if (!handler) {
		console.error(`Unknown command: ${command}`);
		console.error("Run with --help for usage information");
		process.exit(1);
	}

	try {
		await handler(args);
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main();
