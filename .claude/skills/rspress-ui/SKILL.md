---
name: rspress-ui
description: >-
  Customize RSPress UI with CSS variables. Use when theming documentation,
  adjusting colors, typography, spacing, or styling code blocks.
allowed-tools: Read, Write, Edit, Glob
---

# RSPress UI System

Customize RSPress using CSS variables (design tokens).

**Reference:** <https://v2.rspress.rs/ui/vars>

## Quick Start

Override variables in `theme/index.css`:

```css
:where(:root) {
  --rp-c-brand: #8b5cf6;
  --rp-c-brand-light: #a78bfa;
  --rp-c-brand-dark: #7c3aed;
}

:where(.rp-dark) {
  --rp-c-brand: #a78bfa;
  --rp-c-brand-light: #c4b5fd;
  --rp-c-brand-dark: #8b5cf6;
}
```

## Variable Categories

| Category | Variables | Purpose |
| -------- | --------- | ------- |
| Brand | `--rp-c-brand-*` | Primary colors |
| Background | `--rp-c-bg-*` | Page backgrounds |
| Text | `--rp-c-text-*` | Text hierarchy |
| Code | `--rp-code-*`, `--rp-shiki-*` | Code blocks |
| Layout | `--rp-radius-*`, `--rp-shadow-*` | Spacing, elevation |
| Homepage | `--rp-home-*` | Hero, features |

## References

For complete variable lists and examples, read these files:

* [references/css-variables.md](references/css-variables.md) - Complete
  list of all CSS variables with defaults and purposes
* [references/theme-examples.md](references/theme-examples.md) - Ready-to-use
  theme configurations (purple, green, orange, code-only)

## Best Practices

* Always define both light and dark mode variants
* Use `:where()` selector for lower specificity
* Test readability with sufficient contrast ratios
* Override only the variables you need to change
