# RSPress Theme Examples

## Custom Purple Theme

```css
:where(:root) {
  /* Brand */
  --rp-c-brand: #8b5cf6;
  --rp-c-brand-light: #a78bfa;
  --rp-c-brand-lighter: #ddd6fe;
  --rp-c-brand-dark: #7c3aed;
  --rp-c-brand-darker: #6d28d9;

  /* Code blocks */
  --rp-code-block-bg: #f8f7fc;
  --rp-shiki-keyword: #7c3aed;
  --rp-shiki-string: #059669;
}

:where(.rp-dark) {
  /* Brand - adjusted for dark mode */
  --rp-c-brand: #a78bfa;
  --rp-c-brand-light: #c4b5fd;
  --rp-c-brand-dark: #8b5cf6;

  /* Code blocks */
  --rp-code-block-bg: #1e1b2e;
}
```

## Custom Green Theme

```css
:where(:root) {
  --rp-c-brand: #10b981;
  --rp-c-brand-light: #34d399;
  --rp-c-brand-lighter: #a7f3d0;
  --rp-c-brand-dark: #059669;
  --rp-c-brand-darker: #047857;
}

:where(.rp-dark) {
  --rp-c-brand: #34d399;
  --rp-c-brand-light: #6ee7b7;
  --rp-c-brand-dark: #10b981;
}
```

## Custom Orange Theme

```css
:where(:root) {
  --rp-c-brand: #f97316;
  --rp-c-brand-light: #fb923c;
  --rp-c-brand-lighter: #fed7aa;
  --rp-c-brand-dark: #ea580c;
  --rp-c-brand-darker: #c2410c;
}

:where(.rp-dark) {
  --rp-c-brand: #fb923c;
  --rp-c-brand-light: #fdba74;
  --rp-c-brand-dark: #f97316;
}
```

## Customizing Code Blocks Only

```css
:where(:root) {
  /* Light mode code styling */
  --rp-code-block-bg: #fafafa;
  --rp-code-block-border: #e5e7eb;
  --rp-code-font-size: 0.9rem;

  /* Syntax colors */
  --rp-shiki-keyword: #d946ef;
  --rp-shiki-string: #16a34a;
  --rp-shiki-comment: #9ca3af;
  --rp-shiki-function: #2563eb;
}

:where(.rp-dark) {
  --rp-code-block-bg: #1f2937;
  --rp-code-block-border: #374151;

  --rp-shiki-keyword: #f0abfc;
  --rp-shiki-string: #86efac;
  --rp-shiki-comment: #6b7280;
  --rp-shiki-function: #93c5fd;
}
```

## Minimal Dark Mode Adjustments

```css
:where(.rp-dark) {
  /* Softer backgrounds */
  --rp-c-bg: #18181b;
  --rp-c-bg-soft: #27272a;
  --rp-c-bg-mute: #3f3f46;

  /* Adjusted text hierarchy */
  --rp-c-text-0: #fafafa;
  --rp-c-text-1: #e4e4e7;
  --rp-c-text-2: #a1a1aa;
}
```
