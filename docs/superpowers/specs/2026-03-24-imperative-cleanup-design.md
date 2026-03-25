# Imperative Cleanup Design

## Overview

Clean up orphaned exports, consolidate duplicate types, convert remaining
imperative static classes to pure functions, and migrate protocol types
from dual interface+Schema.Class to Schema.Class only. Four phases, each
independently shippable.

## Scope

- OTEL remnants, orphaned exports, protocol consolidation, remaining
  imperative classes
- **Excluded:** Legacy modules (`Commands`, `PluginTester`, `DebugLogger`)
  — separate effort with their own replacement services

## Phase 1: Safe Cleanup

Zero-risk deletions and consolidations.

### Deletions

| Export | File | Reason |
| ---- | ---- | ---- |
| `HookNameSchema` | `src/schemas/branded.ts` | Never imported anywhere |
| `JsonArraySchema` | `src/schemas/json.ts` | Never imported anywhere |
| `SessionEnv` class | `src/otel/SessionEnv.ts` | All methods are dead code — zero callers in `src/` for `getDir()`, `shouldIncludeSessionId()`, `getIdleTimeout()`, or `extractSessionId()`. Functionality absorbed by SidecarConnectionLive and SidecarMain. |
| `emptyArgsSchema` | `src/commands/runtime.ts` | Unexported, unused |
| `createTestBuilder` | `src/testing/builder.ts` | Unexported, unused |

Also delete `__tests__/otel/SessionEnv.test.ts` and remove `SessionEnv`
export from `src/index.ts`.

### ResourceConfig Consolidation

`ResourceConfig` is defined in both `src/services/OtelProviders.ts` and
`src/otel/SidecarResource.ts`. The two definitions differ:

- `OtelProviders.ts` version: 8 fields (endpoint, protocol, serviceName,
  pluginName, marketplaceName, resourceAttributes, headers, exportTimeoutMs)
- `SidecarResource.ts` version: extends `OtelProtocolConfig`, adds
  `pluginVersion` and `marketplaceVersion`

**Resolution:** Merge into single definition in `OtelProviders.ts`. Add
the two missing fields (`pluginVersion`, `marketplaceVersion`) from the
SidecarResource version. Delete the duplicate from `SidecarResource.ts`
and import from `OtelProviders.ts`.

## Phase 2: Imperative Classes to Pure Functions

All remaining static-method-only classes in `src/otel/` become module-level
functions. They are implementation details consumed by Effect layers — they
don't need to be services themselves.

### SidecarExporters (pure factory)

Remove static class wrapper from `src/otel/SidecarExporters.ts`. Export
functions directly:

- `createTraceExporter(config)` (was `SidecarExporters.createTraceExporter`)
- `createMetricsExporter(config)` (was `SidecarExporters.createMetricsExporter`)
- `createLogsExporter(config)` (was `SidecarExporters.createLogsExporter`)

### SidecarResource (pure factory)

Remove static class wrapper from `src/otel/SidecarResource.ts`. Export
function directly:

- `createOtelResource(config)` (was `SidecarResource.create`)

### Platform (pure detection)

Remove static class wrapper from `src/otel/Platform.ts`. Export functions:

- `getPlatform()` (was `Platform.get`)
- `isPlatformSupported()` (was `Platform.isSupported`)
- `assertPlatformSupported()` (was `Platform.assertSupported`)
- `socketExists(path)` (was `Platform.socketExists`)
- `getSocketPath(dir, sessionId)` (was `Platform.getSocketPath`)
- `getSocketPathWithFallback(dir, sessionId)` (was `Platform.getSocketPathWithFallback`)

`Platform.getError()` is only called internally by `assertPlatformSupported()`.
Inline it — no standalone export needed.

### ClaudeAccountInfo (env reader with cache)

Remove static class wrapper from `src/otel/ClaudeAccountInfo.ts`. The class
has a `_cached` static field and `clearCache()` public method.

Export:

- `detectClaudeAccountInfo()` (was `ClaudeAccountInfo.detect`) — uses
  module-level `let _cached` variable for singleton caching
- `clearClaudeAccountInfoCache()` (was `ClaudeAccountInfo.clearCache`) —
  resets the module-level cache. Used by tests in `afterEach`.

The `ClaudeAccountInfoData` interface stays as a return type. The `isValid`
getter becomes a field check in the returned data object (already a boolean
expression, not stored state).

### GitInfo (async detection with computed properties)

Remove static class wrapper from `src/otel/GitInfo.ts`. The class has
instance getters (`isValid`, `displayName`) and a static helper
(`parseRemoteUrl`).

Export:

