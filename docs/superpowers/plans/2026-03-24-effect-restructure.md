# Effect-First Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize src/ into an Effect-first directory structure, remove
deprecated APIs, decompose oversized files, adopt Schema.Class, and convert
remaining imperative code to Effect-native patterns.

**Architecture:** Big-bang restructure on the existing feature branch.
Tasks are sequenced to minimize broken imports: deprecated code is removed
first, then files are moved in waves (schemas, errors, types, OTEL, services,
layers, build), then Effect-native conversions happen, and finally tests move
to `__tests__/`.

**Tech Stack:** Effect 3.x (Schema, Data, Context, Layer, Logger), Bun,
TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-effect-restructure-design.md`

**Effect docs:** `https://effect.website/llms-full.txt` — fetch when
implementing Effect-native patterns (Schema.Class, Logger, services).

---

## File Structure

### New Directories

| Directory | Purpose |
| --- | --- |
| `src/schemas/` | Effect Schema definitions |
| `src/layers/` | Live + Test layer implementations |
| `src/plugin/` | User-facing ClaudeBinaryPlugin factory |
| `__tests__/` | All test files, mirroring src/ |

### Directories Removed

| Directory | Disposition |
| --- | --- |
| `src/events/` | Deleted (deprecated API) |
| `src/core/` | Contents moved to schemas/ and types/ |
| `src/commands/` | Becomes CommandRunner service+layer |
| `src/testing/` | Replaced by testing.ts + layer factories |
| `src/utils/` | Replaced by LoggerLive |
| `src/pipeline/` | Distributed to plugin/, layers/, types/ |
| `src/state/` | Distributed to services/, layers/, types/ |
| `src/otel/classes/` | Flattened into src/otel/ |
| `src/otel/sidecar/classes/` | Flattened into src/otel/ |

---

## Task 1: Delete Deprecated Code

**Files:**

- Delete: `src/events/` (16 source files + 7 test files)
- Delete: `src/state/classes/EnvCodecs.ts` + `EnvCodecs.test.ts`
- Delete: `src/events/response-types.ts` + test
- Modify: `src/index.ts` (remove deprecated exports)
- Modify: any files that import from deleted modules

Remove all deprecated APIs before restructuring so we don't waste effort
moving dead code.

- [ ] **Step 1: Identify all imports from deprecated modules**

```bash
grep -rn "from.*events/classes\|from.*events/enums\|from.*events/types\|from.*events/response-types\|from.*EnvCodecs" src/ --include="*.ts" | grep -v ".test.ts"
```

Record every file that imports from the deprecated modules. These files
need their imports updated or the imported code inlined.

- [ ] **Step 2: Preserve needed types from events/ FIRST**

Before deleting anything, copy the following to `src/types/hook-events.ts`
(create it):

From `src/events/enums.ts`:

- `HookType` enum
- `HookPermissionsMode` type

From `src/events/types.ts`:

- `HookEventBase` interface
- `IO` interface
- `HookEventOptions` interface
- All input interfaces: `PreToolUseInput`, `PostToolUseInput`,
  `SessionStartInput`, `SessionEndInput`, `StopInput`, `SubagentStopInput`,
  `UserPromptSubmitInput`, `PreCompactInput`, `PermissionRequestInput`,
  `NotificationInput`
- `ToolName`, `ToolInput`, `ToolResponse` types

Update all imports that referenced `events/enums.js` or `events/types.js`
to point to `types/hook-events.js`.

- [ ] **Step 3: Remove deprecated imports from non-deprecated files**

For each file found in Step 1 that is NOT itself being deleted, remove or
replace the import:

- `HookEvent` / event subclass imports in `PipelineRuntime.ts` → remove
  (pipeline uses schemas directly, not event classes)
- `SchemaValidator` from `events/classes/` → already replaced by service
- `ResponseBuilders` imports → remove (pipeline returns plain objects)
- `EnvCodecs` imports → remove (replaced by Effect Schema transforms)
- `HookResponse` imports → remove
- Event type imports (`PreToolUseInput`, etc.) → now import from
  `types/hook-events.js` (created in Step 2)

- [ ] **Step 4: Delete deprecated files**

```bash
rm -rf src/events/
rm src/state/classes/EnvCodecs.ts src/state/classes/EnvCodecs.test.ts
```

- [ ] **Step 5: Update src/index.ts**

Remove all exports for: event classes, ResponseBuilders, HookEventSchemas
facade (keep the schemas themselves), ToolInputGuard, EnvCodecs,
SchemaValidator (the old class), TestFixtures, MockState.

