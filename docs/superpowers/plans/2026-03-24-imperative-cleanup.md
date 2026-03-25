# Imperative Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up orphaned exports, convert remaining imperative static
classes to pure functions, consolidate protocol types to Schema.Class
only, and extract OTEL constants to remove the old OtelConfig class.

**Architecture:** Four phases executed sequentially. Phase 1 deletes
orphans. Phase 2 unwraps static classes into module-level functions.
Phase 3 replaces protocol interfaces with Schema.Class. Phase 4 extracts
constants and deletes the old OtelConfig class.

**Tech Stack:** Effect (Schema.Class, Context.Tag), `bun:test`, Biome

**Spec:** `docs/superpowers/specs/2026-03-24-imperative-cleanup-design.md`

---

## Task 1: Delete Orphaned Exports

**Files:**

- Modify: `src/schemas/branded.ts` (remove `HookNameSchema`)
- Modify: `src/schemas/json.ts` (remove `JsonArraySchema`)
- Delete: `src/otel/SessionEnv.ts`
- Delete: `__tests__/otel/SessionEnv.test.ts`
- Modify: `src/index.ts` (remove `SessionEnv` export)
- Modify: `src/commands/runtime.ts` (remove `emptyArgsSchema`)
- Modify: `src/testing/builder.ts` (remove `createTestBuilder`)

- [ ] **Step 1: Remove HookNameSchema from branded.ts**

Read `src/schemas/branded.ts`. Find and delete the `HookNameSchema`
export (the schema definition and any related type export). Keep all
other schemas.

- [ ] **Step 2: Remove JsonArraySchema from json.ts**

Read `src/schemas/json.ts`. Delete `JsonArraySchema` export. Keep
`JsonPrimitiveSchema`, `JsonValueSchema`, `JsonObjectSchema`.

- [ ] **Step 3: Delete SessionEnv**

```bash
rm src/otel/SessionEnv.ts __tests__/otel/SessionEnv.test.ts
```

Remove the `SessionEnv` export from `src/index.ts`.

- [ ] **Step 4: Remove emptyArgsSchema from runtime.ts**

Read `src/commands/runtime.ts`. Find `emptyArgsSchema` and delete it.
It's not exported and not used — just dead code.

- [ ] **Step 5: Remove createTestBuilder from builder.ts**

Read `src/testing/builder.ts`. Find `createTestBuilder` and delete it.
Not exported from `testing.ts`, not used.

- [ ] **Step 6: Run tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: All tests pass, no type errors. Test count may drop slightly
from deleted SessionEnv tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: delete orphaned exports (HookNameSchema, JsonArraySchema, SessionEnv, etc.)

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Consolidate ResourceConfig

**Files:**

- Modify: `src/services/OtelProviders.ts` (add `pluginVersion`,
  `marketplaceVersion` fields)
- Modify: `src/otel/SidecarResource.ts` (import ResourceConfig from
  OtelProviders instead of defining locally)

- [ ] **Step 1: Read both ResourceConfig definitions**

Read `src/services/OtelProviders.ts` and `src/otel/SidecarResource.ts`
to see the two `ResourceConfig` definitions side by side.

- [ ] **Step 2: Merge fields into OtelProviders.ts**

Add `pluginVersion?: string` and `marketplaceVersion?: string` to the
`ResourceConfig` interface in `src/services/OtelProviders.ts`.

- [ ] **Step 3: Update SidecarResource.ts**

Remove the local `ResourceConfig` type from `src/otel/SidecarResource.ts`.
Add `import type { ResourceConfig } from "../services/OtelProviders.js"`.

- [ ] **Step 4: Run tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: All pass — same type, just imported from a different location.

- [ ] **Step 5: Commit**

```bash
git add src/services/OtelProviders.ts src/otel/SidecarResource.ts
git commit -m "refactor: consolidate ResourceConfig into single definition

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Convert SidecarExporters to Module Functions

**Files:**

- Modify: `src/otel/SidecarExporters.ts`
- Modify: `__tests__/otel/SidecarExporters.test.ts`
- Modify: `src/layers/OtelProvidersLive.ts` (update import)

- [ ] **Step 1: Update test file first**

Read `__tests__/otel/SidecarExporters.test.ts`. Change all
`SidecarExporters.createTraceExporter(...)` calls to
`createTraceExporter(...)`, etc. Update the import statement.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/SidecarExporters.test.ts`
Expected: FAIL — named exports don't exist yet

