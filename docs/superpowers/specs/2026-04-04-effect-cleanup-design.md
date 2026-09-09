# Effect Cleanup & type-fest Removal — Design Spec

**Date:** 2026-04-04
**Status:** Approved design
**Purpose:** Finish the Effect migration by converting remaining imperative patterns
and removing the type-fest dependency.

## Summary

Convert 9 files with remaining non-Effect patterns (try/catch, sync I/O,
console.error, Effect.runSync in callbacks, direct env/file access) to
idiomatic Effect code. Remove the type-fest dependency by replacing its types
with our own JSON and utility types. Delete the imperative
SessionRegistry facade.

## Design Decisions

### 1. Replace type-fest with own types

**JSON types** — replace type-fest re-exports in `src/types/json.ts`:

| type-fest | Replacement |
|-----------|-------------|
| `JsonValue` | Own: `string \| number \| boolean \| null \| JsonObject \| JsonArray` |
| `JsonObject` | Own: `{ [key: string]: JsonValue }` |
| `JsonArray` | Own: `readonly JsonValue[]` |
| `JsonPrimitive` | Own: `string \| number \| boolean \| null` |
| `Jsonifiable` | Own recursive type (values with toJSON()) |
| `Jsonify<T>` | Own recursive type (post-JSON-round-trip shape) |

**Utility types** — replace in `src/types/common.ts`:

| type-fest | Replacement |
|-----------|-------------|
| `ReadonlyDeep<T>` | Own recursive mapped type (~8 lines) |
| `PartialDeep<T>` | Own recursive mapped type (~8 lines) |
| `RequiredDeep` | Drop from public API (unused internally) |
| `WritableDeep` | Drop from public API (unused internally) |
| `Tagged` | Drop from public API (unused internally, we use Effect branded types) |

`JsonObjectWith<K>` stays, updated to reference own `JsonValue`.

After this, `type-fest` is removed from `package.json`.

### 2. Delete SessionRegistry, rewire to SessionStore

`SessionRegistry.ts` is an imperative facade with module-level mutable state.
`SessionStoreLive.ts` already provides the same operations as an Effect service.

- Fix `SessionStoreLive` to use `@effect/platform FileSystem` instead of
  `existsSync`/`mkdirSync`
- Rewire `EnvResolverLive` to inject `SessionStore` service instead of calling
  SessionRegistry functions
- Move `SessionRegistration` type to `src/services/SessionStore.ts`
- Delete `SessionRegistry.ts`
- Remove SessionRegistry exports from `index.ts`

### 3. CommandRunnerLive uses EnvResolver service

Replace self-contained env resolution with service injection:

- Add `EnvResolver` as a dependency
- Replace `findSessionEnvDir()` with `EnvResolver.getSessionEnvDir()` /
  `EnvResolver.getProjectSessionEnvDir()`
- Replace `Bun.env` reads with `EnvBridge.read()`
- Replace `Bun.file().text()` with `FileSystem.readFileString()`
- Replace `Bun.env[key] = value` with `EnvBridge.write()`
- Replace `Bun.Glob` iteration with `FileSystem.readDirectory()` + filter

### 4. ClaudeAccountInfoLive uses FileSystem service

- Add `FileSystem` as a dependency
- Replace `readFileSync` with `FileSystem.readFileString()`
- Replace `JSON.parse` + try/catch with `Effect.try()`
- Fallback to empty info via `Effect.catchAll`

### 5. PlatformInfoLive uses ShellExecutor

- Add `ShellExecutor` as a dependency
- Replace `Bun.spawnSync(["claude", "--version"])` with
  `ShellExecutor.exec("claude --version")`
- Parse version with `Effect.try()`, fallback to `"unknown"`

### 6. PluginRuntimeServiceLive uses Effect logging + Effect.try

- Replace `console.error` in debug logging with `Effect.logDebug`
- Replace `console.error` in validation with `Effect.logError`
- Replace try/catch around JSON.parse with `Effect.try()`
- Replace try/catch around base64 state decoding with `Effect.try()` pipeline
- No new service dependencies

