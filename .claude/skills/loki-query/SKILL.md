---
name: loki-query
description: Query Loki logs using the HTTP API with LogQL (project)
allowed-tools: Bash, Read
---

# Loki Query Skill

Query plugin telemetry and Claude Code events from Loki using a Bun-based CLI tool.

## Quick Start

```bash
# Recent plugin hook executions
bun .claude/skills/loki-query/scripts/query.ts hooks 1

# Statistics overview
bun .claude/skills/loki-query/scripts/query.ts stats 24

# Check for errors
bun .claude/skills/loki-query/scripts/query.ts errors 24
```

## CLI Commands

### Plugin Telemetry

| Command | Description |
| ------- | ----------- |
| `hooks [hours]` | Recent plugin hook executions (default: 1h) |
| `hooks --json [hours]` | Output as JSON |
| `hooks-by-plugin <name> [hours]` | Filter by plugin name |
| `hooks-by-type <type> [hours]` | Filter by hook type |
| `errors [hours]` | Hook errors and failures (default: 24h) |
| `stats [hours]` | Statistics summary (default: 24h) |
| `session <id> [hours]` | All events for a session |
| `events [hours]` | All Claude Code events |

### Low-Level

| Command | Description |
| ------- | ----------- |
| `query <logql> [hours] [limit]` | Execute raw LogQL query |
| `labels` | List all available labels |
| `label-values <label>` | Get values for a label |

## Hook Types

| Type | When Triggered |
| ---- | -------------- |
| `SessionStart` | Session begins |
| `SessionEnd` | Session ends |
| `PreToolUse` | Before tool executes |
| `PostToolUse` | After tool completes |
| `Stop` | Agent about to stop |
| `SubagentStop` | Subagent about to stop |

## Common Workflows

### Check Plugin Health

```bash
# Get overview of the last 24 hours
bun .claude/skills/loki-query/scripts/query.ts stats 24

# Look for any errors
bun .claude/skills/loki-query/scripts/query.ts errors 24
```

### Debug a Specific Plugin

```bash
# Filter by plugin name
bun .claude/skills/loki-query/scripts/query.ts hooks-by-plugin workflow 1

# Or bun-plugin-builder
bun .claude/skills/loki-query/scripts/query.ts hooks-by-plugin bun-plugin-builder 1
```

### Investigate Session

```bash
# Get all events for a session
bun .claude/skills/loki-query/scripts/query.ts session a5cf1a37-b8f6-4ed5-8cae-6434334bed7e 24
```

### Find Slow Hooks

```bash
# Get JSON and filter with jq
bun .claude/skills/loki-query/scripts/query.ts hooks --json 24 | \
  jq '[.[] | select(.stream.duration_ms | tonumber > 100)]'
```

### Monitor Permission Decisions

```bash
# See PreToolUse hooks (allow/deny decisions)
bun .claude/skills/loki-query/scripts/query.ts hooks-by-type PreToolUse 1
```

## Output Format

The table output shows:

```text
TIMESTAMP | PLUGIN:HOOK | TYPE | OUTCOME | DURATION [TOKENS]
```

Example:

```text
2025-12-20 03:52:07 UTC | workflow:workflow-context | SessionStart | completed | 749ms
2025-12-20 03:52:06 UTC | bun-plugin-builder:plugin-context | SessionStart | completed | 7ms [127 tokens]
2025-12-20 03:55:06 UTC | workflow:pre-auto-allow | PreToolUse | allow | 1ms
```

## Stats Output

The `stats` command provides:

```text
Total hook executions: 500
Average duration: 158.6ms

By Plugin:
  workflow: 251
  bun-plugin-builder: 109

By Hook Type:
  PreToolUse: 220
  PostToolUse: 200
  SessionStart: 32

By Outcome:
  completed: 345
  allow: 155
```

## Telemetry Scopes

Events are separated by scope:

| Scope | Description |
| ----- | ----------- |
| `systems.savvyweb.claude_code.events` | Custom plugin telemetry |
| `com.anthropic.claude_code.events` | Native Claude Code events |

The CLI automatically filters for plugin events. Use `events` command to see all events.

## Key Attributes

### Hook Execution Events

| Attribute | Description |
| --------- | ----------- |
| `plugin.name` | Plugin name (workflow, bun-plugin-builder) |
| `hook.name` | Hook identifier (workflow-context, pre-auto-allow) |
| `hook.type` | Hook type (SessionStart, PreToolUse, etc.) |
| `duration_ms` | Execution time in milliseconds |
| `hook.outcome` | Outcome (completed, allow, deny, error) |
| `context_tokens` | Tokens added to context |
| `permission_decision` | PreToolUse decision (allow, deny, ask) |

### Session Attributes

| Attribute | Description |
| --------- | ----------- |
| `session.id` | Session UUID |
| `app.version` | Claude Code version |
| `terminal.type` | Terminal (wezterm, vscode, etc.) |

## Environment

```bash
# Required - API key for authentication
LOKI_API_KEY=<your-key>

# Optional - URL override
LOKI_URL=https://logs.savvyweb.build
```

The API key is loaded from `.env` automatically.

## Reference Documentation

- [Schema Reference](references/schema.md) - Full telemetry schema
- [Examples](references/examples.md) - Query examples and patterns
- [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)
- [LogQL Documentation](https://grafana.com/docs/loki/latest/query/)

## Error Handling

| Error | Cause | Solution |
| ----- | ----- | -------- |
| `LOKI_API_KEY not set` | Missing env var | Add to `.env` |
| `Loki API error (400)` | Invalid LogQL | Check query syntax |
| `Loki API error (401)` | Invalid API key | Verify `LOKI_API_KEY` |
| `max entries limit exceeded` | Query too large | Reduce time range or limit |

## Tips

1. **Start with stats** - Get an overview before diving in
2. **Use filters** - `hooks-by-plugin` and `hooks-by-type` narrow results
3. **Check errors daily** - Run `errors 24` to catch issues early
4. **Use JSON for scripts** - `--json` flag for programmatic processing
5. **Short time ranges** - Start with 1h, expand if needed