- [ ] **Step 6: Verify tests still pass**

```bash
bun test 2>&1 | tail -5
```

Many tests will fail because the deleted code had tests. That's expected.
The KEY check: do the non-deleted tests still pass? Run tests for the
non-deprecated modules specifically:

```bash
bun test src/pipeline/ src/services/ src/state/classes/PluginEnv.test.ts src/state/classes/SessionRegistry.test.ts src/build/ src/cli/ src/types/ src/otel/
```

- [ ] **Step 7: Commit**

```bash
git commit --no-verify -m "refactor: remove deprecated event class API, EnvCodecs, ResponseBuilders

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 2: Move Schemas to src/schemas/

**Files:**

- Move: `src/core/schemas.ts` → `src/schemas/hook-events.ts`
- Move: `src/pipeline/types.ts` (schema parts) → `src/schemas/pipeline-outputs.ts`
- Move: `src/types/branded.ts` → `src/schemas/branded.ts`
- Move: `src/types/json.ts` (schema parts) → `src/schemas/json.ts`
- Delete: `src/core/` directory (after moving)
- Update: all imports across the codebase

- [ ] **Step 1: Create src/schemas/ directory and move files**

```bash
mkdir -p src/schemas
```

Move `src/core/schemas.ts` → `src/schemas/hook-events.ts`
Move `src/types/branded.ts` → `src/schemas/branded.ts`

For `src/types/json.ts`: split into two files:

- `src/schemas/json.ts` — Effect Schema definitions (JsonValueSchema,
  JsonObjectSchema, JsonArraySchema, JsonPrimitiveSchema)
- `src/types/json.ts` — keep type-fest re-exports and utility types only

For `src/pipeline/types.ts`: the schema definitions (output schemas) move
to `src/schemas/pipeline-outputs.ts`. The non-schema type aliases and
`isPipelineOutput` type guard stay and will move to `src/types/pipeline.ts`
in Task 4.

Move `src/core/tool-inputs.ts` → `src/types/tool-inputs.ts` (it's pure
types, not schemas).

- [ ] **Step 2: Update all imports**

Find and update every import of the moved modules. Key patterns:

```text
from "../core/schemas.js"     → from "../schemas/hook-events.js"
from "../types/branded.js"    → from "../schemas/branded.js"
from "../types/json.js"       → check if importing schemas or types
from "../pipeline/types.js"   → check if importing schemas or types
from "../../core/schemas.js"  → from "../../schemas/hook-events.js"
```

- [ ] **Step 3: Delete src/core/ directory**

```bash
rm -rf src/core/
```

- [ ] **Step 4: Run tests for moved modules**

```bash
bun test src/schemas/ src/types/ src/pipeline/
```

- [ ] **Step 5: Commit**

```bash
git commit --no-verify -m "refactor: move schemas to src/schemas/, types to src/types/

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 3: Split Errors into Individual Files

**Files:**

- Split: `src/errors/index.ts` → 8 individual files
- Update: all imports of error types

- [ ] **Step 1: Create individual error files**

Create one file per error class. Each file exports a single class:

- `src/errors/SchemaValidationError.ts`
- `src/errors/EnvLoadError.ts`
- `src/errors/EnvPersistError.ts`
- `src/errors/PipelineError.ts`
- `src/errors/SessionLookupError.ts`
- `src/errors/CommandParseError.ts`
- `src/errors/StdinError.ts`
- `src/errors/ShellError.ts`

Also move `SchemaIssue` interface to `SchemaValidationError.ts`.

- [ ] **Step 2: Delete src/errors/index.ts**

Remove the barrel file. All consumers import directly from the specific
error file.

- [ ] **Step 3: Update all imports**

```text
from "../errors/index.js" → from "../errors/SchemaValidationError.js" (etc.)
```

Each consumer imports only the specific errors it needs.

- [ ] **Step 4: Run tests**

```bash
bun test src/errors/ src/services/ src/pipeline/
```

- [ ] **Step 5: Commit**