- [ ] **Step 3: Convert the class to module functions**

Read `src/otel/SidecarExporters.ts`. Remove the class wrapper. Export
the three methods as standalone functions:

- `export function createTraceExporter(config)`
- `export function createMetricsExporter(config)`
- `export function createLogsExporter(config)`

Remove the private constructor and class declaration. Keep all logic
identical.

- [ ] **Step 4: Update OtelProvidersLive.ts import**

Change `SidecarExporters.createTraceExporter` to `createTraceExporter`
etc. Update the import statement.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test && bun run typecheck`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/SidecarExporters.ts __tests__/otel/SidecarExporters.test.ts \
  src/layers/OtelProvidersLive.ts
git commit -m "refactor: convert SidecarExporters from static class to module functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Convert SidecarResource to Module Function

**Files:**

- Modify: `src/otel/SidecarResource.ts`
- Modify: `__tests__/otel/SidecarResource.test.ts`
- Modify: `src/layers/OtelProvidersLive.ts` (update import)

- [ ] **Step 1: Update test file**

Change `SidecarResource.create(...)` to `createOtelResource(...)`.
Update import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/SidecarResource.test.ts`
Expected: FAIL

- [ ] **Step 3: Convert the class**

Remove class wrapper from `src/otel/SidecarResource.ts`. Export:

- `export function createOtelResource(config: ResourceConfig): Resource`

Keep all logic identical. Remove private constructor and class
declaration.

- [ ] **Step 4: Update OtelProvidersLive.ts**

Change `SidecarResource.create` to `createOtelResource`. Update import.

- [ ] **Step 5: Run tests**

Run: `bun run test && bun run typecheck`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/SidecarResource.ts __tests__/otel/SidecarResource.test.ts \
  src/layers/OtelProvidersLive.ts
git commit -m "refactor: convert SidecarResource from static class to module function

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 5: Convert Platform to Module Functions

**Files:**

- Modify: `src/otel/Platform.ts`
- Modify: `__tests__/otel/Platform.test.ts`
- Modify: `src/layers/OtelConfigLive.ts` (update import)
- Modify: `src/layers/SidecarConnectionLive.ts` (update import)
- Modify: `src/index.ts` (update export)

- [ ] **Step 1: Update test file**

Change all `Platform.isSupported()` to `isPlatformSupported()`, etc.
Update import. `Platform.getError()` becomes inlined in
`assertPlatformSupported()` — tests that called `getError()` directly
should test `assertPlatformSupported()` error message instead.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/Platform.test.ts`
Expected: FAIL

- [ ] **Step 3: Convert the class**

Remove class wrapper from `src/otel/Platform.ts`. Export functions:

- `export function getPlatform(): string`
- `export function isPlatformSupported(): boolean`
- `export function assertPlatformSupported(): void` (inline `getError()`)
- `export function socketExists(path: string): Promise<boolean>`
- `export function getSocketPath(dir: string, sessionId: string): string`
- `export function getSocketPathWithFallback(dir: string, sessionId: string): string`

Keep `SupportedPlatform` and `PlatformType` type exports.

- [ ] **Step 4: Update consumers**

- `OtelConfigLive.ts`: `Platform.isSupported()` → `isPlatformSupported()`
- `SidecarConnectionLive.ts`: `Platform.socketExists()` →
  `socketExists()`, `Platform.getSocketPathWithFallback()` →
  `getSocketPathWithFallback()`
- `src/otel/OtelConfig.ts`: `Platform.isSupported()` →
  `isPlatformSupported()` (old class, still alive until Task 10)
- `src/index.ts`: update Platform exports

- [ ] **Step 5: Run tests**

Run: `bun run test && bun run typecheck`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/Platform.ts __tests__/otel/Platform.test.ts \
  src/layers/OtelConfigLive.ts src/layers/SidecarConnectionLive.ts src/index.ts
git commit -m "refactor: convert Platform from static class to module functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 6: Convert ClaudeAccountInfo to Module Functions

**Files:**

- Modify: `src/otel/ClaudeAccountInfo.ts`
- Modify: `__tests__/otel/ClaudeAccountInfo.test.ts`
- Modify: `src/index.ts` (update export)
- Modify: any consumer importing ClaudeAccountInfo

- [ ] **Step 1: Update test file**

Change `ClaudeAccountInfo.detect()` to `detectClaudeAccountInfo()`,
`ClaudeAccountInfo.clearCache()` to `clearClaudeAccountInfoCache()`.
`info.isValid` stays as a property on the returned data. Update import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/ClaudeAccountInfo.test.ts`
Expected: FAIL

