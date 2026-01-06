# claude-binary-plugin

TypeScript SDK for building Claude Code plugins that compile to single-file Bun executables.

[![npm version](https://img.shields.io/npm/v/claude-binary-plugin.svg)](https://www.npmjs.com/package/claude-binary-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **Declarative pipeline system** for hook handlers
- **Zod-validated** inputs and outputs
- **OpenTelemetry** observability integration
- **Type-safe** environment and state management
- **Single-file executables** via Bun compilation

## Installation

```bash
bun add claude-binary-plugin
```

Requires [Bun](https://bun.sh) >= 1.3.5

## Quick Start

Create a plugin configuration:

```typescript
// plugin.config.ts
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { z } from "zod";

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: z.object({
    TIMEOUT_MS: z.coerce.number().default(30000),
  }),
  hooks: {
    PreToolUse: [{
      name: "security",
      tools: ["Bash"],
      pipeline: "./hooks/security.ts",
    }],
  },
});

export default plugin;
```

Build the plugin:

```bash
claude-binary-plugin build
```

## Documentation

Full documentation available at [spencerbeg.gs/claude-binary-plugin](https://spencerbeg.gs/claude-binary-plugin)

## License

MIT
