# Monorepo Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-package repo into a Bun workspace
monorepo with `package/` (SDK) and `plugin/` (test plugin).

**Architecture:** Move SDK source into `package/`, split
`package.json` into root orchestrator + package-level config,
create `plugin/` workspace that imports the SDK via `workspace:*`.

**Tech Stack:** Bun workspaces, Turbo, Effect, `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-25-monorepo-conversion-design.md`

---

## Task 1: Move SDK Files into package/

**Files:**

- Create: `package/` directory
- Move: `src/` → `package/src/`
- Move: `__tests__/` → `package/__tests__/`
- Move: `tsconfig/` → `package/tsconfig/`
- Move: `tsconfig.json` → `package/tsconfig.json`
- Move: `bun.config.ts` → `package/bun.config.ts`
- Move: `bunfig.toml` → `package/bunfig.toml`
- Move: `types/` → `package/types/`
- Move: `tsdoc.json` → `package/tsdoc.json`

This task uses `git mv` to preserve history tracking.

- [ ] **Step 1: Create the package directory**

```bash
mkdir package
```

- [ ] **Step 2: Move SDK source and test directories**

```bash
git mv src package/src
git mv __tests__ package/__tests__
git mv tsconfig package/tsconfig
git mv tsconfig.json package/tsconfig.json
git mv types package/types
```

- [ ] **Step 3: Move build and test config**

```bash
git mv bun.config.ts package/bun.config.ts
git mv bunfig.toml package/bunfig.toml
git mv tsdoc.json package/tsdoc.json
```

- [ ] **Step 4: Move dist and coverage (if present)**

```bash
rm -rf dist coverage
```

These are build artifacts — no need to `git mv`. They will be
regenerated in `package/dist/` and `package/coverage/`.

- [ ] **Step 5: Commit the move**

