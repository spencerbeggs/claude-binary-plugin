/**
 * OTEL attribute and metric name constants.
 *
 * These constants align with Claude Code's telemetry scheme while adding
 * plugin-specific attributes for richer observability.
 *
 * Schema aligned with Claude Code native telemetry:
 * - scope_name: systems.savvyweb.claude_code.events
 * - service_name: claude-code
 * - All attributes use dot notation (e.g., "session.id", "tool.name", "hook.duration_ms")
 *
 * @module
 */

/**
 * Scope configuration for OTEL instrumentation.
 * Aligns with Claude Code's native scope naming pattern (com.anthropic.claude_code.events).
 */
export const SCOPE = {
	/**
	 * The scope name for all plugin hook telemetry.
	 * Format: {reverse_domain}.claude_code.events
	 */
	NAME: "systems.savvyweb.claude_code.events",
} as const;

/**
 * Event names for hook telemetry.
 * Uses `claude_code.hook.*` pattern to align with Anthropic's naming.
 * The scope_name distinguishes our events from Anthropic's native telemetry.
 */
export const EVENT_NAMES = {
	/**
	 * Main event emitted when a hook execution completes.
	 * Contains all hook result data including decision, timing, and context.
	 */
	HOOK_EXECUTION: "claude_code.hook.execution",
	/**
	 * Event emitted when schema validation fails during hook event parsing.
	 * Contains validation error details for debugging malformed events from Claude Code.
	 */
	SCHEMA_VALIDATION_ERROR: "claude_code.hook.validation_error",
	/**
	 * Event emitted when environment variable validation fails.
	 * Contains validation error details for debugging invalid env configurations.
	 */
	ENV_VALIDATION_ERROR: "claude_code.hook.env_error",
	/**
	 * Event emitted when an uncaught exception or unhandled rejection occurs.
	 * Contains error details for debugging hook crashes.
	 */
	FATAL_ERROR: "claude_code.hook.fatal_error",
} as const;

/**
 * Claude Code specific attributes.
 * These align with Claude Code's native telemetry cardinality scheme.
 *
 * All attributes use dot notation for consistency with Anthropic's native telemetry
 * (e.g., "session.id", "tool.name", "hook.duration_ms").
 * @public
 */