```bash
git commit --no-verify -m "refactor: split errors into individual files

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 4: Move Types and Pipeline/State Files

**Files:**

- Create: `src/types/hook-events.ts` (if not created in Task 1)
- Create: `src/types/pipeline.ts` (from pipeline/types.ts non-schema + metrics.ts)
- Create: `src/types/plugin-state.ts` (from PluginEnv types)
- Create: `src/types/common.ts` (from utility.ts + shared types)
- Move: `src/pipeline/config.ts` → `src/plugin/config.ts`
- Move: `src/pipeline/classes/PipelineRuntime.ts` → `src/layers/PipelineRuntime.ts`
- Move: `src/pipeline/classes/Pipeline.ts` → merge into `src/types/pipeline.ts`
- Move: `src/state/classes/PluginEnv.ts` → `src/services/PluginEnv.ts`
- Move: `src/state/classes/SessionRegistry.ts` → `src/layers/SessionRegistry.ts`
- Delete: `src/pipeline/`, `src/state/`, `src/types/utility.ts`
- Update: all imports

- [ ] **Step 1: Create target directories**

```bash
mkdir -p src/plugin
```

(`src/layers/` and `src/types/` already exist)

- [ ] **Step 2: Create src/types/pipeline.ts**

Merge into this file:

- Non-schema type aliases from `src/pipeline/types.ts` (`isPipelineOutput`
  type guard, `AnyPipelineOutput` union, `TokenMetricsData` interface,
  `ContentType` type)
- Content from `src/pipeline/metrics.ts` (token budget types and logic)
- Utility functions from `src/pipeline/classes/Pipeline.ts`

- [ ] **Step 3: Create src/types/plugin-state.ts**

Extract from `src/state/classes/PluginEnv.ts`:

- `BaseState` interface
- `PluginState<TState>` type
- `SetupFunction` and `SetupContext` types
- `ValidationResult<T>` type
- `ValidationErrorMinimal` and `ValidationIssueMinimal` interfaces
- `formatValidationError` function

- [ ] **Step 4: Create src/types/common.ts**

Merge from `src/types/utility.ts`:

- type-fest re-exports (`PartialDeep`, `ReadonlyDeep`, etc.)
- Any shared types from other files (`IO` interface if not in hook-events)

Delete `src/types/utility.ts`.

- [ ] **Step 5: Move pipeline and state files (source + tests together)**

```text
src/pipeline/config.ts             → src/plugin/config.ts
src/pipeline/config.test.ts        → src/plugin/config.test.ts
src/pipeline/classes/PipelineRuntime.ts      → src/layers/PipelineRuntime.ts
src/pipeline/classes/PipelineRuntime.test.ts → src/layers/PipelineRuntime.test.ts
src/pipeline/classes/Pipeline.test.ts        → merge tests into types/pipeline tests
src/state/classes/PluginEnv.ts      → src/services/PluginEnv.ts
src/state/classes/PluginEnv.test.ts → src/services/PluginEnv.test.ts
src/state/classes/SessionRegistry.ts      → src/layers/SessionRegistry.ts
src/state/classes/SessionRegistry.test.ts → src/layers/SessionRegistry.test.ts
```

Keep test files colocated with their source for now — they'll all move
to `__tests__/` in Task 13.

- [ ] **Step 6: Delete emptied directories**

```bash
rm -rf src/pipeline/ src/state/
```

- [ ] **Step 7: Update all imports across codebase**

This is the largest import update. Key patterns:

```text
from "../pipeline/config.js"                → from "../plugin/config.js"
from "../pipeline/classes/PipelineRuntime.js" → from "../layers/PipelineRuntime.js"
from "../pipeline/types.js"                  → check schemas/ vs types/
from "../pipeline/metrics.js"                → from "../types/pipeline.js"
from "../pipeline/classes/Pipeline.js"       → from "../types/pipeline.js"
from "../state/classes/PluginEnv.js"         → from "../services/PluginEnv.js"
from "../state/classes/SessionRegistry.js"   → from "../layers/SessionRegistry.js"
from "../types/utility.js"                   → from "../types/common.js"
```

- [ ] **Step 8: Run tests**

```bash
bun test src/plugin/ src/layers/ src/services/ src/types/
```

- [ ] **Step 9: Commit**

```bash
git commit --no-verify -m "refactor: distribute pipeline/ and state/ into services/layers/types/plugin

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 5: Flatten OTEL Directory

**Files:**

- Move: all files from `src/otel/classes/` up to `src/otel/`
- Move: all files from `src/otel/sidecar/classes/` up to `src/otel/`
- Delete: `src/otel/classes/Sidecar.ts` (facade)
- Delete: `src/otel/classes/`, `src/otel/sidecar/classes/`
- Update: all imports within and into the OTEL subsystem

- [ ] **Step 1: Move files up**

