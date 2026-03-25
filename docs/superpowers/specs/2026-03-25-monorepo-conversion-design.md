# Monorepo Conversion Design

## Overview

Convert the single-package `claude-binary-plugin` repo into a Bun
workspace monorepo with two packages: `package/` (the SDK) and
`plugin/` (a test plugin that dogfoods the SDK). This enables
end-to-end testing by booting Claude Code with `--plugin-dir ./plugin`.

## Goals

- Restructure into `package/` and `plugin/` workspaces
- Preserve all existing SDK functionality and tests
- Create a working test plugin with observable behavior
- Enable `claude --plugin-dir ./plugin` for live testing

## Workspace Structure

```text
claude-binary-plugin/           (workspace root)
  package.json                  (private, workspaces: ["package", "plugin"])
  turbo.json                    (orchestration across workspaces)
  biome.jsonc                   (shared linting config)
  .husky/                       (git hooks)
  lib/configs/                  (shared tool configs)
  docs/                         (specs, plans)
  .claude/                      (design docs, memory)
  CLAUDE.md
  README.md
  LICENSE
  CHANGELOG.md

  package/                      (claude-binary-plugin SDK)
    package.json                (name: claude-binary-plugin, publishConfig)
    tsconfig.json
    bun.config.ts
    bunfig.toml
    src/
    __tests__/
    tsconfig/
    types/
    dist/

  plugin/                       (test plugin, dogfoods the SDK)
    package.json                (depends on "claude-binary-plugin": "workspace:*")
    plugin.config.ts
    plugin.build.ts
    .claude-plugin/
      plugin.json
    hooks/
      session-start.ts
      pre-tool-use.ts
```

## Root package.json

The root becomes a bare workspace orchestrator:

- `private: true`
- `workspaces: ["package", "plugin"]`
- No `name` publish identity, no `exports`, no `version`
- devDependencies: shared tooling only (biome, turbo, husky,
  lint-staged, markdownlint, commitlint, changesets, typescript)
- Scripts: orchestration commands that delegate to turbo

## package/ (SDK)

Receives all current SDK source, tests, and build config:

- `package.json` with the current `claude-binary-plugin` name,
  version (0.1.0), exports, dependencies, publishConfig
- Dependencies: `effect`, `@effect/platform`, `@effect/platform-bun`,
  `type-fest`
- devDependencies: `@changesets/cli`, `@types/bun`, test-related deps
- `src/`, `__tests__/`, `tsconfig/`, `types/`, `bun.config.ts`,
  `bunfig.toml` all move here
- `dist/` output stays within `package/dist/`

## plugin/ (Test Plugin)

A minimal plugin that dogfoods the SDK with observable behavior:

### plugin.json

```json
{
  "name": "test-plugin",
  "version": "0.0.1",
  "description": "Test plugin for dogfooding claude-binary-plugin SDK"
}
```

### plugin.config.ts

Defines two hooks:

1. SessionStart hook that logs session initialization context
2. PreToolUse hook that adds `additionalContext` with a timestamp
   so the developer can see it appearing in the conversation,
   proving the pipeline runs end-to-end

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

export default ClaudeBinaryPlugin.create({
  prefix: "TEST_PLUGIN",
  hooks: {
    SessionStart: [
      { name: "init", pipeline: "./hooks/session-start.ts" },
    ],
    PreToolUse: [
      { name: "observe", pipeline: "./hooks/pre-tool-use.ts" },
    ],
  },
});
```

### hooks/session-start.ts

Returns `status: "executed"` with a summary confirming
initialization. No setup function needed.

### hooks/pre-tool-use.ts

Returns `status: "executed"`, `action: "allow"`, and adds
`additionalContext` with a timestamp and the tool name. This
produces visible output in the Claude Code conversation.

### plugin.build.ts

```typescript
import plugin from "./plugin.config.ts";
import { ClaudeBinaryPlugin } from "claude-binary-plugin";

const result = await ClaudeBinaryPlugin.build(plugin, {
  rootDir: import.meta.dir,
});

if (!result.success) {
  console.error("Build failed");
  process.exit(1);
}

console.log(`Built: ${result.output}`);
```

## Turbo Configuration

`turbo.json` stays at root. Tasks:

- `build` — runs in both workspaces; `plugin/` depends on
  `package/` build
- `test` — runs in `package/` only (plugin has no unit tests
  initially)
- `typecheck` — runs in both workspaces
- `lint` — continues to run at root level (biome is repo-wide)

## What Moves

| From (root) | To |
| ----------- | -- |
| `src/` | `package/src/` |
| `__tests__/` | `package/__tests__/` |
| `tsconfig/` | `package/tsconfig/` |
| `tsconfig.json` | `package/tsconfig.json` |
| `bun.config.ts` | `package/bun.config.ts` |
| `bunfig.toml` | `package/bunfig.toml` |
| `types/` | `package/types/` |
| `dist/` | `package/dist/` |
| `coverage/` | `package/coverage/` |
| `tsdoc.json` | `package/tsdoc.json` |

## What Stays at Root

| File | Reason |
| ---- | ------ |
| `turbo.json` | Workspace orchestration |
| `biome.jsonc` | Shared linting config |
| `.husky/` | Git hooks |
| `lib/configs/` | Shared tool configs (lint-staged, markdownlint, etc.) |
| `docs/` | Specs, plans (not package-specific) |
| `.claude/` | Design docs, memory |
| `CLAUDE.md` | Project instructions |
| `README.md` | Repo-level docs |
| `LICENSE` | License |
| `CHANGELOG.md` | Release history |
| `CONTRIBUTING.md` | Contribution guide |
| `SECURITY.md` | Security policy |

## Package Dependencies Split

### Root devDependencies (tooling)

- `@biomejs/biome`
- `turbo`
- `husky`
- `lint-staged`
- `markdownlint-cli2`
- `@commitlint/cli`, `@commitlint/config-conventional`
- `typescript` (or `@anthropic-ai/tsgo`)

### package/ dependencies (runtime)

- `effect`
- `@effect/platform`
- `@effect/platform-bun`
- `type-fest`

### package/ devDependencies (build and test)

- `@changesets/cli`
- `@types/bun`
- Other test/build-specific deps

### plugin/ dependencies

- `claude-binary-plugin: "workspace:*"`

## Migration Notes

- Git history will show the move as renames (use `git mv` to
  preserve history tracking)
- All import paths within `package/src/` remain unchanged
  (relative imports)
- `bun install` at root resolves workspace dependencies
- The `.gitignore` may need updates for `plugin/` build artifacts
- `bunfig.toml` coverage paths need updating after the move
- Turbo task config needs updating for the workspace structure
