---
name: rspress-page
description: >-
  Scaffold new RSPress documentation pages with proper structure and
  templates. Use when creating new docs pages, adding package
  documentation, writing guides, or setting up API reference pages.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# RSPress Page Scaffolding

Create new documentation pages with proper structure.

## Documentation Root

```text
../website/website/docs/en/claude-binary-plugin/
```

## Page Types

| Type | Location | Purpose |
| ---- | -------- | ------- |
| Overview | `index.mdx` | Package introduction |
| Guide | `{name}.mdx` | How-to content |
| API Reference | `api/` | Auto-generated |

## Page Checklist

1. Determine page type and location
2. Create file with appropriate frontmatter
3. Add single H1 heading
4. Write introduction paragraph
5. Structure with H2/H3 sections
6. Add code blocks with language identifiers
7. Ensure blank lines around blocks
8. Run markdown lint to validate

## Code Block Languages

`bash`, `typescript`, `javascript`, `json`, `yaml`, `text`, `tsx`, `mdx`

## References

For structure details:

* [references/structure.md](references/structure.md) - Directory layout,
  page types, and content structure guidelines

## Tips

* Keep content scannable with short paragraphs
* Use tables for structured data
* Link to related pages
* Follow existing patterns in the project
