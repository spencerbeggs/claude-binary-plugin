---
name: claude-plugin-hooks
description: >-
  Document hook types and handler patterns for claude-binary-plugin.
  Use when documenting SessionStart, PreToolUse, PostToolUse, Stop,
  and other hook event types.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Claude Plugin Hooks

Document hook types by understanding current implementation.

## Approach

1. **Read architecture docs** - `docs/ARCHITECTURE.md` explains hook flow
2. **Check event classes** - `src/events/` contains current event types
3. **Verify schemas** - `src/core/schemas.ts` defines input validation
4. **Document actual behavior** - Don't assume; read the code

## Source Files to Consult

| Topic | Source File |
| ----- | ----------- |
| Hook event types | `src/events/subclasses.ts` |
| Base event class | `src/events/base.ts` |
| Input validation | `src/core/schemas.ts` |
| Response types | `src/events/response-types.ts` |
| Pipeline execution | `src/pipeline/runtime.ts` |

## Documentation Workflow

1. Read `docs/ARCHITECTURE.md` section on hooks
2. List current hook types from `src/events/subclasses.ts`
3. Document input schemas from `src/core/schemas.ts`
4. Explain output format from `src/pipeline/types.ts`
5. Provide examples based on actual patterns in codebase

## What to Document

* What each hook type does and when it fires
* Input fields available to handlers
* Valid output actions and their effects
* Tool filtering for PreToolUse/PostToolUse