Move all 14 source files from `src/otel/classes/` to `src/otel/`.
Move all 10 source files from `src/otel/sidecar/classes/` to `src/otel/`.
Keep `src/otel/protocol.ts` and `src/otel/version.macro.ts` in place.

If `Sidecar.ts` is just a facade re-exporting from subfiles, delete it and
update its consumers to import directly.

- [ ] **Step 2: Update all imports**

Within OTEL files:

```text
from "./SidecarClient.js"              → stays (already flat)
from "../../classes/OtelConfig.js"     → from "../OtelConfig.js" (sidecar→otel)
from "../sidecar/classes/EventHandler.js" → from "./EventHandler.js"
```

From outside OTEL:

```text
from "../otel/classes/OtelConfig.js"       → from "../otel/OtelConfig.js"
from "../otel/classes/TelemetryEmitter.js" → from "../otel/TelemetryEmitter.js"
from "../../otel/classes/SidecarClient.js" → from "../../otel/SidecarClient.js"
```

- [ ] **Step 3: Delete emptied directories**

```bash
rm -rf src/otel/classes/ src/otel/sidecar/
```

- [ ] **Step 4: Run OTEL tests**

```bash
bun test src/otel/
```

All 24 OTEL test files should still pass (only import paths changed).
Note: `protocol.ts` and `version.macro.ts` are already at `src/otel/` —
they don't need to move.

- [ ] **Step 5: Commit**

```bash
git commit --no-verify -m "refactor: flatten otel/ directory structure

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 6: Split Services from Layers

**Files:**

- Modify: `src/services/StdinReader.ts` (strip Live/Test, keep tag only)
- Modify: all 7 existing service files similarly
- Create: `src/layers/StdinReaderLive.ts` (Live implementation)
- Create: `src/layers/StdinReaderTest.ts` (Test factory)
- Create: similarly for all 7 services
- Move: `src/services/index.ts` PipelineLive → `src/layers/PipelineLive.ts`
- Delete: `src/services/index.ts` (barrel file)
- Update: all imports

- [ ] **Step 1: For each of the 7 existing services, split into 3 files**

For each service (StdinReader, SchemaValidator, EnvLoader, EnvPersister,
SessionStore, Telemetry, ShellExecutor):

1. Keep `src/services/X.ts` — only the `Context.Tag` definition + types
2. Create `src/layers/XLive.ts` — Live implementation (cut from service file)
3. Create `src/layers/XTest.ts` — Test factory (cut from service file)

- [ ] **Step 2: Move PipelineLive to src/layers/PipelineLive.ts**

Create `src/layers/PipelineLive.ts` with `Layer.mergeAll(...)` composing
all Live layers. Import each Live layer from its own file.

- [ ] **Step 3: Move withErrorTelemetry**

Move `withErrorTelemetry` from `src/services/index.ts` to
`src/layers/TelemetryLive.ts` (or a separate utility file in layers/).

- [ ] **Step 4: Delete src/services/index.ts barrel**

- [ ] **Step 5: Update all imports**

```text
from "../services/index.js"  → import specific service from "../services/X.js"
from "../services/index.js"  → import Live/Test from "../layers/XLive.js"
PipelineLive                  → from "../layers/PipelineLive.js"
```

- [ ] **Step 6: Run tests**

```bash
bun test src/services/ src/layers/
```

- [ ] **Step 7: Commit**

```bash
git commit --no-verify -m "refactor: split services from layers, eliminate barrel

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 7: Decompose Build System

**Files:**

- Create: `src/build/EntrypointGenerator.ts`
- Create: `src/build/ManifestGenerator.ts`
- Create: `src/build/HookExtractor.ts`
- Create: `src/build/CommandExtractor.ts`
- Rename: `src/build/proxy-template.ts` → `src/build/ProxyTemplate.ts`
- Create: `src/services/PluginBuilder.ts` (service tag)
- Create: `src/layers/PluginBuilderLive.ts` (layer)
- Create: `src/layers/PluginBuilderTest.ts` (test factory)
- Delete: `src/build/builder.ts` (2,047 lines)

- [ ] **Step 1: Read src/build/builder.ts and identify extraction boundaries**

The file has these logical groups of methods:

- Hook extraction (from plugin config)
- Command extraction
- Entrypoint code generation
- hooks.json manifest generation
- Compilation (calls Bun.build)
- Build orchestration (fromConfig, build)

- [ ] **Step 2: Extract focused modules**

Create each file by moving the relevant methods from builder.ts. Each file
exports plain functions (not a class):

