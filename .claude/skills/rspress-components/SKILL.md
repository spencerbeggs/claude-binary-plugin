---
name: rspress-components
description: >-
  Use RSPress built-in components and MDX features in documentation.
  Use when adding interactive elements like tabs, badges, steps,
  callouts, or code groups to documentation pages.
allowed-tools: Read, Write, Edit, Glob
---

# RSPress Components

Use built-in components and MDX features in documentation.

## Import Pattern

```tsx
import { Badge, Tabs, Tab } from 'rspress/theme';
```

## Available Components

| Component | Purpose |
| --------- | ------- |
| `Badge` | Inline status badges (info, tip, warning, danger) |
| `Tabs`, `Tab` | Tabbed content sections |
| `PackageManagerTabs` | npm/yarn/pnpm/bun command tabs |
| `Steps` | Numbered step-by-step instructions |
| `NoSSR` | Client-only rendering wrapper |

## Container Blocks

Use markdown syntax for callouts and collapsibles:

```markdown
:::tip
Helpful tip content
:::

:::details Summary text
Collapsible content
:::
```

Types: `tip`, `info`, `warning`, `danger`, `details`

## Code Block Features

* Language identifier: ` ```typescript `
* Line highlighting: ` ```typescript{2,4-6} `
* Diff highlighting: `// [!code ++]` and `// [!code --]`

## References

For complete syntax and examples:

* [references/components.md](references/components.md) - Detailed usage
  examples for all components and code block features
