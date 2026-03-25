# Effect Migration Design Spec

## Overview

Migrate claude-binary-plugin from Zod to the Effect ecosystem (Effect Schema,
Effect Data, Effect core) as a big-bang replacement before the 1.0 public
release. The goal is better DX through bidirectional codecs, typed error
channels, and service/layer decomposition that eliminates global mocking in
tests.

## Status

- **Pre-1.0** — no external users, no backward compatibility concerns
- **Effect already present** — CLI layer uses `effect`, `@effect/cli`,
  `@effect/platform`, `@effect/platform-bun`
- **Binary size irrelevant** — plugins compile to ~75 MB Bun executables
  locally; marginal Effect cost is noise

## Goals

1. Replace all Zod usage with Effect Schema
2. Introduce typed errors via `Data.TaggedError`
3. Decompose `PipelineRuntime` and `PluginEnv` into Effect services with layers
4. Simplify OTEL lifecycle via `acquireRelease` and `Effect.withSpan`
5. Eliminate global mocking in tests by swapping layers
6. Keep plugin author experience simple — plain async handlers, Effect Schema
   for options only

## Non-Goals

- Requiring plugin authors to write Effect programs
- Wrapper/convenience utilities over Effect Schema
- Rewriting the CLI layer (already uses Effect)
- Changing the build process or binary compilation
- Maintaining the `init` scaffold system — replaced by a standalone template
  repo (`claude-plugin-template`). The entire `src/cli/init/` subsystem
  (scaffold, templates, Ink wizard, detect-defaults) is removed. This also
  removes `ink`, `react`, and `@inkjs/ui` as dependencies.

## Risks and Mitigations

- **No rollback path** — this is a big-bang rewrite. If an unforeseen blocker
  occurs (e.g., Effect Schema limitation with recursive types, Bun
  compatibility issue), there is no partial state to fall back to. Acceptable
  because this is pre-1.0 with no external users and all work happens on a
  feature branch with the prior state preserved on `main`.
- **Effect Schema decode performance** — Effect Schema's decode is slower than
  Zod's parse for simple schemas. Hooks run on every tool invocation and need
  to be fast. In practice, the schemas are small (10-20 fields) and the
  bottleneck is I/O (stdin/stdout), not validation. Profile after migration to
  confirm.
- **Plugin author learning curve** — Effect Schema is more verbose than Zod.
  The `claude-plugin-template` repo must provide clear, well-commented Effect
  Schema examples to ease onboarding.
- **Intermediate compilation** — the migration order is a logical ordering for
  the final result, not a sequence of independently compilable steps. The
  codebase will not type-check during the migration. All steps land as a single
  branch merged to `main`.

## Design

### 1. Schema Migration (Zod to Effect Schema)

Every Zod schema becomes an Effect Schema. The mapping:

| Zod v4 | Effect Schema |
| --- | --- |
| `z.object({ ... })` | `Schema.Struct({ ... })` |
| `z.enum(["a", "b"])` | `Schema.Literal("a", "b")` |
| `z.discriminatedUnion("key", [...])` | `Schema.Union` with tagged members |
| `z.literal("value")` | `Schema.Literal("value")` |
| `z.string().uuid()` | `Schema.UUID` |
| `z.lazy(() => ...)` | `Schema.suspend(() => ...)` |
| `z.refine(pred, msg)` | `Schema.filter(pred)` |
| `z.transform(fn)` | `Schema.transform(From, To, { decode, encode })` |
| `z.infer<typeof S>` | `Schema.Type<typeof S>` |
| `z.codec(in, out, fns)` | `Schema.transform` or `Schema.transformOrFail` |
| `schema.parse(data)` | `Schema.decodeUnknownSync(schema)(data)` |
| `schema.safeParse(data)` | `Schema.decodeUnknownEither(schema)(data)` |

#### Branded Types

Replace `.transform()` cast hacks with `Schema.brand()`:

```typescript
// Before
const SessionIdSchema = z.string().uuid().transform((val) => val as SessionId);

// After
const SessionIdSchema = Schema.UUID.pipe(Schema.brand("SessionId"));
type SessionId = Schema.Type<typeof SessionIdSchema>;
```

#### Registry / Metadata

Replace `z.registry()` with `Schema.annotations()`. Annotations are attached
to the schema's AST and retrieved programmatically:

