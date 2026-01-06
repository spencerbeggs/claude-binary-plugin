---
name: rspress-frontmatter
description: >-
  Configure RSPress frontmatter for documentation pages. Use when
  setting up page metadata, controlling layout options, or configuring
  home page hero/features sections.
allowed-tools: Read, Write, Edit, Glob
---

# RSPress Frontmatter Configuration

Configure YAML frontmatter to control page metadata and layout.

## Core Fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `title` | string | Page title (overrides H1) |
| `description` | string | SEO meta description |
| `titleSuffix` | string | Browser tab suffix |
| `pageType` | string | `doc`, `home`, `overview`, `blank` |

## Layout Control

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `sidebar` | boolean | true | Show/hide sidebar |
| `outline` | boolean | true | Show/hide TOC |
| `navbar` | boolean | true | Show/hide navbar |
| `footer` | boolean | true | Show/hide footer |

## Special Features

| Field | Type | Description |
| ----- | ---- | ----------- |
| `overviewHeaders` | number[] | Header levels in overview (default: [2]) |
| `head` | array | Custom HTML head tags |
| `hero` | object | Home page hero section |
| `features` | array | Home page feature cards |

## References

For complete examples and advanced usage:

* [references/examples.md](references/examples.md) - Ready-to-use
  frontmatter configurations for all page types

## Notes

* Frontmatter must be at the very top of the file
* Use triple-dash (`---`) delimiters
* Boolean values: lowercase `true`, `false`
