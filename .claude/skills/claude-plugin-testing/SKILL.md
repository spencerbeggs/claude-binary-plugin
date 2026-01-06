---
name: claude-plugin-testing
description: >-
  Document testing patterns and utilities for claude-binary-plugin.
  Use when documenting hook testing, command testing, environment
  mocking, or the PluginTestBuilder API.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Claude Plugin Testing

Document testing utilities by understanding current implementation.

## Approach

1. **Read test files** - `tests/` shows actual testing patterns
2. **Check mock utilities** - `src/testing/` contains test helpers
3. **Verify exports** - Check what's exported from mocks module
4. **Document actual behavior** - Don't assume; read the code

## Source Files to Consult

| Topic | Source File |
| ----- | ----------- |
| Mock utilities | `src/testing/mocks.ts` |
| Test builder | `src/testing/builder.ts` |
| Example tests | `tests/` directory |

## Documentation Workflow

1. Read `src/testing/mocks.ts` for available mock functions
2. Read `src/testing/builder.ts` for test builder API
3. Look at actual tests in `tests/` for usage patterns
4. Document based on current exports and signatures
5. Include examples from actual test files

## What to Document

* Environment mocking utilities and options
* Test builder for hooks and commands
* Shell executor injection patterns
* Test file organization conventions
* Best practices from existing tests