```typescript
// Before (write side)
const registry = z.registry<HookEventSchemaMetadata>();
schema.register(registry, { description: "...", capabilities: [...] });

// Before (read side)
const metadata = registry.get(schema);

// After (write side)
const PreToolUseEventSchema = Schema.Struct({ ... }).annotations({
  identifier: "PreToolUseEvent",
  description: "...",
  // custom annotations via Symbol keys for capabilities
});

// After (read side)
const annotations = PreToolUseEventSchema.ast.annotations;
// Or define a custom annotation symbol:
const CapabilitiesAnnotation = Symbol.for("HookCapabilities");
// Attach: .annotations({ [CapabilitiesAnnotation]: ["read", "write"] })
// Read:   schema.ast.annotations[CapabilitiesAnnotation]
```

#### Discriminated Unions

Effect Schema auto-detects discriminators on `Schema.Union` when members have
literal fields:

```typescript
const HookEventSchema = Schema.Union(
  PreToolUseEventSchema,   // has hook_event_name: "PreToolUse"
  PostToolUseEventSchema,  // has hook_event_name: "PostToolUse"
  // ...
);
```

#### EnvCodecs

Zod's `z.codec()` becomes Effect Schema's bidirectional transforms. Simple
codecs use `Schema.transform`; codecs that need fallback behavior (like the
enum and JSON array factories that use `safeParse` internally) use
`Schema.transformOrFail` with `ParseResult.succeed`/`ParseResult.fail`:

```typescript
// Before
const boolCodec = z.codec(
  z.enum(["true", "false"]),
  z.boolean(),
  { decode: (str) => str === "true", encode: (bool) => bool ? "true" : "false" }
);

// After — simple codec (infallible)
const BoolCodec = Schema.transform(
  Schema.Literal("true", "false"),
  Schema.Boolean,
  {
    decode: (str) => str === "true",
    encode: (bool) => bool ? "true" as const : "false" as const,
  }
);

// After — codec with fallback (needs error handling)
const EnumCodec = <T extends string>(values: readonly T[], defaultValue: T) =>
  Schema.transformOrFail(
    Schema.String,
    Schema.Literal(...values),
    {
      decode: (str, _, ast) =>
        values.includes(str as T)
          ? ParseResult.succeed(str as T)
          : ParseResult.succeed(defaultValue),
      encode: (val) => ParseResult.succeed(val),
    }
  );
```

#### Recursive JSON Schema

```typescript
// Before
const JsonValueSchema = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(...)])
);

// After
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    JsonPrimitiveSchema,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  )
);
```

### 2. Typed Error Handling (Effect Data)

Define a closed set of typed errors:

```typescript
import { Data } from "effect";

class SchemaValidationError extends Data.TaggedError("SchemaValidationError")<{
  readonly message: string;
  readonly issues: ReadonlyArray<SchemaIssue>;
  readonly path: string;
}> {}

class EnvLoadError extends Data.TaggedError("EnvLoadError")<{
  readonly file: string;
  readonly cause: unknown;
}> {}

class PipelineError extends Data.TaggedError("PipelineError")<{
  readonly hookName: string;
  readonly stage: "parse" | "validate" | "handler" | "output";
  readonly cause: unknown;
}> {}

class SessionLookupError extends Data.TaggedError("SessionLookupError")<{
  readonly sessionId: string;
  readonly reason: string;
}> {}

class CommandParseError extends Data.TaggedError("CommandParseError")<{
  readonly commandName: string;
  readonly message: string;
}> {}
```

Errors flow through the pipeline as typed error channels:

```typescript
const runHook: Effect<PipelineOutput, SchemaValidationError | EnvLoadError | PipelineError>
```

Handled precisely with `Effect.catchTag`:

```typescript
pipe(
  runHook,
  Effect.catchTag("SchemaValidationError", (e) => emitOtelError(e)),
  Effect.catchTag("EnvLoadError", (e) => fallbackToDefaults(e)),
);
```

Plugin author handlers are wrapped at the boundary:

```typescript
function wrapHandler<I, O>(
  handler: (ctx: HandlerContext<I>) => Promise<O>,
): Effect<O, PipelineError> {
  return Effect.tryPromise({
    try: () => handler(ctx),
    catch: (cause) => new PipelineError({ hookName, stage: "handler", cause }),
  });
}
```

### 3. Service and Layer Architecture

Decompose `PipelineRuntime` and `PluginEnv` into focused services:

