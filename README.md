# claude-binary-plugin

[![npm version][badge-npm]][npm]
[![License: MIT][badge-license]][license-osi]
[![Bun][badge-bun]][bun]
[![TypeScript][badge-ts]][typescript]

Build Claude Code plugins that compile to single-file Bun executables. Define
hooks and commands with a declarative pipeline system, Zod-validated
inputs/outputs, and built-in OpenTelemetry observability.

## Features

- Declarative hook pipelines with full type inference for all 10 Claude Code hook types
- Single-file Bun executables with cross-platform distribution via proxy scripts
- Zod-validated environment options, typed tool inputs, and branded identifiers
- Built-in `init` scaffolding to go from zero to working plugin in under a minute
- Fluent testing API with shell mocking, temp projects, and full state simulation

## Installation

```bash
bun add claude-binary-plugin
```

Requires [Bun][bun] >= 1.3.9 and [Zod][zod] >= 4.3.5
as a peer dependency.

## Quick Start

Scaffold a new plugin project:

```bash
bunx claude-binary-plugin init my-plugin
```

Or define a plugin manually:

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

Build the plugin:

```bash
bunx claude-binary-plugin build
```

## Documentation

Comprehensive documentation is available in the [docs directory][docs]:

- [Getting Started][getting-started] -- zero to working plugin
- [Plugin Configuration][plugin-config] -- `ClaudeBinaryPlugin.create()` deep dive
- [Hooks][hooks] -- all 10 hook types with examples
- [Commands][commands] -- CLI tools compiled into your plugin
- [CLI Reference][cli-ref] -- `build` and `init` command options

## License

[MIT][license]

[badge-npm]: https://img.shields.io/npm/v/claude-binary-plugin
[badge-license]: https://img.shields.io/badge/License-MIT-yellow.svg
[badge-bun]: https://img.shields.io/badge/Bun-%3E%3D1.3.9-black
[badge-ts]: https://img.shields.io/badge/TypeScript-5.9-blue
[npm]: https://www.npmjs.com/package/claude-binary-plugin
[license-osi]: https://opensource.org/licenses/MIT
[bun]: https://bun.sh
[typescript]: https://www.typescriptlang.org/
[zod]: https://zod.dev
[docs]: ./docs/README.md
[getting-started]: ./docs/01-getting-started.md
[plugin-config]: ./docs/02-plugin-configuration.md
[hooks]: ./docs/04-hooks/README.md
[commands]: ./docs/05-commands.md
[cli-ref]: ./docs/11-cli-reference.md
[license]: ./LICENSE
