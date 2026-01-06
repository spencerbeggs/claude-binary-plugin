---
name: claude-plugin-commands
description: >-
  Document command definition and execution for claude-binary-plugin.
  Use when documenting CLI command creation, argument parsing, or
  command handler patterns.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Claude Plugin Commands

Document command system by understanding current implementation.

## Approach

1. **Read architecture docs** - `docs/ARCHITECTURE.md` explains commands
2. **Check runtime** - `src/commands/` contains command execution logic
3. **Verify types** - Find current command definition types
4. **Document actual behavior** - Don't assume; read the code

## Source Files to Consult

| Topic | Source File |
| ----- | ----------- |
| Command runtime | `src/commands/runtime.ts` |
| Command types | `src/commands/types.ts` |
| Plugin config | `src/pipeline/config.ts` |

## Documentation Workflow

1. Read `docs/ARCHITECTURE.md` section on commands
2. Understand command definition structure from config types
3. Document argument parsing from runtime
4. Explain output format and exit codes
5. Show how commands access session state

## What to Document

* How to define commands in plugin config
* Argument schema definition with Zod
* Handler context (args, options, env)
* Output format for LLM consumption
* Skill markdown file structure
