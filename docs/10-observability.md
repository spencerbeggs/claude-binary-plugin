# Observability

The `claude-binary-plugin` SDK includes built-in OpenTelemetry (OTEL) support for monitoring hook execution, recording metrics, and tracing operations. Telemetry is collected by a sidecar process that runs alongside your plugin and exports data to any OTLP-compatible backend.

## Sidecar Architecture

Hook processes are short-lived -- each hook invocation spawns a new process that exits after responding. A long-running sidecar process handles telemetry collection so that hooks can emit data without blocking on network I/O.

```text
Hook Processes (short-lived)
  |
  |  IPC (Unix Domain Socket)
  v
Sidecar Process (long-running)
  |
  v
OTLP Endpoint (Grafana, Datadog, Honeycomb, etc.)
```

Key properties of this design:

- Hooks use fire-and-forget telemetry that never blocks execution
- The sidecar batches and exports telemetry efficiently
- The sidecar auto-spawns on the first hook and auto-terminates after idle timeout
- Any hook can resurrect the sidecar if it has exited

## Enabling Telemetry

Telemetry requires two conditions:

1. The `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable must be set
2. The platform must support Unix domain sockets (macOS or Linux)

Set these environment variables in your `.env` file or Claude Code settings:

```bash
# Required: OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com

# Optional: authentication headers
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer your-token-here

# Optional: custom service name (default: "claude-code")
OTEL_SERVICE_NAME=my-plugin

# Optional: custom socket path for sidecar IPC
OTEL_SIDECAR_SOCKET=/tmp/my-plugin-otel.sock
```

Check whether telemetry is enabled in your code:

```typescript
import { OtelConfig } from "claude-binary-plugin";

if (OtelConfig.isEnabled()) {
  // Safe to emit telemetry
}
```

## Primary Telemetry Classes

The SDK provides three classes for emitting telemetry. All methods are static and fire-and-forget by default.

### TelemetryEmitter

Emits structured events for hook execution, validation errors, and fatal errors.

```typescript
import { TelemetryEmitter, OtelConfig } from "claude-binary-plugin";

// Emit hook execution event
TelemetryEmitter.emitHookExecution(event, "security", {
  hookType: "PreToolUse",
  pluginName: "my-plugin",
  pluginVersion: "1.0.0",
  durationMs: 42,
  success: true,
  outcome: "allowed",
  toolName: "Bash",
  summary: "auto-allowed: git status",
});

// Emit schema validation error
TelemetryEmitter.emitSchemaValidationError(sessionId, "security", {
  hookName: "security",
  issueCount: 2,
  validationPath: "tool_input.command",
  errorMessage: "Required field missing",
});

// Emit fatal error (waits for flush)
await TelemetryEmitter.emitFatalError(sessionId, {
  hookName: "security",
  errorType: "uncaughtException",
  errorMessage: error.message,
  errorStack: error.stack,
});
```

### TelemetryMetrics

Records counters, histograms, and gauges for quantitative monitoring.

```typescript
import { TelemetryMetrics } from "claude-binary-plugin";

// Record hook execution (counter + histogram combined)
TelemetryMetrics.recordHookExecution(event, "security", 42, true);

// Record custom counter
TelemetryMetrics.recordCounter(event, "files.linted", files.length);

// Record custom histogram
TelemetryMetrics.recordHistogram(event, "lint.duration", durationMs, "ms");

// Record custom gauge
TelemetryMetrics.recordGauge(event, "cache.size", cacheEntries);

// Record hook decision
TelemetryMetrics.recordHookDecision(event, "security", "allow", "Bash");
```

### TelemetrySpan

Instruments hook execution with tracing spans for timing and error tracking.

```typescript
import { TelemetrySpan } from "claude-binary-plugin";

// Execute within a traced span
const result = await TelemetrySpan.withHookSpan(
  event,
  "validate-input",
  async () => {
    return validateInput(event.tool_input);
  },
);

