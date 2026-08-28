---
"claude-binary-plugin": patch
---

## Breaking Changes

- Removed `RequiredDeep`, `WritableDeep`, and `Tagged` from the public API. These utility types were re-exported from `type-fest` and are no longer available from this package. If you were using them, import from `type-fest` directly.

## Refactoring

- Removed the `type-fest` dependency. JSON and utility types previously sourced from that package are now self-contained.
- Deleted the imperative `SessionRegistry` facade. Session lookups now go exclusively through the `SessionStore` Effect service.
- `ClaudeAccountInfoLive`, `PlatformInfoLive`, and `SessionStoreLive` now use `@effect/platform` `FileSystem` service for all file I/O instead of direct `Bun.file()` calls.
- `CommandRunnerLive` uses `EnvResolver`, `EnvBridge`, and `FileSystem` services in place of direct `Bun.env` and `Bun.file()` access.
- `PluginRuntimeServiceLive` now uses `Effect.logDebug` and `Effect.logError` instead of `console.error`.
- `SidecarConnectionLive` and `SidecarTransportLive` use `Effect.runFork` instead of `Effect.runSync` in async callbacks.
