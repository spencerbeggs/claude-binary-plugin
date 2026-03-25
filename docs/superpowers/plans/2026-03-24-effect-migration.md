# Effect Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Zod usage with the Effect ecosystem (Schema, Data, core)
and decompose the pipeline runtime into Effect services with layers.

**Architecture:** Big-bang migration on a feature branch. Errors and services
are defined first (no dependencies), then schemas are migrated, then the
pipeline runtime is recomposed as an Effect program with service layers. The
scaffold system (`src/cli/init/`) is removed entirely.

**Tech Stack:** Effect 3.x (Schema, Data, Context, Layer), Bun, TypeScript,
OpenTelemetry

**Spec:** `docs/superpowers/specs/2026-03-24-effect-migration-design.md`

---

## File Structure

### New Files

| Path | Responsibility |
| --- | --- |
| `src/errors/index.ts` | All `Data.TaggedError` definitions |
| `src/services/StdinReader.ts` | Stdin reading service (tag + Live + Test) |
| `src/services/SchemaValidator.ts` | Schema validation service |
| `src/services/EnvLoader.ts` | Env file I/O service |
| `src/services/EnvPersister.ts` | Env file write service |
| `src/services/SessionStore.ts` | Session lookup service (SQLite / in-memory) |
| `src/services/Telemetry.ts` | OTEL emission service |
| `src/services/ShellExecutor.ts` | Shell command service |
| `src/services/index.ts` | Service barrel + PipelineLive/PipelineTest layers |

### Modified Files

| Path | Change |
| --- | --- |
| `src/types/branded.ts` | `Tagged<>` to `Schema.brand()` |
| `src/types/json.ts` | Zod schemas to Effect Schema |
| `src/core/schemas.ts` | Full rewrite: Effect Schema + annotations |
| `src/pipeline/types.ts` | Full rewrite: Effect Schema output schemas |
| `src/state/classes/EnvCodecs.ts` | Full rewrite: Effect Schema transforms |
| `src/state/classes/PluginEnv.ts` | Decompose into services, thin state container |
| `src/state/classes/SessionRegistry.ts` | Becomes SessionStore service impl |
| `src/events/classes/HookEvent.ts` | Remove `z.ZodType` refs, use Effect Schema |
| `src/events/classes/SchemaValidator.ts` | Use `Schema.decodeUnknown` |
| `src/events/classes/ResponseBuilders.ts` | Remove Zod type refs |
| `src/events/classes/*.ts` (10 event classes) | Update schema references |
| `src/events/types.ts` | Update types derived from schemas |
| `src/events/enums.ts` | Use `Schema.Literal` unions |
| `src/pipeline/config.ts` | `z.ZodType` to `Schema.Schema` in generics |
| `src/pipeline/classes/PipelineRuntime.ts` | Composed Effect program |
| `src/commands/runtime.ts` | Effect Schema validation |
| `src/testing/builder.ts` | Layer-based instead of global mocking |
| `src/testing/mocks.ts` | Test layers replace mock utilities |
| `src/build/builder.ts` | Entrypoint generation for Effect runtime |
| `src/cli/index.ts` | Remove Zod imports, remove `init` subcommand |
| `src/index.ts` | Update exports, remove scaffold re-exports |
| `package.json` | Peer deps: `effect` replaces `zod`; remove ink/react |

### Deleted Files

| Path | Reason |
| --- | --- |
| `src/cli/init/` (26 files) | Scaffold system replaced by template repo |

---

## Task 1: Remove Scaffold System

**Files:**

- Delete: `src/cli/init/` (entire directory, 26 files)
- Modify: `src/cli/index.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Delete: `src/cli/init/scaffold.test.ts`

This is independent of the Effect migration and reduces noise for subsequent
tasks.

- [ ] **Step 1: Delete the src/cli/init/ directory**

```bash
rm -rf src/cli/init
```

- [ ] **Step 2: Remove init subcommand from CLI**

In `src/cli/index.ts`, remove the `init` subcommand import and the
`Command.withSubcommands` entry for init. Keep the `build` subcommand.

- [ ] **Step 3: Remove scaffold exports from barrel file**

In `src/index.ts`, remove any re-exports related to the scaffold/init system.

- [ ] **Step 4: Remove ink/react dependencies from package.json**

Remove from `dependencies`:

- `@inkjs/ui`
- `ink`
- `ink-big-text`
- `react`

Remove from `devDependencies`:

- `@types/react`

- [ ] **Step 5: Run typecheck to verify no broken imports**

```bash
bun run typecheck
```

Expected: PASS (no references to deleted files remain)

- [ ] **Step 6: Run tests to verify nothing broke**

```bash
bun run test:ai
```

Expected: All tests pass (scaffold tests were self-contained)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove scaffold system (replaced by template repo)"
```

---

## Task 2: Define Typed Errors

**Files:**

- Create: `src/errors/index.ts`
- Test: `src/errors/index.test.ts`