// Create child spans for sub-operations
await TelemetrySpan.withChildSpan(event, "lint", async () => {
  await runLint();
});

await TelemetrySpan.withChildSpan(event, "typecheck", async () => {
  await runTypeCheck();
});

// Wrap an entire handler with automatic span instrumentation
const handler = TelemetrySpan.instrumentHook("security", async (event) => {
  return { status: "executed", action: "allow", summary: "ok" };
});

// Wrap a tool hook with tool-specific attributes
const toolHandler = TelemetrySpan.instrumentToolHook("pre-bash", async (event) => {
  // event.tool_name is automatically added to span attributes
  return { status: "executed", action: "allow", summary: "ok" };
});
```

## Sidecar Lifecycle

### Spawning

Every hook follows the same connection pattern:

1. Try to connect to the existing sidecar socket
2. If connected, send a ping with config and then emit data
3. If the socket file exists but connection fails, wait up to 1 second and retry
4. If the socket file does not exist, spawn a new sidecar process
5. Wait for the socket to become available (up to 2 seconds)
6. Send a ping message with OTEL configuration
7. Emit telemetry data

This pattern allows SessionStart to create the sidecar and subsequent hooks to reconnect or resurrect a dead sidecar.

### The Ping Handshake

The `ping` message initializes or reinitializes the sidecar's OTEL providers:

```typescript
// Client sends ping with config
{
  type: "ping",
  sessionId: "abc-123",
  config: {
    endpoint: "https://otel.example.com",
    protocol: "http",
    serviceName: "claude-code",
    headers: { "Authorization": "Bearer ..." }
  }
}

// Sidecar responds
{ ok: true, version: "1.0.0" }
```

On receiving a ping, the sidecar stores the session configuration and initializes OTEL providers. If the sidecar was started with one endpoint and a new session sends a different endpoint, the sidecar updates its configuration on the fly.

### Idle Timeout and Resurrection

The sidecar auto-terminates after a configurable idle period (default: 5 minutes). Every message resets the idle timer.

```text
Spawned --> Receives messages --> Idle timer resets on each message
                |
                v
        No messages for 5 min
                |
                v
        Sidecar exits (graceful shutdown, flushes pending telemetry)
                |
                v