```bash
git add -A
git commit -m "refactor: move SDK files into package/ directory

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Split package.json into Root and Package

**Files:**

- Modify: `package.json` (rewrite as workspace root)
- Create: `package/package.json` (SDK package config)

- [ ] **Step 1: Create package/package.json**

Create `package/package.json` with the SDK identity. This gets
the name, version, exports, dependencies, publishConfig, and
build scripts from the current root `package.json`.

```json
{
  "name": "claude-binary-plugin",
  "version": "0.1.0",
  "description": "Toolkit for compiling complex single-file executable Claude Code plugins",
  "keywords": ["claude", "claude-code", "plugin", "cli", "effect", "typescript", "bun", "anthropic"],
  "homepage": "https://github.com/spencerbeggs/claude-binary-plugin#documentation",
  "bugs": {
    "url": "https://github.com/spencerbeggs/claude-binary-plugin/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/spencerbeggs/claude-binary-plugin.git",
    "directory": "package"
  },
  "license": "MIT",
  "author": {
    "name": "C. Spencer Beggs",
    "email": "spencer@beggs.codes",
    "url": "https://spencerbeg.gs"
  },
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts",
    "./tsconfig/root.json": "./tsconfig/root.json",
    "./tsconfig/ecma/lib.json": "./tsconfig/ecma/lib.json"
  },
  "scripts": {
    "build": "turbo run build:dev build:npm --log-order=grouped",
    "build:dev": "bun run bun.config.ts --env-mode dev",
    "build:npm": "bun run bun.config.ts --env-mode npm",
    "test": "NODE_ENV=test bun test",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/api-logs": "^0.212.0",
    "@opentelemetry/exporter-logs-otlp-http": "^0.212.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.212.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.212.0",
    "@opentelemetry/resources": "^2.5.1",
    "@opentelemetry/sdk-logs": "^0.212.0",
    "@opentelemetry/sdk-metrics": "^2.5.1",
    "@opentelemetry/sdk-trace-base": "^2.5.1",
    "@opentelemetry/sdk-trace-node": "^2.5.1",
    "@opentelemetry/semantic-conventions": "^1.38.0",
    "type-fest": "5.4.4"
  },
  "devDependencies": {
    "@savvy-web/bun-builder": "^0.7.0",
    "@types/bun": "^1.3.9"
  },
  "peerDependencies": {
    "@effect/platform": "^0.96.0",
    "@effect/platform-bun": "^0.89.0",
    "effect": "^3.21.0"
  },
  "publishConfig": {
    "access": "public",
    "directory": "dist/dev",
    "linkDirectory": true,
    "targets": [
      {
        "protocol": "npm",
        "registry": "https://npm.pkg.github.com/",
        "directory": "dist/github",
        "access": "public",
        "provenance": true
      },
      {
        "protocol": "npm",
        "registry": "https://registry.npmjs.org/",
        "directory": "dist/npm",
        "access": "public",
        "provenance": true
      }
    ]
  }
}
```

- [ ] **Step 2: Rewrite root package.json as workspace orchestrator**

Replace the root `package.json` with:

```json
{
  "name": "claude-binary-plugin-monorepo",
  "private": true,
  "workspaces": ["package", "plugin"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "biome check --max-diagnostics=none",
    "lint:fix": "biome check --write --max-diagnostics=none",
    "lint:md": "markdownlint-cli2 --config './lib/configs/.markdownlint-cli2.jsonc'",
    "lint:md:fix": "markdownlint-cli2 --config './lib/configs/.markdownlint-cli2.jsonc' --fix",
    "prepare": "husky"
  },
  "devDependencies": {
    "@biomejs/biome": "<current version>",
    "@savvy-web/changesets": "^0.6.0",
    "@savvy-web/commitlint": "^0.4.3",
    "@savvy-web/lint-staged": "^0.6.2",
    "husky": "<current version>",
    "markdownlint-cli2": "<current version>",
    "turbo": "<current version>",
    "typescript": "<current version>"
  },
  "packageManager": "bun@1.3.9",
  "engines": {
    "bun": ">=1.3.9"
  },
  "trustedDependencies": ["@parcel/watcher", "msgpackr-extract", "protobufjs"]
}
```

**Important:** Read the current root `package.json` devDependencies
to get exact versions for biome, husky, markdownlint-cli2, turbo,
and typescript. The `<current version>` placeholders above must be
filled with actual versions.

- [ ] **Step 3: Update bunfig.toml coverage paths**

In `package/bunfig.toml`, update the `coveragePathIgnorePatterns`
to remove references to deleted CLI files:

```toml
coveragePathIgnorePatterns = [
  "src/otel/classes/Sidecar.ts",
  "src/otel/sidecar/classes/SidecarServer.ts",
  "src/otel/sidecar/classes/SidecarProviders.ts",
  "src/testing/builder.ts",
]
```

- [ ] **Step 4: Run bun install to link workspaces**

```bash
bun install
```

This will update `bun.lock` with the workspace resolution.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: split package.json into root and package workspace

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Update Turbo and Verify SDK Build

**Files:**

- Modify: `turbo.json`

- [ ] **Step 1: Update turbo.json for workspace structure**

The turbo config needs minor adjustments. The `$TURBO_ROOT$`
references now point to the monorepo root, and individual tasks
run per-workspace. Update:

```json
{
  "$schema": "https://turborepo.com/schema.v2.json",
  "globalPassThroughEnv": ["HOME", "XDG_CONFIG_HOME"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true,
      "outputs": ["dist/**"]
    },
    "build:dev": {
      "dependsOn": ["typecheck"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "package.json",
        "$TURBO_ROOT$/bun.lock",
        "tsconfig.json",
        "*.ts",
        "src/**/*"
      ],
      "outputs": ["dist/dev/**"]
    },
    "build:npm": {
      "dependsOn": ["typecheck"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "package.json",
        "$TURBO_ROOT$/bun.lock",
        "tsconfig.json",
        "*.ts",
        "src/**/*"
      ],
      "outputs": ["dist/npm/**"]
    },
    "test": {
      "cache": false,
      "dependsOn": ["typecheck"]
    },
    "typecheck": {
      "cache": true,
      "inputs": [
        "$TURBO_DEFAULT$",
        "package.json",
        "$TURBO_ROOT$/bun.lock",
        "tsconfig.json",
        "*.ts",
        "*.mts",
        "*.cts",
        "src/**/*.ts",
        "src/**/*.tsx",
        "src/**/*.mts",
        "src/**/*.cts",
        "lib/**/*.ts",
        "lib/**/*.mts",
        "lib/**/*.cts"
      ],
      "outputLogs": "errors-only"
    }
  }
}
```

Key change: `"build"` task gets `"dependsOn": ["^build"]` so
plugin build waits for package build. Renamed `types:check` to
`typecheck` to match the script name convention across workspaces.

- [ ] **Step 2: Update package/package.json typecheck script**

Ensure `package/package.json` scripts include `typecheck`:

```json
"scripts": {
  "build": "turbo run build:dev build:npm --log-order=grouped",
  "build:dev": "bun run bun.config.ts --env-mode dev",
  "build:npm": "bun run bun.config.ts --env-mode npm",
  "test": "NODE_ENV=test bun test",
  "typecheck": "tsgo --noEmit"
}
```

- [ ] **Step 3: Verify SDK tests pass**

```bash
cd package && bun test
```

Expected: All ~1082 tests pass.

- [ ] **Step 4: Verify SDK build works**

```bash
bun run build
```

Expected: Build succeeds (may need to run from root or package/).

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: update turbo config for workspace structure

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Create Test Plugin Workspace

**Files:**

- Create: `plugin/package.json`
- Create: `plugin/plugin.config.ts`
- Create: `plugin/plugin.build.ts`
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/hooks/session-start.ts`
- Create: `plugin/hooks/pre-tool-use.ts`
- Create: `plugin/tsconfig.json`

