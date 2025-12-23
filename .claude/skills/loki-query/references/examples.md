# Loki Query Examples

Real-world examples for querying plugin telemetry.

## Using the Bun CLI

The recommended way to query logs is via the Bun CLI tool:

```bash
# Recent plugin hook executions (last hour)
bun .claude/skills/loki-query/scripts/query.ts hooks 1

# Get JSON output
bun .claude/skills/loki-query/scripts/query.ts hooks --json 1

# Filter by plugin
bun .claude/skills/loki-query/scripts/query.ts hooks-by-plugin workflow 24

# Filter by hook type
bun .claude/skills/loki-query/scripts/query.ts hooks-by-type PreToolUse 1

# Check for errors (last 24 hours)
bun .claude/skills/loki-query/scripts/query.ts errors 24

# Get statistics
bun .claude/skills/loki-query/scripts/query.ts stats 24

# All events for a session
bun .claude/skills/loki-query/scripts/query.ts session a5cf1a37-b8f6-4ed5-8cae-6434334bed7e 24
```

## Raw LogQL Queries

For advanced queries, use the `query` command:

```bash
# Custom LogQL query
bun .claude/skills/loki-query/scripts/query.ts query '{service_name="claude-code"}' 1 50
```

### Plugin Events Only

```logql
{service_name="claude-code"} | scope_name="systems.savvyweb.claude_code.events"
```

### Filter by Hook Outcome

```logql
# Denied permissions
{service_name="claude-code"} | hook_outcome="denied"

# Errors
{service_name="claude-code"} | hook_outcome="error"

# Blocked completions
{service_name="claude-code"} | hook_outcome="blocked"
```

### Filter by Plugin

```logql
# Workflow plugin only
{service_name="claude-code"} | plugin_name="workflow"

# Bun plugin builder only
{service_name="claude-code"} | plugin_name="bun-plugin-builder"
```

### Filter by Hook Type

```logql
# SessionStart hooks
{service_name="claude-code"} | hook_type="SessionStart"

# PreToolUse hooks
{service_name="claude-code"} | hook_type="PreToolUse"

# PostToolUse hooks
{service_name="claude-code"} | hook_type="PostToolUse"
```

### Filter by Tool

```logql
# Bash tool events
{service_name="claude-code"} | tool_name="Bash"

# Write tool events
{service_name="claude-code"} | tool_name="Write"
```

## Aggregation Queries

### Hook Count by Plugin

```logql
sum by (plugin_name) (count_over_time({service_name="claude-code"} | scope_name="systems.savvyweb.claude_code.events" [24h]))
```

### Hook Count by Type

```logql
sum by (hook_type) (count_over_time({service_name="claude-code"} | scope_name="systems.savvyweb.claude_code.events" [24h]))
```

### Average Duration by Hook

```logql
avg by (hook_name) (
  avg_over_time({service_name="claude-code"} | scope_name="systems.savvyweb.claude_code.events" | unwrap duration_ms [24h])
)
```

## Debugging Workflows

### Find Slow Hooks

```bash
# Query and filter in shell
bun .claude/skills/loki-query/scripts/query.ts hooks --json 24 | \
  jq '[.[] | select(.stream.duration_ms | tonumber > 100)]'
```

### Track Session Activity

```bash
# All plugin activity for a session
bun .claude/skills/loki-query/scripts/query.ts session <session-id> 24
```

### Check Context Token Bloat

```bash
# Find hooks adding lots of context
bun .claude/skills/loki-query/scripts/query.ts hooks --json 1 | \
  jq '[.[] | select(.stream.metrics_contextTokens != null) | {hook: .stream.hook_name, tokens: .stream.metrics_contextTokens}]'
```

### Monitor Permission Decisions

```bash
# See what's being allowed/denied
bun .claude/skills/loki-query/scripts/query.ts hooks-by-type PreToolUse 1
```

## Using with Claude Code

### Ask About Recent Activity

```text
User: What plugin hooks ran in the last hour?
Claude: [Uses loki-query skill to fetch and display recent hooks]
```

### Debug Hook Issues

```text
User: Are there any hook errors?
Claude: [Queries for errors and analyzes them]
```

### Performance Analysis

```text
User: Which hooks are the slowest?
Claude: [Gets stats and identifies slow hooks]
```

### Session Investigation

```text
User: Show me all events for session abc-123
Claude: [Queries by session ID and displays timeline]
```

## Tips

1. **Start with the CLI** - Use `bun query.ts hooks` for quick exploration
2. **Use stats first** - Get an overview with `bun query.ts stats 24`
3. **Filter by plugin** - Narrow down with `hooks-by-plugin <name>`
4. **Check errors regularly** - Run `bun query.ts errors 24` to catch issues
5. **Use JSON for processing** - Add `--json` for programmatic analysis
