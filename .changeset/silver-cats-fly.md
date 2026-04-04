---
"claude-binary-plugin": minor
---

## Features

- Expanded typed handler support from 10 to all 26 hook types. Every hook now has a dedicated module under `src/hooks/` with its own input schema, output schema, and response serializer, replacing four monolithic schema files (`hook-inputs.ts`, `hook-outputs.ts`, `hook-responses.ts`, `outcomes/types.ts`).
- Added `PermissionDenied` as the 26th hook type, fired when Claude Code rejects a permission request.
- Added `Retry` outcome for `PermissionDenied` handlers, allowing plugins to signal that a permission request should be retried.
- Added `WatchPaths` outcome for `CwdChanged` and `FileChanged` handlers, enabling plugins to register additional file system paths to watch.
- Added `NoAction.implicit()` as a distinct variant of `NoAction` for cases where a handler returns nothing. Telemetry now distinguishes an intentional `NoAction` from a missing return value.
- Added `NormalizedPath` branded type for cross-platform path normalization, used in `CwdChanged`, `FileChanged`, and `WatchPaths` to guarantee consistent path representations regardless of OS.
- Decomposed the monolithic `config.ts` into 5 focused files for easier navigation and tree-shaking.

## Refactoring

- Migrated hook definitions to 26 per-hook-type modules. Import paths from `src/hooks/<HookName>` are now the canonical source for each hook's types, schemas, and response helpers.
- `PluginConfig` and `ClaudePlugin` implementation split across dedicated files; public API is unchanged.