export const CLAUDE_ATTRS = {
	/**
	 * The Claude Code session ID.
	 * High cardinality - use OTEL_INCLUDE_SESSION_ID env var to enable.
	 * Aligned with Claude Code native schema.
	 */
	SESSION_ID: "session.id",

	/**
	 * The Claude Code binary version (e.g., "1.0.30").
	 * Detected from `claude --version` command.
	 * Enables correlating hook behavior with Claude Code releases.
	 * Separate from plugin.version which tracks plugin releases.
	 */
	APP_VERSION: "app.version",

	/**
	 * The terminal type (e.g., "iTerm", "vscode", "cursor", "tmux").
	 * Detected from TERM_PROGRAM or similar environment variables.
	 * Aligns with Anthropic's native OTEL schema.
	 */
	TERMINAL_TYPE: "terminal.type",

	/**
	 * Organization ID from the user's Claude account.
	 * Read from `~/.claude.json` at `oauthAccount.organizationUuid`
	 * Aligns with Anthropic's native OTEL schema.
	 */
	ORGANIZATION_ID: "organization.id",

	/**
	 * User account UUID from the user's Claude account.
	 * Read from `~/.claude.json` at `oauthAccount.accountUuid`
	 * Aligns with Anthropic's native OTEL schema.
	 */
	USER_ACCOUNT_UUID: "user.account_uuid",

	/**
	 * User email from the user's Claude account.
	 * Read from `~/.claude.json` at `oauthAccount.emailAddress`
	 * High cardinality - only include if explicitly enabled.
	 */
	USER_EMAIL: "user.email",

	/**
	 * The custom hook name (e.g., "pre-edit-code", "docs-access").
	 * This is the user-defined hook identifier, distinct from hook.type.
	 */
	HOOK_NAME: "hook.name",

	/**
	 * The hook event type (e.g., "PreToolUse", "SessionStart", "PostToolUse").
	 * This is the Claude Code hook event type.
	 */
	HOOK_TYPE: "hook.type",

	/**
	 * The tool name for tool-related hooks.
	 */
	TOOL_NAME: "tool.name",

	/**
	 * The tool use ID for correlation with Claude Code events.
	 */
	TOOL_USE_ID: "tool.use_id",

	/**
	 * Tool input hash for deduplication (not the actual input).
	 */
	TOOL_INPUT_HASH: "tool.input_hash",

	/**
	 * Whether the hook allowed or denied the tool use.
	 * Values: "allow", "deny", "ask", "block"
	 */
	HOOK_DECISION: "hook.decision",

	/**
	 * Semantic outcome of hook execution.
	 * Values: "skipped", "allowed", "denied", "modified", "blocked", "context_added", "passthrough", "error"
	 */
	HOOK_OUTCOME: "hook.outcome",

	/**
	 * Source of the permission decision.
	 * Values: "config", "user_permanent", "user_temporary", "hook", "user_abort", "user_reject"
	 * Aligns with Anthropic's native telemetry for decision attribution.
	 */
	DECISION_SOURCE: "decision.source",

	/**
	 * The Claude Code project directory.
	 */
	PROJECT_DIR: "project.dir",

	/**
	 * The model being used (e.g., "claude-3-opus").
	 */
	MODEL: "model",

	/**
	 * Source of the telemetry event.
	 * Always "hook" for plugin hook events.
	 */
	SOURCE: "source",

	/**
	 * ISO 8601 timestamp of when the event occurred.
	 */
	EVENT_TIMESTAMP: "event.timestamp",

	/**
	 * The event name (e.g., "claude_code.hook.execution").
	 * Aligns with Anthropic's event naming convention.
	 */
	EVENT_NAME: "event.name",

	/**
	 * Duration of hook execution in milliseconds.
	 */
	DURATION_MS: "hook.duration_ms",

	/**
	 * Error message if hook execution failed.
	 */
	ERROR: "error",

	/**
	 * Permission decision for PreToolUse hooks.
	 * Values: "allow", "deny", "ask"
	 */
	PERMISSION_DECISION: "permission.decision",

	/**
	 * Reason for permission denial.
	 */
	PERMISSION_DECISION_REASON: "permission.decision_reason",

	/**
	 * Whether the tool input was modified by the hook.
	 */
	HAS_UPDATED_INPUT: "tool.input_modified",

	/**
	 * Reason for blocking an operation.
	 */
	REASON: "reason",

	/**
	 * Whether additional context was provided.
	 */
	HAS_ADDITIONAL_CONTEXT: "response.has_context",

	/**
	 * Schema validation error path (which field failed).
	 */
	VALIDATION_PATH: "validation.path",

	/**
	 * Number of validation issues found.
	 */
	VALIDATION_ISSUE_COUNT: "validation.issue_count",

	/**
	 * Environment class name that failed validation.
	 */
	ENV_CLASS: "env.class",

	/**
	 * Error type for fatal errors (uncaughtException, unhandledRejection, ZodError, etc.)
	 */
	ERROR_TYPE: "error.type",

	/**
	 * Whether an error was a validation error.
	 */
	IS_VALIDATION_ERROR: "error.is_validation",
} as const;

/**
 * Plugin-specific attributes.
 * @public
 */