- `HookExtractor.ts` — `extractHookEntries(config): HookEntry[]`
- `CommandExtractor.ts` — `extractCommandEntries(config): CommandEntry[]`
- `EntrypointGenerator.ts` — `generateEntrypoint(entries): string`
- `ManifestGenerator.ts` — `generateManifest(entries): string`

- [ ] **Step 3: Create PluginBuilder service**

```typescript
// src/services/PluginBuilder.ts
export class PluginBuilder extends Context.Tag("PluginBuilder")<PluginBuilder, {
  readonly build: (config: PluginConfig) => Effect.Effect<PluginBuildResult, ShellError>;
}>() {}
```

- [ ] **Step 4: Create PluginBuilderLive layer**

```typescript
// src/layers/PluginBuilderLive.ts
// Orchestrates: extract hooks → extract commands → generate entrypoint
// → generate manifest → compile
```

- [ ] **Step 5: Rename proxy-template.ts**

```bash
git mv src/build/proxy-template.ts src/build/ProxyTemplate.ts
```

- [ ] **Step 6: Delete builder.ts**

- [ ] **Step 7: Update imports and run tests**

```bash
bun test src/build/
```

- [ ] **Step 8: Commit**

```bash
git commit --no-verify -m "refactor: decompose build system into focused modules + service

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 8: Create CommandRunner Service

**Files:**

- Create: `src/services/CommandRunner.ts` (service tag)
- Create: `src/layers/CommandRunnerLive.ts` (from commands/runtime.ts logic)
- Create: `src/layers/CommandRunnerTest.ts` (test factory)
- Delete: `src/commands/runtime.ts`
- Delete: `src/commands/` directory

- [ ] **Step 1: Create CommandRunner service tag**

```typescript
// src/services/CommandRunner.ts
import { Context, Effect, Schema } from "effect";
import type { CommandParseError } from "../errors/CommandParseError.js";

export interface CommandOutput {
  readonly exitCode: number;
  readonly output: string;
  readonly data?: Record<string, unknown>;
}

export class CommandRunner extends Context.Tag("CommandRunner")<CommandRunner, {
  readonly run: (options: RunCommandOptions) => Effect.Effect<CommandOutput, CommandParseError>;
  readonly parse: <TArgs>(
    schema: Schema.Schema<TArgs>,
    args: string[],
  ) => Effect.Effect<TArgs, CommandParseError>;
}>() {}
```

- [ ] **Step 2: Create CommandRunnerLive**

Extract logic from `src/commands/runtime.ts`. Replace `process.exit()`
with returning the exit code in `CommandOutput`. Replace try/catch with
`Effect.try` / `Effect.tryPromise`.

- [ ] **Step 3: Create CommandRunnerTest**

```typescript
export const makeCommandRunnerTest = () => {
  const runs: RunCommandOptions[] = [];
  return {
    runs,
    layer: Layer.succeed(CommandRunner, {
      run: (options) => {
        runs.push(options);
        return Effect.succeed({ exitCode: 0, output: "", data: undefined });
      },
      parse: (schema, args) => Effect.try(() => Schema.decodeUnknownSync(schema)(args)),
    }),
  };
};
```

- [ ] **Step 4: Delete src/commands/**

```bash
rm -rf src/commands/
```

- [ ] **Step 5: Update imports and run tests**

- [ ] **Step 6: Commit**

```bash
git commit --no-verify -m "refactor: replace Commands static class with CommandRunner service

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 9: Create LoggerLive (Replace DebugLogger)

**Files:**

- Create: `src/layers/LoggerLive.ts`
- Delete: `src/utils/debug-logger.ts`
- Delete: `src/utils/` directory
- Update: all `this.log.debug(...)` etc. calls to `Effect.logDebug(...)`

Reference: `https://effect.website/docs/observability/logging/`
Reference: `/Users/spencer/workspaces/spencerbeggs/vitest-llm-reporter/package/src/layers/LoggerLive.ts`

- [ ] **Step 1: Create LoggerLive layer**

