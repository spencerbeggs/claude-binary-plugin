---
name: claude-plugin-concepts
description: >-
  Document core claude-binary-plugin SDK concepts and patterns. Use
  when explaining the three-layer model, plugin configuration, pipeline
  system, or state management.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Claude Binary Plugin Concepts

Document core SDK concepts by understanding current implementation.

## Approach

1. **Read internal docs first** - `docs/ARCHITECTURE.md` is the source
   of truth for architectural concepts
2. **Verify against source** - Check `src/` files to confirm patterns
3. **Document current behavior** - Don't assume; verify how it works

## Key Concepts to Document

| Concept | Source of Truth |
| ------- | --------------- |
| Three-layer model | `docs/ARCHITECTURE.md` |
| Plugin configuration | `src/pipeline/config.ts` |
| State management | `src/state/plugin-state.ts` |
| Session persistence | `src/state/session-registry.ts` |

## Documentation Workflow

1. Read `docs/ARCHITECTURE.md` for conceptual overview
2. Read relevant source files to understand current implementation
3. Extract patterns and explain them clearly
4. Include code examples from actual source (not hypothetical)
5. Link to auto-generated API docs for class/function details

## What to Avoid

* Don't copy outdated examples - verify against source
* Don't assume API shapes - read the actual types
* Don't document features that may have changed