- `detectGitInfo()` (was `GitInfo.detect`) — returns `GitInfoData`
- `parseGitRemoteUrl(url)` (was `GitInfo.parseRemoteUrl`) — public static
  helper, called internally and tested directly (18 test cases)
- `isGitInfoValid(info: GitInfoData): boolean` (was `GitInfo.isValid` getter)
  — computed from data fields, tested directly (7 test cases)
- `getGitInfoDisplayName(info: GitInfoData): string` (was
  `GitInfo.displayName` getter) — computed from data fields, tested
  directly (4 test cases)
- `gitInfoToAttributes(info: GitInfoData)` (was `GitInfo.toAttributes`
  instance method)

The `GitInfoData` interface and `GitProvider` type stay as return/field
types.

### PluginInfo (mutable singleton)

**Keep as-is.** It's an intentional global mutable singleton (set once at
startup, read many times). Converting to `Ref` adds complexity without
benefit since it's set before any Effect code runs.

### Consumer Updates

All consumers update from `ClassName.method()` to `functionName()`:

- `OtelProvidersLive.ts` — `SidecarExporters.*` → direct function calls
- `OtelProvidersLive.ts` — `SidecarResource.create` → `createOtelResource`
- `OtelProvidersLive.ts` — `GitInfo.detect` → `detectGitInfo`
- `OtelConfigLive.ts` — `Platform.isSupported` → `isPlatformSupported`
- `SidecarConnectionLive.ts` — `Platform.*` → direct function calls
- `message-builders.ts` — `ClaudeAccountInfo.detect` →
  `detectClaudeAccountInfo`

### Test File Updates

Tests call the class API directly and need updating:

| Test File | Changes |
| ---- | ---- |
| `__tests__/otel/Platform.test.ts` | `Platform.isSupported()` → `isPlatformSupported()` etc. |
| `__tests__/otel/ClaudeAccountInfo.test.ts` | `ClaudeAccountInfo.detect()` → `detectClaudeAccountInfo()`, `clearCache()` → `clearClaudeAccountInfoCache()` |
| `__tests__/otel/GitInfo.test.ts` | `GitInfo.parseRemoteUrl()` → `parseGitRemoteUrl()`, `info.isValid` → `isGitInfoValid(info)`, `info.displayName` → `getGitInfoDisplayName(info)` |
| `__tests__/otel/SidecarExporters.test.ts` | `SidecarExporters.createTraceExporter()` → `createTraceExporter()` etc. |
| `__tests__/otel/SidecarResource.test.ts` | `SidecarResource.create()` → `createOtelResource()` |

## Phase 3: Protocol Consolidation

Migrate from dual interface+Schema.Class to Schema.Class only in
`src/otel/protocol.ts`.

### Rename Strategy

Drop the "Schema" suffix — Schema.Class versions replace the old
interfaces:

| Old Interface | Old Schema.Class | New Name |
| ---- | ---- | ---- |
| `ScopeData` | `ScopeDataSchema` | `ScopeData` (Schema.Class) |
| `EventData` | `EventDataSchema` | `EventData` (Schema.Class) |
| `SpanEvent` | `SpanEventSchema` | `SpanEvent` (Schema.Class) |
| `SpanData` | `SpanDataSchema` | `SpanData` (Schema.Class) |
| `MetricData` | `MetricDataSchema` | `MetricData` (Schema.Class) |
| `MetricType` | `MetricTypeSchema` | `MetricType` (Schema.Union) |
| `PingMessage` | `PingMessageSchema` | `PingMessage` (Schema.Class) |
| `SpanMessage` | `SpanMessageSchema` | `SpanMessage` (Schema.Class) |
| `EventMessage` | `EventMessageSchema` | `EventMessage` (Schema.Class) |
| `MetricMessage` | `MetricMessageSchema` | `MetricMessage` (Schema.Class) |
| `ShutdownMessage` | `ShutdownMessageSchema` | `ShutdownMessage` (Schema.Class) |
| `SidecarProtocolMessage` | `SidecarProtocolMessageSchema` | `SidecarProtocolMessage` (Schema.Union) |

### What Stays as Interfaces

- `OtelProtocolConfig` — complex config object, doesn't cross trust
  boundary requiring validation
- `SidecarResponse` — simple `{ ok, error?, version? }` response

### BigInt Handling

Schema.Class with `Schema.BigInt` has two forms:

- `.Type` (decoded/runtime) = `bigint` — same as current interfaces
- `.Encoded` (wire format) = `string` — for JSON serialization

Internal code works with `.Type`, which has the same `bigint` fields as
the old interfaces. The migration is type-compatible for all consumers.

**Follow-on opportunity:** After protocol consolidation, the manual
`bigIntReplacer` in `SidecarConnectionLive.ts` could be replaced by
`Schema.encode` for serialization, since the Schema.Class handles
BigInt-to-string conversion automatically. This is optional and can
be done as a separate improvement.