[Next hook runs] --> Spawns new sidecar --> Ping with config
```

Key behaviors:

- Graceful shutdown on SIGTERM/SIGINT flushes pending telemetry
- Socket file is removed on exit
- The next hook that runs spawns a fresh sidecar automatically

### Message Protocol

Hooks send JSON Lines (newline-delimited JSON) over the Unix socket:

| Message Type | Description |
| --- | --- |
| `ping` | Initialize providers, accept config updates |
| `event` | Log event with attributes |
| `metric` | Record counter, histogram, or gauge |
| `span` | Trace span with timing data |
| `shutdown` | End session or request full shutdown |

## Hook Outcome Model

Outcomes classify what the hook decided to do. They enable easy filtering and analysis of hook behavior in your observability backend.

| Outcome | Description |
| --- | --- |
| `skipped` | Hook did not apply (wrong tool, disabled, etc.) |
| `allowed` | PreToolUse: explicitly allowed the tool use |
| `denied` | PreToolUse: explicitly denied the tool use |
| `modified` | Tool input was modified before execution |
| `blocked` | PostToolUse/Stop: blocked continuation |
| `context_added` | Added context for Claude |
| `passthrough` | Analyzed but took no action |
| `error` | Hook failed with an error |

### Outcome Mapping

| Hook Response | Outcome |
| --- | --- |
| `action: "allow"` | `allowed` |
| `action: "deny"` | `denied` |
| `action: "ask"` | `passthrough` |
| `action: "modify"` with `updatedInput` | `modified` |
| `action: "context"` with `claudeContext` | `context_added` |
| `action: "block"` | `blocked` |
| `action: "none"` (no fields set) | `passthrough` |
| Hook disabled for this tool | `skipped` |
| Exception thrown | `error` |

## Event Types

All events use the `claude_code.hook.*` naming pattern and the scope name `systems.savvyweb.claude_code.events` to distinguish plugin telemetry from Claude Code's native telemetry.

### claude_code.hook.execution

The primary event emitted when a hook completes. Contains timing, decision, and outcome data.

Required attributes:

| Attribute | Type | Description |
| --- | --- | --- |
| `session.id` | string | Claude Code session UUID |
| `event.name` | string | `"claude_code.hook.execution"` |
| `hook.name` | string | Custom hook name (e.g., "security") |
| `hook.type` | string | Hook event type (e.g., "PreToolUse") |
| `hook.duration_ms` | number | Execution time in milliseconds |
| `plugin.name` | string | Plugin name |
| `plugin.version` | string | Plugin version |

Optional attributes include `hook.outcome`, `tool.name`, `permission.decision`, `tool.input_modified`, `error`, and custom `metrics.*` and `context.*` attributes.

### claude_code.hook.validation_error

Emitted when Claude Code sends malformed event data that fails Zod schema validation. Includes `validation.path` and `validation.issue_count` attributes.

### claude_code.hook.env_error

Emitted when plugin environment variables fail validation. Includes `env.class`, `validation.path`, and `validation.issue_count` attributes.

### claude_code.hook.fatal_error

Emitted when an uncaught exception or unhandled rejection occurs. Unlike other emit methods, `emitFatalError` waits for the message to be flushed before returning. Includes `error.type` and `error.is_validation` attributes.

## Metrics

All metrics use the `claude_code.hook.*` prefix.

| Metric Name | Type | Description |
| --- | --- | --- |
| `claude_code.hook.count` | Counter | Hook invocations |
| `claude_code.hook.duration_ms` | Histogram | Hook execution duration |
| `claude_code.hook.tool_use.count` | Counter | Tool uses processed |
| `claude_code.hook.tool_denied.count` | Counter | Denied tool uses |
| `claude_code.hook.session.active` | Gauge | Active sessions |
| `claude_code.hook.session.start.count` | Counter | Sessions started |
| `claude_code.hook.session.end.count` | Counter | Sessions ended |
| `claude_code.hook.sidecar.ipc.messages.sent` | Counter | IPC messages sent |
| `claude_code.hook.sidecar.ipc.errors` | Counter | IPC errors |
| `claude_code.hook.sidecar.ipc.latency_ms` | Histogram | IPC message latency |

### Metric Dimensions

Hook count and duration metrics are dimensioned by:

- `hook.name` -- Custom hook name
- `hook.type` -- Hook event type
- `tool.name` -- Tool name (for tool hooks)
- `success` -- Whether the hook succeeded

## Configuration Reference

### OTEL Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Protocol (`http` or `grpc`) | `http` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers (comma-separated `key=value`) | (none) |
| `OTEL_SERVICE_NAME` | Service name override | `claude-code` |
| `OTEL_INCLUDE_SESSION_ID` | Include `session.id` in attributes | `true` |

### Sidecar Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `OTEL_SIDECAR_SOCKET` | Unix socket path | Auto-generated |
| `OTEL_SIDECAR_SESSION_ID` | Session ID for correlation | From hook event |
| `OTEL_SIDECAR_IDLE_TIMEOUT_MS` | Idle timeout before shutdown | `300000` (5 min) |

### Scope and Service

| Field | Value |
| --- | --- |
| Scope Name | `systems.savvyweb.claude_code.events` |
| Service Name | `claude-code` |
| Service Namespace | `claude-code` |

The scope name allows queries to filter between native Claude Code telemetry (`com.anthropic.claude_code.events`) and plugin hook telemetry (`systems.savvyweb.claude_code.events`).