### 7. SidecarConnectionLive removes runSync

- Replace `Effect.runSync(Ref.set(...))` in WebSocket callbacks with
  `Effect.runFork()` — fire-and-forget fibers in the layer's scope
- Replace try/catch around `socket.write()` with `Effect.try()`

### 8. SidecarTransportLive uses OtelConfig + FileSystem

- Replace `process.env.OTEL_SIDECAR_SOCKET` with `OtelConfig` service
- Replace `Bun.spawnSync(["rm", "-f", ...])` with `FileSystem.remove()`
- Add `FileSystem` as a dependency

## Files Changed

### Deleted

| File | Reason |
|------|--------|
| `src/layers/SessionRegistry.ts` | Replaced by SessionStore service |

### Modified

| File | Change |
|------|--------|
| `src/types/json.ts` | Replace type-fest re-exports with own types + Effect Schema |
| `src/types/common.ts` | Replace type-fest re-exports with own ReadonlyDeep/PartialDeep |
| `src/plugin/handler.ts` | Update ReadonlyDeep import to `../types/common.js` |
| `src/testing/builder.ts` | Update PartialDeep import to `../types/common.js` |
| `src/layers/PluginRuntimeServiceLive.ts` | console→Effect.log, try/catch→Effect.try, update ReadonlyDeep import |
| `src/layers/SessionStoreLive.ts` | existsSync/mkdirSync → FileSystem service |
| `src/layers/EnvResolverLive.ts` | SessionRegistry calls → SessionStore service |
| `src/layers/CommandRunnerLive.ts` | Use EnvResolver + EnvBridge + FileSystem |
| `src/layers/ClaudeAccountInfoLive.ts` | readFileSync → FileSystem service |
| `src/layers/PlatformInfoLive.ts` | Bun.spawnSync → ShellExecutor service |
| `src/layers/SidecarConnectionLive.ts` | runSync → runFork, try/catch → Effect.try |
| `src/layers/SidecarTransportLive.ts` | process.env → OtelConfig, Bun.spawnSync → FileSystem.remove |
| `src/layers/PluginLive.ts` | Update layer composition for new dependencies |
| `src/services/SessionStore.ts` | Add SessionRegistration type (moved from SessionRegistry) |
| `src/index.ts` | Remove SessionRegistry/type-fest exports, drop unused utility types |
| `package.json` | Remove type-fest dependency |

### Created

No new files — all changes are modifications or deletions.

## Migration Order

Bottom-up, respecting the dependency graph:

1. **Replace type-fest** — own JSON types + utility types, remove dependency.
   Pure type changes, no runtime impact.

2. **Fix leaf services** — ClaudeAccountInfoLive (FileSystem), PlatformInfoLive
   (ShellExecutor), SessionStoreLive (FileSystem). Independent changes.

3. **Delete SessionRegistry** — move SessionRegistration type, rewire
   EnvResolverLive to use SessionStore, delete the file.

4. **Fix CommandRunnerLive** — depends on EnvResolver rewiring being done.
   Inject EnvResolver + EnvBridge + FileSystem.

5. **Fix PluginRuntimeServiceLive** — console.error → Effect.log,
   try/catch → Effect.try. Independent of other changes.

6. **Fix OTEL sidecar** — SidecarConnectionLive (runSync → runFork),
   SidecarTransportLive (OtelConfig + FileSystem). Independent.

7. **Update PluginLive layer composition** — wire new dependencies.

8. **Update index.ts** — remove old exports, update public API.

## Testing Strategy

- All existing tests must continue to pass
- SessionRegistry deletion: covered by existing SessionStoreLive.test.ts and
  EnvResolverLive.test.ts
- CommandRunnerLive: update test to provide EnvResolver mock layer
- ClaudeAccountInfoLive: update test to provide FileSystem mock layer
- PlatformInfoLive: already has test layer factory
- PluginRuntimeServiceLive: existing tests cover behavior, logging changes
  are transparent
- Sidecar: existing tests should still pass (internal mechanics only)