- [ ] **Step 1: Create plugin directory structure**

```bash
mkdir -p plugin/.claude-plugin plugin/hooks
```

- [ ] **Step 2: Create plugin/package.json**

```json
{
  "name": "test-plugin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun run plugin.build.ts",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "claude-binary-plugin": "workspace:*"
  }
}
```

- [ ] **Step 3: Create plugin/.claude-plugin/plugin.json**

```json
{
  "name": "test-plugin",
  "version": "0.0.1",
  "description": "Test plugin for dogfooding claude-binary-plugin SDK"
}
```

- [ ] **Step 4: Create plugin/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["*.ts", "hooks/**/*.ts"]
}
```

- [ ] **Step 5: Create plugin/hooks/session-start.ts**

```typescript
import type { SessionStartPipeline } from "claude-binary-plugin";

const handler: SessionStartPipeline<Record<string, never>> = () => {
 return {
  status: "executed" as const,
  summary: "Test plugin initialized",
 };
};

export default handler;
```

- [ ] **Step 6: Create plugin/hooks/pre-tool-use.ts**

```typescript
import type { PreToolUsePipeline } from "claude-binary-plugin";

const handler: PreToolUsePipeline<Record<string, never>> = ({ input }) => {
 const timestamp = new Date().toISOString();
 const toolName = input.tool_name;

 return {
  status: "executed" as const,
  action: "allow" as const,
  summary: `test-plugin observed ${toolName}`,
  additionalContext: `[test-plugin ${timestamp}] Tool: ${toolName}`,
 };
};

export default handler;
```

- [ ] **Step 7: Create plugin/plugin.config.ts**

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

- [ ] **Step 8: Create plugin/plugin.build.ts**

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import plugin from "./plugin.config.ts";

const result = await ClaudeBinaryPlugin.build(plugin, {
 rootDir: import.meta.dir,
});

if (!result.success) {
 console.error("Build failed:", result.output);
 process.exit(1);
}

console.log(`Built: ${result.output} (${result.duration}ms)`);
```

- [ ] **Step 9: Run bun install to link the workspace**

```bash
bun install
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add test plugin workspace for SDK dogfooding

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 5: Update .gitignore and CLAUDE.md

**Files:**

- Modify: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update .gitignore for plugin build artifacts**

Add to `.gitignore`:

```gitignore
# Plugin build artifacts
plugin/*.plugin
plugin/.plugin-entrypoint.ts
plugin/hooks/hooks.json
plugin/scripts/
```

- [ ] **Step 2: Update CLAUDE.md**

Update the development commands section to reflect the monorepo
structure:

- `bun install` at root installs all workspaces
- `bun run build` builds all workspaces (SDK first, then plugin)
- `bun run test` runs tests in all workspaces
- `cd package && bun test` for SDK tests only
- `cd plugin && bun run build` for plugin build only
- `claude --plugin-dir ./plugin` to test the live plugin

Update the "Core Source Files" section paths to reflect `package/`
prefix where relevant.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: update gitignore and CLAUDE.md for monorepo

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Run bun install from root**

```bash
bun install
```

Expected: Clean install, workspace linking works.

- [ ] **Step 2: Run SDK tests**

```bash
cd package && bun test
```

Expected: All ~1082 tests pass.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: Clean across both workspaces.

- [ ] **Step 4: Run SDK build**

```bash
cd package && bun run build
```

Expected: Build succeeds, `package/dist/` populated.

- [ ] **Step 5: Build the test plugin**

```bash
cd plugin && bun run build
```

Expected: Build succeeds, produces `test-plugin.plugin` binary
and `hooks/hooks.json`.

- [ ] **Step 6: Verify plugin binary runs**

```bash
cd plugin && echo '{"session_id":"test-123","cwd":"/tmp"}' | ./test-plugin.plugin --hook=SessionStart/init
```

Expected: JSON response with `"summary": "Test plugin initialized"`.

- [ ] **Step 7: Run lint**

```bash
bun run lint:fix
```

Expected: Clean (or only pre-existing warnings).

- [ ] **Step 8: Commit** (if any cleanup needed)

```bash
git add -A
git commit -m "chore: final monorepo verification cleanup

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
