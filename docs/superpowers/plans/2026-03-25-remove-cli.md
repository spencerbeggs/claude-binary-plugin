# Remove CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `@effect/cli`-based CLI and make
`ClaudeBinaryPlugin.build()` the sole build entry point.

**Architecture:** Delete `src/cli/`, remove `@effect/cli` dependency,
fix the hardcoded import path in `buildPluginFromConfig()`, remove
the `bin` entry from `package.json`.

**Tech Stack:** Bun, Effect, `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-25-remove-cli-design.md`

---

## Task 1: Fix Hardcoded Import Path in buildPluginFromConfig

**Files:**

- Modify: `src/build/builder.ts`
- Modify: `src/plugin/config.ts`
- Modify: `__tests__/build/builder.test.ts`

The programmatic build path hardcodes `"./plugin.ts"` as the
entrypoint import path. Add a `configPath` option and default it
to `"./plugin.config.ts"`.

- [ ] **Step 1: Add configPath to PluginBuildOptions**

In `src/plugin/config.ts`, add to the `PluginBuildOptions` interface
(after the `rootDir` field):

```typescript
/**
 * Path to the plugin config file, relative to rootDir.
 * Used as the import path in the generated entrypoint.
 * @defaultValue "./plugin.config.ts"
 */
configPath?: string;
```

- [ ] **Step 2: Update buildPluginFromConfig to use configPath**

In `src/build/builder.ts`, find `buildPluginFromConfig()` at
line ~1322. The options parameter already has the right shape.
Add `configPath` to the options type:

```typescript
async function buildPluginFromConfig(
  plugin: { ... },
  options: {
    rootDir?: string;
    configPath?: string;  // ADD THIS
    plugin?: string;
    // ...rest unchanged
  } = {},
)
```

Then replace line 1432:

```typescript
// Before:
const pluginImportPath = "./plugin.ts";

// After:
const configFile = options.configPath ?? "./plugin.config.ts";
const pluginImportPath = configFile.replace(/\.ts$/, ".js");
```

Note: the `.ts` → `.js` replacement is needed because the
generated entrypoint uses ESM imports with `.js` extensions.

- [ ] **Step 3: Run existing tests**

Run: `bun test __tests__/build/builder.test.ts`
Expected: PASS — existing tests don't exercise `buildPluginFromConfig`
directly (they test lower-level functions).

- [ ] **Step 4: Run full test suite**

Run: `bun test && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/build/builder.ts src/plugin/config.ts
git commit -m "fix: use configurable import path in buildPluginFromConfig

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Delete CLI and Remove Dependencies

**Files:**

- Delete: `src/cli/index.ts`
- Delete: `src/cli/macros.ts`
- Delete: `__tests__/cli/index.test.ts`
- Delete: `__tests__/cli/macros.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Delete CLI source files**

```bash
rm src/cli/index.ts src/cli/macros.ts
rmdir src/cli
```

- [ ] **Step 2: Delete CLI test files**

```bash
rm __tests__/cli/index.test.ts __tests__/cli/macros.test.ts
rmdir __tests__/cli
```

- [ ] **Step 3: Remove bin entry from package.json**

In `package.json`, remove the `"bin"` field (lines 27-29):

```json
"bin": {
  "claude-binary-plugin": "./src/cli/index.ts"
},
```

- [ ] **Step 4: Remove @effect/cli dependency**

```bash
bun remove @effect/cli
```

- [ ] **Step 5: Verify no remaining CLI references**

Search for any remaining references:

- `@effect/cli` imports in `src/`
- `cli/index` or `cli/macros` imports in `src/`
- `getPackageVersion` references outside of deleted files

Fix any that remain.

- [ ] **Step 6: Run full test suite**

Run: `bun test && bun run typecheck && bun run lint:fix`
Expected: All pass (test count decreases by ~10-15 from deleted
CLI tests)

- [ ] **Step 7: Verify build still works**

Run: `bun run build`
Expected: Build succeeds (the build system compiles the library,
not the CLI)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove CLI and @effect/cli dependency

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Update Exports and Design Docs

**Files:**

- Modify: `src/index.ts` (verify no CLI exports)
- Modify: `.claude/design/cli.md`
- Modify: `.claude/design/architecture.md`

- [ ] **Step 1: Verify index.ts has no CLI exports**

Read `src/index.ts` and confirm no references to `cli/` exist.
(There shouldn't be any based on current state.)

- [ ] **Step 2: Update .claude/design/cli.md**

Replace the CLI command documentation with documentation of the
programmatic build API:

- `ClaudeBinaryPlugin.build(plugin, options)` as the build entry
  point
- `PluginBuildOptions` interface with all fields
- Example `plugin.build.ts` usage
- Build artifacts produced

- [ ] **Step 3: Update .claude/design/architecture.md**

Remove references to `src/cli/` directory. Update the build
workflow description to reference `plugin.build.ts` pattern
instead of CLI commands.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint:fix`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update design docs for programmatic build API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Verify deleted files are gone**

```bash
test -d src/cli && echo "EXISTS" || echo "DELETED"
test -d __tests__/cli && echo "EXISTS" || echo "DELETED"
```

Expected: Both DELETED

- [ ] **Step 5: Verify no remaining @effect/cli references**

```bash
grep -rn "@effect/cli" src/ __tests__/
```

Expected: No matches

- [ ] **Step 6: Verify package.json has no bin entry**

```bash
grep -n '"bin"' package.json
```

Expected: No matches

- [ ] **Step 7: Commit** (if any cleanup needed)

```bash
git add -A
git commit -m "chore: final cleanup for CLI removal

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