```typescript
class StdinReader extends Context.Tag("StdinReader")<StdinReader, {
  readonly read: () => Effect<string, StdinError>;
}>() {}

class SchemaValidator extends Context.Tag("SchemaValidator")<SchemaValidator, {
  readonly decode: <T>(raw: string, schema: Schema<T>) => Effect<T, SchemaValidationError>;
}>() {}

class EnvLoader extends Context.Tag("EnvLoader")<EnvLoader, {
  readonly loadUserEnv: (projectRoot: string) => Effect<void, EnvLoadError>;
  readonly loadHookFiles: (dir: string) => Effect<void, EnvLoadError>;
  readonly loadSessionEnv: (prefix: string) => Effect<void, EnvLoadError>;
}>() {}

class EnvPersister extends Context.Tag("EnvPersister")<EnvPersister, {
  readonly persist: (vars: Record<string, string>, path: string) => Effect<void, EnvPersistError>;
}>() {}

class SessionStore extends Context.Tag("SessionStore")<SessionStore, {
  readonly lookup: (sessionId: SessionId) => Effect<string, SessionLookupError>;
  readonly register: (sessionId: SessionId, dir: string) => Effect<void>;
}>() {}

class Telemetry extends Context.Tag("Telemetry")<Telemetry, {
  readonly emitHookExecution: (data: HookExecutionData) => Effect<void>;
  readonly emitError: (error: unknown) => Effect<void>;
}>() {}

class ShellExecutor extends Context.Tag("ShellExecutor")<ShellExecutor, {
  readonly exec: (cmd: string) => Effect<ShellResult, ShellError>;
}>() {}
```

#### Layer Composition

```typescript
// Live layers (real I/O)
const PipelineLive = Layer.mergeAll(
  StdinReaderLive,
  SchemaValidatorLive,
  EnvLoaderLive,
  EnvPersisterLive,
  SessionStoreLive,
  TelemetryLive,
  ShellExecutorLive,
);

// Test layers (no globals, no I/O)
const PipelineTest = Layer.mergeAll(
  StdinReaderTest,
  SchemaValidatorLive,  // reuse real validator
  EnvLoaderTest,
  EnvPersisterTest,
  SessionStoreTest,
  TelemetryTest,
  ShellExecutorTest,
);
```

#### PipelineRuntime.run() as a Composed Effect

```typescript
const runHook = Effect.gen(function* () {
  const stdin = yield* StdinReader;
  const validator = yield* SchemaValidator;
  const envLoader = yield* EnvLoader;
  const telemetry = yield* Telemetry;

  const raw = yield* stdin.read();
  const event = yield* validator.decode(raw, HookEventSchema);

  yield* envLoader.loadHookFiles(sessionEnvDir);
  const state = yield* loadState(event);

  const output = yield* runHandler(handler, { input, options, state });

  yield* telemetry.emitHookExecution({ ... });

  return output;
}).pipe(
  Effect.withSpan("hook.execution", {
    attributes: { hookType, hookName, pluginName },
  })
);
```

#### PluginEnv Decomposition

The current `PluginEnv` god-class splits into:

- **EnvLoader** service — file I/O, env file parsing, glob for hook files
- **SchemaValidator** service — schema-based validation (reused from section 3,
  handles both event parsing and env var validation)
- **EnvPersister** service — writing env files back to disk
- **PluginState** — thin typed state container (no I/O)

`SessionRegistry` becomes the `SessionStore` service with SQLite under the hood.
Test layer uses an in-memory `Map`.

### 4. OTEL Integration

Existing OTEL classes (`OtelConfig`, `TelemetryEmitter`, `TelemetryMetrics`,
`TelemetrySpan`) are preserved as service implementations:

```typescript
const TelemetryLive = Layer.effect(Telemetry,
  Effect.gen(function* () {
    const config = yield* OtelConfigService;
    if (!config.isEnabled()) return TelemetryNoop;
    const emitter = yield* SidecarService;
    return {
      emitHookExecution: (data) => Effect.sync(() => emitter.emit(data)),
      emitError: (err) => Effect.sync(() => emitter.emitError(err)),
    };
  })
);
```

Sidecar lifecycle as a scoped resource:

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

Automatic error telemetry:

```typescript
const withErrorTelemetry = <A, E>(effect: Effect<A, E>) =>
  Effect.tapError(effect, (error) =>
    Effect.flatMap(Telemetry, (t) => t.emitError(error))
  );
```

