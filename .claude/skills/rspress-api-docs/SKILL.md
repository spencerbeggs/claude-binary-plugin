---
name: rspress-api-docs
description: >-
  Generate API documentation from TypeScript source code for RSPress.
  Use when documenting package APIs, extracting types, or creating
  function/class reference pages.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# RSPress API Documentation

Generate API documentation from TypeScript source code.

## Important: Auto-Generated API Docs

For this project, API reference docs in `api/` are **auto-generated**
from API Extractor. Do not manually edit files there. Instead:

* Link to entities in `api/` from guide pages
* Update TSDoc comments in source code to improve API docs
* Run `bun run build` to regenerate the doc model

This skill is useful for writing guide-level documentation that
references the auto-generated API docs.

## Workflow

1. **Find source code** - Use Glob to locate files
2. **Identify exports** - Use Grep to find exported items
3. **Read source** - Extract type signatures, TSDoc comments
4. **Write guides** - Reference auto-generated API docs

## References

For manual API documentation templates (if needed):

* [references/templates.md](references/templates.md) - Templates for
  function, type/interface, and class documentation pages

## Tips

* Extract TSDoc comments from source for descriptions
* Include practical examples users can copy
* Link related types and functions together
* Test code examples before documenting