export const PLUGIN_ATTRS = {
	/**
	 * The plugin name (e.g., "workflow", "bun-plugin-builder").
	 */
	NAME: "plugin.name",

	/**
	 * The plugin version from package.json.
	 */
	VERSION: "plugin.version",

	/**
	 * The marketplace the plugin belongs to.
	 */
	MARKETPLACE: "plugin.marketplace",

	/**
	 * The marketplace version.
	 */
	MARKETPLACE_VERSION: "plugin.marketplace.version",

	/**
	 * The hook handler file path (relative to plugin root).
	 */
	HOOK_HANDLER: "plugin.hook.handler",

	/**
	 * The command name for command hooks.
	 */
	COMMAND: "plugin.command",
} as const;

/**
 * Git repository attributes.
 * Detected from the project directory's git configuration.
 */
export const GIT_ATTRS = {
	/**
	 * Current git branch name.
	 * Detected via: git branch --show-current
	 */
	BRANCH: "git.branch",

	/**
	 * Git hosting provider.
	 * Values: "github", "gitlab", "bitbucket", "unknown"
	 * Parsed from the origin remote URL.
	 */
	PROVIDER: "git.provider",

	/**
	 * Repository owner or organization.
	 * Parsed from the origin remote URL.
	 */
	OWNER: "git.owner",

	/**
	 * Repository name.
	 * Parsed from the origin remote URL.
	 */
	REPO: "git.repo",
} as const;

/**
 * OTEL sidecar specific attributes.
 */
export const SIDECAR_ATTRS = {
	/**
	 * The sidecar process ID.
	 */
	PID: "sidecar.pid",

	/**
	 * The socket path the sidecar is listening on.
	 */
	SOCKET_PATH: "sidecar.socket.path",

	/**
	 * Sidecar uptime in milliseconds.
	 */
	UPTIME_MS: "sidecar.uptime_ms",

	/**
	 * Number of messages processed by the sidecar.
	 */
	MESSAGE_COUNT: "sidecar.message.count",
} as const;

/**
 * Standard OTEL resource attributes.
 * Following semantic conventions for service identification.
 */
export const RESOURCE_ATTRS = {
	/**
	 * Service name (required for all telemetry).
	 */
	SERVICE_NAME: "service.name",

	/**
	 * Service version.
	 */
	SERVICE_VERSION: "service.version",

	/**
	 * Service namespace for grouping related services.
	 */
	SERVICE_NAMESPACE: "service.namespace",

	/**
	 * Deployment environment (e.g., "production", "development").
	 */
	DEPLOYMENT_ENV: "deployment.environment",

	/**
	 * Host name.
	 */
	HOST_NAME: "host.name",

	/**
	 * Operating system type.
	 */
	OS_TYPE: "os.type",
} as const;

/**
 * Metric names for hook telemetry.
 * Uses `claude_code.hook.*` prefix to align with Anthropic's naming.
 * @public
 */
export const METRIC_NAMES = {
	/**
	 * Counter: Number of hook invocations.
	 * Dimensions: hook.name, decision, tool_name
	 */
	HOOK_COUNT: "claude_code.hook.count",

	/**
	 * Histogram: Hook execution duration in milliseconds.
	 * Dimensions: hook.name, tool_name
	 */
	HOOK_DURATION_MS: "claude_code.hook.duration_ms",

	/**
	 * Counter: Number of tool uses processed by hooks.
	 * Dimensions: tool_name, allowed
	 */
	TOOL_USE_COUNT: "claude_code.hook.tool_use.count",

	/**
	 * Counter: Number of denied tool uses.
	 * Dimensions: tool_name, reason
	 */
	TOOL_DENIED_COUNT: "claude_code.hook.tool_denied.count",

	/**
	 * Gauge: Number of active sessions.
	 */
	ACTIVE_SESSIONS: "claude_code.hook.session.active",

	/**
	 * Counter: Total sessions started.
	 */
	SESSION_START_COUNT: "claude_code.hook.session.start.count",

	/**
	 * Counter: Total sessions ended.
	 */
	SESSION_END_COUNT: "claude_code.hook.session.end.count",

	/**
	 * Counter: IPC messages sent to sidecar.
	 * Dimensions: message_type
	 */
	IPC_MESSAGES_SENT: "claude_code.hook.sidecar.ipc.messages.sent",

	/**
	 * Counter: IPC errors.
	 * Dimensions: error_type
	 */
	IPC_ERRORS: "claude_code.hook.sidecar.ipc.errors",

	/**
	 * Histogram: IPC message latency in milliseconds.
	 */
	IPC_LATENCY_MS: "claude_code.hook.sidecar.ipc.latency_ms",
} as const;