- [ ] **Step 3: Convert the class**

Remove class wrapper. Convert to:

- Module-level `let _cached: ClaudeAccountInfoData | null = null`
- `export function detectClaudeAccountInfo(): ClaudeAccountInfoData`
  (port `detect()` logic, use module-level cache)
- `export function clearClaudeAccountInfoCache(): void` (reset module
  cache)

Keep `ClaudeAccountInfoData` interface. The `isValid` getter was on the
class instance — check if tests use it. If so, add an `isValid` boolean
field computed during `detect()` and stored in the returned data.

- [ ] **Step 4: Update consumers and index.ts**

Update `src/index.ts` exports. The only consumer importing
`ClaudeAccountInfo` is `src/otel/OtelConfig.ts` (the old class, still
alive until Task 10) — update its import to use the new function name.
`message-builders.ts` and `OtelConfigLive.ts` do NOT import
`ClaudeAccountInfo`.

- [ ] **Step 5: Run tests**

Run: `bun run test && bun run typecheck`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/ClaudeAccountInfo.ts __tests__/otel/ClaudeAccountInfo.test.ts \
  src/index.ts
git commit -m "refactor: convert ClaudeAccountInfo from static class to module functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 7: Convert GitInfo to Module Functions

**Files:**

- Modify: `src/otel/GitInfo.ts`
- Modify: `__tests__/otel/GitInfo.test.ts`
- Modify: `src/layers/OtelProvidersLive.ts` (update import)
- Modify: `src/index.ts` (update export)

- [ ] **Step 1: Update test file**

Change all calls:

- `GitInfo.parseRemoteUrl(url)` → `parseGitRemoteUrl(url)`
- `GitInfo.detect()` → `detectGitInfo()`
- `info.isValid` → `isGitInfoValid(info)`
- `info.displayName` → `getGitInfoDisplayName(info)`
- `info.toAttributes()` → `gitInfoToAttributes(info)`

