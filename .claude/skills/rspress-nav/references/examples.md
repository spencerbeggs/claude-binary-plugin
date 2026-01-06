# Navigation Configuration Examples

## Navbar Example

Place in docs root as `_nav.json`:

```json
[
  {
    "text": "Guide",
    "link": "/guide/introduction",
    "activeMatch": "^/guide/"
  },
  {
    "text": "API",
    "items": [
      { "text": "Core API", "link": "/api/core" },
      { "text": "Plugins", "link": "/api/plugins" }
    ]
  },
  {
    "text": "GitHub",
    "link": "https://github.com/user/repo"
  }
]
```

## Sidebar Example

Place in each directory as `_meta.json`:

```json
[
  {
    "type": "file",
    "name": "introduction",
    "label": "Getting Started"
  },
  {
    "type": "dir",
    "name": "concepts",
    "label": "Core Concepts",
    "collapsible": true,
    "collapsed": false
  },
  {
    "type": "divider"
  },
  {
    "type": "file",
    "name": "advanced"
  }
]
```

## Nested Sidebar with Custom Links

```json
[
  {
    "type": "dir",
    "name": "hooks",
    "label": "Hook Types",
    "link": "/api/hooks/overview",
    "collapsible": true,
    "collapsed": true
  },
  {
    "type": "dir",
    "name": "commands",
    "label": "Commands",
    "collapsible": true
  }
]
```

## Active Route Matching

Use regex patterns to highlight navbar items:

```json
{
  "text": "Documentation",
  "link": "/docs/intro",
  "activeMatch": "^/docs/"
}
```

Matches any path starting with `/docs/`.

## File Structure

```text
docs/src/en/
├── _nav.json           # Top navbar configuration
├── guide/
│   ├── _meta.json      # Guide section sidebar
│   ├── introduction.md
│   └── advanced.md
└── api/
    ├── _meta.json      # API section sidebar
    └── reference.md
```