```typescript
// src/layers/LoggerLive.ts
import { Layer, LogLevel, Logger } from "effect";

export const LoggerLive = (
  level?: LogLevel.LogLevel,
  logFile?: string,
): Layer.Layer<never> => {
  if (!level || level._tag === "None") {
    return Logger.replace(Logger.defaultLogger, Logger.none);
  }

  const stderrLogger = Logger.structuredLogger.pipe(
    Logger.map((entry) => JSON.stringify(entry)),
    Logger.withConsoleError,
  );

  return Layer.merge(
    Logger.replace(Logger.defaultLogger, stderrLogger),
    Logger.minimumLogLevel(level),
  );
};

export function resolveLogLevel(option?: string): LogLevel.LogLevel | undefined {
  const raw = option ?? Bun.env.CLAUDE_DEBUG;
  if (!raw || raw === "0") return undefined;
  if (raw === "1") return LogLevel.Debug;
  // Map common names to Effect LogLevel
  const aliases: Record<string, string> = {
    debug: "Debug", info: "Info", warn: "Warning", error: "Error",
    trace: "Trace", none: "None",
  };
  const normalized = aliases[raw.toLowerCase()] ?? raw;
  return LogLevel.fromLiteral(normalized as LogLevel.Literal);
}
```

- [ ] **Step 2: Update code that uses DebugLogger**

Replace `this.log.debug(msg)` / `this.log.info(msg)` with
`Effect.logDebug(msg)` / `Effect.logInfo(msg)` in Effect-native code.

For code not yet in Effect (PipelineRuntime, PluginEnv), use
`console.error` directly or wrap in `Effect.sync(() => console.error(...))`.