Update imports. This test file has 30+ test cases — update all of them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/otel/GitInfo.test.ts`
Expected: FAIL

- [ ] **Step 3: Convert the class**

Remove class wrapper from `src/otel/GitInfo.ts`. Export:

- `export function detectGitInfo(): Promise<GitInfoData>` (port
  `detect()` logic)
- `export function parseGitRemoteUrl(url: string): Partial<GitInfoData>`
  (port `parseRemoteUrl()`)
- `export function isGitInfoValid(info: GitInfoData): boolean` (port
  `isValid` getter logic)
- `export function getGitInfoDisplayName(info: GitInfoData): string`
  (port `displayName` getter logic)
- `export function gitInfoToAttributes(info: GitInfoData): Record<string, string>`
  (port `toAttributes()` method)

Keep `GitInfoData` interface and `GitProvider` type.

- [ ] **Step 4: Update consumers**

- `OtelProvidersLive.ts`: `GitInfo.detect()` → `detectGitInfo()`,
  `.toAttributes()` → `gitInfoToAttributes(info)`
- `src/index.ts`: update exports

- [ ] **Step 5: Run tests**

Run: `bun run test && bun run typecheck`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/otel/GitInfo.ts __tests__/otel/GitInfo.test.ts \
  src/layers/OtelProvidersLive.ts src/index.ts
git commit -m "refactor: convert GitInfo from static class to module functions

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 8: Protocol Consolidation — Replace Interfaces with Schema.Class

**Files:**

- Modify: `src/otel/protocol.ts` (delete interfaces, rename Schema.Class)
- Modify: `__tests__/otel/protocol-schema.test.ts` (update names)
- Modify: `__tests__/otel/protocol.test.ts` (if exists, update or delete)
- Modify: `src/otel/SidecarSpan.ts` (use Schema.Class constructors)
- Modify: `src/otel/message-builders.ts` (use Schema.Class constructors)
- Modify: `src/otel/EventHandler.ts` (type ref update)
- Modify: `src/otel/SpanHandler.ts` (type ref update)
- Modify: `src/otel/MetricHandler.ts` (type ref update)
- Modify: `src/layers/SidecarTransportLive.ts` (type ref update)
- Modify: `src/layers/SidecarConnectionLive.ts` (type ref update)
- Modify: `src/services/SidecarConnection.ts` (type ref update)
- Modify: `src/index.ts` (update exports)

- [ ] **Step 1: Rename Schema.Class definitions in protocol.ts**

In `src/otel/protocol.ts`:

- Rename `ScopeDataSchema` → `ScopeData`
- Rename `EventDataSchema` → `EventData`
- Rename `SpanEventSchema` → `SpanEvent`
- Rename `SpanStatusSchema` → `SpanStatus`
- Rename `SpanDataSchema` → `SpanData`
- Rename `MetricTypeSchema` → `MetricType`
- Rename `MetricDataSchema` → `MetricData`
- Rename `PingMessageSchema` → `PingMessage`
- Rename `SpanMessageSchema` → `SpanMessage`
- Rename `EventMessageSchema` → `EventMessage`
- Rename `MetricMessageSchema` → `MetricMessage`
- Rename `ShutdownMessageSchema` → `ShutdownMessage`
- Rename `SidecarProtocolMessageSchema` → `SidecarProtocolMessage`
- Rename `SpanStatusSchema` → `SpanStatus`

Delete all old TypeScript interfaces with the same names. Keep
`OtelProtocolConfig` and `SidecarResponse` interfaces.

Delete the comment about "retained for imperative code."

- [ ] **Step 2: Update SidecarSpan.ts**

Where `SidecarSpan` builds `SpanData` or `SpanMessage` as plain object
literals, change to `new SpanData({...})` and `new SpanMessage({...})`.
Since `.Type` has the same shape as the old interface, the field values
stay identical.

- [ ] **Step 3: Update message-builders.ts**

Where message builders construct `EventData` as plain object literals,
change to `new EventData({...})`. Same for `EventMessage`.

- [ ] **Step 4: Update handler type references**

In `EventHandler.ts`, `SpanHandler.ts`, `MetricHandler.ts`:
the function signatures use `EventData`, `SpanData`, `MetricData` as
parameter types. These names now refer to Schema.Class. The `.Type`
form is structurally identical to the old interface, so the handler
logic is unchanged. Just verify imports are correct.

- [ ] **Step 5: Update SidecarTransportLive.ts and SidecarConnectionLive.ts**

Update any type references. `SidecarProtocolMessage` is now a
Schema.Union type — verify it's imported correctly.

Update `SidecarConnection` service tag in
`src/services/SidecarConnection.ts` if it references protocol types.

- [ ] **Step 6: Update test files**

- `__tests__/otel/protocol-schema.test.ts`: rename all `*Schema`
  references to the new names
- `__tests__/otel/protocol.test.ts`: if this still exists with old
  interface tests, delete it or merge into protocol-schema.test.ts
- `__tests__/otel/SidecarSpan.test.ts`: update any protocol type
  constructors

- [ ] **Step 7: Update src/index.ts exports**

Replace old interface exports with Schema.Class exports. Verify the
exported names match what they were (e.g., `EventData` was exported
before, still exported now — just a different type).

- [ ] **Step 8: Run tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: All pass. No functional changes — just type source changed
from interface to Schema.Class.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: consolidate protocol types to Schema.Class only

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 9: Extract OTEL Constants

**Files:**

- Create: `src/otel/constants.ts`
- Modify: `src/layers/OtelConfigLive.ts` (import from constants)
- Modify: `src/otel/SidecarExporters.ts` (import from constants)
- Modify: `src/otel/SidecarResource.ts` (import from constants)
- Modify: `src/services/PluginEnv.ts` (replace `OtelConfig.isEnabled()`)
- Modify: any other file importing OtelConfig.DEFAULTS or OtelConfig.ENV_VARS

Note: `SidecarMain.ts` does NOT import OtelConfig — it uses its own
local idle timeout constant. Do not modify it.

- [ ] **Step 1: Create constants.ts**

Create `src/otel/constants.ts`:

```typescript
/**
 * Default values for OTEL configuration.
 */