Spans via `Effect.withSpan()` on pipeline stages instead of manual
instrumentation.

### 5. Dependency Strategy

**Peer dependencies change:**

| Before | After |
| --- | --- |
| `zod@^4.3.5` | `effect@^3.x` |
| | `@effect/platform@^0.x` |
| | `@effect/platform-bun@^0.x` |

- `zod` removed entirely
- `type-fest` stays for handler context utilities (`ReadonlyDeep`, `PartialDeep`,
  `JsonValue`). Branded types (`SessionId`, `ToolUseId`, `TranscriptPath`)
  migrate from type-fest `Opaque`/cast patterns to Effect's `Schema.brand()`.
  The `src/types/branded.ts` file is rewritten using Effect Brand.
- No binary size increase (Effect already bundled via CLI)
- Plugin authors using Effect elsewhere share a single copy
- Plugin authors import `Schema` from `"effect"` (re-exported from
  `@effect/schema`) — no separate `@effect/schema` install needed

### 6. Plugin Author Experience

Authors import `Schema` from `effect` instead of `z` from `zod`. Everything
else stays the same:

```typescript
import { ClaudeBinaryPlugin } from "claude-binary-plugin";
import { Schema } from "effect";

const Options = Schema.Struct({
  apiKey: Schema.String,
  maxRetries: Schema.optionalWith(Schema.Number, { default: () => 3 }),
});

const plugin = ClaudeBinaryPlugin.create({
  prefix: "MY_PLUGIN",
  options: Options,
  setup: async ({ options }) => ({
    client: createClient(options.apiKey),
  }),
  hooks: {
    PreToolUse: {
      name: "validate-tool",
      description: "Validates tool usage",
      pipeline: async ({ input, options, state }) => ({
        status: "executed",
        action: "allow",
        summary: "Tool validated",
      }),
    },
  },
});
```

**Unchanged:**

- `ClaudeBinaryPlugin.create()` factory API shape
- Handler signatures: `async ({ input, options, state }) => output`
- Output shapes: `{ status, action, summary }` plain objects
- Setup functions: `async ({ options }) => computed state`
- Command handlers: `async ({ args, options, state }) => { exitCode, output }`
- `plugin.test()` fluent API
- Build process: `ClaudeBinaryPlugin.build()` or CLI
- OTEL configuration via environment variables

**Type inference preserved:** `Schema.Type<typeof Options>` flows through
generics identically to `z.infer<typeof options>`. Config type changes from
`z.ZodType<TOptions>` to `Schema.Schema<TOptions, any, never>`.

### 7. Generated Entrypoint

The build system generates a TypeScript entrypoint that is compiled into the
binary. After migration, the generated code must bootstrap the Effect runtime:

```typescript
// Generated entrypoint (compiled into binary)
import { Effect, Layer } from "effect";
import { PipelineLive } from "claude-binary-plugin/runtime";
import { runHook } from "./hooks/validate-tool.js";

const program = runHook.pipe(
  Effect.provide(PipelineLive),
  Effect.tapErrorCause(Effect.logError),
  Effect.catchAllCause(() => Effect.sync(() => process.exit(1))),
);

Effect.runPromise(program);
```

The `PluginBuilder.generateEntrypoint()` method produces this code. The key
change is that the entrypoint provides the live layer and runs the Effect
program, rather than directly calling `PipelineRuntime.run()`.

### 8. Testing

`PluginTester` internals change from global mocking to layer provision:

```typescript
// Before (global mutation)
process.stdout = mockStream;
Bun.env.MY_PLUGIN_API_KEY = "test-key";
const mockShell = mockBunShell();
// ... test ...
ctx.dispose(); // must restore globals

// After (layer swapping)
const TestLayer = Layer.mergeAll(
  Layer.succeed(StdinReader, { read: () => Effect.succeed(inputJson) }),
  Layer.succeed(EnvLoader, { /* returns pre-set vars */ }),
  Layer.succeed(SessionStore, { /* in-memory Map */ }),
  Layer.succeed(Telemetry, { /* captures to array */ }),
  Layer.succeed(ShellExecutor, { exec: (cmd) => Effect.succeed(result) }),
);

const result = await Effect.runPromise(
  runHook(config).pipe(Effect.provide(TestLayer))
);
// No dispose() needed — no globals mutated
```

Fluent API stays identical for plugin authors:

```typescript
const result = await plugin.test()
  .withOptions({ apiKey: "test-key" })
  .withPreToolUseInput({ tool_name: "Bash", tool_input: { command: "ls" } })
  .runHook("validate-tool");

expect(result.action).toBe("allow");
```

**Remaining cleanup concerns:** Layer swapping eliminates global mocking, but
some tests still need cleanup for:

- Temporary files created on disk (handled by `PluginTester.dispose()` or
  `afterEach` hooks — this stays)
- SQLite databases — eliminated by the `SessionStore` test layer using an
  in-memory `Map`
- `spyOn` restoration — eliminated since services replace spied globals

Telemetry assertions via captured events instead of spy functions:

```typescript
const events: HookExecutionData[] = [];
const TelemetryTest = Layer.succeed(Telemetry, {
  emitHookExecution: (data) => Effect.sync(() => { events.push(data); }),
  emitError: () => Effect.void,
});
```

## Files Affected

### Core Schema (full rewrite)

- `src/core/schemas.ts` — all hook event schemas
- `src/pipeline/types.ts` — all output schemas
- `src/state/classes/EnvCodecs.ts` — all codecs
- `src/types/json.ts` — recursive JSON schemas
- `src/types/branded.ts` — branded types migrate to `Schema.brand()`

### Event Classes (full rewrite)

- `src/events/classes/HookEvent.ts` — base class, `z.ZodType` references
- `src/events/classes/PreToolUseEvent.ts` — Zod schema references
- `src/events/classes/PostToolUseEvent.ts`
- `src/events/classes/SessionStartEvent.ts`
- `src/events/classes/SessionEndEvent.ts`
- `src/events/classes/StopEvent.ts`
- `src/events/classes/SubagentStopEvent.ts`
- `src/events/classes/UserPromptSubmitEvent.ts`
- `src/events/classes/PreCompactEvent.ts`
- `src/events/classes/NotificationEvent.ts`
- `src/events/classes/PermissionRequestEvent.ts`
- `src/events/classes/ResponseBuilders.ts` — fluent response builder API
- `src/events/types.ts` — types derived from Zod schemas
- `src/events/enums.ts` — enum types

### New: Error Types

- `src/errors/` — `Data.TaggedError` definitions

### New: Service Definitions

- `src/services/` — `Context.Tag` definitions and Live/Test layers

### Refactored

- `src/pipeline/classes/PipelineRuntime.ts` — becomes composed Effect program
- `src/pipeline/config.ts` — `z.ZodType` to `Schema.Schema` in generics
- `src/state/classes/PluginEnv.ts` — decomposed into services
- `src/state/classes/SessionRegistry.ts` — becomes `SessionStore` service
- `src/events/classes/SchemaValidator.ts` — uses Effect Schema decoding
- `src/commands/runtime.ts` — schema validation via Effect
- `src/testing/builder.ts` — layer-based instead of global mocking
- `src/testing/mocks.ts` — test layers replace mock utilities
- `src/build/builder.ts` — entrypoint generation for Effect runtime
- `src/cli/index.ts` — Zod imports replaced
- `src/index.ts` — barrel file, Zod references in JSDoc examples

### Removed (scaffold system)

- `src/cli/init/` — entire directory removed (scaffold, templates, Ink wizard,
  detect-defaults). Replaced by standalone `claude-plugin-template` repo.
- Dependencies removed: `ink`, `react`, `@inkjs/ui`, `@types/react`

### Tests (all rewritten)

All test files updated to use layer-based testing.

### Package Configuration

- `package.json` — peer deps: `effect` replaces `zod`

## Migration Order

1. **Errors first** — define `Data.TaggedError` types (no dependencies)
2. **Services second** — define `Context.Tag` interfaces (depend on errors)
3. **Schemas third** — migrate all Zod schemas to Effect Schema
4. **Codecs fourth** — migrate `EnvCodecs` to Effect Schema transforms
5. **Layers fifth** — implement Live and Test layers for each service
6. **Pipeline sixth** — rewrite `PipelineRuntime` as composed Effect
7. **State seventh** — decompose `PluginEnv`, implement `SessionStore`
8. **Testing eighth** — rewrite `PluginTester` and `TestFixtures` with layers
9. **Config ninth** — update `ClaudeBinaryPlugin.create()` generics
10. **Build tenth** — update entrypoint generation for Effect runtime
11. **Commands eleventh** — migrate command runtime to Effect
12. **Cleanup twelfth** — remove all Zod imports, update package.json