- [ ] **Step 3: Delete src/utils/**

```bash
rm -rf src/utils/
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit --no-verify -m "refactor: replace DebugLogger with Effect Logger layer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 10: Schema.Class Adoption

**Files:**

- Modify: `src/schemas/hook-events.ts` — convert Schema.Struct to Schema.Class
- Modify: `src/schemas/pipeline-outputs.ts` — consolidate output types
- Modify: `src/types/hook-events.ts` — remove interfaces that Schema.Class replaces
- Modify: `src/services/Telemetry.ts` — convert HookExecutionData to Schema.Class
- Modify: `src/services/ShellExecutor.ts` — convert ShellResult to Schema.Class
- Modify: `src/otel/protocol.ts` — convert protocol types to Schema.Class
- Modify: `src/layers/SessionRegistry.ts` — convert record types to Schema.Class
- Update: all imports of the converted types

Reference: `https://effect.website/llms-full.txt` — search for Schema.Class

- [ ] **Step 1: Convert hook event schemas to Schema.Class**

In `src/schemas/hook-events.ts`, replace each Schema.Struct + type alias
pair with a Schema.Class declaration:

```typescript
export class PreToolUseEvent extends Schema.Class<PreToolUseEvent>(
  "PreToolUseEvent",
)({
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.String,
  tool_input: JsonObjectSchema,
  tool_use_id: ToolUseIdSchema,
  session_id: SessionIdSchema,
  transcript_path: Schema.optional(TranscriptPathSchema),
  cwd: Schema.optional(Schema.String),
  permission_mode: Schema.optional(HookPermissionsModeSchema),
}) {}
```

Do this for all 10 event schemas + the base schema if applicable.

The `HookEventSchema` union becomes `Schema.Union(PreToolUseEvent, ...)`.

- [ ] **Step 2: Remove duplicate interfaces from types/hook-events.ts**

Delete the manual `PreToolUseInput`, `PostToolUseInput`, etc. interfaces
that are now provided by Schema.Class. Keep `HookType` enum and any types
not backed by schemas.

- [ ] **Step 3: Convert service return types**

In `src/services/Telemetry.ts`:

```typescript
export class HookExecutionData extends Schema.Class<HookExecutionData>(
  "HookExecutionData",
)({
  hookType: Schema.String,
  hookName: Schema.String,
  pluginName: Schema.String,
  pluginVersion: Schema.String,
  durationMs: Schema.Number,
  success: Schema.Boolean,
  outcome: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
}) {}
```

Similarly for `ShellResult` in `src/services/ShellExecutor.ts`.

- [ ] **Step 4: Convert OTEL protocol types to Schema.Class**

In `src/otel/protocol.ts`, convert the 15+ manually defined interfaces
to Schema.Class declarations. These are core protocol structures with
zero validation currently — Schema.Class gives validation for free:

- `OtelProtocolConfig`, `SpanData`, `SpanEvent`, `ScopeData`
- `EventData`, `MetricData`, `MetricType`
- `PingMessage`, `SpanMessage`, `EventMessage`, `MetricMessage`,
  `ShutdownMessage`
- `SidecarResponse`

- [ ] **Step 5: Convert session record types to Schema.Class**

In `src/layers/SessionRegistry.ts`, convert `SessionRegistration` and
`SessionRecord` interfaces to Schema.Class — validates data from SQLite.

- [ ] **Step 6: Consolidate pipeline output types**

In `src/schemas/pipeline-outputs.ts`, ensure the output schemas and their
inferred types use Schema.Class where it makes sense (the discriminated
union variants).

- [ ] **Step 7: Update all imports**

Consumers that imported `PreToolUseInput` from `types/hook-events.ts` now
import `PreToolUseEvent` from `schemas/hook-events.ts` (the Schema.Class
IS the type).

- [ ] **Step 8: Run tests**

```bash
bun test src/schemas/ src/services/ src/layers/ src/otel/
```

- [ ] **Step 9: Commit**

```bash
git commit --no-verify -m "refactor: adopt Schema.Class for hook events, OTEL protocol, service types

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 11: Create PluginEnv Service + Layer

**Files:**

- Modify: `src/services/PluginEnv.ts` — thin to Context.Tag service
- Create: `src/layers/PluginEnvLive.ts` — orchestrates env loading
- Create: `src/layers/PluginEnvTest.ts` — test factory

- [ ] **Step 1: Define PluginEnv service tag**

Thin `src/services/PluginEnv.ts` to just the service interface:

```typescript
export class PluginEnv extends Context.Tag("PluginEnv")<PluginEnv, {
  readonly get: (key: string) => string | undefined;
  readonly require: (key: string) => Effect.Effect<string, EnvLoadError>;
  readonly vars: <T>() => T;
  readonly loadForSessionStart: (params: SessionStartParams) => Effect.Effect<void, EnvLoadError>;
  readonly loadForHook: (params: HookParams) => Effect.Effect<void, EnvLoadError>;
}>() {}
```

- [ ] **Step 2: Create PluginEnvLive**

Extract the loading/validation logic from the current PluginEnv class.
The Live layer depends on EnvLoader, SchemaValidator, and EnvPersister
services.

- [ ] **Step 3: Create PluginEnvTest**

```typescript
export const makePluginEnvTest = (vars?: Record<string, string>) => {
  const state = new Map<string, string>(Object.entries(vars ?? {}));
  return {
    state,
    layer: Layer.succeed(PluginEnv, {
      get: (key) => state.get(key),
      require: (key) => {
        const v = state.get(key);
        return v ? Effect.succeed(v) : Effect.fail(new EnvLoadError({ file: key, cause: "not found" }));
      },
      vars: () => Object.fromEntries(state) as any,
      loadForSessionStart: () => Effect.void,
      loadForHook: () => Effect.void,
    }),
  };
};
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit --no-verify -m "refactor: create PluginEnv service + Live/Test layers

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 12: Rewrite Entry Points

**Files:**

- Rewrite: `src/index.ts` — new public API exports
- Create: `src/testing.ts` — test utilities entry point
- Delete: `src/testing/` directory (builder.ts, mocks.ts)

- [ ] **Step 1: Rewrite src/index.ts**

Export only the public API:

```typescript
// Plugin definition
export { ClaudeBinaryPlugin } from "./plugin/config.js";

// Schemas
export { PreToolUseEvent, PostToolUseEvent, ... } from "./schemas/hook-events.js";
export { SessionIdSchema, ToolUseIdSchema, ... } from "./schemas/branded.js";

// Services (for advanced Effect users)
export { StdinReader } from "./services/StdinReader.js";
export { SchemaValidator } from "./services/SchemaValidator.js";
// ... all service tags

// Layers
export { PipelineLive } from "./layers/PipelineLive.js";

// Errors
export { SchemaValidationError } from "./errors/SchemaValidationError.js";
export { PipelineError } from "./errors/PipelineError.js";
// ... all errors

// Types
export type { HookType, HookPermissionsMode } from "./types/hook-events.js";
export type { ... } from "./types/pipeline.js";
export type { ... } from "./types/plugin-state.js";

// State
export { PluginEnv } from "./services/PluginEnv.js";

// OTEL
export { OtelConfig } from "./otel/OtelConfig.js";
```

- [ ] **Step 2: Create src/testing.ts**

```typescript
// Test layer factories
export { makeStdinReaderTest } from "./layers/StdinReaderTest.js";
export { EnvLoaderTest } from "./layers/EnvLoaderTest.js";
export { makeEnvPersisterTest } from "./layers/EnvPersisterTest.js";
export { makeSessionStoreTest } from "./layers/SessionStoreTest.js";
export { makeTelemetryTest } from "./layers/TelemetryTest.js";
export { makeShellExecutorTest } from "./layers/ShellExecutorTest.js";
export { makeCommandRunnerTest } from "./layers/CommandRunnerTest.js";
export { makePluginEnvTest } from "./layers/PluginEnvTest.js";

// Composed test layer
export { PipelineTest } from "./layers/PipelineLive.js";

// PluginTester (fluent API — rewritten to use layers internally)
// export { PluginTester } from "./layers/PluginTester.js";
```

- [ ] **Step 3: Delete src/testing/ directory**

```bash
rm -rf src/testing/
```

Note: the PluginTester fluent API will need rewriting in a future task
(separate plan). For now, remove it and rely on the raw layer factories.

- [ ] **Step 4: Update package.json exports**

If `package.json` has an `exports` field, add `testing.ts` as a second
entry point:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing.ts"
  }
}
```

Also update the `bin` field if it references moved CLI paths.

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git commit --no-verify -m "refactor: rewrite entry points, create testing.ts

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 13: Move Tests to \_\_tests\_\_/

**Files:**

- Move: all 54 `.test.ts` files from colocated positions to `__tests__/`
- Update: test configuration to find tests in `__tests__/`
- Update: all test import paths

- [ ] **Step 1: Create **tests**/ directory structure**