export const OTEL_DEFAULTS = {
 ENDPOINT: "http://localhost:4318",
 PROTOCOL: "http" as const,
 SERVICE_NAME: "claude-code",
 SERVICE_NAMESPACE: "claude-code",
 IDLE_TIMEOUT_MS: 5 * 60 * 1000,
 EXPORT_TIMEOUT_MS: 30 * 1000,
} as const;

/**
 * Environment variable names for OTEL configuration.
 */
export const OTEL_ENV_VARS = {
 OTEL_EXPORTER_ENDPOINT: "OTEL_EXPORTER_OTLP_ENDPOINT",
 OTEL_EXPORTER_PROTOCOL: "OTEL_EXPORTER_OTLP_PROTOCOL",
 OTEL_EXPORTER_HEADERS: "OTEL_EXPORTER_OTLP_HEADERS",
 OTEL_SERVICE_NAME: "OTEL_SERVICE_NAME",
 OTEL_INCLUDE_SESSION_ID: "OTEL_INCLUDE_SESSION_ID",
 OTEL_SIDECAR_SOCKET: "OTEL_SIDECAR_SOCKET",
 OTEL_SIDECAR_SESSION_ID: "OTEL_SIDECAR_SESSION_ID",
 OTEL_SIDECAR_IDLE_TIMEOUT_MS: "OTEL_SIDECAR_IDLE_TIMEOUT_MS",
} as const;

/**
 * Check if OTEL telemetry is enabled.
 * Standalone function for imperative code paths (e.g., PluginEnv).
 * Effect code should use the OtelConfig service's `enabled` field.
 */
export function isOtelEnabled(): boolean {
 return Bun.env.CLAUDE_CODE_ENABLE_TELEMETRY === "1"
  && (process.platform === "darwin" || process.platform === "linux");
}
```

- [ ] **Step 2: Search for all OtelConfig.DEFAULTS and OtelConfig.ENV_VARS usages**

Search `src/` for all imports of `OtelConfig` from `./OtelConfig.js` or
`../otel/OtelConfig.js`. For each file, replace `OtelConfig.DEFAULTS.*`
with `OTEL_DEFAULTS.*` and `OtelConfig.ENV_VARS.*` with
`OTEL_ENV_VARS.*`.

Key files to check:

- `src/layers/OtelConfigLive.ts`
- `src/otel/SidecarExporters.ts` (now module functions)
- `src/otel/SidecarResource.ts` (now module function)
- `src/layers/SidecarConnectionLive.ts`
- `src/layers/SidecarTransportLive.ts`
- `src/services/PluginEnv.ts` — replace `OtelConfig.isEnabled()` with
  `isOtelEnabled()` from `constants.ts`. Remove `OtelConfig` import.

- [ ] **Step 3: Run tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: All pass — same values, different import source.

- [ ] **Step 4: Commit**

```bash
git add src/otel/constants.ts src/layers/OtelConfigLive.ts \
  src/otel/SidecarExporters.ts src/otel/SidecarResource.ts \
  src/otel/SidecarMain.ts
git commit -m "refactor: extract OTEL constants to shared constants.ts

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 10: Delete Old OtelConfig Class

**Files:**

- Delete: `src/otel/OtelConfig.ts`
- Modify: `src/index.ts` (verify no stale export)

- [ ] **Step 1: Verify no remaining imports**

Search for any remaining imports of `OtelConfig` from
`./otel/OtelConfig.js` or `../otel/OtelConfig.js` in `src/`. After
Task 9, there should be none. If any remain, update them to import
from `constants.ts`.

- [ ] **Step 2: Delete the file**

```bash
rm src/otel/OtelConfig.ts
```

- [ ] **Step 3: Verify index.ts**

Check `src/index.ts` doesn't export from the deleted file. The new
`OtelConfig` service (from `src/services/OtelConfig.ts`) should be the
only `OtelConfig` export.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `bun run test && bun run typecheck && bun run lint:fix`
Expected: All clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete old imperative OtelConfig class

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun run test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint:fix && bun run lint:md:fix`
Expected: Clean

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 5: Verify no remaining static classes in src/otel/**

Search: `grep -r "static class\|static readonly\|private constructor" src/otel/`

Expected: Only `PluginInfo.ts` (kept as singleton) and any `as const`
patterns. No other static classes should remain.

- [ ] **Step 6: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final cleanup for imperative removal

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