No dependencies on any other migration work. These error types will be used by
all subsequent tasks.

- [ ] **Step 1: Write failing tests for error types**

Create `src/errors/index.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  SchemaValidationError,
  EnvLoadError,
  EnvPersistError,
  PipelineError,
  SessionLookupError,
  CommandParseError,
  StdinError,
  ShellError,
} from "./index.js";

describe("Error Types", () => {
  test("SchemaValidationError has _tag and fields", () => {
    const err = new SchemaValidationError({
      message: "invalid",
      issues: [{ message: "bad field", path: ["name"] }],
      path: "name",
    });
    expect(err._tag).toBe("SchemaValidationError");
    expect(err.message).toBe("invalid");
    expect(err.issues).toHaveLength(1);
  });

  test("EnvLoadError has _tag and fields", () => {
    const err = new EnvLoadError({ file: "/tmp/env", cause: "not found" });
    expect(err._tag).toBe("EnvLoadError");
    expect(err.file).toBe("/tmp/env");
  });

  test("PipelineError has _tag and stage", () => {
    const err = new PipelineError({
      hookName: "validate",
      stage: "handler",
      cause: new Error("boom"),
    });
    expect(err._tag).toBe("PipelineError");
    expect(err.stage).toBe("handler");
  });

  test("SessionLookupError has _tag", () => {
    const err = new SessionLookupError({
      sessionId: "abc-123",
      reason: "not found",
    });
    expect(err._tag).toBe("SessionLookupError");
  });

  test("CommandParseError has _tag", () => {
    const err = new CommandParseError({
      commandName: "run",
      message: "missing arg",
    });
    expect(err._tag).toBe("CommandParseError");
  });

  test("StdinError has _tag", () => {
    const err = new StdinError({ cause: "EOF" });
    expect(err._tag).toBe("StdinError");
  });

  test("ShellError has _tag", () => {
    const err = new ShellError({
      command: "git status",
      exitCode: 1,
      stderr: "fatal",
    });
    expect(err._tag).toBe("ShellError");
    expect(err.exitCode).toBe(1);
  });

  test("EnvPersistError has _tag", () => {
    const err = new EnvPersistError({
      path: "/tmp/env",
      cause: "permission denied",
    });
    expect(err._tag).toBe("EnvPersistError");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/errors/index.test.ts
```

Expected: FAIL — module `./index.js` not found

- [ ] **Step 3: Implement error types**

Create `src/errors/index.ts`:

```typescript
import { Data } from "effect";

export interface SchemaIssue {
  readonly message: string;
  readonly path: ReadonlyArray<string | number>;
}

export class SchemaValidationError extends Data.TaggedError(
  "SchemaValidationError",
)<{
  readonly message: string;
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly path: string;
}> {}

export class EnvLoadError extends Data.TaggedError("EnvLoadError")<{
  readonly file: string;
  readonly cause: unknown;
}> {}

export class EnvPersistError extends Data.TaggedError("EnvPersistError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class PipelineError extends Data.TaggedError("PipelineError")<{
  readonly hookName: string;
  readonly stage: "parse" | "validate" | "handler" | "output";
  readonly cause: unknown;
}> {}

export class SessionLookupError extends Data.TaggedError(
  "SessionLookupError",
)<{
  readonly sessionId: string;
  readonly reason: string;
}> {}

export class CommandParseError extends Data.TaggedError("CommandParseError")<{
  readonly commandName: string;
  readonly message: string;
}> {}

export class StdinError extends Data.TaggedError("StdinError")<{
  readonly cause: unknown;
}> {}

export class ShellError extends Data.TaggedError("ShellError")<{
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
}> {}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/errors/index.test.ts
```

Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/errors/
git commit -m "feat: add typed error definitions with Data.TaggedError"
```

---

## Task 3: Define Service Interfaces

**Files:**

- Create: `src/services/StdinReader.ts`
- Create: `src/services/SchemaValidator.ts`
- Create: `src/services/EnvLoader.ts`
- Create: `src/services/EnvPersister.ts`
- Create: `src/services/SessionStore.ts`
- Create: `src/services/Telemetry.ts`
- Create: `src/services/ShellExecutor.ts`
- Create: `src/services/index.ts`
- Test: `src/services/index.test.ts`

Service tags only — no implementations yet. These define the contracts.

- [ ] **Step 1: Write failing tests for service tag existence**

Create `src/services/index.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { Context } from "effect";
import {
  StdinReader,
  SchemaValidator,
  EnvLoader,
  EnvPersister,
  SessionStore,
  Telemetry,
  ShellExecutor,
} from "./index.js";

