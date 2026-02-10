# claude-binary-plugin

TypeScript SDK for building Claude Code plugins that compile to single-file
Bun executables.

[![npm version](https://img.shields.io/npm/v/claude-binary-plugin.svg)](https://www.npmjs.com/package/claude-binary-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3.6-black)](https://bun.sh)

Claude Code plugins intercept hook events (tool use, session lifecycle, prompts)
and respond with decisions. This SDK handles the boilerplate: stdin/stdout
protocol, Zod validation, state persistence, and compilation to a single
executable binary.

## Features

- **Declarative pipeline system** for hook handlers with typed inputs and outputs
- **Three-layer context model** -- hook input, validated options, computed state
- **All hook types supported** -- PreToolUse, PostToolUse, SessionStart, Stop,
  and more
- **Command runtime** for CLI tools exposed via skill markdown files
- **OpenTelemetry observability** with fire-and-forget sidecar architecture

## Installation

```bash
bun add claude-binary-plugin
```

Requires [Bun](https://bun.sh) >= 1.3.6 and [Zod](https://zod.dev) >= 4.3.5
as a peer dependency.

## Quick Start

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
      pipeline: "./hooks/security.hook.ts",
    }],
  },
});

export default plugin;
```

Build and install the plugin:

```bash
claude-binary-plugin build
```

## Documentation

For architecture, API reference, and advanced usage, see the
[documentation site](https://spencerbeg.gs/claude-binary-plugin).

## License

[MIT](./LICENSE)