### Consumer Updates

| Consumer | Change |
| ---- | ---- |
| `EventHandler.ts` | Type reference only — `EventData` now Schema.Class `.Type` |
| `SpanHandler.ts` | Type reference only |
| `MetricHandler.ts` | Type reference only |
| `SidecarSpan.ts` | Use `new SpanData({...})` instead of plain object literal |
| `message-builders.ts` | Use `new EventData({...})` instead of plain object literal |
| `SidecarTransportLive.ts` | Type reference changes, logic unchanged |
| `SidecarConnectionLive.ts` | Type reference changes |
| `src/index.ts` | Update protocol type exports |
| `__tests__/otel/protocol.test.ts` | Update to use Schema.Class constructors |
| `__tests__/otel/protocol-schema.test.ts` | Rename references |
| `__tests__/otel/SidecarSpan.test.ts` | Update protocol type constructors |

### SpanStatus Special Case

The current `SpanData` interface has an inline `status` object type. The
Schema.Class version uses `SpanStatusSchema` (now renamed `SpanStatus`).
The `SpanStatus` Schema.Class has `code: Literal("unset", "ok", "error")`
and `message: optional(String)` — same shape as the inline type.

## Phase 4: Old OtelConfig Removal

### Extract Constants

Create `src/otel/constants.ts` with constants currently on the old
`OtelConfig` class:

```typescript
export const OTEL_DEFAULTS = {
  ENDPOINT: "http://localhost:4318",
  PROTOCOL: "http" as const,
  SERVICE_NAME: "claude-code",
  SERVICE_NAMESPACE: "claude-code",
  IDLE_TIMEOUT_MS: 5 * 60 * 1000,
  EXPORT_TIMEOUT_MS: 30 * 1000,
} as const;

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
```

Note: env var names match the existing values in `OtelConfig.ENV_VARS`
exactly — no prefix changes.

### OtelConfig Instance Methods

The old `OtelConfig` class has three getter methods (`effectiveEndpoint`,
`effectiveProtocol`, `effectiveServiceName`) that compute values with
fallbacks. These are only called within `OtelConfig.ts` itself — zero
external callers. They are deleted with the class.

### Update Consumers

- `OtelConfigLive.ts` — import from `constants.ts`
- `SidecarResource.ts` (now `createOtelResource`) — import from
  `constants.ts`
- `SidecarExporters.ts` (now functions) — import from `constants.ts`
- `SidecarMain.ts` (`readIdleTimeout`) — import from `constants.ts`
- Any other file importing from old `OtelConfig`

### Delete

- `src/otel/OtelConfig.ts` — the old imperative class
- Remove from `src/index.ts` if still exported (should already be
  replaced by new `OtelConfig` service export)

## File Disposition Summary

### Deleted

| File | Phase | Reason |
| ---- | ---- | ---- |
| `src/otel/SessionEnv.ts` | 1 | Orphaned (all methods dead code) |
| `__tests__/otel/SessionEnv.test.ts` | 1 | Test for deleted file |
| `src/otel/OtelConfig.ts` | 4 | Replaced by service + constants |

### Converted (class wrapper removed)

| File | Phase |
| ---- | ---- |
| `src/otel/SidecarExporters.ts` | 2 |
| `src/otel/SidecarResource.ts` | 2 |
| `src/otel/Platform.ts` | 2 |
| `src/otel/ClaudeAccountInfo.ts` | 2 |
| `src/otel/GitInfo.ts` | 2 |

### Updated (Phase 3 consumer changes)

| File | Phase | Change |
| ---- | ---- | ---- |
| `src/otel/protocol.ts` | 3 | Interfaces replaced by Schema.Class |
| `src/otel/SidecarSpan.ts` | 3 | Plain objects → Schema.Class constructors |
| `src/otel/message-builders.ts` | 3 | Plain objects → Schema.Class constructors |

### New

| File | Phase | Purpose |
| ---- | ---- | ---- |
| `src/otel/constants.ts` | 4 | Shared OTEL constants |

### Unchanged

| File | Reason |
| ---- | ---- |
| `src/otel/PluginInfo.ts` | Intentional mutable singleton |
| `src/otel/version.macro.ts` | Bun macro |
| `src/otel/Sidecar.ts` | Already Effect-based |
| `src/otel/SidecarMain.ts` | Already Effect-based |
| `src/otel/EventHandler.ts` | Already pure functions (type refs update in Phase 3) |
| `src/otel/SpanHandler.ts` | Already pure functions (type refs update in Phase 3) |
| `src/otel/MetricHandler.ts` | Already pure functions (type refs update in Phase 3) |