describe("Service Tags", () => {
  test("all service tags are defined", () => {
    // Context.Tag instances are truthy and have a key
    expect(StdinReader).toBeDefined();
    expect(SchemaValidator).toBeDefined();
    expect(EnvLoader).toBeDefined();
    expect(EnvPersister).toBeDefined();
    expect(SessionStore).toBeDefined();
    expect(Telemetry).toBeDefined();
    expect(ShellExecutor).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/services/index.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement service tag definitions**

Create each service file with its `Context.Tag` definition. Use the error types
from Task 2 in the service method signatures. Refer to the spec for the exact
interface shapes:

- `StdinReader.ts` — `read(): Effect<string, StdinError>`
- `SchemaValidator.ts` — `decode<T>(raw, schema): Effect<T, SchemaValidationError>`
- `EnvLoader.ts` — `loadUserEnv`, `loadHookFiles`, `loadSessionEnv`
- `EnvPersister.ts` — `persist(vars, path): Effect<void, EnvPersistError>`
- `SessionStore.ts` — `lookup(sessionId)`, `register(sessionId, dir)`
- `Telemetry.ts` — `emitHookExecution(data)`, `emitError(error)`
- `ShellExecutor.ts` — `exec(cmd): Effect<ShellResult, ShellError>`

Create `src/services/index.ts` barrel re-exporting all tags.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/services/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/
git commit -m "feat: define Effect service interfaces (Context.Tag)"
```

---

## Task 4: Migrate Branded Types

**Files:**

- Modify: `src/types/branded.ts`
- Test: `src/types/branded.ts` (existing tests if any, or inline verification)

- [ ] **Step 1: Read current branded.ts**

Read `src/types/branded.ts` to understand the current `Tagged<>` pattern.

- [ ] **Step 2: Rewrite branded types with Schema.brand()**

Replace `Tagged<string, "SessionId">` etc. with Effect Schema brand:

```typescript
import { Schema } from "effect";

export const SessionIdSchema = Schema.UUID.pipe(Schema.brand("SessionId"));
export type SessionId = Schema.Type<typeof SessionIdSchema>;

export const ToolUseIdSchema = Schema.String.pipe(Schema.brand("ToolUseId"));
export type ToolUseId = Schema.Type<typeof ToolUseIdSchema>;

export const HookNameSchema = Schema.String.pipe(Schema.brand("HookName"));
export type HookName = Schema.Type<typeof HookNameSchema>;

export const TranscriptPathSchema = Schema.String.pipe(
  Schema.brand("TranscriptPath"),
);
export type TranscriptPath = Schema.Type<typeof TranscriptPathSchema>;
```

- [ ] **Step 3: Write tests for branded type schemas**

Create or update branded type tests to verify decode/encode:

```typescript
import { Schema } from "effect";
import { SessionIdSchema, ToolUseIdSchema, HookNameSchema, TranscriptPathSchema } from "./branded.js";

test("SessionIdSchema decodes valid UUID", () => {
  const id = Schema.decodeUnknownSync(SessionIdSchema)("550e8400-e29b-41d4-a716-446655440000");
  expect(typeof id).toBe("string");
});

test("SessionIdSchema rejects non-UUID", () => {
  expect(() => Schema.decodeUnknownSync(SessionIdSchema)("not-a-uuid")).toThrow();
});

test("ToolUseIdSchema decodes string", () => {
  const id = Schema.decodeUnknownSync(ToolUseIdSchema)("toolu_abc123");
  expect(typeof id).toBe("string");
});
```

- [ ] **Step 4: Find and update branded type cast sites**

Search for all `as SessionId`, `as ToolUseId`, `as HookName`,
`as TranscriptPath` casts across the codebase. These need to change from
type-cast patterns to `Schema.decodeUnknownSync(BrandedSchema)(value)` or
use the brand constructor. Note which files are affected — they will be
updated in later tasks but this creates the inventory.

```bash
grep -rn "as SessionId\|as ToolUseId\|as HookName\|as TranscriptPath" src/
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: Type errors in files that import branded types — this is expected and
will be resolved in subsequent tasks. Verify branded.ts itself compiles.

- [ ] **Step 6: Commit**

```bash
git add src/types/branded.ts
git commit -m "refactor: migrate branded types to Schema.brand()"
```

---

## Task 5: Migrate JSON Schemas

**Files:**

- Modify: `src/types/json.ts`
- Test: existing tests or add inline

- [ ] **Step 1: Read current json.ts**

Read `src/types/json.ts` to understand the recursive Zod schemas.

- [ ] **Step 2: Rewrite JSON schemas with Effect Schema**

Replace `z.lazy()`, `z.union()`, `z.record()` with Effect Schema equivalents:

```typescript
import { Schema } from "effect";

const JsonPrimitiveSchema = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
);

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    JsonPrimitiveSchema,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  ),
);

const JsonObjectSchema = Schema.Record({
  key: Schema.String,
  value: JsonValueSchema,
});

const JsonArraySchema = Schema.Array(JsonValueSchema);
```

Keep the type-fest re-exports (`JsonObject`, `JsonValue`, etc.) and custom
utility types (`OtelAttributeValue`, `OtelAttributes`, `OtelHeaders`).

- [ ] **Step 3: Write tests for JSON schemas**

Add decode tests for the recursive JSON schemas:

```typescript
import { Schema } from "effect";
import { JsonValueSchema, JsonObjectSchema, JsonArraySchema } from "./json.js";

test("JsonValueSchema decodes primitives", () => {
  expect(Schema.decodeUnknownSync(JsonValueSchema)("hello")).toBe("hello");
  expect(Schema.decodeUnknownSync(JsonValueSchema)(42)).toBe(42);
  expect(Schema.decodeUnknownSync(JsonValueSchema)(true)).toBe(true);
  expect(Schema.decodeUnknownSync(JsonValueSchema)(null)).toBe(null);
});

test("JsonValueSchema decodes nested objects", () => {
  const nested = { a: { b: [1, "two", { c: true }] } };
  expect(Schema.decodeUnknownSync(JsonValueSchema)(nested)).toEqual(nested);
});

test("JsonObjectSchema decodes record", () => {
  expect(Schema.decodeUnknownSync(JsonObjectSchema)({ key: "value" })).toEqual({ key: "value" });
});

test("JsonArraySchema decodes array", () => {
  expect(Schema.decodeUnknownSync(JsonArraySchema)([1, "a", null])).toEqual([1, "a", null]);
});
```

- [ ] **Step 4: Run typecheck to verify json.ts compiles**

```bash
bun run typecheck
```

Note downstream errors — these will be fixed in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/types/json.ts
git commit -m "refactor: migrate JSON schemas to Effect Schema"
```

---

## Task 6: Migrate Core Hook Event Schemas

**Files:**

- Modify: `src/core/schemas.ts`
- Modify: `src/core/schemas.test.ts`

This is the largest single file migration. The discriminated union, registry
pattern, and all 10 event schemas are rewritten.

- [ ] **Step 1: Read current schemas.ts thoroughly**

Understand the full registry pattern, all 10 event schemas, the discriminated
union, and the branded type transforms.

- [ ] **Step 2: Rewrite schemas.ts with Effect Schema**

Key changes:

- `z.registry()` → custom `Symbol` annotation keys
- `z.enum()` → `Schema.Literal(...values)`
- `z.discriminatedUnion()` → `Schema.Union` with literal discriminator fields
- `.transform()` for branded types → use imported branded schemas from
  `src/types/branded.ts`
- `.extend()` → `Schema.Struct` with spread or `Schema.extend`
- Each schema gets `.annotations()` with identifier, description, and custom
  capability annotation

Preserve:

- `HookEventSchemas` static class as the public API facade
- All inferred types (`PreToolUseEventParsed`, etc.) via `Schema.Type<>`
- Parse methods using `Schema.decodeUnknownSync`

- [ ] **Step 3: Rewrite schemas.test.ts**

Update tests to validate:

- Each schema parses valid input correctly
- Annotations are retrievable from schema AST
- Discriminated union selects correct schema by `hook_event_name`
- Branded types are applied correctly
- Invalid input produces `ParseError`

- [ ] **Step 4: Run tests**

```bash
bun test src/core/schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas.ts src/core/schemas.test.ts
git commit -m "refactor: migrate hook event schemas to Effect Schema"
```

---

## Task 7: Migrate Pipeline Output Schemas

**Files:**

- Modify: `src/pipeline/types.ts`
- Modify: `src/pipeline/types.test.ts`

- [ ] **Step 1: Read current types.ts**

Understand the discriminated unions on `status`, the `HookAction` enum, the
conditional refinements (`block` requires `reason`), and the `.strict()`
enforcement.

- [ ] **Step 2: Rewrite output schemas with Effect Schema**

Key changes:

- `z.enum()` for `ExecutionStatus` and `HookAction` → `Schema.Literal`
- `z.discriminatedUnion("status", [...])` → `Schema.Union` with literal
  `status` fields
- `.strict()` → Effect Schema structs are strict by default
- `.refine()` for "block requires reason" → `Schema.filter()`
- All inferred types via `Schema.Type<>`
- `isPipelineOutput()` type guard stays as-is (structural check)

- [ ] **Step 3: Update tests**

Rewrite `src/pipeline/types.test.ts` to validate all output schemas with
Effect Schema decoding.

- [ ] **Step 4: Run tests**

```bash
bun test src/pipeline/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/types.ts src/pipeline/types.test.ts
git commit -m "refactor: migrate pipeline output schemas to Effect Schema"
```

---

## Task 8: Migrate EnvCodecs

**Files:**

- Modify: `src/state/classes/EnvCodecs.ts`
- Modify: `src/state/classes/EnvCodecs.test.ts`

- [ ] **Step 1: Read current EnvCodecs.ts**

Understand all 7 built-in codecs, the 2 factory functions, and the registry
pattern with metadata.

- [ ] **Step 2: Rewrite codecs with Effect Schema transforms**

Key changes:

- Simple codecs (bool, int, float) → `Schema.transform()`
- Codecs with fallback behavior (enum, jsonArray factories) →
  `Schema.transformOrFail()` with `ParseResult.succeed`
- `z.registry()` → `Schema.annotations()` on each codec schema
- `EnvCodecs` static class facade preserved
- `EnvCodecMetadata` type preserved, attached via custom annotation symbol

- [ ] **Step 3: Update tests**

Rewrite `EnvCodecs.test.ts` to test encode/decode with Effect Schema.

- [ ] **Step 4: Run tests**

```bash
bun test src/state/classes/EnvCodecs.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/classes/EnvCodecs.ts src/state/classes/EnvCodecs.test.ts
git commit -m "refactor: migrate EnvCodecs to Effect Schema transforms"
```

---

## Task 9: Migrate Event Classes and SchemaValidator

**Files:**

- Modify: `src/events/classes/SchemaValidator.ts`
- Modify: `src/events/classes/HookEvent.ts`
- Modify: `src/events/classes/PreToolUseEvent.ts` (and all 9 other event
  classes)
- Modify: `src/events/classes/ResponseBuilders.ts`
- Modify: `src/events/types.ts`
- Modify: `src/events/enums.ts`
- Modify: `src/events/classes/SchemaValidator.test.ts`
- Modify: `src/events/classes/EventClasses.test.ts`
- Modify: `src/events/classes/HookEvent.test.ts`
- Modify: `src/events/classes/ResponseBuilders.test.ts`

- [ ] **Step 1: Migrate SchemaValidator**

Replace `z.ZodType` param with `Schema.Schema`. Replace `schema.safeParse()`
with `Schema.decodeUnknownEither()`. Replace `ZodError` formatting with Effect
`ParseError` formatting. Use `SchemaValidationError` from `src/errors/`.

- [ ] **Step 2: Migrate HookEvent base class**

Replace `z.ZodType` references in the base class. Update `create()` factory to
use Effect Schema decoding via the migrated SchemaValidator.

- [ ] **Step 3: Migrate all 10 event subclasses**

Update schema references in each event class to use the new Effect Schema
types from `src/core/schemas.ts`.

- [ ] **Step 4: Migrate enums.ts**

If `HookPermissionsMode` or `HookType` reference Zod, update to plain
TypeScript enums/unions (these may already be plain TS).

- [ ] **Step 5: Migrate types.ts**

Update any types that derive from Zod `z.infer<>` to use `Schema.Type<>`.

- [ ] **Step 6: Migrate ResponseBuilders.ts**

Update any Zod type references in the fluent builder API.

- [ ] **Step 7: Update all event tests**

Update `SchemaValidator.test.ts`, `EventClasses.test.ts`, `HookEvent.test.ts`,
`ResponseBuilders.test.ts` to use Effect Schema.

- [ ] **Step 8: Run all event tests**

```bash
bun test src/events/
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/events/
git commit -m "refactor: migrate event classes to Effect Schema"
```

---

## Task 10: Implement Service Layers (Live + Test)

**Files:**

- Modify: `src/services/StdinReader.ts` (add Live + Test layers)
- Modify: `src/services/SchemaValidator.ts` (add Live layer)
- Modify: `src/services/EnvLoader.ts` (add Live + Test layers)
- Modify: `src/services/EnvPersister.ts` (add Live + Test layers)
- Modify: `src/services/SessionStore.ts` (add Live + Test layers)
- Modify: `src/services/Telemetry.ts` (add Live + Test layers)
- Modify: `src/services/ShellExecutor.ts` (add Live + Test layers)
- Modify: `src/services/index.ts` (export PipelineLive, PipelineTest)
- Test: `src/services/index.test.ts` (expand tests)

This is where the actual implementations go. Extract logic from
`PipelineRuntime`, `PluginEnv`, `SessionRegistry`, and test fixtures into
service layer implementations.

- [ ] **Step 1: Implement StdinReaderLive + Test**

Extract stdin reading logic from `HookEvent.create()` — specifically the
`readStdin()` helper that reads from `process.stdin` and returns the raw JSON
string. Also reference `PipelineRuntime`'s `IODependencies.stdin` for the
stream abstraction.

- `StdinReaderLive`: reads from `process.stdin` via `Bun.stdin`
- `StdinReaderTest`: returns a pre-canned string via `Effect.succeed(input)`

Write unit test, commit:

```bash
git add src/services/StdinReader.ts src/services/StdinReader.test.ts
git commit -m "feat: implement StdinReader service (Live + Test)"
```

- [ ] **Step 2: Implement SchemaValidatorLive**

Wraps `Schema.decodeUnknown` with error mapping to
`SchemaValidationError`. Extract the two-stage validation logic from
`src/events/classes/SchemaValidator.ts` — Stage 1 (session_id extraction)
and Stage 2 (full decode). Map `ParseError` to `SchemaValidationError`.

Write unit test, commit:

```bash
git add src/services/SchemaValidator.ts src/services/SchemaValidator.test.ts
git commit -m "feat: implement SchemaValidator service"
```

- [ ] **Step 3: Implement EnvLoaderLive + Test**

Extract from `PluginEnv` — specifically these static methods:

- `PluginEnv.loadUserEnvFiles(projectRoot)` → `EnvLoader.loadUserEnv()`
- `PluginEnv.loadAllHookFiles(sessionEnvDir)` → `EnvLoader.loadHookFiles()`
- `PluginEnv.loadFromSessionEnvFile(prefix)` → `EnvLoader.loadSessionEnv()`

Live uses `Bun.file()` and `Bun.Glob`. Test is no-op (`Effect.void`).

Write unit test, commit:

```bash
git add src/services/EnvLoader.ts src/services/EnvLoader.test.ts
git commit -m "feat: implement EnvLoader service (Live + Test)"
```

- [ ] **Step 4: Implement EnvPersisterLive + Test**

Extract from `PluginEnv.persist()` — the logic that writes env vars to
`CLAUDE_ENV_FILE` as shell `export` statements with `chmod 600`.

- `EnvPersisterLive`: writes to disk via `Bun.write()`
- `EnvPersisterTest`: captures writes to an array for assertions

Write unit test, commit:

```bash
git add src/services/EnvPersister.ts src/services/EnvPersister.test.ts
git commit -m "feat: implement EnvPersister service (Live + Test)"
```

- [ ] **Step 5: Implement SessionStoreLive + Test**

Extract from `SessionRegistry` class — the SQLite-backed session lookup:

- `SessionRegistry.register(sessionId, envDir)` → `SessionStore.register()`
- `SessionRegistry.lookup(sessionId)` → `SessionStore.lookup()`
- `SessionRegistry.close()` → handled by `Layer.scoped` / `acquireRelease`

- `SessionStoreLive`: uses SQLite via current `SessionRegistry` internals
- `SessionStoreTest`: uses `Map<string, string>` — no SQLite, no cleanup

Write unit test, commit:

```bash
git add src/services/SessionStore.ts src/services/SessionStore.test.ts
git commit -m "feat: implement SessionStore service (Live + Test)"
```

- [ ] **Step 6: Implement TelemetryLive + Test + OTEL lifecycle**

Wrap existing `TelemetryEmitter`, `OtelConfig`, and sidecar classes:

**Sidecar lifecycle via `Effect.acquireRelease`:**

```typescript
const SidecarLive = Layer.scoped(SidecarService,
  Effect.gen(function* () {
    const launcher = new SidecarLauncher(config);
    const client = yield* Effect.acquireRelease(
      Effect.promise(() => launcher.spawn()),
      (client) => Effect.sync(() => client.close()),
    );
    return client;
  })
);
```

**Automatic error telemetry via `Effect.tapError`:**

```typescript
export const withErrorTelemetry = <A, E>(effect: Effect<A, E>) =>
  Effect.tapError(effect, (error) =>
    Effect.flatMap(Telemetry, (t) => t.emitError(error))
  );
```

- `TelemetryLive`: checks `OtelConfig.isEnabled()`, delegates to emitter,
  manages sidecar lifecycle via scoped layer
- `TelemetryTest`: captures events to `HookExecutionData[]` for assertions
- Export `withErrorTelemetry` helper for use in pipeline composition

Write unit test, commit:

```bash
git add src/services/Telemetry.ts src/services/Telemetry.test.ts
git commit -m "feat: implement Telemetry service with acquireRelease sidecar"
```

- [ ] **Step 7: Implement ShellExecutorLive + Test**

Wrap `Bun.$` shell execution:

- `ShellExecutorLive`: executes via `Bun.$`, maps non-zero exit to `ShellError`
- `ShellExecutorTest`: pattern-matching executor (like current
  `TestFixtures.shellExecutor()`) — matches command substrings to canned
  results

Write unit test, commit:

```bash
git add src/services/ShellExecutor.ts src/services/ShellExecutor.test.ts
git commit -m "feat: implement ShellExecutor service (Live + Test)"
```

- [ ] **Step 8: Export composed layers + barrel**

In `src/services/index.ts`, export:

- All service tags and types
- `PipelineLive` = `Layer.mergeAll(all Live layers)`
- `PipelineTest` = `Layer.mergeAll(all Test layers)`
- `withErrorTelemetry` helper

Write integration test verifying a simple Effect program runs with both
`PipelineLive` and `PipelineTest` layers.

```bash
git add src/services/index.ts src/services/index.test.ts
git commit -m "feat: export composed PipelineLive and PipelineTest layers"
```

---

## Task 11: Migrate Pipeline Config and Runtime

**Files:**

- Modify: `src/pipeline/config.ts`
- Modify: `src/pipeline/classes/PipelineRuntime.ts`
- Modify: `src/pipeline/classes/Pipeline.ts`
- Modify: `src/pipeline/config.test.ts`
- Modify: `src/pipeline/classes/PipelineRuntime.test.ts`
- Modify: `src/pipeline/classes/Pipeline.test.ts`

- [ ] **Step 1: Migrate config.ts generics**

Replace `z.ZodType<TOptions>` with `Schema.Schema<TOptions, any, never>` in
all handler/config type definitions. Replace `$ZodType` import from
`zod/v4/core`. Update `ClaudeBinaryPlugin.create()` factory.

- [ ] **Step 2: Rewrite PipelineRuntime as Effect program**

Replace the procedural `run()` method with a composed Effect program using
`Effect.gen`. The current `run()` method does these steps sequentially:

1. Read stdin JSON → **yield\* StdinReader.read()**
2. Parse/validate event → **yield\* SchemaValidator.decode(raw, schema)**
3. Check tool filter → pure logic, unchanged
4. Load env files → **yield\* EnvLoader.loadHookFiles(dir)**
5. Extract persisted state → pure logic, unchanged
6. Run setup (SessionStart) or load state (other hooks) → pure logic
7. Build handler context → pure logic
8. Call pipeline handler → **wrap with Effect.tryPromise**
9. Validate output schema → **yield\* SchemaValidator.decode(output, outputSchema)**
10. Emit OTEL telemetry → **yield\* Telemetry.emitHookExecution(data)**
11. Write to stdout + exit → **yield\* StdinReader** (or direct Effect.sync)

```typescript
const runHook = (config: PipelineConfig) =>
  Effect.gen(function* () {
    const stdin = yield* StdinReader;
    const validator = yield* SchemaValidator;
    const envLoader = yield* EnvLoader;
    const telemetry = yield* Telemetry;

    // 1-2: Read and validate input
    const raw = yield* stdin.read();
    const event = yield* validator.decode(raw, HookEventSchema);

    // 3: Tool filter check
    if (config.tools && !config.tools.includes(event.tool_name)) {
      return skipResult;
    }

    // 4-6: Load state
    const sessionEnvDir = findSessionEnvDir(event);
    if (sessionEnvDir) {
      yield* envLoader.loadHookFiles(sessionEnvDir);
    }
    const state = extractPersistedState(/* ... */);

    // 7-8: Run handler (wrapped to capture errors)
    const output = yield* Effect.tryPromise({
      try: () => config.pipeline({ input: event.input, options, state }),
      catch: (cause) => new PipelineError({
        hookName: config.hookName, stage: "handler", cause,
      }),
    });

    // 9-10: Validate output and emit telemetry
    yield* telemetry.emitHookExecution({ hookType, hookName, output });

    return output;
  }).pipe(
    Effect.withSpan("hook.execution", {
      attributes: { hookType: config.hookType, hookName: config.hookName },
    }),
    withErrorTelemetry, // auto-emit errors to OTEL
  );
```

Replace manual `TelemetrySpan` calls throughout the pipeline with
`Effect.withSpan()` on individual stages where finer granularity is needed.

- [ ] **Step 3: Update Pipeline utilities**

Update any Zod references in `Pipeline.ts`.

- [ ] **Step 4: Rewrite pipeline tests**

Tests now provide test layers instead of mocking globals. Use
`Effect.provide(PipelineTest)` to inject test services.

- [ ] **Step 5: Run pipeline tests**

```bash
bun test src/pipeline/
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/
git commit -m "refactor: rewrite pipeline runtime as composed Effect program"
```

---

## Task 12: Migrate State Management

**Files:**

- Modify: `src/state/classes/PluginEnv.ts`
- Modify: `src/state/classes/SessionRegistry.ts`
- Modify: `src/state/classes/PluginEnv.test.ts`
- Modify: `src/state/classes/SessionRegistry.test.ts`

- [ ] **Step 1: Thin out PluginEnv**

Remove file I/O methods (moved to EnvLoader/EnvPersister services). Remove
schema validation (moved to SchemaValidator service). Keep:

- `prefix` and typed state container
- `collectEnvVars()` using Effect Schema shape introspection
- `get(key)` / `require(key)` accessors
- `log()` / `info()` / `debug()` logger

The factory methods (`forSessionStart`, `forHook`, `forCommand`) become thin
wrappers that delegate to services.

- [ ] **Step 2: Update SessionRegistry to implement SessionStore**

The `SessionRegistry` class becomes the Live implementation behind the
`SessionStore` service tag. Keep the SQLite logic but expose it through the
service interface.

- [ ] **Step 3: Update tests**

Tests use test layers instead of mocking file I/O. `PluginEnv.test.ts` tests
the thin state container. `SessionRegistry.test.ts` tests the SQLite
implementation directly.

- [ ] **Step 4: Run tests**

```bash
bun test src/state/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/
git commit -m "refactor: decompose PluginEnv into services, thin state container"
```

---

## Task 13: Migrate Commands Runtime

**Files:**

- Modify: `src/commands/runtime.ts`
- Modify: `src/commands/runtime.test.ts`

- [ ] **Step 1: Replace Zod validation with Effect Schema**

Replace `schema.parse()` and `ZodError` formatting with
`Schema.decodeUnknownSync` and `ParseError` formatting. Update
`extractSchemaShape()` to introspect Effect Schema AST instead of Zod
`_def.shape`.

- [ ] **Step 2: Update command tests**

```bash
bun test src/commands/
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/
git commit -m "refactor: migrate command runtime to Effect Schema"
```

---

## Task 14: Migrate Testing Infrastructure

**Files:**

- Modify: `src/testing/builder.ts`
- Modify: `src/testing/mocks.ts`
- Modify: `src/testing/builder.test.ts`
- Modify: `src/testing/mocks.test.ts`

- [ ] **Step 1: Rewrite PluginTester internals**

The fluent API stays identical. Internally, `runHook()` now:

1. Builds a test layer from `.withOptions()`, `.withState()`, etc.
2. Runs the pipeline Effect with `Effect.provide(testLayer)`
3. Returns `HookTestResult` as before

Remove global mocking of `process.stdout`, `Bun.env`, `Bun.$`. Replace with
layer construction.

- [ ] **Step 2: Rewrite TestFixtures and MockState**

Replace mock utilities with test layer factories. `TestFixtures.createIO()`
becomes a `StdinReader` test layer. `TestFixtures.shellExecutor()` becomes a
`ShellExecutor` test layer. Keep the fluent mock function API
(`createMockFn`).

- [ ] **Step 3: Update tests**

```bash
bun test src/testing/
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/testing/
git commit -m "refactor: migrate testing infra to layer-based approach"
```

---

## Task 15: Update Build System and Entrypoint Generation

**Files:**

- Modify: `src/build/builder.ts`
- Modify: `src/build/builder.test.ts`

- [ ] **Step 1: Update generated entrypoint code**

`PluginBuilder.generateEntrypoint()` currently generates code that calls
`PipelineRuntime.run()`. Update to generate code that:

1. Imports `Effect`, `Layer`, and the live layers
2. Constructs the pipeline Effect
3. Runs with `Effect.runPromise(program.pipe(Effect.provide(PipelineLive)))`

- [ ] **Step 2: Update builder tests**

Verify the generated entrypoint code contains Effect imports and layer
provision.

- [ ] **Step 3: Run tests**

```bash
bun test src/build/
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/build/
git commit -m "refactor: update entrypoint generation for Effect runtime"
```

---

## Task 16: Update Barrel File and CLI

**Files:**

- Modify: `src/index.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/index.test.ts`
- Modify: `src/cli/index.test.ts`

- [ ] **Step 1: Update barrel exports**

In `src/index.ts`:

- Add exports for error types from `src/errors/`
- Add exports for service tags from `src/services/`
- Remove any remaining Zod references in JSDoc examples
- Verify all public API exports are correct

- [ ] **Step 2: Update CLI**

In `src/cli/index.ts`, remove any remaining Zod imports. The CLI should only
have the `build` subcommand using `@effect/cli`.

- [ ] **Step 3: Run barrel and CLI tests**

```bash
bun test src/index.test.ts src/cli/index.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/cli/index.ts src/index.test.ts src/cli/index.test.ts
git commit -m "refactor: update barrel exports and CLI for Effect migration"
```

---

## Task 17: Update Package Dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Update peer dependencies**

Remove:

```json
"peerDependencies": {
  "zod": "^4.3.5"
}
```

The `effect`, `@effect/platform`, and `@effect/platform-bun` are already in
`dependencies`. Decide whether to move them to `peerDependencies` (recommended
per spec) or keep as direct dependencies. Move to peer deps for single-copy
guarantee.

- [ ] **Step 2: Remove Zod from devDependencies**

Remove `"zod": "^4.3.5"` from `devDependencies`.

- [ ] **Step 3: Install to verify dependency resolution**

```bash
bun install
```

Expected: Clean install, no missing dependencies

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: replace zod peer dep with effect ecosystem"
```

---

## Task 18: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

```bash
bun run typecheck
```

Expected: PASS — zero type errors

- [ ] **Step 2: Run full test suite**

```bash
bun run test:ai
```

Expected: All tests pass

- [ ] **Step 3: Run linter**

```bash
bun run lint:fix
```

Expected: Clean or auto-fixed

- [ ] **Step 4: Verify no Zod imports remain**

```bash
grep -r "from \"zod\"" src/ || echo "No Zod imports found"
grep -r "from 'zod'" src/ || echo "No Zod imports found"
```

Expected: "No Zod imports found" for both

- [ ] **Step 5: Build a test plugin**

Run the build system against a test plugin config to verify the compiled binary
works end-to-end with Effect runtime.

```bash
bun run build
```

Expected: PASS — binary compiles successfully

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final cleanup for Effect migration"
```
