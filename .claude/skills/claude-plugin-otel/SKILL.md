---
name: claude-plugin-otel
description: >-
  Document OpenTelemetry integration for claude-binary-plugin. Use
  when documenting telemetry configuration, event emission, metrics
  recording, or sidecar architecture.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Claude Plugin OTEL Integration

Document telemetry by understanding current implementation.

## Approach

1. **Read schema docs** - `docs/SCHEMA.md` defines telemetry schema
2. **Check OTEL classes** - `src/otel/classes/` contains the API
3. **Verify constants** - `src/otel/constants.ts` has attribute names
4. **Document actual behavior** - Don't assume; read the code

## Source Files to Consult

| Topic | Source File |
| ----- | ----------- |
| Schema specification | `docs/SCHEMA.md` |
| OTEL classes | `src/otel/classes/` |
| Constants | `src/otel/constants.ts` |
| Sidecar client | `src/otel/client.ts` |
| Sidecar server | `src/otel/sidecar/` |

## Documentation Workflow

1. Read `docs/SCHEMA.md` for event types and attributes
2. List available classes from `src/otel/classes/`
3. Document class methods by reading source
4. Explain sidecar architecture from `docs/ARCHITECTURE.md`
5. Include configuration environment variables

## What to Document

* How to check if telemetry is enabled
* Event emission patterns
* Metric recording (counters, histograms)
* Sidecar lifecycle and IPC
* Environment variable configuration
