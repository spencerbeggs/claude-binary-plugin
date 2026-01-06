---
name: rspress-nav
description: >-
  Configure RSPress navigation bars and sidebars with _nav.json and
  _meta.json files. Use when setting up navigation, organizing sidebar
  sections, or configuring collapsible menu items.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# RSPress Navigation Configuration

Configure navigation using JSON files.

## Navigation Files

| File | Location | Purpose |
| ---- | -------- | ------- |
| `_nav.json` | Docs root | Top navbar items |
| `_meta.json` | Each directory | Sidebar for that section |

## Navbar Item Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `text` | string | Display text |
| `link` | string | URL or path |
| `activeMatch` | string | Regex for active state |
| `items` | array | Dropdown items |

## Sidebar Entry Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | string | `file`, `dir`, or `divider` |
| `name` | string | Filename (no extension) |
| `label` | string | Display text override |
| `collapsible` | boolean | Allow collapse (dirs) |
| `collapsed` | boolean | Initial state |

## Quick Patterns

* Omit `_meta.json` for auto-generated sidebar
* Use `{"type": "divider"}` for visual separators
* Use `activeMatch: "^/docs/"` for path-based highlighting

## References

For complete examples:

* [references/examples.md](references/examples.md) - Navbar, sidebar,
  and nested navigation configuration examples
