# Documentation Structure Reference

## Directory Layout

```text
../website/website/docs/en/claude-binary-plugin/
├── index.mdx                 # Package overview
├── architecture.mdx          # System architecture
├── cli.mdx                   # CLI usage guide
├── telemetry.mdx             # OTEL integration guide
├── testing/                  # Testing guides
│   ├── hooks.mdx
│   └── commands.mdx
└── api/                      # API reference (AUTO-GENERATED)
    ├── index.mdx
    ├── functions/
    ├── classes/
    └── interfaces/
```

## Page Type: Package Overview

Location: `index.mdx`

Structure:

* Brief description
* Installation section with bash code block
* Usage examples
* Configuration options
* Links to API reference

## Page Type: Guide

Location: `{guide-name}.mdx` or `{category}/{page-name}.mdx`

Structure:

* H1 heading matching the topic
* Introduction paragraph
* Organized sections with H2/H3 headings
* Code examples with language identifiers
* Step-by-step instructions using ordered lists

## Page Type: API Reference

Location: `api/{type}/{name}.mdx` (auto-generated)

Types: `functions/`, `classes/`, `types/`, `interfaces/`

Structure:

* H1 heading with the item name
* Description paragraph
* Signature section with TypeScript code block
* Parameters section (table or list)
* Returns section
* Examples section
* Related links

## Code Block Languages

* `bash` - Shell commands
* `typescript` - TypeScript code
* `javascript` - JavaScript code
* `json` - JSON configuration
* `yaml` - YAML configuration
* `text` - Plain text output
* `tsx` - React/TSX components
* `mdx` - MDX content

## Common Frontmatter Fields

* `title` - Page title (displayed in browser tab)
* `pageTitle` - Alternative page title for display
* `overview` - Boolean to control overview display
* `description` - Page description for SEO
