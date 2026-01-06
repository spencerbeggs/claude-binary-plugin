# Frontmatter Examples

## Standard Documentation Page

```yaml
---
title: Getting Started
description: Learn how to install and configure the project
sidebar: true
outline: true
---
```

## Home Page

```yaml
---
pageType: home
title: Welcome
navbar: true
sidebar: false
hero:
  name: My Project
  text: Build amazing things
  tagline: Fast, flexible, and powerful
  actions:
    - text: Get Started
      link: /guide/getting-started
      theme: brand
    - text: View on GitHub
      link: https://github.com/user/repo
      theme: alt
features:
  - title: Feature One
    details: Description of first feature
    icon: "\U0001F680"
  - title: Feature Two
    details: Description of second feature
    icon: "\u26A1"
---
```

## API Reference Page

```yaml
---
title: API Reference
description: Complete API documentation
outline: true
pageType: doc
---
```

## Blank Page (Custom Layout)

```yaml
---
pageType: blank
navbar: false
sidebar: false
footer: false
---
```

## Overview Page

```yaml
---
title: Guides
pageType: overview
overview: true
---
```

## Overview with Custom Headers

```yaml
---
pageType: overview
overview: true
overviewHeaders:
  - 2
  - 3
---
```

## Custom Title Suffix

```yaml
---
titleSuffix: 'Claude Binary Plugin SDK'
---
```

With pipe separator:

```yaml
---
titleSuffix: '| Claude Binary Plugin SDK'
---
```

## Custom Head Tags (Open Graph)

```yaml
---
head:
  - - meta
    - property: og:url
      content: https://example.com/docs/hooks/
  - - meta
    - property: og:image
      content: https://example.com/og-image.jpg
  - - link
    - rel: canonical
      href: https://example.com/docs/hooks/
---
```