```bash
mkdir -p __tests__/{errors,schemas,services,layers,plugin,build,otel,cli,types}
```

- [ ] **Step 2: Move all test files**

Move each `.test.ts` file to its mirror location in `__tests__/`:

```text
src/schemas/hook-events.test.ts    → __tests__/schemas/hook-events.test.ts
src/schemas/branded.test.ts        → __tests__/schemas/branded.test.ts
src/layers/PipelineRuntime.test.ts → __tests__/layers/PipelineRuntime.test.ts
src/otel/OtelConfig.test.ts        → __tests__/otel/OtelConfig.test.ts
...
```

(Note: some test files may have already been deleted with their deprecated
source in Task 1.)

- [ ] **Step 3: Update all import paths in test files**

Test files will need relative paths updated since they're now in `__tests__/`
instead of next to their source:

```text
from "./schemas.js"        → from "../src/schemas/hook-events.js"
from "../errors/index.js"  → from "../src/errors/SchemaValidationError.js"
```

- [ ] **Step 4: Update test configuration**

If `bunfig.toml` or `package.json` test config specifies test file patterns,
update to include `__tests__/**/*.test.ts`.

- [ ] **Step 5: Run full test suite**

```bash
bun test
```

All tests should discover and run from the new location.

- [ ] **Step 6: Commit**

```bash
git commit --no-verify -m "refactor: move all tests to __tests__/ directory

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Task 14: Final Verification and Cleanup

**Files:** None (verification only)

- [ ] **Step 1: Verify no deprecated imports remain**

```bash
grep -rn "from.*events/classes\|from.*events/enums\|from.*events/types" src/ --include="*.ts"
grep -rn "from.*core/schemas\|from.*core/tool-inputs" src/ --include="*.ts"
grep -rn "from.*commands/runtime" src/ --include="*.ts"
grep -rn "from.*testing/builder\|from.*testing/mocks" src/ --include="*.ts"
grep -rn "from.*utils/debug-logger" src/ --include="*.ts"
grep -rn "from.*pipeline/\|from.*state/" src/ --include="*.ts"
grep -rn "from.*otel/classes/\|from.*otel/sidecar/" src/ --include="*.ts"
grep -rn "from.*services/index" src/ --include="*.ts"
```

All should return empty.

- [ ] **Step 2: Verify no barrel files remain (except entry points)**

```bash
find src -name "index.ts" | grep -v "src/index.ts" | grep -v "src/cli/index.ts"
```

Should return empty.

- [ ] **Step 3: Run full typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

- [ ] **Step 5: Run linter**

```bash
bun run lint:fix
```

- [ ] **Step 6: Verify directory structure matches spec**

```bash
find src -type d | sort
```

Expected directories:

```text
src
src/build
src/cli
src/errors
src/layers
src/otel
src/plugin
src/schemas
src/services
src/types
```

No `src/events/`, `src/core/`, `src/commands/`, `src/testing/`, `src/utils/`,
`src/pipeline/`, `src/state/`, `src/otel/classes/`, `src/otel/sidecar/`.

- [ ] **Step 7: Commit any remaining fixes**

```bash
git commit --no-verify -m "chore: final cleanup for Effect-first restructure

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
