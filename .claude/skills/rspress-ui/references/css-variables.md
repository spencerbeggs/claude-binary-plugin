# RSPress CSS Variables Reference

Complete reference for all CSS variables exposed by RSPress.

**Official docs:** <https://v2.rspress.rs/ui/vars>

## Brand Colors

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `--rp-c-brand` | #0095ff | Primary brand color |
| `--rp-c-brand-light` | #33adff | Lighter variant |
| `--rp-c-brand-lighter` | #c6e0fd | Lightest variant |
| `--rp-c-brand-dark` | #0077ff | Darker variant |
| `--rp-c-brand-darker` | #005fcc | Darkest variant |
| `--rp-c-brand-tint` | rgba(...) | Tinted overlay |

## Background Colors

| Variable | Light | Dark | Purpose |
| -------- | ----- | ---- | ------- |
| `--rp-c-bg` | #ffffff | #121212 | Primary background |
| `--rp-c-bg-soft` | - | - | Softer background |
| `--rp-c-bg-mute` | - | - | Muted background |

## Text Colors

Hierarchical text colors for visual emphasis:

| Variable | Purpose |
| -------- | ------- |
| `--rp-c-text-0` | Primary text (highest emphasis) |
| `--rp-c-text-1` | Secondary text |
| `--rp-c-text-2` | Tertiary text |
| `--rp-c-text-3` | Quaternary text |
| `--rp-c-text-4` | Lowest emphasis |
| `--rp-c-text-code` | Inline code text |
| `--rp-c-text-code-bg` | Inline code background |
| `--rp-c-text-code-border` | Inline code border |

## Code Block Styling

### Container

| Variable | Purpose |
| -------- | ------- |
| `--rp-code-block-color` | Code text color |
| `--rp-code-block-bg` | Code block background |
| `--rp-code-block-border` | Code block border |
| `--rp-code-font-size` | Font size (default: 0.875rem) |
| `--rp-code-title-bg` | Title bar background |

### Shiki Syntax Tokens

| Variable | Purpose |
| -------- | ------- |
| `--rp-shiki-constant` | Constants |
| `--rp-shiki-string` | Strings |
| `--rp-shiki-comment` | Comments |
| `--rp-shiki-keyword` | Keywords |
| `--rp-shiki-parameter` | Parameters |
| `--rp-shiki-function` | Functions |
| `--rp-shiki-punctuation` | Punctuation |
| `--rp-shiki-deleted` | Diff deletions |
| `--rp-shiki-inserted` | Diff insertions |

## Dividers

| Variable | Purpose |
| -------- | ------- |
| `--rp-c-divider` | Full opacity divider |
| `--rp-c-divider-light` | Reduced opacity divider |

## Border Radius

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `--rp-radius` | 1rem | Standard radius |
| `--rp-radius-small` | 0.5rem | Small elements |
| `--rp-radius-large` | 1.5rem | Large elements |

## Shadows

Progressive elevation levels:

| Variable | Purpose |
| -------- | ------- |
| `--rp-shadow-1` | Subtle elevation |
| `--rp-shadow-2` | Low elevation |
| `--rp-shadow-3` | Medium elevation |
| `--rp-shadow-4` | High elevation |
| `--rp-shadow-5` | Highest elevation |

## Gray Scale

| Variable | Purpose |
| -------- | ------- |
| `--rp-c-gray` | Base gray |
| `--rp-c-gray-light-1` | Light gray 1 |
| `--rp-c-gray-light-2` | Light gray 2 |
| `--rp-c-gray-light-3` | Light gray 3 |
| `--rp-c-gray-light-4` | Light gray 4 |
| `--rp-c-gray-light-5` | Light gray 5 |

## Homepage Components

| Variable | Purpose |
| -------- | ------- |
| `--rp-home-hero-title-bg` | Hero title gradient |
| `--rp-home-hero-secondary-color` | Secondary hero color |
| `--rp-home-background-bg` | Page background gradient |
| `--rp-home-feature-bg` | Feature card background |

## Links

| Variable | Purpose |
| -------- | ------- |
| `--rp-c-link` | Link color (brand-based) |
