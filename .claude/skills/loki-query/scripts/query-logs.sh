#!/usr/bin/env bash
# =============================================================================
# Loki Query Helper Script
# =============================================================================
# Simple wrapper for querying Loki logs with proper authentication
# =============================================================================

set -euo pipefail

# Load environment variables from .env if present
if [ -f "$(git rev-parse --show-toplevel)/.env" ]; then
  # shellcheck disable=SC1091
  source "$(git rev-parse --show-toplevel)/.env"
fi

# Check for API key
if [ -z "${LOKI_API_KEY:-}" ]; then
  echo "Error: LOKI_API_KEY not set. Add it to your .env file." >&2
  exit 1
fi

LOKI_URL="${LOKI_URL:-https://logs.savvyweb.build}"

# =============================================================================
# Helper Functions
# =============================================================================

# Get current timestamp in nanoseconds
now_ns() {
  date -u +%s000000000
}

# Get timestamp N hours ago in nanoseconds
hours_ago_ns() {
  local hours=$1
  date -u -v-"${hours}"H +%s000000000
}

# Pretty print log results
pretty_print() {
  jq -r '.data.result[].values[] | "\(.[0] | tonumber / 1000000000 | strftime("%Y-%m-%d %H:%M:%S UTC")) | \(.[1])"'
}

# Print just the log messages
just_logs() {
  jq -r '.data.result[].values[][1]'
}

# Print available labels
print_labels() {
  jq -r '.data[]'
}

# Print label values
print_label_values() {
  jq -r '.data[]'
}

# =============================================================================
# API Functions
# =============================================================================

# Query logs over a time range
query_range() {
  local query=$1
  local start=${2:-$(hours_ago_ns 1)}
  local end=${3:-$(now_ns)}
  local limit=${4:-100}

  curl -sS -G "${LOKI_URL}/loki/api/v1/query_range" \
    -H "X-Api-Key: ${LOKI_API_KEY}" \
    --data-urlencode "query=${query}" \
    --data-urlencode "start=${start}" \
    --data-urlencode "end=${end}" \
    --data-urlencode "limit=${limit}"
}

# Instant query
query_instant() {
  local query=$1
  local limit=${2:-100}

  curl -sS -G "${LOKI_URL}/loki/api/v1/query" \
    -H "X-Api-Key: ${LOKI_API_KEY}" \
    --data-urlencode "query=${query}" \
    --data-urlencode "limit=${limit}"
}

# Get all labels
get_labels() {
  curl -sS "${LOKI_URL}/loki/api/v1/labels" \
    -H "X-Api-Key: ${LOKI_API_KEY}"
}

# Get values for a specific label
get_label_values() {
  local label=$1
  curl -sS "${LOKI_URL}/loki/api/v1/label/${label}/values" \
    -H "X-Api-Key: ${LOKI_API_KEY}"
}

# =============================================================================
# Convenience Commands
# =============================================================================

# Get recent GitHub webhook logs
github_logs() {
  local hours=${1:-1}
  query_range '{job="github-webhooks"}' "$(hours_ago_ns "$hours")" "$(now_ns)" 100
}

# Get Claude Code session logs
claude_logs() {
  local hours=${1:-1}
  query_range '{service_name="claude-code"}' "$(hours_ago_ns "$hours")" "$(now_ns)" 100
}

# Get logs for a specific session ID
claude_session() {
  local session_id=$1
  local hours=${2:-24}
  query_range "{service_name=\"claude-code\", session_id=\"${session_id}\"}" \
    "$(hours_ago_ns "$hours")" "$(now_ns)" 1000
}

# Search for errors
search_errors() {
  local hours=${1:-1}
  query_range '{job="github-webhooks"} |= "error"' "$(hours_ago_ns "$hours")" "$(now_ns)" 100
}

# Get CI events
ci_events() {
  local hours=${1:-24}
  query_range '{job="github-webhooks", category="ci"}' "$(hours_ago_ns "$hours")" "$(now_ns)" 100
}

# =============================================================================
# CLI Interface
# =============================================================================

show_help() {
  cat <<EOF
Loki Query Helper - Query Loki logs from the command line

Usage:
  $0 <command> [arguments]

Commands:
  range <query> [start] [end] [limit]  Query logs over a time range
  instant <query> [limit]              Instant query
  labels                               Get all available labels
  label-values <label>                 Get values for a specific label

Convenience Commands:
  github [hours]                       Recent GitHub webhook logs (default: 1 hour)
  claude [hours]                       Recent Claude Code logs (default: 1 hour)
  claude-session <session-id> [hours]  Logs for a specific Claude session (default: 24 hours)
  errors [hours]                       Search for errors (default: 1 hour)
  ci [hours]                           CI events (default: 24 hours)

Examples:
  # Recent GitHub webhooks
  $0 github 2 | jq -r '.data.result[].values[][1]'

  # Claude Code logs (last hour)
  $0 claude 1 | jq -r '.data.result[].values[][1]'

  # Specific session
  $0 claude-session 7dfe685e-dc62-4c4d-9c0f-966f298604b3

  # Custom query
  $0 range '{job="github-webhooks", event="push"}' "$(date -u -v-1H +%s)000000000" "$(date -u +%s)000000000" 50

  # Get all event types
  $0 label-values event

  # Pretty print with timestamps
  $0 github 1 | jq -r '.data.result[].values[] | "\(.[0] | tonumber / 1000000000 | strftime("%Y-%m-%d %H:%M:%S")) \(.[1])"'

Environment:
  LOKI_API_KEY  API key for authentication (required, set in .env)
  LOKI_URL      Loki URL (default: https://logs.savvyweb.build)

EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi

  local command=$1
  shift

  case "$command" in
    range)
      query_range "$@"
      ;;
    instant)
      query_instant "$@"
      ;;
    labels)
      get_labels
      ;;
    label-values)
      get_label_values "$@"
      ;;
    github)
      github_logs "$@"
      ;;
    claude)
      claude_logs "$@"
      ;;
    claude-session)
      claude_session "$@"
      ;;
    errors)
      search_errors "$@"
      ;;
    ci)
      ci_events "$@"
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo "Error: Unknown command '$command'" >&2
      echo "Run '$0 help' for usage information" >&2
      exit 1
      ;;
  esac
}

main "$@"