/**
 * Span names for tracing.
 * Uses `claude_code.hook.*` prefix for consistency.
 * @public
 */
export const SPAN_NAMES = {
	/**
	 * Root span for a hook execution.
	 */
	HOOK_EXECUTION: "claude_code.hook.execute",

	/**
	 * Span for tool input processing.
	 */
	TOOL_INPUT_PROCESS: "claude_code.hook.tool.input.process",

	/**
	 * Span for tool output processing.
	 */
	TOOL_OUTPUT_PROCESS: "claude_code.hook.tool.output.process",

	/**
	 * Span for IPC message send.
	 */
	IPC_SEND: "claude_code.hook.sidecar.ipc.send",

	/**
	 * Span for OTEL export.
	 */
	OTEL_EXPORT: "claude_code.hook.sidecar.otel.export",
} as const;

/**
 * Environment variables for OTEL configuration.
 */
export const ENV_VARS = {
	/**
	 * OTLP endpoint URL.
	 * Standard OTEL env var.
	 */
	OTEL_EXPORTER_ENDPOINT: "OTEL_EXPORTER_OTLP_ENDPOINT",

	/**
	 * OTLP protocol (http or grpc).
	 */
	OTEL_EXPORTER_PROTOCOL: "OTEL_EXPORTER_OTLP_PROTOCOL",

	/**
	 * OTLP headers as comma-separated key=value pairs.
	 */
	OTEL_EXPORTER_HEADERS: "OTEL_EXPORTER_OTLP_HEADERS",

	/**
	 * Service name override.
	 */
	OTEL_SERVICE_NAME: "OTEL_SERVICE_NAME",

	/**
	 * Whether to include high-cardinality session ID in attributes.
	 * Set to "true" to enable.
	 */
	OTEL_INCLUDE_SESSION_ID: "OTEL_INCLUDE_SESSION_ID",

	/**
	 * Socket path for sidecar IPC.
	 * Set by the sidecar or hook launcher.
	 */
	OTEL_SIDECAR_SOCKET: "OTEL_SIDECAR_SOCKET",

	/**
	 * Session ID for sidecar correlation.
	 */
	OTEL_SIDECAR_SESSION_ID: "OTEL_SIDECAR_SESSION_ID",

	/**
	 * Idle timeout in milliseconds before sidecar shuts down.
	 * @default 300000 (5 minutes)
	 */
	OTEL_SIDECAR_IDLE_TIMEOUT_MS: "OTEL_SIDECAR_IDLE_TIMEOUT_MS",
} as const;

/**
 * Default values for configuration.
 */
export const DEFAULTS = {
	/**
	 * Default OTLP endpoint.
	 */
	ENDPOINT: "http://localhost:4318",

	/**
	 * Default OTLP protocol.
	 */
	PROTOCOL: "http" as const,

	/**
	 * Default service name.
	 * Uses underscore to match Loki/Grafana conventions.
	 */
	SERVICE_NAME: "claude-code",

	/**
	 * Default service namespace.
	 */
	SERVICE_NAMESPACE: "claude-code",

	/**
	 * Default idle timeout in milliseconds (5 minutes).
	 */
	IDLE_TIMEOUT_MS: 5 * 60 * 1000,

	/**
	 * Default export timeout in milliseconds (30 seconds).
	 */
	EXPORT_TIMEOUT_MS: 30 * 1000,
} as const;
